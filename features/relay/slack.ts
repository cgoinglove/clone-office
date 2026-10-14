// The team's Slack (10-14: people keep the AI and the chat they use; what the office takes over is
// the questions between them). An owner of an office connects one Slack app for the whole team, on
// the team server's Office tab, and from then on anyone in the office asks a colleague's clone from
// Slack: they mention the app and the colleague ("@Clone Office @Minsu how do refunds work?") in a
// channel the app was added to, or write to the app directly. The request goes to that colleague's
// clone as from the one who asked: their place in the office, found by the email their Slack
// account and their account here share (one with an account but no place yet is given one on the
// web, as the pages give it). What comes back is posted in the thread, named as whoever wrote it
// ("Minsu's clone", or Minsu), in the language the asker's Slack speaks; a reply in the thread that
// mentions the app again goes on with the same request. The app reads only what mentions it and
// what is written to it directly, never a channel's other messages.
//
// Socket Mode, as the clone's own Slack is (../minime/messenger/slack.ts): the app-level token opens
// a WebSocket Slack sends events down, so nothing has to reach this server from outside, and the
// bot token speaks through the Web API. Both are sealed under the relay's key, as team keys are,
// and never shown again. Answers are posted by whichever relay process claims them first in the
// database, so relays sharing one database never post one twice.

import type { AllInSync } from "../../i18n/sync.ts";
import { openWith, sealWith } from "../../lib/seal.ts";
import { pieces, slackMrkdwn } from "../minime/messenger/text.ts";
import type { Database } from "./db.ts";
import {
  type Caller,
  FINAL,
  type Member,
  type Relay,
  RelayError,
  type Task,
} from "./relay.ts";

const API = "https://slack.com/api";
/** How often answers are looked for to post. */
const POLL_MS = 3000;
/** Waits between tries after trouble, growing to the last. */
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000, 60_000];
/** Slack's cap on one message's text, with room to spare. */
const MAX_TEXT = 3500;
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

/** The app as Slack makes it from this, with exactly what it uses. */
export const SLACK_MANIFEST = {
  display_information: {
    name: "Clone Office",
    description: "Ask your colleagues' clones from Slack.",
    background_color: "#111111",
  },
  features: {
    app_home: {
      home_tab_enabled: false,
      messages_tab_enabled: true,
      messages_tab_read_only_enabled: false,
    },
    bot_user: { display_name: "Clone Office", always_online: true },
  },
  oauth_config: {
    scopes: {
      bot: [
        "app_mentions:read",
        "chat:write",
        "chat:write.customize",
        "im:history",
        "users:read",
        "users:read.email",
      ],
    },
  },
  settings: {
    event_subscriptions: { bot_events: ["app_mention", "message.im"] },
    org_deploy_enabled: false,
    socket_mode_enabled: true,
    token_rotation_enabled: false,
  },
};

/** Where Slack makes the app from the manifest, filled in. */
export const SLACK_CREATE = `https://api.slack.com/apps?new_app=1&manifest_json=${encodeURIComponent(JSON.stringify(SLACK_MANIFEST))}`;

// ---- Words posted in Slack, in the asker's language ----

