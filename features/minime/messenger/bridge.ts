// The person's mini-me in their messenger: their own Discord, Telegram or Slack bot, which they
// talk to from their phone as they do on its page, while the app runs on their computer. Only its
// person talks to it.
// Whoever writes first is asked about on the computer, with a code sent to their phone: the person
// lets in the phone in their hand, not a name anyone could pick; one at a time, and what they wrote
// meanwhile is answered once they are in (as Thursday's reach does, features/reach/reach.ts, after
// Hermes Agent's pairing). What they write goes into one conversation with the mini-me, the same
// as on the page, where it shows too ("/new" starts another); its questions come as buttons.
// While no page is in view (server/presence.ts), what waits on the person comes to the phone as
// Thursday's reach brings open work: a question waiting on them (a colleague's request, a
// conversation left on the page), questions kept for later at the day's moments (batch.ts), and
// finished work nobody has seen (a flow's answer, a colleague's answer); news in the phone's own
// conversation comes back to it whoever is watching. Progress never goes: a phone that buzzes for
// every step gets muted. settings.json "messenger" keeps the bot's token, the person and the
// conversation; one process per folder talks through the bot.

import { randomInt } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { createTranslator } from "next-intl";
import { isLocale, type Locale } from "../../../i18n/locales.ts";
import { loadMessages } from "../../../i18n/messages.ts";
import type english from "../../../messages/en.json";
import { changeOf, describe } from "../ask-text.ts";
import { dueAt } from "../batch.ts";
import { type ChatNews, onChatMessage, readChat } from "../chat/store.ts";
import { runTurn } from "../chat/turn.ts";
import { answerPerson } from "../gate/answer.ts";
import { type Ask, isRequestChat, onAsk, pendingAsks } from "../gate/gate.ts";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { personLanguage } from "../server/language.ts";
import { minimeHome } from "../server/paths.ts";
import { watching } from "../server/presence.ts";
import {
  type Choice,
  DiscordBot,
  type Incoming,
  type Listener,
  type Person,
  type Press,
} from "./discord.ts";
import { type Kept, type OfficeSide, officeSide } from "./office.ts";
import { SlackBot } from "./slack.ts";
import { TelegramBot } from "./telegram.ts";

/** The messengers a person can talk to their mini-me through. */
export const SERVICES = ["discord", "telegram", "slack"] as const;
export type Service = (typeof SERVICES)[number];

/** A bot's keys: one token, and for Slack also the app-level one that opens its socket. */
export interface Account {
  service: Service;
  token: string;
  appToken?: string;
}

/** What the bridge needs of a bot: Discord's, Telegram's, or a stand-in in tests. */
export interface Bot {
  me?: Person;
  invite?: string;
  start(): void;
  stop(): void;
  whoAmI(): Promise<Person>;
  /** Checks every key it was given, when that takes more than asking who it is (Slack's two). */
  check?(): Promise<void>;
  send(channel: string, text: string, choices?: Choice[]): Promise<string>;
  typing(channel: string): Promise<void>;
  settle(press: Press, answer: string): Promise<void>;
  /** The direct-message channel with a user, to write to them first. */
  dm(user: string): Promise<string>;
}

interface MessengerSettings extends Account {
  on: boolean;
  /** The person, once they were let in. */
  owner?: Person;
  /** The conversation what they write goes into. */
  chat?: string;
}

