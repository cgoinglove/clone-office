// The person's own Telegram bot, with no dependencies (after Thursday's features/reach/telegram.ts):
// it asks Telegram for what was written with a long poll, so nothing calls in and nothing needs to be
// reachable, and sends back with the Bot API. Only private chats are heard; a button pressed is
// taken at once (the spinner on it stops) and its message is settled after.

import type { Bot } from "./bridge.ts";
import type {
  Choice,
  IncomingFile,
  Listener,
  OutgoingFile,
  Person,
  Press,
} from "./discord.ts";
import { pieces, telegramHtml } from "./text.ts";

const API = "https://api.telegram.org";
/** Telegram takes 4096 characters a message, marks aside; this leaves room. */
const MAX_TEXT = 4000;
/** How long one ask for news waits at Telegram before it answers with none. */
const POLL_SECONDS = 30;
/** Waits between tries after trouble, growing to the last. */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramFile {
  file_id: string;
  file_size?: number;
  file_name?: string;
  mime_type?: string;
}

interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: { id: number; type: string };
  text?: string;
  caption?: string;
  entities?: unknown[];
  reply_to_message?: { message_id: number };
  document?: TelegramFile;
  /** The same picture at several sizes, smallest first. */
  photo?: TelegramFile[];
  audio?: TelegramFile;
  voice?: TelegramFile;
  video?: TelegramFile;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: TelegramMessage;
    data?: string;
  };
}

/** Telegram answered, and said no: its words, and the status it answered in. */
export class TelegramError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });

function person(user: TelegramUser | undefined): Person {
  return {
    id: String(user?.id ?? ""),
    name:
      [user?.first_name, user?.last_name].filter(Boolean).join(" ") ||
      (user?.username ? `@${user.username}` : String(user?.id ?? "")),
  };
}

export class TelegramBot implements Bot {
  me?: Person;
  /** The chat with this bot, which a phone opens straight from the link. */
  invite?: string;
  private token: string;
  private listener: Listener;
  private request: typeof fetch;
  private pollSeconds: number;
  private running?: AbortController;
  /** Past the last update handed over: asked from 0 again, a message would be answered twice. */
  private offset = 0;

  constructor(
    token: string,
    listener: Listener,
    options: { fetch?: typeof fetch; pollSeconds?: number } = {},
  ) {
    this.token = token;
    this.listener = listener;
    this.request = options.fetch ?? fetch;
    this.pollSeconds = options.pollSeconds ?? POLL_SECONDS;
  }

  start(): void {
    if (this.running) return;
    const running = new AbortController();
    this.running = running;
    void this.listen(running.signal);
  }

  stop(): void {
    this.running?.abort();
    this.running = undefined;
  }

  private async listen(signal: AbortSignal): Promise<void> {
    let trouble = 0;
    let ready = false;
    let taken = false;
    while (!signal.aborted) {
      try {
        if (!ready) {
          this.me = await this.whoAmI(signal);
          ready = true;
          this.listener.ready?.(this.me);
        }
        const updates = await this.call<TelegramUpdate[]>(
          "getUpdates",
          {
            offset: this.offset,
            timeout: this.pollSeconds,
            allowed_updates: ["message", "callback_query"],
          },
          // Past the wait itself, the connection is taken for dead.
          AbortSignal.any([
            signal,
            AbortSignal.timeout((this.pollSeconds + 15) * 1000),
          ]),
        );
        trouble = 0;
        if (taken) {
          taken = false;
          this.listener.trouble?.(undefined);
        }
        for (const update of updates) {
          this.offset = update.update_id + 1;
          this.read(update);
        }
      } catch (error) {
        if (signal.aborted) return;
        // The token itself was turned away: asking again would not change that.
        if (error instanceof TelegramError && error.status === 401) {
          this.running = undefined;
          this.listener.failed?.("messenger-telegram-token-wrong");
          return;
        }
        // Another program reads this bot (its own long poll, or a webhook): said, and tried again.
        if (error instanceof TelegramError && error.status === 409 && !taken) {
          taken = true;
          this.listener.trouble?.("messenger-telegram-taken");
        }
        // Anything else may pass: a line that is down, Telegram busy.
        await sleep(
          BACKOFF_MS[Math.min(trouble, BACKOFF_MS.length - 1)],
          signal,
        );
        trouble += 1;
      }
    }
  }

  private read(update: TelegramUpdate): void {
    const pressed = update.callback_query;
    if (pressed) {
      // Ends the spinner on the button, whatever comes of the press.
      void this.call("answerCallbackQuery", {
        callback_query_id: pressed.id,
      }).catch(() => {});
      const message = pressed.message;
      if (message && message.chat.type !== "private") return;
      this.listener.press?.({
        id: pressed.id,
        token: "",
        channel: String(message?.chat.id ?? pressed.from.id),
        user: person(pressed.from),
        value: pressed.data ?? "",
        ...(message
          ? {
              message: {
                id: String(message.message_id),
                text: message.text ?? "",
                keep: message.entities,
              },
            }
          : {}),
      });
      return;
    }
    const message = update.message;
    // Private chats with people only: not a group, not a bot.
    if (!message?.from || message.from.is_bot) return;
    if (message.chat.type !== "private") return;
    const files = this.filesOf(message);
    this.listener.message?.({
      id: String(message.message_id),
      channel: String(message.chat.id),
      author: person(message.from),
      text: message.text ?? message.caption ?? "",
      ...(message.reply_to_message
        ? { replyTo: String(message.reply_to_message.message_id) }
        : {}),
      ...(files.length ? { files } : {}),
    });
  }