const WORDS = {
  en: {
    clone: "{name}'s clone",
    asked: "Asked {name}'s clone. The answer comes in this thread.",
    whom: "Whom should I ask? Mention them with your question: @Clone Office @name …",
    what: "What should I ask {name}'s clone?",
    unknown: "{name} has no place in this office yet.",
    self: "That's you: mention the colleague to ask.",
    stranger:
      "You have no place in this office yet. Ask an owner to invite you with the email your Slack account uses.",
    failed: "{name}'s clone could not answer this time.",
    files: "Files came with it: open them in Clone Office.",
  },
  ko: {
    clone: "{name}의 클론",
    asked: "{name}의 클론에게 물었어요. 답은 이 스레드에 와요.",
    whom: "누구에게 물을까요? 질문과 함께 그 사람을 불러 주세요: @Clone Office @이름 …",
    what: "{name}의 클론에게 무엇을 물을까요?",
    unknown: "{name} 님은 아직 이 오피스에 없어요.",
    self: "본인이에요. 물을 동료를 불러 주세요.",
    stranger:
      "아직 이 오피스에 자리가 없어요. 슬랙과 같은 이메일로 초대해 달라고 오피스 주인에게 말해 주세요.",
    failed: "{name}의 클론이 이번에는 답하지 못했어요.",
    files: "파일이 함께 왔어요. Clone Office에서 열어 보세요.",
  },
  zh: {
    clone: "{name}的分身",
    asked: "已经问了{name}的分身。回答会出现在这个话题里。",
    whom: "要问谁？请在问题里提到对方：@Clone Office @名字 …",
    what: "要问{name}的分身什么？",
    unknown: "{name}还不在这个办公室里。",
    self: "这是你自己。请提到你要问的同事。",
    stranger:
      "你在这个办公室里还没有位置。请让办公室的所有者用你 Slack 账号的邮箱邀请你。",
    failed: "{name}的分身这次没能回答。",
    files: "附带了文件，请在 Clone Office 中打开。",
  },
  ja: {
    clone: "{name}のクローン",
    asked: "{name}のクローンに聞きました。答えはこのスレッドに届きます。",
    whom: "誰に聞きますか？質問と一緒にその人をメンションしてください：@Clone Office @名前 …",
    what: "{name}のクローンに何を聞きますか？",
    unknown: "{name}さんはまだこのオフィスにいません。",
    self: "それはあなたです。聞きたい同僚をメンションしてください。",
    stranger:
      "まだこのオフィスに席がありません。Slackと同じメールアドレスで招待してもらうよう、オフィスのオーナーに頼んでください。",
    failed: "{name}のクローンは今回答えられませんでした。",
    files: "ファイルが届いています。Clone Officeで開いてください。",
  },
  es: {
    clone: "Clon de {name}",
    asked: "Le pregunté al clon de {name}. La respuesta llega en este hilo.",
    whom: "¿A quién pregunto? Menciónalo con tu pregunta: @Clone Office @nombre …",
    what: "¿Qué le pregunto al clon de {name}?",
    unknown: "{name} todavía no está en esta oficina.",
    self: "Ese eres tú: menciona al compañero a quien quieres preguntar.",
    stranger:
      "Todavía no tienes sitio en esta oficina. Pide a quien la administra que te invite con el correo de tu cuenta de Slack.",
    failed: "El clon de {name} no pudo responder esta vez.",
    files: "Llegaron archivos: ábrelos en Clone Office.",
  },
  pt: {
    clone: "Clone de {name}",
    asked: "Perguntei ao clone de {name}. A resposta chega nesta conversa.",
    whom: "Para quem pergunto? Mencione a pessoa junto com a pergunta: @Clone Office @nome …",
    what: "O que pergunto ao clone de {name}?",
    unknown: "{name} ainda não está neste escritório.",
    self: "Esse é você: mencione o colega a quem quer perguntar.",
    stranger:
      "Você ainda não tem lugar neste escritório. Peça a quem o administra para convidar você com o e-mail da sua conta do Slack.",
    failed: "O clone de {name} não conseguiu responder desta vez.",
    files: "Chegaram arquivos: abra-os no Clone Office.",
  },
};
const _wordsInStep: AllInSync<typeof WORDS> = WORDS;

type Lang = keyof typeof WORDS;
type Word = keyof (typeof WORDS)["en"];

/** The asker's language, from the locale Slack keeps for them; English when it is none of ours. */
export function slackLang(locale: string | undefined): Lang {
  const code = (locale ?? "").slice(0, 2).toLowerCase();
  return code in WORDS ? (code as Lang) : "en";
}