export interface Status {
  configured: boolean;
  service?: Service;
  state: "off" | "connecting" | "on" | "failed" | "elsewhere";
  bot?: string;
  /** Where the person finds the bot: Discord's link that adds it to a server, Telegram's chat with it. */
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
/** How often it looks for what waits on the person: a page left, a batch moment come. */
const LOOK_MS = 15_000;
/** How long it remembers what went to the phone, and which of its messages asked what. */
const TOLD_MS = 24 * 60 * 60 * 1000;
/** How much of a colleague's request the phone is shown over the question about it. */
const ABOUT_CHARS = 300;

/** A question on the phone that words answer: one from the gate, or one kept for later. */
interface Waiting {
  kind: "ask" | "later";
  id: string;
  /** It came to the phone on its own, outside the phone's conversation: its answer is confirmed. */
  pushed: boolean;
}

/** Finished work nobody has seen yet, for the phone while no page is in view. */
type Ending =
  | { kind: "flow"; name: string; text: string; failed: boolean; at: string }
  | { kind: "office"; text: string };

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

function asMessenger(value: unknown): MessengerSettings | undefined {
  const messenger = value as Partial<MessengerSettings> | undefined;
  return messenger?.token && SERVICES.includes(messenger.service as Service)
    ? (messenger as MessengerSettings)
    : undefined;
}

async function loadMessenger(): Promise<MessengerSettings | undefined> {
  return asMessenger((await readSettings()).messenger);
}

async function saveMessenger(
  change: (was: MessengerSettings | undefined) => MessengerSettings | undefined,
): Promise<void> {
  await withLock(minimeHome(), async () => {
    const { messenger, ...others } = await readSettings();
    const next = change(asMessenger(messenger));
    await writeSettings(
      `${JSON.stringify(next ? { ...others, messenger: next } : others, null, 2)}\n`,
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
    locale,
    t: createTranslator({ locale, messages, namespace: "messenger" }),
    ask: createTranslator({ locale, messages, namespace: "ask" }),
    chat: createTranslator({ locale, messages, namespace: "chat" }),
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
  private makeBot: (account: Account, listener: Listener) => Bot;
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
  private waitingWords?: Waiting;
  /** Its messages that ask a question, by message id: a reply to one answers that one. */
  private asked = new Map<string, Waiting & { at: number }>();
  /** What already went to the phone (questions by id), so nothing goes twice. */
  private told = new Map<string, number>();
  private endings: Ending[] = [];
  /** Flows running now, by their conversation: the next answer there is theirs. */
  private flowChats = new Map<string, string>();
  /** The conversation a message from the phone is being answered in now. */
  private turnChat?: string;
  private channel?: { user: string; id: string };
  private holding?: ReturnType<typeof setInterval>;
  private looker?: ReturnType<typeof setInterval>;
  private later?: ReturnType<typeof setTimeout>;
  private looking = false;
  private lookAgain = false;
  private unhear: (() => void)[] = [];
  private office: OfficeSide;
  private presence: typeof watching;
  private lookMs: number;

  constructor(
    options: {
      makeBot?: (account: Account, listener: Listener) => Bot;
      turn?: typeof runTurn;
      gateUrl?: () => string;
      office?: OfficeSide;
      presence?: typeof watching;
      /** How often it looks for what waits on the person. */
      lookMs?: number;
    } = {},
  ) {
    this.makeBot =
      options.makeBot ??
      (({ service, token, appToken }, listener) =>
        service === "telegram"
          ? new TelegramBot(token, listener)
          : service === "slack"
            ? new SlackBot(token, appToken ?? "", listener)
            : new DiscordBot(token, listener));
    this.turn = options.turn ?? runTurn;
    // The app's own gate, where the mini-me's tool server puts its questions.
    this.gateUrl =
      options.gateUrl ??
      (() => `http://127.0.0.1:${process.env.PORT || 3000}/api/me/gate`);
    this.office = options.office ?? officeSide(this.gateUrl);
    this.presence = options.presence ?? watching;
    this.lookMs = options.lookMs ?? LOOK_MS;
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
    const settings = await loadMessenger();
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
    const bot = this.makeBot(settings, {
      ready: () => {
        this.state = "on";
        this.lookSoon(0);
      },
      message: (message) => void this.onMessage(message).catch(report),
      press: (press) => void this.onPress(press).catch(report),
      failed: (problem) => {
        this.state = "failed";
        this.problem = problem;
        if (this.bot === bot) this.bot = undefined;
      },
      trouble: (problem) => {
        this.problem = problem;
      },
    });
    this.bot = bot;
    // What waits on the person: a new question, a line in a conversation, and a look every little
    // while for a page that left or a batch moment that came.
    this.unhear.push(
      onAsk(() => this.lookSoon(0)),
      onChatMessage((news) => this.onNews(news)),
    );
    this.looker = setInterval(() => this.lookSoon(0), this.lookMs);
    this.looker.unref?.();
    bot.start();
  }

  stop(): void {
    this.bot?.stop();
    this.bot = undefined;
    this.state = "off";
    clearInterval(this.holding);
    this.holding = undefined;
    clearInterval(this.looker);
    this.looker = undefined;
    clearTimeout(this.later);
    this.later = undefined;
    for (const unhear of this.unhear.splice(0)) unhear();
    this.channel = undefined;
    this.endings = [];
    void unlink(this.holderPath()).catch(() => {});
  }

  async status(): Promise<Status> {
    const settings = await loadMessenger();
    if (this.asking && Date.now() - this.asking.at > ASK_MS)
      this.asking = undefined;
    return {
      configured: Boolean(settings),
      ...(settings ? { service: settings.service } : {}),
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

  /**
   * Sets up the bot with its keys, checked with its service first. One messenger at a time: new
   * keys for the same one keep the person let in; another service starts afresh. Slack's two
   * tokens are told apart by how they start, whichever box they were pasted in.
   */
  async connect(
    service: Service,
    token: string,
    appToken?: string,
  ): Promise<void> {
    const keys = [token.trim(), appToken?.trim() ?? ""];
    const account: Account =
      service === "slack"
        ? {
            service,
            token: keys.find((key) => key.startsWith("xoxb-")) ?? keys[0],
            appToken: keys.find((key) => key.startsWith("xapp-")) ?? keys[1],
          }
        : { service, token: keys[0] };
    const wrong =
      service === "telegram"
        ? "messenger-telegram-token-wrong"
        : service === "slack"
          ? "messenger-slack-token-wrong"
          : "messenger-token-wrong";
    if (service === "slack" && !account.appToken)
      throw new MessengerError(wrong);
    try {
      const bot = this.makeBot(account, {});
      await (bot.check ? bot.check() : bot.whoAmI());
    } catch {
      throw new MessengerError(wrong);
    }
    this.stop();
    this.asking = undefined;
    await saveMessenger((was) => ({
      ...(was?.service === service ? was : {}),
      ...account,
      on: true,
    }));
    await this.start();
  }

  /** Forgets the bot: its token, and who it talked with. */
  async disconnect(): Promise<void> {
    this.stop();
    this.asking = undefined;
    await saveMessenger(() => undefined);
  }

  /**
   * Lets in whoever is asking, when the code is the one the screen showed (a screen left open
   * from an earlier ask lets nobody in); what they wrote meanwhile is answered.
   */
  async allow(code: string): Promise<boolean> {
    const asking = this.asking;
    if (!asking || asking.code !== code.trim()) return false;
    this.asking = undefined;
    await saveMessenger((was) => was && { ...was, owner: asking.user });
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
    const settings = await loadMessenger();
    if (!settings || !this.bot) return;
    // Telegram's Start button writes "/start": only a hello.
    const text = /^\/start(\s|$)/.test(message.text.trim())
      ? ""
      : message.text.trim();
    if (!settings.owner) return this.knock(message, text);
    const { t } = await words();
    if (message.author.id !== settings.owner.id) {
      await this.bot.send(message.channel, t("taken"));
      return;
    }
    if (!text) return;
    // A reply to one of its questions answers that one; else a question waiting for their words.
    const replied = message.replyTo
      ? this.asked.get(message.replyTo)
      : undefined;
    const waiting = replied ?? this.waitingWords;
    if (waiting) {
      if (this.waitingWords?.id === waiting.id) this.waitingWords = undefined;
      if (await this.answerWith(waiting, text)) {
        if (waiting.pushed)
          await this.bot.send(
            message.channel,
            (await words()).ask("answered", { answer: text }),
          );
        return;
      }
    }
    if (text === "/new") {
      await saveMessenger((was) => was && { ...was, chat: undefined });
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
    const settings = await loadMessenger();
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
          if (event.type === "chat") this.turnChat = event.id;
          if (event.type === "chat" && event.id !== settings?.chat)
            said.push(
              saveMessenger((was) => was && { ...was, chat: event.id }),
            );
          else if (event.type === "ask") {
            // Asked in the phone's own conversation: here already, so it is not sent again.
            this.told.set(event.id, Date.now());
            said.push(this.ask(message.channel, event.id, event.ask));
          } else if (event.type === "done") {
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
      this.turnChat = undefined;
      await Promise.allSettled(said);
    }
  }

  private async answer(channel: string, chat: string): Promise<void> {
    const found = await readChat(chat).catch(() => undefined);
    const last = found?.messages.filter((m) => m.role === "minime").at(-1);
    if (last?.text.trim()) await this.bot?.send(channel, last.text);
  }

  /** A question from the gate, as a message with buttons; `about` says whose it is when it came on its own. */
  private async ask(
    channel: string,
    id: string,
    ask: Ask,
    about?: string,
  ): Promise<void> {
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
    }
    const sent = await this.bot?.send(
      channel,
      about ? `${about}\n\n${text}` : text,
      choices,
    );
    if (ask.kind === "question") {
      const waiting: Waiting = { kind: "ask", id, pushed: about !== undefined };
      this.waitingWords = waiting;
      if (sent) this.asked.set(sent, { ...waiting, at: Date.now() });
    }
  }

  /** A question kept for later, as a message with its choices as buttons. */
  private async askKept(
    channel: string,
    kept: Kept,
    about: string,
  ): Promise<void> {
    const { t } = await words();
    const choices: Choice[] = (kept.choices ?? []).map((choice, index) => ({
      label: choice,
      value: `later:${kept.id}:${index}`,
    }));
    const sent = await this.bot?.send(
      channel,
      `${about}\n\n${kept.question}\n\n${choices.length ? t("orReply") : t("replyHere")}`,
      choices,
    );
    const waiting: Waiting = { kind: "later", id: kept.id, pushed: true };
    this.waitingWords = waiting;
    if (sent) this.asked.set(sent, { ...waiting, at: Date.now() });
  }

  /** Their words or choice as the answer to a question; false when it no longer waits. */
  private async answerWith(waiting: Waiting, given: string): Promise<boolean> {
    if (waiting.kind === "later") return this.office.answer(waiting.id, given);
    if ((await answerPerson(waiting.id, given)).ok) return true;
    // Not answered while it waited, it was kept for later: the same question waits there.
    const kept = (await this.office.kept().catch(() => [])).find(
      (one) => one.ask === waiting.id,
    );
    return kept ? this.office.answer(kept.id, given) : false;
  }

  private async onPress(press: Press): Promise<void> {
    const settings = await loadMessenger();
    if (!this.bot || !settings?.owner || press.user.id !== settings.owner.id)
      return;
    const [kind, id = "", value = ""] = press.value.split(":");
    if (kind !== "ask" && kind !== "later") return;
    const { t, ask: tAsk } = await words();
    const waiting =
      kind === "ask"
        ? pendingAsks().find((pending) => pending.id === id)
        : undefined;
    if (!waiting) {
      // Kept for later: its choice answers it, and the request goes on.
      const kept = (await this.office.kept().catch(() => [])).find((one) =>
        kind === "later" ? one.id === id : one.ask === id,
      );
      const given = kept?.choices?.[Number(value)];
      const ok = Boolean(
        kept && given && (await this.office.answer(kept.id, given)),
      );
      if (
        ok &&
        this.waitingWords &&
        [id, kept?.id].includes(this.waitingWords.id)
      )
        this.waitingWords = undefined;
      await this.bot.settle(
        press,
        ok ? tAsk("answered", { answer: given ?? "" }) : t("gone"),
      );
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
    if (this.waitingWords?.id === id) this.waitingWords = undefined;
    await this.bot.settle(press, outcome);
  }

  /** A line added to a conversation: news for the phone, or a flow's answer to keep for it. */
  private onNews(news: ChatNews): void {
    if (news.role === "flow") {
      this.flowChats.set(news.chat, news.text);
      return;
    }
    const flow = this.flowChats.get(news.chat);
    if (
      flow !== undefined &&
      (news.role === "minime" || news.role === "error")
    ) {
      this.flowChats.delete(news.chat);
      this.endings.push({
        kind: "flow",
        name: flow,
        text: news.text,
        failed: news.role === "error",
        at: news.at,
      });
      this.lookSoon(0);
      return;
    }
    if (news.role !== "office" && news.role !== "told") return;
    void (async () => {
      const settings = await loadMessenger();
      // In the phone's own conversation: it comes back there, whoever is watching.
      if (news.chat === settings?.chat) {
        const { chat } = await words();
        await this.say(
          `${news.role === "office" ? chat("fromColleague") : chat("told")}\n${news.text}`,
        );
        return;
      }
      // A colleague's answer in a conversation on the page: for the phone if nobody looks there.
      if (news.role === "office") {
        this.endings.push({ kind: "office", text: news.text });
        this.lookSoon(0);
      }
    })().catch((error) =>
      console.error(`messenger: ${(error as Error).message}`),
    );
  }

  /** Writes to the person first, in their direct messages. */
  private async say(
    text: string,
    choices?: Choice[],
  ): Promise<string | undefined> {
    const channel = await this.dmChannel();
    return channel ? this.bot?.send(channel, text, choices) : undefined;
  }

  private async dmChannel(): Promise<string | undefined> {
    const settings = await loadMessenger();
    const bot = this.bot;
    if (!bot || this.state !== "on" || !settings?.owner) return undefined;
    if (this.channel?.user !== settings.owner.id)
      this.channel = {
        user: settings.owner.id,
        id: await bot.dm(settings.owner.id),
      };
    return this.channel.id;
  }

  private lookSoon(ms: number): void {
    if (!this.bot) return;
    clearTimeout(this.later);
    this.later = setTimeout(() => void this.look(), ms);
    this.later.unref?.();
  }

  /** One look at a time; one asked for meanwhile follows it. */
  private async look(): Promise<void> {
    if (this.looking) {
      this.lookAgain = true;
      return;
    }
    this.looking = true;
    try {
      do {
        this.lookAgain = false;
        await this.lookOnce();
      } while (this.lookAgain);
    } catch (error) {
      console.error(`messenger: ${(error as Error).message}`);
    } finally {
      this.looking = false;
    }
  }

  /** What waits on the person goes to the phone while no page is in view. */
  private async lookOnce(): Promise<void> {
    const now = Date.now();
    for (const [id, at] of this.told)
      if (now - at > TOLD_MS) this.told.delete(id);
    for (const [id, one] of this.asked)
      if (now - one.at > TOLD_MS) this.asked.delete(id);
    const seen = this.presence();
    if (seen.state === "unknown") return this.lookSoon(seen.wait);
    // The page shows it all: what finished meanwhile was seen there.
    if (seen.state === "watching") {
      this.endings = [];
      return;
    }
    const channel = await this.dmChannel();
    if (!channel) return;
    const w = await words();
    // Questions waiting on the person now. A colleague's request waits on someone who said they
    // are away until the day's next moment; the offer to make a rule waits calmly for the page.
    const away = await this.office.away().catch(() => false);
    // What could not be sent stays unsent, and the next look tries again.
    for (const pending of pendingAsks()) {
      if (this.told.has(pending.id) || pending.ask.kind === "rule") continue;
      if (pending.chat && pending.chat === this.turnChat) continue;
      if (away && isRequestChat(pending.chat)) continue;
      const about = await this.about(pending.chat, w);
      // Answered while it was looked into: it no longer waits.
      if (!pendingAsks().some((still) => still.id === pending.id)) continue;
      await this.ask(channel, pending.id, pending.ask, about);
      this.told.set(pending.id, Date.now());
    }
    // Questions kept for later, at the day's moments, once each; one that came live already
    // is not sent again.
    const kept = (await this.office.kept().catch(() => [])).filter(
      (one) => !one.phoned && !this.told.has(one.id),
    );
    const due: Kept[] = [];
    for (const one of kept) {
      if (one.ask && this.told.has(one.ask)) {
        this.told.set(one.id, Date.now());
        await this.office.phoned(one.id).catch(() => {});
      } else if (dueAt(new Date(one.at)).getTime() <= now) due.push(one);
    }
    const open: { kept: Kept; about: string }[] = [];
    for (const one of due) {
      const request = await this.office.about(one.task).catch(() => undefined);
      // Closed meanwhile: nothing to answer.
      if (request && !request.open) {
        this.told.set(one.id, Date.now());
        continue;
      }
      open.push({
        kept: one,
        about: w.t("fromRequest", {
          name: one.from ?? request?.from ?? w.t("colleague"),
          request: clip(request?.text ?? "", ABOUT_CHARS),
        }),
      });
    }
    if (open.length > 1)
      await this.bot?.send(channel, w.t("waiting", { count: open.length }));
    for (const { kept: one, about } of open) {
      await this.askKept(channel, one, about);
      this.told.set(one.id, Date.now());
      await this.office.phoned(one.id).catch(() => {});
    }
    // Finished work nobody has seen.
    while (this.endings.length) {
      await this.bot?.send(channel, this.endingText(this.endings[0], w));
      this.endings.shift();
    }
  }

  /** Whose question it is: who asked what, or the conversation on the page it came from. */
  private async about(
    chat: string | undefined,
    w: Awaited<ReturnType<typeof words>>,
  ): Promise<string> {
    if (isRequestChat(chat)) {
      const task = (chat ?? "").slice("office-request-".length);
      const request = await this.office.about(task).catch(() => undefined);
      return w.t("fromRequest", {
        name: request?.from ?? w.t("colleague"),
        request: clip(request?.text ?? "", ABOUT_CHARS),
      });
    }
    const title = chat
      ? (await readChat(chat).catch(() => undefined))?.info.title
      : undefined;
    return title ? w.t("inChat", { title }) : w.t("fromPage");
  }

  private endingText(
    ending: Ending,
    w: Awaited<ReturnType<typeof words>>,
  ): string {
    if (ending.kind === "office")
      return `${w.chat("fromColleague")}\n${ending.text}`;
    const at = new Intl.DateTimeFormat(w.locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ending.at));
    const text = !ending.failed
      ? ending.text
      : w.errors.has(ending.text as never)
        ? w.errors(ending.text as never)
        : w.t("failed");
    return `${w.chat("flowRan", { name: ending.name, at })}\n\n${text}`;
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
