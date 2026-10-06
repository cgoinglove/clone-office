// The person's mini-me in their messenger: their own Discord bot, which they talk to from their
// phone as they do on its page, while the app runs on their computer. Only its person talks to it.
// Whoever writes first is asked about on the computer, with a code sent to their phone: the person
// lets in the phone in their hand, not a name anyone could pick; one at a time, and what they wrote
// meanwhile is answered once they are in (as Thursday's reach does, features/reach/reach.ts, after
// Hermes Agent's pairing). What they write goes into one conversation with the mini-me, the same
// as on the page, where it shows too ("/new" starts another); its questions come as buttons.
// settings.json "messenger" keeps the bot's token, the person and the conversation; one process
// per folder talks through the bot.

import { randomInt } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { isLocale, type Locale } from "../../../i18n/locales.ts";
import { loadMessages } from "../../../i18n/messages.ts";
import type english from "../../../messages/en.json";
import { changeOf, describe } from "../ask-text.ts";
import { readChat } from "../chat/store.ts";
import { runTurn } from "../chat/turn.ts";
import { answerPerson } from "../gate/answer.ts";
import { type Ask, pendingAsks } from "../gate/gate.ts";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { settingsPath } from "../server/exclude.ts";
import { personLanguage } from "../server/language.ts";
import { minimeHome } from "../server/paths.ts";
import {
  type Choice,
  DiscordBot,
  type Incoming,
  type Listener,
  type Person,
  type Press,
} from "./discord.ts";

/** What the bridge needs of a bot: the Discord one, or a stand-in in tests. */
export interface Bot {
  me?: Person;
  invite?: string;
  start(): void;
  stop(): void;
  whoAmI(): Promise<Person>;
  send(channel: string, text: string, choices?: Choice[]): Promise<string>;
  typing(channel: string): Promise<void>;
  settle(press: Press, answer: string): Promise<void>;
}

interface DiscordSettings {
  token: string;
  on: boolean;
  /** The person, once they were let in. */
  owner?: Person;
  /** The conversation what they write goes into. */
  chat?: string;
}

export interface Status {
  configured: boolean;
  state: "off" | "connecting" | "on" | "failed" | "elsewhere";
  bot?: string;
  /** The link that adds the bot to a server. */
  invite?: string;
  owner?: string;
  /** Someone wrote and waits to be let in: the code their phone shows. */
  asking?: { code: string; name: string };
  problem?: string;
}

/** A failure the screen says in the person's language. */
export class MessengerError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** How many digits the code someone asking to be let in is sent. */
const CODE_DIGITS = 4;
/** How long someone may wait to be let in. */
const ASK_MS = 60 * 60 * 1000;
/** How much of what they write while they wait is kept, to answer once they are in. */
const HELD = 5;
/** A process holding the bot renews it every minute; one silent for two is replaced. */
const HOLD_MS = 2 * 60 * 1000;

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

async function loadDiscord(): Promise<DiscordSettings | undefined> {
  const messenger = (await readSettings()).messenger as
    | { discord?: DiscordSettings }
    | undefined;
  return messenger?.discord?.token ? messenger.discord : undefined;
}

async function saveDiscord(
  change: (was: DiscordSettings | undefined) => DiscordSettings | undefined,
): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const messenger = (settings.messenger ?? {}) as {
      discord?: DiscordSettings;
    };
    const discord = change(
      messenger.discord?.token ? messenger.discord : undefined,
    );
    const { discord: _old, ...rest } = messenger;
    const next = discord ? { ...rest, discord } : rest;
    const { messenger: _was, ...others } = settings;
    await atomicWrite(
      settingsPath(),
      `${JSON.stringify(Object.keys(next).length ? { ...others, messenger: next } : others, null, 2)}\n`,
    );
  });
}