function words(lang: Lang, key: Word, name = ""): string {
  return WORDS[lang][key].replaceAll("{name}", name);
}

// ---- Reading what was written ----

/** The people a message mentions, in order, without the app itself. */
export function mentioned(text: string, bot?: string): string[] {
  const out: string[] = [];
  for (const found of text.matchAll(/<@([UW][A-Z0-9]+)(?:\|[^>]*)?>/g))
    if (found[1] !== bot && !out.includes(found[1])) out.push(found[1]);
  return out;
}

/** What a person wrote, as words: mentions out, Slack's escapes and links back to what they typed. */
export function plainWords(text: string): string {
  return text
    .replace(/<@[UW][A-Z0-9]+(?:\|[^>]*)?>/g, " ")
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/<(https?:[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:[^>]+)>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

// ---- The connection ----

/** The socket Slack sends events down (Node's own WebSocket, or a test's). */
export interface SlackSocket {
  send(data: string): void;
  close(code?: number): void;
  addEventListener(
    type: "message" | "close" | "error",
    listener: (event: { data?: unknown }) => void,
  ): void;
}

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
}

interface Tokens {
  bot: string;
  app: string;
}

interface Link {
  office: string;
  tokens: Tokens;
  bot: string;
  socket?: SlackSocket;
  stopped: boolean;
  tries: number;
}

interface SlackPerson {
  email?: string;
  name: string;
  locale?: string;
}

interface ThreadRow {
  office_id: string;
  channel: string;
  thread_ts: string;
  task_id: string;
  asker: string;
  slack_user: string;
  lang: string;
  posted: number;
}

class SlackRefused extends Error {
  readonly code: string;
  readonly refused: boolean;
  constructor(code: string) {
    super(`Slack answered ${code}`);
    this.code = code;
    this.refused = REFUSED.has(code);
  }
}

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms).unref?.());

/** The team's Slack for every office that connected one. Fields written out: Node strips this file. */
export class TeamSlack {
  private relay: Relay;
  private db: Database;
  private key: Buffer | undefined;
  private request: typeof fetch;
  private open: (url: string) => SlackSocket;
  private api: string;
  private links = new Map<string, Link>();
  private people = new Map<string, Promise<SlackPerson>>();
  /** Events already taken, as Slack may send one twice (a mention in a direct message). */
  private seen = new Map<string, number>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;

  constructor(
    relay: Relay,
    db: Database,
    key: Buffer | undefined,
    options: {
      fetch?: typeof fetch;
      open?: (url: string) => SlackSocket;
      /** Stands in for slack.com in tests. */
      api?: string;
    } = {},
  ) {
    this.relay = relay;
    this.db = db;
    this.key = key;
    this.request = options.fetch ?? fetch;
    this.open =
      options.open ?? ((url) => new WebSocket(url) as unknown as SlackSocket);
    this.api = options.api ?? API;
  }

  /** Connects every office that has its Slack, and looks for answers to post from then on. */
  async start(): Promise<void> {
    if (!this.key) return;
    const rows = await this.db.query<{
      office_id: string;
      sealed: string;
      bot_user: string;
    }>("SELECT office_id, sealed, bot_user FROM office_slack");
    for (const row of rows)
      this.connect(row.office_id, row.sealed, row.bot_user);
    this.timer ??= setInterval(() => void this.poll(), POLL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const link of this.links.values()) this.disconnect(link);
    this.links.clear();
  }

  /** The office's Slack as its page shows it: connected, to which workspace, by whom. */
  async status(
    office: string,
  ): Promise<{ on: boolean; team?: string; by?: string; sealing: boolean }> {
    const [row] = await this.db.query<{ team: string; set_by: string }>(
      "SELECT team, set_by FROM office_slack WHERE office_id = $1",
      [office],
    );
    if (!row) return { on: false, sealing: Boolean(this.key) };
    const [who] = await this.db
      .query<{ name: string }>("SELECT name FROM auth_users WHERE id = $1", [
        row.set_by,
      ])
      .catch(() => []);
    return {
      on: true,
      team: row.team,
      ...(who ? { by: who.name } : {}),
      sealing: Boolean(this.key),
    };
  }

