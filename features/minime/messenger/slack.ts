// The person's own Slack app, in Socket Mode, with no dependencies (after Thursday's
// features/reach/slack.ts): the app-level token opens a WebSocket that Slack sends events down, so
// nothing calls in, and the bot token speaks through the Web API. Only the direct conversation
// with the app (its Messages tab) is read. The app is made from the manifest on the page
// (manifest.ts), which asks for exactly the scopes used here.

import type { Bot } from "./bridge.ts";
import type {
  Choice,
  IncomingFile,
  Listener,
  OutgoingFile,
  Person,
  Press,
  Socket,
} from "./discord.ts";
import { pieces, slackMrkdwn } from "./text.ts";

const API = "https://slack.com/api";
/** Slack's cap on the text of one section block, with room to spare. */
const MAX_TEXT = 2900;
/** Waits between tries after trouble, growing to the last. */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];
/** Answers that mean a token is wrong or lacks what it needs, not that Slack is unwell. */
const REFUSED = new Set([
  "invalid_auth",
  "not_authed",
  "account_inactive",
  "token_revoked",
  "token_expired",
  "not_allowed_token_type",
  "missing_scope",
]);

/** Slack answered, and said no: its error code, and whether it is the token's. */
export class SlackError extends Error {
  readonly code: string;
  readonly refused: boolean;

