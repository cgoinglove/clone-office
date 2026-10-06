// A Discord bot as small as a mini-me needs: it opens Discord's gateway itself (a WebSocket from
// this computer, so nothing has to reach in), hears direct messages and button presses, and
// answers through Discord's HTTP API. Direct messages only: the bot is one person's own, talked to
// one to one, and in a direct message Discord gives the text without any privileged intent.
// The protocol is the gateway's v10 (discord.com/developers/docs/events/gateway): hello,
// heartbeats, identify or resume, dispatches, and the close codes after which connecting again
// cannot help, such as a wrong token. Thursday's reach (features/reach/discord.ts) went this way
// first: its invite link, its quick answer to a press and its list of buttons are taken from it.

const GATEWAY = "wss://gateway.discord.gg/?v=10&encoding=json";
const API = "https://discord.com/api/v10";
/** DIRECT_MESSAGES: all the bot hears. */
const INTENTS = 1 << 12;
/** Closed for good: a wrong token, or intents or a version the bot may not use. */
const FATAL = new Set([4004, 4010, 4011, 4012, 4013, 4014]);
/** Below Discord's 2,000-character limit on one message, with room to spare. */
export const MAX_TEXT = 1900;
/** A message flag: links go without the card Discord draws under each. */
const SUPPRESS_EMBEDS = 1 << 2;

/**
 * The link that adds the bot to a server, from its application's id: Discord delivers a direct
 * message only between a person and a bot that share a server. No permissions: it wants nothing
 * inside the server.
 */
const invite = (application: unknown) =>
  application
    ? `https://discord.com/oauth2/authorize?client_id=${application}&scope=bot&permissions=0`
    : undefined;

export interface Person {
  id: string;
  name: string;
}

export interface Incoming {
  id: string;
  channel: string;
  author: Person;
  text: string;
}

/** A button pressed on a message the bot sent, and that message as it was. */
export interface Press {
  id: string;
  token: string;
  channel: string;
  user: Person;
  value: string;
  message?: { id: string; text: string };
}

export interface Choice {
  label: string;
  value: string;
  style?: "primary" | "secondary" | "danger";
}

export interface Listener {
  ready?(bot: Person): void;
  message?(message: Incoming): void;
  press?(press: Press): void;
  /** It stopped trying: the close code says why (4004 is a wrong token). */
  failed?(code: number): void;
}

/** What the bot needs of a WebSocket: the one in Node, or a stand-in in tests. */
export interface Socket {
  send(data: string): void;
  close(code?: number): void;
  addEventListener(
    type: "message" | "close" | "error",
    listener: (event: { data?: unknown; code?: number }) => void,
  ): void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function person(user: Record<string, unknown> | undefined): Person {
  const id = String(user?.id ?? "");
  return {
    id,
    name: String(user?.global_name || user?.username || id),
  };
}

/** Text in pieces Discord takes, cut at a line where it can be. */
export function pieces(text: string, max = MAX_TEXT): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf("\n", max);
    const at = cut > max / 2 ? cut : max;
    out.push(rest.slice(0, at).trimEnd());
    rest = rest.slice(at).trimStart();
  }
  if (rest) out.push(rest);
  return out.length ? out : [""];
}

/** Buttons in Discord's rows: one to a row while they fit, so they read as a list; else five. */
function rows(choices: Choice[]) {
  const style = { primary: 1, secondary: 2, danger: 4 } as const;
  const perRow = choices.length <= 5 ? 1 : 5;
  const out: { type: 1; components: unknown[] }[] = [];
  for (const [index, choice] of choices.slice(0, 25).entries()) {
    if (index % perRow === 0) out.push({ type: 1, components: [] });
    out.at(-1)?.components.push({
      type: 2,
      style: style[choice.style ?? "secondary"],
      label: choice.label.slice(0, 80) || "…",
      custom_id: choice.value.slice(0, 100),
    });
  }
  return out;
}