  /**
   * Connects the office's Slack with its two tokens after Slack says both work, or lets it go
   * (null). Only an owner of the office comes here (the handler asks the accounts first).
   */
  async set(
    office: string,
    user: string,
    tokens: Tokens | null,
  ): Promise<void> {
    if (!tokens) {
      await this.db.query("DELETE FROM office_slack WHERE office_id = $1", [
        office,
      ]);
      const link = this.links.get(office);
      if (link) this.disconnect(link);
      this.links.delete(office);
      return;
    }
    if (!this.key)
      throw new RelayError(
        409,
        "This server keeps no Slack tokens until RELAY_ENCRYPTION_KEY is set.",
        "slack-unsealed",
      );
    const bot = tokens.bot.trim();
    const app = tokens.app.trim();
    if (!/^xoxb-[\w-]{10,}$/.test(bot) || !/^xapp-[\w-]{10,}$/.test(app))
      throw new RelayError(400, "Not Slack's tokens.", "slack-token-wrong");
    let me: { team?: string; user_id?: string };
    try {
      me = await this.call<{ team?: string; user_id?: string }>(
        "auth.test",
        {},
        bot,
      );
      await this.call("apps.connections.open", {}, app);
    } catch (error) {
      if (error instanceof SlackRefused)
        throw new RelayError(400, "Slack refused it.", "slack-token-wrong");
      throw new RelayError(502, "Slack did not answer.", "slack-unreachable");
    }
    const sealed = sealWith(this.key, JSON.stringify({ bot, app }));
    await this.db.query(
      "INSERT INTO office_slack (office_id, sealed, team, bot_user, set_by, updated) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (office_id) DO UPDATE SET sealed = $2, team = $3, bot_user = $4, set_by = $5, updated = $6",
      [
        office,
        sealed,
        String(me.team ?? "Slack").slice(0, 80),
        String(me.user_id ?? ""),
        user,
        new Date().toISOString(),
      ],
    );
    const old = this.links.get(office);
    if (old) this.disconnect(old);
    this.links.delete(office);
    this.connect(office, sealed, String(me.user_id ?? ""));
    this.timer ??= setInterval(() => void this.poll(), POLL_MS);
    this.timer.unref?.();
  }

  private connect(office: string, sealed: string, bot: string): void {
    if (!this.key) return;
    let tokens: Tokens;
    try {
      tokens = JSON.parse(openWith(this.key, sealed));
    } catch {
      return;
    }
    const link: Link = { office, tokens, bot, stopped: false, tries: 0 };
    this.links.set(office, link);
    void this.openSocket(link);
  }

  private disconnect(link: Link): void {
    link.stopped = true;
    const socket = link.socket;
    link.socket = undefined;
    try {
      socket?.close(1000);
    } catch {
      // closed already
    }
  }

  /** A fresh address from Slack each time, after a wait when the last went wrong. */
  private async openSocket(link: Link): Promise<void> {
    while (!link.stopped) {
      try {
        const { url } = await this.call<{ url: string }>(
          "apps.connections.open",
          {},
          link.tokens.app,
        );
        if (link.stopped) return;
        this.listen(link, this.open(url));
        return;
      } catch (error) {
        // a token Slack refuses waits for an owner to connect it again
        if (error instanceof SlackRefused && error.refused) {
          link.stopped = true;
          return;
        }
        await sleep(BACKOFF_MS[Math.min(link.tries, BACKOFF_MS.length - 1)]);
        link.tries += 1;
      }
    }
  }