  constructor(code: string) {
    super(`Slack answered ${code}`);
    this.code = code;
    this.refused = REFUSED.has(code);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SlackEvent {
  type?: string;
  subtype?: string;
  channel_type?: string;
  channel?: string;
  user?: string;
  bot_id?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
  files?: {
    name?: string;
    size?: number;
    mimetype?: string;
    url_private_download?: string;
  }[];
}

export class SlackBot implements Bot {
  me?: Person;
  /** The app's Messages tab, once Slack has said which app and workspace it is. */
  invite?: string;
  private token: string;
  private appToken: string;
  private listener: Listener;
  private open: (url: string) => Socket;
  private request: typeof fetch;
  private socket?: Socket;
  private stopped = true;
  private tries = 0;
  /** Sockets Slack said hello on: their close is Slack's routine one. */
  private greeted = new WeakSet<Socket>();
  private team?: string;
  private people = new Map<string, Promise<string>>();

  constructor(
    token: string,
    appToken: string,
    listener: Listener,
    options: { open?: (url: string) => Socket; fetch?: typeof fetch } = {},
  ) {
    this.token = token;
    this.appToken = appToken;
    this.listener = listener;
    this.open =
      options.open ?? ((url) => new WebSocket(url) as unknown as Socket);
    this.request = options.fetch ?? fetch;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000);
  }

  /** Opens a socket: a fresh address from Slack each time, after a wait when the last went wrong. */
  private async connect(): Promise<void> {
    while (!this.stopped) {
      try {
        if (!this.me) this.me = await this.whoAmI();
        const { url } = await this.call<{ url: string }>(
          "apps.connections.open",
          {},
          this.appToken,
        );
        if (this.stopped) return;
        this.listen(this.open(url));
        return;
      } catch (error) {
        if (error instanceof SlackError && error.refused) {
          this.stopped = true;
          this.listener.failed?.("messenger-slack-token-wrong");
          return;
        }
        await sleep(BACKOFF_MS[Math.min(this.tries, BACKOFF_MS.length - 1)]);
        this.tries += 1;
      }
    }
  }

  private listen(socket: Socket): void {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      // Taken first: Slack sends again what is not, and a turn takes longer than it waits.
      if (typeof frame.envelope_id === "string")
        this.write(socket, { envelope_id: frame.envelope_id });
      this.receive(socket, frame);
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (this.stopped) return;
      // Slack closes every socket now and then, and says so first: a new one is opened. One that
      // closed before Slack said hello went wrong: the next waits, longer each time.
      if (this.greeted.has(socket)) {
        void this.connect();
        return;
      }
      const wait = BACKOFF_MS[Math.min(this.tries, BACKOFF_MS.length - 1)];
      this.tries += 1;
      setTimeout(() => {
        if (!this.stopped && !this.socket) void this.connect();
      }, wait).unref?.();
    });
    socket.addEventListener("error", () => {});
  }

  private write(socket: Socket, payload: unknown): void {
    try {
      socket.send(JSON.stringify(payload));
    } catch {
      // Closing already: the close opens a new one.
    }
  }

  private receive(socket: Socket, frame: Record<string, unknown>): void {
    const payload = (frame.payload ?? {}) as Record<string, unknown>;
    if (frame.type === "hello") {
      this.tries = 0;
      this.greeted.add(socket);
      const app = (frame.connection_info as { app_id?: string } | undefined)
        ?.app_id;
      if (app && this.team)
        this.invite = `https://slack.com/app_redirect?app=${app}&team=${this.team}`;
      if (this.me) this.listener.ready?.(this.me);
      return;
    }
    if (frame.type === "disconnect") {
      // Socket Mode was turned off for the app: it will not come back by itself.
      if (frame.reason === "link_disabled") {
        this.stopped = true;
        this.listener.failed?.("messenger-slack-token-wrong");
      }
      socket.close(1000);
      return;
    }
    if (frame.type === "events_api") {
      const event = (payload.event ?? {}) as SlackEvent;
      if (event.type !== "message" || event.channel_type !== "im") return;
      // People's own words and files only: not the app's, not an edit or a join.
      const plain = !event.subtype || event.subtype === "file_share";
      if (!plain || event.bot_id || !event.user || !event.channel) return;
      const { user, channel } = event;
      const files: IncomingFile[] = (event.files ?? []).flatMap((file) => {
        const url = file.url_private_download;
        if (!url) return [];
        return [
          {
            name: file.name ?? "file",
            size: file.size,
            type: file.mimetype,
            // Slack's files are the workspace's: fetched with the bot's own token.
            fetch: async () => {
              const response = await this.request(url, {
                headers: { authorization: `Bearer ${this.token}` },
              });
              if (!response.ok)
                throw new Error(
                  `Slack answered ${response.status} for a file.`,
                );
              return new Uint8Array(await response.arrayBuffer());
            },
          },
        ];
      });
      void this.name(user).then((name) =>
        this.listener.message?.({
          id: event.ts ?? "",
          channel,
          author: { id: user, name },
          text: this.words(event.text ?? ""),
          // A reply in a thread answers the message the thread hangs from.
          ...(event.thread_ts && event.thread_ts !== event.ts
            ? { replyTo: event.thread_ts }
            : {}),
          ...(files.length ? { files } : {}),
        }),
      );
      return;
    }
    if (frame.type === "interactive" && payload.type === "block_actions") {
      const pressed = payload as {
        trigger_id?: string;
        user?: { id?: string; name?: string; username?: string };
        channel?: { id?: string };
        message?: { ts?: string; text?: string };
        actions?: { value?: string; action_ts?: string }[];
      };
      if (!pressed.channel?.id || !pressed.user?.id) return;
      this.listener.press?.({
        id: pressed.actions?.[0]?.action_ts ?? pressed.trigger_id ?? "",
        token: "",
        channel: pressed.channel.id,
        user: {
          id: pressed.user.id,
          name: pressed.user.name ?? pressed.user.username ?? pressed.user.id,
        },
        value: pressed.actions?.[0]?.value ?? "",
        ...(pressed.message?.ts
          ? {
              message: {
                id: pressed.message.ts,
                text: pressed.message.text ?? "",
              },
            }
          : {}),
      });
    }
  }

  /** What a person wrote, as words: Slack's &amp; and links back to what they typed. */
  private words(text: string): string {
    return text
      .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
      .replace(/<(https?:[^>]+)>/g, "$1")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  }

  /** A person as Slack shows them; their id when the app may not read it. Asked once each. */
  private name(user: string): Promise<string> {
    let known = this.people.get(user);
    if (!known) {
      known = this.call<{ user?: { real_name?: string; name?: string } }>(
        "users.info",
        { user },
      )
        .then((said) => said.user?.real_name || said.user?.name || user)
        .catch(() => user);
      this.people.set(user, known);
    }
    return known;
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown>,
    token = this.token,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request(`${API}/${method}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body),
      });
      // Too many at once: Slack names the wait in a header, in seconds.
      const after = Number(response.headers.get("retry-after"));
      if (response.status === 429 && attempt < 3 && after <= 30) {
        await sleep(after * 1000);
        continue;
      }
      const said = (await response.json().catch(() => null)) as
        | ({ ok?: boolean; error?: string } & T)
        | null;
      if (said?.ok) return said;
      throw new SlackError(said?.error ?? `http_${response.status}`);
    }
  }

  /** Who the bot token belongs to, which also checks it. */
  async whoAmI(): Promise<Person> {
    const me = await this.call<{
      user?: string;
      user_id?: string;
      team_id?: string;
    }>("auth.test", {});
    this.team = me.team_id;
    return { id: me.user_id ?? "", name: me.user ? `@${me.user}` : "clone" };
  }

  /** Checks both tokens, for setting it up: the bot's, and the app-level one that opens sockets. */
  async check(): Promise<void> {
    await this.whoAmI();
    // Asked for a socket address only: nothing is opened.
    await this.call("apps.connections.open", {}, this.appToken);
  }

  /** Sends text in as many messages as it takes; choices go with the last. Returns the last one's ts. */
  async send(
    channel: string,
    text: string,
    choices: Choice[] = [],
  ): Promise<string> {
    const parts = pieces(text, MAX_TEXT);
    let id = "";
    for (const [index, part] of parts.entries()) {
      const drawn = slackMrkdwn(part);
      const last = index === parts.length - 1;
      const sent = await this.call<{ ts: string }>("chat.postMessage", {
        channel,
        text: drawn,
        unfurl_links: false,
        unfurl_media: false,
        ...(last && choices.length
          ? {
              blocks: [
                { type: "section", text: { type: "mrkdwn", text: drawn } },
                {
                  type: "actions",
                  elements: choices.slice(0, 25).map((choice, at) => ({
                    type: "button",
                    action_id: `choice_${at}`,
                    text: {
                      type: "plain_text",
                      text: choice.label.slice(0, 75) || "…",
                    },
                    value: choice.value.slice(0, 2000),
                    ...(choice.style === "primary" ? { style: "primary" } : {}),
                  })),
                },
              ],
            }
          : {}),
      });
      id = sent.ts;
    }
    return id;
  }

  /** Slack gives an app no way to say it is typing. */
  async typing(): Promise<void> {}

  /** After a press: the message it was under, its buttons gone and `answer` written beneath. */
  async settle(press: Press, answer: string): Promise<void> {
    if (!press.message) return;
    const after = `\n\n→ ${slackMrkdwn(answer)}`;
    await this.call("chat.update", {
      channel: press.channel,
      ts: press.message.id,
      text: `${press.message.text.slice(0, MAX_TEXT - after.length)}${after}`,
      blocks: [],
    }).catch(() => {});
  }

  /** A file of ours: an upload address from Slack, the bytes, then the file posted in the channel. */
  async sendFile(channel: string, file: OutgoingFile): Promise<void> {
    const asked = await this.request(`${API}/files.getUploadURLExternal`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}` },
      body: new URLSearchParams({
        filename: file.name,
        length: String(file.bytes.byteLength),
      }),
    });
    const slot = (await asked.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      upload_url?: string;
      file_id?: string;
    };
    if (!slot.ok || !slot.upload_url || !slot.file_id)
      throw new SlackError(slot.error ?? `http_${asked.status}`);
    const put = await this.request(slot.upload_url, {
      method: "POST",
      body: new Blob([file.bytes as BlobPart], { type: file.type }),
    });
    // Completed anyway, it would post a file with nothing in it.
    if (!put.ok) throw new SlackError(`http_${put.status}`);
    await this.call("files.completeUploadExternal", {
      files: [{ id: slot.file_id, title: file.name }],
      channel_id: channel,
    });
  }

  /** The direct conversation with a person, to write to them first. */
  async dm(user: string): Promise<string> {
    const said = await this.call<{ channel?: { id?: string } }>(
      "conversations.open",
      { users: user },
    );
    return said.channel?.id ?? user;
  }
}