export class DiscordBot {
  private token: string;
  private listener: Listener;
  private open: (url: string) => Socket;
  private request: typeof fetch;
  private socket?: Socket;
  private beat?: ReturnType<typeof setInterval>;
  private firstBeat?: ReturnType<typeof setTimeout>;
  private acked = true;
  private seq: number | null = null;
  private session?: { id: string; url: string };
  private stopped = true;
  private tries = 0;
  /** The bot itself, once connected. */
  me?: Person;
  /** The link that adds it to a server, once connected. */
  invite?: string;

  constructor(
    token: string,
    listener: Listener,
    options: { open?: (url: string) => Socket; fetch?: typeof fetch } = {},
  ) {
    this.token = token;
    this.listener = listener;
    this.open =
      options.open ?? ((url) => new WebSocket(url) as unknown as Socket);
    this.request = options.fetch ?? fetch;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.quiet();
    this.socket?.close(1000);
  }

  private quiet(): void {
    clearInterval(this.beat);
    clearTimeout(this.firstBeat);
  }

  private connect(): void {
    const url = this.session
      ? `${this.session.url}/?v=10&encoding=json`
      : GATEWAY;
    const socket = this.open(url);
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      try {
        this.receive(JSON.parse(String(event.data)));
      } catch {
        // Not Discord's JSON: nothing to do with it.
      }
    });
    socket.addEventListener("close", (event) => {
      if (this.socket === socket) this.closed(event.code ?? 1006);
    });
    // A failed connection is followed by its close.
    socket.addEventListener("error", () => {});
  }

  private receive(payload: {
    op: number;
    d?: Record<string, unknown> | boolean | null;
    s?: number | null;
    t?: string | null;
  }): void {
    if (typeof payload.s === "number") this.seq = payload.s;
    const d = (payload.d ?? {}) as Record<string, unknown>;
    switch (payload.op) {
      case 10:
        this.heartbeat(Number(d.heartbeat_interval) || 41_250);
        this.write(
          this.session
            ? {
                op: 6,
                d: {
                  token: this.token,
                  session_id: this.session.id,
                  seq: this.seq,
                },
              }
            : {
                op: 2,
                d: {
                  token: this.token,
                  intents: INTENTS,
                  properties: {
                    os: process.platform,
                    browser: "sub-office",
                    device: "sub-office",
                  },
                },
              },
        );
        return;
      case 11:
        this.acked = true;
        return;
      case 1:
        this.sendBeat();
        return;
      case 7:
        // Asked to reconnect: the session goes on over a new connection.
        this.socket?.close(4000);
        return;
      case 9:
        // The session cannot go on (d false): a new one, after the wait Discord asks for.
        if (payload.d !== true) {
          this.session = undefined;
          this.seq = null;
        }
        setTimeout(
          () => this.socket?.close(4000),
          1000 + Math.random() * 4000,
        ).unref?.();
        return;
      case 0:
        this.dispatch(payload.t ?? "", d);
    }
  }

  private dispatch(type: string, d: Record<string, unknown>): void {
    if (type === "READY") {
      this.session = {
        id: String(d.session_id),
        url: String(d.resume_gateway_url || "wss://gateway.discord.gg"),
      };
      this.tries = 0;
      this.me = person(d.user as Record<string, unknown>);
      this.invite = invite(
        (d.application as Record<string, unknown> | undefined)?.id,
      );
      this.listener.ready?.(this.me);
      return;
    }
    if (type === "RESUMED") {
      this.tries = 0;
      return;
    }
    if (type === "MESSAGE_CREATE") {
      const author = d.author as Record<string, unknown> | undefined;
      // Direct messages from people only: not a server's channels, not bots (itself included).
      if (d.guild_id || !author || author.bot) return;
      this.listener.message?.({
        id: String(d.id),
        channel: String(d.channel_id),
        author: person(author),
        text: String(d.content ?? ""),
      });
      return;
    }
    // A button in a direct message, taken at once: Discord waits three seconds for that.
    if (type === "INTERACTION_CREATE" && d.type === 3 && !d.guild_id) {
      void this.call(
        "POST",
        `/interactions/${String(d.id)}/${String(d.token)}/callback`,
        { type: 6 },
      ).catch(() => {});
      const user = (d.user ??
        (d.member as Record<string, unknown> | undefined)?.user) as
        | Record<string, unknown>
        | undefined;
      const message = d.message as Record<string, unknown> | undefined;
      this.listener.press?.({
        id: String(d.id),
        token: String(d.token),
        channel: String(d.channel_id),
        user: person(user),
        value: String(
          (d.data as Record<string, unknown> | undefined)?.custom_id,
        ),
        ...(message
          ? {
              message: {
                id: String(message.id),
                text: String(message.content ?? ""),
              },
            }
          : {}),
      });
    }
  }

  private heartbeat(interval: number): void {
    this.quiet();
    this.acked = true;
    this.firstBeat = setTimeout(
      () => this.sendBeat(),
      interval * Math.random(),
    );
    this.firstBeat.unref?.();
    this.beat = setInterval(() => {
      // No answer to the last beat: the connection is dead even if it looks open.
      if (!this.acked) {
        this.socket?.close(4000);
        return;
      }
      this.sendBeat();
    }, interval);
    this.beat.unref?.();
  }

  private sendBeat(): void {
    this.acked = false;
    this.write({ op: 1, d: this.seq });
  }

  private write(payload: unknown): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch {
      // Closing already: the close reconnects.
    }
  }

  private closed(code: number): void {
    this.quiet();
    if (this.stopped) return;
    if (FATAL.has(code)) {
      this.stopped = true;
      this.listener.failed?.(code);
      return;
    }
    // The session's place in the stream is lost: start a new one.
    if (code === 4007 || code === 4009) {
      this.session = undefined;
      this.seq = null;
    }
    const wait = Math.min(60_000, 1000 * 2 ** this.tries++);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, wait).unref?.();
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bot ${this.token}`,
          "content-type": "application/json",
          "user-agent": "DiscordBot (sub-office, 0)",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (response.status === 429 && attempt < 3) {
        const data = (await response.json().catch(() => ({}))) as {
          retry_after?: number;
        };
        await sleep(Math.ceil((Number(data.retry_after) || 1) * 1000));
        continue;
      }
      if (!response.ok)
        throw new Error(`Discord answered ${response.status} to ${path}.`);
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
  }

  /** Who the token belongs to: a quick check that it is a bot's. */
  async whoAmI(): Promise<Person> {
    return person(
      await this.call<Record<string, unknown>>("GET", "/users/@me"),
    );
  }

  /** Sends text in as many messages as it takes; choices go with the last. Returns the last one's id. */
  async send(
    channel: string,
    text: string,
    choices: Choice[] = [],
  ): Promise<string> {
    const parts = pieces(text);
    let id = "";
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const sent = await this.call<{ id: string }>(
        "POST",
        `/channels/${channel}/messages`,
        {
          content: part,
          // No card under every link, and no one pinged by a name in what it writes.
          flags: SUPPRESS_EMBEDS,
          allowed_mentions: { parse: [] },
          ...(last && choices.length ? { components: rows(choices) } : {}),
        },
      );
      id = sent.id;
    }
    return id;
  }

  /** "Typing…" in the channel for a few seconds. */
  async typing(channel: string): Promise<void> {
    await this.call("POST", `/channels/${channel}/typing`).catch(() => {});
  }

  /** After a press: the message it was under, its buttons gone and `answer` written beneath. */
  async settle(press: Press, answer: string): Promise<void> {
    if (!press.message) return;
    const after = `\n\n→ ${answer}`;
    await this.call(
      "PATCH",
      `/channels/${press.channel}/messages/${press.message.id}`,
      {
        content: `${press.message.text.slice(0, MAX_TEXT - after.length)}${after}`,
        components: [],
      },
    ).catch(() => {});
  }

  /** The direct-message channel with a user, to write to them first. */
  async dm(user: string): Promise<string> {
    return (
      await this.call<{ id: string }>("POST", "/users/@me/channels", {
        recipient_id: user,
      })
    ).id;
  }
}