/** The words for the messenger, in the language the person's screen last used, else English. */
async function words() {
  const tag = (await readSettings()).language;
  const base = typeof tag === "string" ? tag.split("-")[0] : undefined;
  const locale: Locale = isLocale(base) ? base : "en";
  const messages = (await loadMessages(locale)) as typeof english;
  return {
    t: createTranslator({ locale, messages, namespace: "messenger" }),
    ask: createTranslator({ locale, messages, namespace: "ask" }),
    errors: createTranslator({ locale, messages, namespace: "errors" }),
  };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export class Bridge {
  private makeBot: (token: string, listener: Listener) => Bot;
  private turn: typeof runTurn;
  private gateUrl: () => string;
  private bot?: Bot;
  private state: Status["state"] = "off";
  private problem?: string;
  /** Someone who wrote and waits to be let in, with what they wrote meanwhile. */
  private asking?: {
    code: string;
    user: Person;
    channel: string;
    held: string[];
    at: number;
  };
  private queue: Incoming[] = [];
  private busy = false;
  /** A question waiting for the person's own words: what they write next answers it. */
  private waitingWords?: string;
  private holding?: ReturnType<typeof setInterval>;

  constructor(
    options: {
      makeBot?: (token: string, listener: Listener) => Bot;
      turn?: typeof runTurn;
      gateUrl?: () => string;
    } = {},
  ) {
    this.makeBot =
      options.makeBot ?? ((token, listener) => new DiscordBot(token, listener));
    this.turn = options.turn ?? runTurn;
    // The app's own gate, where the mini-me's tool server puts its questions.
    this.gateUrl =
      options.gateUrl ??
      (() => `http://127.0.0.1:${process.env.PORT || 3000}/api/me/gate`);
  }

  private holderPath(): string {
    return join(
      /*turbopackIgnore: true*/ minimeHome(),
      "messenger",
      "holder.json",
    );
  }

  /** Takes the bot for this process, unless another live one holds it. */
  private async hold(): Promise<boolean> {
    const dir = join(/*turbopackIgnore: true*/ minimeHome(), "messenger");
    return withLock(dir, async () => {
      const read = await readText(this.holderPath());
      let holder: { pid: number; at: number } | undefined;
      try {
        holder = read.raw ? JSON.parse(read.raw) : undefined;
      } catch {
        holder = undefined;
      }
      if (
        holder &&
        holder.pid !== process.pid &&
        alive(holder.pid) &&
        Date.now() - holder.at < HOLD_MS
      )
        return false;
      await atomicWrite(
        this.holderPath(),
        JSON.stringify({ pid: process.pid, at: Date.now() }),
      );
      return true;
    });
  }

  /** Connects the bot when one is set up, in the one process that holds it. */
  async start(): Promise<void> {
    const settings = await loadDiscord();
    if (!settings?.on || this.bot) return;
    if (!(await this.hold())) {
      this.state = "elsewhere";
      return;
    }
    this.holding ??= setInterval(
      () => void this.hold().catch(() => {}),
      60_000,
    );
    this.holding.unref?.();
    this.state = "connecting";
    this.problem = undefined;
    const report = (error: unknown) =>
      console.error(`messenger: ${(error as Error).message}`);
    const bot = this.makeBot(settings.token, {
      ready: () => {
        this.state = "on";
      },
      message: (message) => void this.onMessage(message).catch(report),
      press: (press) => void this.onPress(press).catch(report),
      failed: (code) => {
        this.state = "failed";
        this.problem =
          code === 4004 ? "messenger-token-wrong" : "messenger-refused";
        if (this.bot === bot) this.bot = undefined;
      },
    });
    this.bot = bot;
    bot.start();
  }

  stop(): void {
    this.bot?.stop();
    this.bot = undefined;
    this.state = "off";
    clearInterval(this.holding);
    this.holding = undefined;
    void unlink(this.holderPath()).catch(() => {});
  }

  async status(): Promise<Status> {
    const settings = await loadDiscord();
    if (this.asking && Date.now() - this.asking.at > ASK_MS)
      this.asking = undefined;
    return {
      configured: Boolean(settings),
      state: settings ? this.state : "off",
      ...(this.bot?.me ? { bot: this.bot.me.name } : {}),
      ...(this.bot?.invite ? { invite: this.bot.invite } : {}),
      ...(settings?.owner ? { owner: settings.owner.name } : {}),
      ...(this.asking
        ? { asking: { code: this.asking.code, name: this.asking.user.name } }
        : {}),
      ...(this.problem ? { problem: this.problem } : {}),
    };
  }

  /** Sets up the bot with its token, checked with Discord first; the person stays let in. */
  async connect(token: string): Promise<void> {
    const clean = token.trim();
    try {
      await this.makeBot(clean, {}).whoAmI();
    } catch {
      throw new MessengerError("messenger-token-wrong");
    }
    this.stop();
    await saveDiscord((was) => ({ ...was, token: clean, on: true }));
    await this.start();
  }

  /** Forgets the bot: its token, and who it talked with. */
  async disconnect(): Promise<void> {
    this.stop();
    this.asking = undefined;
    await saveDiscord(() => undefined);
  }

  /**
   * Lets in whoever is asking, when the code is the one the screen showed (a screen left open
   * from an earlier ask lets nobody in); what they wrote meanwhile is answered.
   */
  async allow(code: string): Promise<boolean> {
    const asking = this.asking;
    if (!asking || asking.code !== code.trim()) return false;
    this.asking = undefined;
    await saveDiscord((was) => was && { ...was, owner: asking.user });
    const { t } = await words();
    await this.bot
      ?.send(asking.channel, asking.held.length ? t("inHeld") : t("in"))
      .catch(() => {});
    if (asking.held.length)
      void this.onMessage({
        id: "",
        channel: asking.channel,
        author: asking.user,
        text: asking.held.join("\n"),
      }).catch(() => {});
    return true;
  }

  /** Turns away whoever is asking; what they wrote is dropped, and they may ask again. */
  decline(code: string): boolean {
    if (!this.asking || this.asking.code !== code.trim()) return false;
    this.asking = undefined;
    return true;
  }

  private async onMessage(message: Incoming): Promise<void> {
    const settings = await loadDiscord();
    if (!settings || !this.bot) return;
    const text = message.text.trim();
    if (!settings.owner) return this.knock(message, text);
    const { t } = await words();
    if (message.author.id !== settings.owner.id) {
      await this.bot.send(message.channel, t("taken"));
      return;
    }
    if (!text) return;
    // A question waits for their own words: this is the answer.
    if (this.waitingWords) {
      const id = this.waitingWords;
      this.waitingWords = undefined;
      if ((await answerPerson(id, text)).ok) return;
    }
    if (text === "/new") {
      await saveDiscord((was) => was && { ...was, chat: undefined });
      await this.bot.send(message.channel, t("newChat"));
      return;
    }
    this.queue.push({ ...message, text });
    if (this.busy) {
      await this.bot.send(message.channel, t("busy"));
      return;
    }
    this.busy = true;
    try {
      for (let next = this.queue.shift(); next; next = this.queue.shift())
        await this.converse(next);
    } finally {
      this.busy = false;
    }
  }

  /** Someone not let in wrote: the screen asks about them, with a code their phone alone is sent. */
  private async knock(message: Incoming, text: string): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    const { t } = await words();
    if (this.asking && Date.now() - this.asking.at > ASK_MS)
      this.asking = undefined;
    // One at a time: a second would push the first out without a word.
    if (this.asking && this.asking.user.id !== message.author.id) {
      await bot.send(message.channel, t("someoneWaiting"));
      return;
    }
    if (this.asking) {
      if (text && this.asking.held.length < HELD) this.asking.held.push(text);
      return;
    }
    this.asking = {
      code: randomInt(10 ** CODE_DIGITS)
        .toString()
        .padStart(CODE_DIGITS, "0"),
      user: message.author,
      channel: message.channel,
      held: text ? [text] : [],
      at: Date.now(),
    };
    await bot.send(message.channel, t("knock", { code: this.asking.code }));
  }

  /** One turn of the conversation: what they wrote, answered as on the page. */
  private async converse(message: Incoming): Promise<void> {
    const bot = this.bot;
    if (!bot) return;
    const { t, errors } = await words();
    const settings = await loadDiscord();
    void bot.typing(message.channel);
    const typing = setInterval(() => void bot.typing(message.channel), 8000);
    typing.unref?.();
    let answered = false;
    const said: Promise<unknown>[] = [];
    try {
      await this.turn({
        text: message.text,
        chat: settings?.chat,
        language: await personLanguage(),
        gateUrl: this.gateUrl(),
        send: (event) => {
          if (event.type === "chat" && event.id !== settings?.chat)
            said.push(saveDiscord((was) => was && { ...was, chat: event.id }));
          else if (event.type === "ask")
            said.push(this.ask(message.channel, event.id, event.ask));
          else if (event.type === "done") {
            // Sent as soon as it is ready; the look back at the conversation comes after.
            clearInterval(typing);
            answered = true;
            said.push(this.answer(message.channel, event.chat));
          } else if (event.type === "error") {
            clearInterval(typing);
            answered = true;
            const code = event.code ?? "";
            said.push(
              bot.send(
                message.channel,
                code && errors.has(code as never)
                  ? errors(code as never)
                  : t("failed"),
              ),
            );
          }
        },
      });
    } catch {
      if (!answered) said.push(bot.send(message.channel, t("failed")));
    } finally {
      clearInterval(typing);
      await Promise.allSettled(said);
    }
  }

  private async answer(channel: string, chat: string): Promise<void> {
    const found = await readChat(chat).catch(() => undefined);
    const last = found?.messages.filter((m) => m.role === "minime").at(-1);
    if (last?.text.trim()) await this.bot?.send(channel, last.text);
  }

  /** A question from the gate, as a message with buttons. */
  private async ask(channel: string, id: string, ask: Ask): Promise<void> {
    const { t, ask: tAsk } = await words();
    let text: string;
    let choices: Choice[] = [];
    if (ask.kind === "permission") {
      const change = changeOf(ask.tool, ask.input);
      text = `${tAsk("mayI")}\n${describe(tAsk, ask.tool, ask.input)}${change ? `\n\`\`\`\n${change.replace(/```/g, "ˋˋˋ")}\n\`\`\`` : ""}`;
      choices = [
        { label: tAsk("allow"), value: `ask:${id}:allow`, style: "primary" },
        { label: tAsk("always"), value: `ask:${id}:always` },
        { label: tAsk("deny"), value: `ask:${id}:deny` },
      ];
    } else if (ask.kind === "rule") {
      text = tAsk("rule", { menu: ask.menu });
      choices = [
        { label: tAsk("ruleYes"), value: `ask:${id}:yes`, style: "primary" },
        { label: tAsk("ruleNo"), value: `ask:${id}:no` },
      ];
    } else {
      text = `${ask.question}\n\n${ask.choices?.length ? t("orReply") : t("replyHere")}`;
      choices = (ask.choices ?? []).map((choice, index) => ({
        label: choice,
        value: `ask:${id}:${index}`,
      }));
      this.waitingWords = id;
    }
    await this.bot?.send(channel, text, choices);
  }

  private async onPress(press: Press): Promise<void> {
    const settings = await loadDiscord();
    if (!this.bot || !settings?.owner || press.user.id !== settings.owner.id)
      return;
    const [kind, id = "", value = ""] = press.value.split(":");
    if (kind !== "ask") return;
    const { t, ask: tAsk } = await words();
    const waiting = pendingAsks().find((pending) => pending.id === id);
    if (!waiting) {
      await this.bot.settle(press, t("gone"));
      return;
    }
    let answer = value;
    let always = false;
    let outcome: string;
    if (waiting.ask.kind === "permission") {
      answer = value === "deny" ? "deny" : "allow";
      always = value === "always";
      outcome = answer === "allow" ? tAsk("allowed") : tAsk("denied");
    } else if (waiting.ask.kind === "rule") {
      outcome = value === "yes" ? tAsk("ruleDone") : tAsk("ruleKept");
    } else {
      answer = waiting.ask.choices?.[Number(value)] ?? value;
      outcome = tAsk("answered", { answer });
    }
    await answerPerson(id, answer, always);
    if (this.waitingWords === id) this.waitingWords = undefined;
    await this.bot.settle(press, outcome);
  }
}

const holder = globalThis as typeof globalThis & { __minimeMessenger?: Bridge };

/** The app's one bridge, on globalThis so it survives module reloads in development. */
export function messenger(): Bridge {
  holder.__minimeMessenger ??= new Bridge();
  return holder.__minimeMessenger;
}

/** Connects the person's messenger if they set one up: when the app starts, and when the page asks. */
export async function startMessenger(): Promise<void> {
  await messenger()
    .start()
    .catch((error) => console.error(`messenger: ${(error as Error).message}`));
}