  /** The file a message carries: a document, the largest size of a photo, a voice note, audio, video. */
  private filesOf(message: TelegramMessage): IncomingFile[] {
    const id = message.message_id;
    const found: { file: TelegramFile; name: string }[] = [];
    if (message.document)
      found.push({
        file: message.document,
        name: message.document.file_name ?? `file-${id}`,
      });
    const photo = message.photo?.at(-1);
    if (photo) found.push({ file: photo, name: `photo-${id}.jpg` });
    if (message.voice)
      found.push({ file: message.voice, name: `voice-${id}.ogg` });
    if (message.audio)
      found.push({
        file: message.audio,
        name: message.audio.file_name ?? `audio-${id}`,
      });
    if (message.video)
      found.push({
        file: message.video,
        name: message.video.file_name ?? `video-${id}.mp4`,
      });
    return found.map(({ file, name }) => ({
      name,
      size: file.file_size,
      type: file.mime_type,
      fetch: async () => {
        const { file_path: path } = await this.call<{ file_path?: string }>(
          "getFile",
          { file_id: file.file_id },
        );
        if (!path) throw new Error("Telegram did not say where the file is.");
        const response = await this.request(
          `${API}/file/bot${this.token}/${path}`,
        );
        if (!response.ok)
          throw new Error(`Telegram answered ${response.status} for a file.`);
        return new Uint8Array(await response.arrayBuffer());
      },
    }));
  }

  private async call<T>(
    method: string,
    body: Record<string, unknown> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request(`${API}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal,
      });
      const said = (await response.json().catch(() => null)) as {
        ok?: boolean;
        result?: T;
        description?: string;
        parameters?: { retry_after?: number };
      } | null;
      if (said?.ok) return said.result as T;
      const wait = said?.parameters?.retry_after;
      // Too many at once: wait as long as Telegram says, a few times.
      if (
        response.status === 429 &&
        wait !== undefined &&
        attempt < 3 &&
        wait <= 30
      ) {
        await sleep(wait * 1000, signal);
        continue;
      }
      throw new TelegramError(
        said?.description ?? `Telegram answered ${response.status}`,
        response.status,
      );
    }
  }

  /** Who the token belongs to: a quick check that it is a bot's. */
  async whoAmI(signal?: AbortSignal): Promise<Person> {
    const me = await this.call<TelegramUser>("getMe", {}, signal);
    this.invite = me.username ? `https://t.me/${me.username}` : undefined;
    return {
      id: String(me.id),
      name: me.username ? `@${me.username}` : (me.first_name ?? "bot"),
    };
  }

  /** Sends text in as many messages as it takes; choices go with the last. Returns the last one's id. */
  async send(
    channel: string,
    text: string,
    choices: Choice[] = [],
  ): Promise<string> {
    const parts = pieces(text, MAX_TEXT);
    let id = "";
    for (const [index, part] of parts.entries()) {
      const last = index === parts.length - 1;
      const message = {
        chat_id: channel,
        link_preview_options: { is_disabled: true },
        ...(last && choices.length
          ? {
              reply_markup: {
                // One to a row, so they read as a list.
                inline_keyboard: choices.map((choice) => [
                  {
                    text: choice.label.slice(0, 64) || "…",
                    callback_data: choice.value.slice(0, 64),
                  },
                ]),
              },
            }
          : {}),
      };
      let sent: { message_id: number };
      try {
        sent = await this.call("sendMessage", {
          ...message,
          text: telegramHtml(part),
          parse_mode: "HTML",
        });
      } catch (error) {
        // Marks Telegram could not read: the words go as they are.
        if (!(error instanceof TelegramError && error.status === 400))
          throw error;
        sent = await this.call("sendMessage", { ...message, text: part });
      }
      id = String(sent.message_id);
    }
    return id;
  }

  /** "typing…" in the chat for a few seconds. */
  async typing(channel: string): Promise<void> {
    await this.call("sendChatAction", {
      chat_id: channel,
      action: "typing",
    }).catch(() => {});
  }

  /** After a press: the message it was under, its buttons gone and `answer` written beneath. */
  async settle(press: Press, answer: string): Promise<void> {
    if (!press.message) return;
    await this.call("editMessageText", {
      chat_id: press.channel,
      message_id: Number(press.message.id),
      text: `${press.message.text}\n\n→ ${answer}`.slice(0, 4096),
      // Its words as Telegram gave them back, with the marks they carried.
      ...(press.message.keep ? { entities: press.message.keep } : {}),
      link_preview_options: { is_disabled: true },
    }).catch(() => {});
  }

  /** A file of ours, as a document. */
  async sendFile(channel: string, file: OutgoingFile): Promise<void> {
    const form = new FormData();
    form.set("chat_id", channel);
    form.set(
      "document",
      new Blob([file.bytes as BlobPart], { type: file.type }),
      file.name,
    );
    const response = await this.request(
      `${API}/bot${this.token}/sendDocument`,
      {
        method: "POST",
        body: form,
      },
    );
    const said = (await response.json().catch(() => null)) as {
      ok?: boolean;
      description?: string;
    } | null;
    if (!said?.ok)
      throw new TelegramError(
        said?.description ?? `Telegram answered ${response.status}`,
        response.status,
      );
  }

  /** A private chat's id is the person's own. */
  async dm(user: string): Promise<string> {
    return user;
  }
}