  private listen(link: Link, socket: SlackSocket): void {
    link.socket = socket;
    socket.addEventListener("message", (message) => {
      if (link.socket !== socket) return;
      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(String(message.data));
      } catch {
        return;
      }
      // Taken at once: Slack sends again what is not, and a request takes longer than it waits.
      if (typeof frame.envelope_id === "string")
        try {
          socket.send(JSON.stringify({ envelope_id: frame.envelope_id }));
        } catch {
          // closing already
        }
      if (frame.type === "hello") link.tries = 0;
      if (frame.type === "disconnect") {
        if (frame.reason === "link_disabled") link.stopped = true;
        socket.close(1000);
        return;
      }
      if (frame.type !== "events_api") return;
      const payload = (frame.payload ?? {}) as { event?: SlackEvent };
      const event = payload.event ?? {};
      const direct =
        event.type === "message" &&
        event.channel_type === "im" &&
        !event.subtype;
      if (event.type !== "app_mention" && !direct) return;
      if (event.bot_id || !event.user || !event.channel || !event.ts) return;
      const key = `${event.channel}:${event.ts}`;
      if (this.seen.has(key)) return;
      this.seen.set(key, Date.now());
      for (const [old, at] of this.seen)
        if (Date.now() - at > 10 * 60 * 1000) this.seen.delete(old);
      void this.take(link, event).catch(() => {});
    });
    socket.addEventListener("close", () => {
      if (link.socket !== socket) return;
      link.socket = undefined;
      if (link.stopped) return;
      const wait = BACKOFF_MS[Math.min(link.tries, BACKOFF_MS.length - 1)];
      link.tries += 1;
      setTimeout(() => {
        if (!link.stopped && !link.socket) void this.openSocket(link);
      }, wait).unref?.();
    });
    socket.addEventListener("error", () => {});
  }

  /** One mention or direct message: a new request, or more words for the thread's request. */
  async take(link: Link, event: SlackEvent): Promise<void> {
    const office = link.office;
    const channel = event.channel as string;
    const user = event.user as string;
    const thread = event.thread_ts ?? (event.ts as string);
    const text = event.text ?? "";
    const asker = await this.person(link, user);
    const lang = slackLang(asker.locale);
    const reply = (words: string) =>
      this.post(link, channel, thread, words).catch(() => {});
    // The one asking: their place in the office, by the email Slack and this server share.
    const caller = await this.callerFor(office, asker);
    if (!caller) return reply(words(lang, "stranger"));
    const others = mentioned(text, link.bot);
    const said = plainWords(text);
    const [kept] = event.thread_ts
      ? await this.db.query<ThreadRow>(
          "SELECT * FROM slack_threads WHERE office_id = $1 AND channel = $2 AND thread_ts = $3",
          [office, channel, event.thread_ts],
        )
      : [];
    // More words in a thread a request was asked in, by the one who asked it.
    if (kept && kept.slack_user === user && others.length === 0) {
      if (!said) return;
      const task = await this.relay
        .taskFor(caller, kept.task_id)
        .catch(() => undefined);
      if (task && !FINAL.includes(task.status.state)) {
        await this.relay.update(caller, task.id, { text: said, by: "person" });
        return;
      }
      if (task) {
        await this.ask(caller, task.metadata.to, said, {
          link,
          channel,
          thread,
          user,
          lang,
          context: task.contextId,
          direct: event.channel_type === "im",
        });
        return;
      }
    }
    const to = others[0];
    if (!to) return reply(words(lang, "whom"));
    const target = await this.colleague(link, office, to);
    if (!target) {
      const them = await this.person(link, to);
      return reply(words(lang, "unknown", them.name));
    }
    if (target.id === caller.id) return reply(words(lang, "self"));
    if (!said) return reply(words(lang, "what", target.card.name));
    await this.ask(caller, target.id, said, {
      link,
      channel,
      thread,
      user,
      lang,
      direct: event.channel_type === "im",
    });
    await reply(words(lang, "asked", target.card.name));
  }

  /** Sends the request and remembers the thread it is answered in. */
  private async ask(
    caller: Caller,
    to: string,
    said: string,
    at: {
      link: Link;
      channel: string;
      thread: string;
      user: string;
      lang: Lang;
      context?: string;
      direct: boolean;
    },
  ): Promise<Task> {
    // Where the answer goes, for the clone and the look before it leaves to weigh.
    const where = at.direct
      ? "(Asked from Slack, in a direct message: the answer goes back to them alone.)"
      : "(Asked from Slack, in a channel: the answer is posted in its thread, for everyone in that channel to read.)";
    const task = await this.relay.send(
      caller,
      to,
      `${said}\n\n${where}`,
      [],
      at.context,
      "person",
    );
    await this.db.query(
      "INSERT INTO slack_threads (office_id, channel, thread_ts, task_id, asker, slack_user, lang, posted, done, created) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, false, $8) ON CONFLICT (office_id, channel, thread_ts) DO UPDATE SET task_id = $4, asker = $5, slack_user = $6, lang = $7, posted = 0, done = false",
      [
        at.link.office,
        at.channel,
        at.thread,
        task.id,
        caller.id,
        at.user,
        at.lang,
        new Date().toISOString(),
      ],
    );
    return task;
  }

  /** The asker's place in the office: theirs, or one on the web made for an account here. */
  private async callerFor(
    office: string,
    person: SlackPerson,
  ): Promise<Caller | undefined> {
    if (!person.email) return undefined;
    const [account] = await this.db
      .query<{ id: string; name: string }>(
        "SELECT u.id, u.name FROM auth_users u JOIN office_people p ON p.user_id = u.id WHERE p.office_id = $1 AND lower(u.email) = lower($2)",
        [office, person.email],
      )
      .catch(() => []);
    if (!account) return undefined;
    return (
      (await this.relay.callerFor(office, account.id)) ??
      this.relay.joinWeb(office, account.id, {
        name: account.name || person.name,
        description: "",
      })
    );
  }

  /** A colleague mentioned in Slack, as a member of the office: by email, else by exact name. */
  private async colleague(
    link: Link,
    office: string,
    user: string,
  ): Promise<Member | undefined> {
    const them = await this.person(link, user);
    if (them.email) {
      const [account] = await this.db
        .query<{ id: string }>(
          "SELECT u.id FROM auth_users u JOIN office_people p ON p.user_id = u.id WHERE p.office_id = $1 AND lower(u.email) = lower($2)",
          [office, them.email],
        )
        .catch(() => []);
      const member = account
        ? await this.relay.memberOf(office, account.id)
        : undefined;
      if (member) return member;
    }
    const name = them.name.trim().toLowerCase();
    const same = (await this.relay.members(office)).filter(
      (member) => member.card.name.trim().toLowerCase() === name,
    );
    // never a guess: one exact name, or nobody
    return same.length === 1 ? same[0] : undefined;
  }

  /** A Slack user as the app may read them, asked once each. */
  private person(link: Link, user: string): Promise<SlackPerson> {
    const key = `${link.office}:${user}`;
    let known = this.people.get(key);
    if (!known) {
      known = this.call<{
        user?: {
          real_name?: string;
          name?: string;
          locale?: string;
          profile?: {
            email?: string;
            display_name?: string;
            real_name?: string;
          };
        };
      }>("users.info", { user, include_locale: "true" }, link.tokens.bot)
        .then(({ user: found }) => ({
          name:
            found?.profile?.real_name ||
            found?.real_name ||
            found?.profile?.display_name ||
            found?.name ||
            user,
          ...(found?.profile?.email ? { email: found.profile.email } : {}),
          ...(found?.locale ? { locale: found.locale } : {}),
        }))
        .catch(() => {
          this.people.delete(key);
          return { name: user };
        });
      this.people.set(key, known);
      setTimeout(() => this.people.delete(key), 10 * 60 * 1000).unref?.();
    }
    return known;
  }

  /** Posts what came back on the requests asked from Slack, each answer once. */
  async poll(): Promise<void> {
    if (this.polling || !this.links.size) return;
    this.polling = true;
    try {
      const rows = await this.db.query<ThreadRow>(
        "SELECT * FROM slack_threads WHERE NOT done ORDER BY created LIMIT 200",
      );
      for (const row of rows) {
        const link = this.links.get(row.office_id);
        if (!link) continue;
        await this.deliver(link, row).catch(() => {});
      }
    } finally {
      this.polling = false;
    }
  }

  private async deliver(link: Link, row: ThreadRow): Promise<void> {
    const caller: Caller = {
      id: row.asker,
      office: row.office_id,
      card: { name: "", description: "" },
    };
    const task = await this.relay.taskFor(caller, row.task_id).catch(() => {
      return undefined;
    });
    const where = [row.office_id, row.channel, row.thread_ts, row.task_id];
    if (!task) {
      await this.db.query(
        "UPDATE slack_threads SET done = true WHERE office_id = $1 AND channel = $2 AND thread_ts = $3 AND task_id = $4",
        where,
      );
      return;
    }
    const answers = task.history.filter((message) => message.role === "agent");
    const final = FINAL.includes(task.status.state);
    // Claimed in the database first: of relays sharing it, one posts each answer.
    const from = await this.db.transaction(async (tx) => {
      const [now] = await tx.query<{ posted: number }>(
        "SELECT posted FROM slack_threads WHERE office_id = $1 AND channel = $2 AND thread_ts = $3 AND task_id = $4 FOR UPDATE",
        where,
      );
      if (!now) return undefined;
      const posted = Number(now.posted);
      if (posted >= answers.length && !final) return undefined;
      await tx.query(
        "UPDATE slack_threads SET posted = $5, done = $6 WHERE office_id = $1 AND channel = $2 AND thread_ts = $3 AND task_id = $4",
        [...where, Math.max(posted, answers.length), final],
      );
      return posted;
    });
    if (from === undefined) return;
    const lang = slackLang(row.lang);
    const target = (await this.relay.members(row.office_id)).find(
      (member) => member.id === task.metadata.to,
    );
    const name = target?.card.name ?? "";
    for (const answer of answers.slice(from)) {
      const text = answer.parts
        .map((part) => part.text)
        .join("\n")
        .trim();
      const files = answer.files?.length ? `\n\n_${words(lang, "files")}_` : "";
      await this.post(
        link,
        row.channel,
        row.thread_ts,
        `${slackMrkdwn(text)}${files}`,
        answer.metadata?.by === "person" ? name : words(lang, "clone", name),
      );
    }
    if (
      final &&
      !answers.length &&
      (task.status.state === "FAILED" || task.status.state === "REJECTED")
    )
      await this.post(
        link,
        row.channel,
        row.thread_ts,
        words(lang, "failed", name),
      );
  }

  /** A message in the thread, as the app or named as the one who answered. */
  private async post(
    link: Link,
    channel: string,
    thread: string,
    text: string,
    as?: string,
  ): Promise<void> {
    for (const piece of pieces(text, MAX_TEXT))
      await this.call(
        "chat.postMessage",
        {
          channel,
          thread_ts: thread,
          text: piece,
          unfurl_links: "false",
          ...(as ? { username: as.slice(0, 80) } : {}),
        },
        link.tokens.bot,
      );
  }

  private async call<T = Record<string, unknown>>(
    method: string,
    body: Record<string, string>,
    token: string,
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const response = await this.request(`${this.api}/${method}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(body).toString(),
        signal: AbortSignal.timeout(15_000),
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
      throw new SlackRefused(said?.error ?? `http_${response.status}`);
    }
  }
}
