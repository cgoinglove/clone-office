// The team's Slack (10-14: people keep the AI and the chat they use; what the office takes over is
// the questions between them). An owner of an office connects one Slack app for the whole team, on
// the team server's Office tab, and from then on anyone in the office asks a colleague's clone from
// Slack: they mention the app and the colleague ("@Clone Office @Minsu how do refunds work?") in a
// channel the app was added to, or write to the app directly. The request goes to that colleague's
// clone as from the one who asked, and what comes back is posted in the thread, named as whoever
// wrote it ("Minsu's clone", or Minsu), in the language the asker's Slack speaks; a mention later in
// the thread goes on with the same request. The app reads only what mentions it and what is written
// to it directly, never a channel's other messages.
//
// Who is who: a Slack account is someone's place in the office once they linked it (a six-digit
// code from their page on the team server, sent to the app), or when its email is one Google
// checked for their account here; an email anyone could type when signing up is never enough, so
// nobody asks or answers as someone else. Someone with an account but no place yet is given one on
// the web, as the pages give it. A channel shared with another company gets no answer at all, and a
// request asked in a channel says so in its message (`via`), so the colleague's clone reads nothing
// it would otherwise read alone, since everyone in the channel reads the answer.
//
// Socket Mode, as the clone's own Slack is (../minime/messenger/slack.ts): the app-level token opens
// a WebSocket Slack sends events down, so nothing has to reach this server from outside, and the
// bot token speaks through the Web API. Both are sealed under the relay's key, as team keys are,
// and never shown again. Each process looks at what is connected every minute, so relays sharing a
// database follow a change one of them made; answers are claimed in the database before they are
// posted (and given back when Slack refuses one), so none is posted twice or lost.

import { createHash, randomInt } from "node:crypto";
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
/** How often what is connected is looked at again, for a change another process made. */
const SYNC_MS = 60_000;
/** A request asked from Slack is followed this long, then let go. */
const FOLLOW_DAYS = 14;
/** How long a code to link one's Slack works. */
const CODE_MINUTES = 10;
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

/** Answers that mean a thread will never take another message. */
const GONE = new Set([
  "channel_not_found",
  "is_archived",
  "not_in_channel",
  "thread_not_found",
  "message_not_found",
  "restricted_action",
  ...REFUSED,
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
        "channels:read",
        "groups:read",
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
    unknown:
      "I can't tell who {name} is in the office yet: they link their Slack once, from their page on the team server.",
    self: "That's you: mention the colleague to ask.",
    stranger:
      "Link your Slack to your place in the office first: on the team server, open your account page, press Link Slack and send me the code it shows, here in a direct message.",
    shared:
      "I don't answer in a channel shared with another company. Ask me in a direct message or in one of your own channels.",
    linked: "Linked: in this office you are {name}.",
    codeWrong:
      "That code doesn't work: it may have ended. Make a new one on your account page.",
    failed: "{name}'s clone could not answer this time.",
    files: "Files came with it: open them in Clone Office.",
  },
  ko: {
    clone: "{name}의 클론",
    asked: "{name}의 클론에게 물었어요. 답은 이 스레드에 와요.",
    whom: "누구에게 물을까요? 질문과 함께 그 사람을 불러 주세요: @Clone Office @이름 …",
    what: "{name}의 클론에게 무엇을 물을까요?",
    unknown:
      "아직 오피스에서 {name} 님이 누구인지 알 수 없어요. 그분이 팀 서버의 내 페이지에서 슬랙을 한 번 연결하면 돼요.",
    self: "본인이에요. 물을 동료를 불러 주세요.",
    stranger:
      '먼저 내 슬랙을 오피스 자리와 연결해 주세요. 팀 서버의 내 계정 페이지에서 "슬랙 연결"을 누르고, 나오는 코드를 여기 DM으로 보내 주세요.',
    shared:
      "다른 회사와 함께 쓰는 채널에서는 답하지 않아요. DM이나 우리 회사 채널에서 물어 주세요.",
    linked: "연결했어요. 이 오피스에서 {name} 님이에요.",
    codeWrong:
      "그 코드는 쓸 수 없어요. 시간이 지났을 수 있어요. 계정 페이지에서 새로 만들어 주세요.",
    failed: "{name}의 클론이 이번에는 답하지 못했어요.",
    files: "파일이 함께 왔어요. Clone Office에서 열어 보세요.",
  },
  zh: {
    clone: "{name}的分身",
    asked: "已经问了{name}的分身。回答会出现在这个话题里。",
    whom: "要问谁？请在问题里提到对方：@Clone Office @名字 …",
    what: "要问{name}的分身什么？",
    unknown:
      "我还不知道{name}在办公室里是谁：对方需要在团队服务器的个人页面上连接一次 Slack。",
    self: "这是你自己。请提到你要问的同事。",
    stranger:
      "请先把你的 Slack 连接到你在办公室的位置：在团队服务器打开你的账户页面，点“连接 Slack”，然后把显示的代码私信发给我。",
    shared:
      "我不在与其他公司共享的频道里回答。请私信我，或在你们自己的频道里问。",
    linked: "已连接：你在这个办公室里是{name}。",
    codeWrong: "这个代码不能用了，可能已过期。请在账户页面重新生成。",
    failed: "{name}的分身这次没能回答。",
    files: "附带了文件，请在 Clone Office 中打开。",
  },
  ja: {
    clone: "{name}のクローン",
    asked: "{name}のクローンに聞きました。答えはこのスレッドに届きます。",
    whom: "誰に聞きますか？質問と一緒にその人をメンションしてください：@Clone Office @名前 …",
    what: "{name}のクローンに何を聞きますか？",
    unknown:
      "オフィスで{name}さんが誰なのかまだ分かりません。チームサーバーの自分のページでSlackを一度連携してもらえば大丈夫です。",
    self: "それはあなたです。聞きたい同僚をメンションしてください。",
    stranger:
      "まずSlackをオフィスの席と連携してください。チームサーバーのアカウントページで「Slackを連携」を押し、表示されたコードをここにDMで送ってください。",
    shared:
      "他社と共有しているチャンネルでは答えません。DMか自社のチャンネルで聞いてください。",
    linked: "連携しました。このオフィスでは{name}さんです。",
    codeWrong:
      "そのコードは使えません。期限が切れたかもしれません。アカウントページで作り直してください。",
    failed: "{name}のクローンは今回答えられませんでした。",
    files: "ファイルが届いています。Clone Officeで開いてください。",
  },
  es: {
    clone: "Clon de {name}",
    asked: "Le pregunté al clon de {name}. La respuesta llega en este hilo.",
    whom: "¿A quién pregunto? Menciónalo con tu pregunta: @Clone Office @nombre …",
    what: "¿Qué le pregunto al clon de {name}?",
    unknown:
      "Todavía no sé quién es {name} en la oficina: debe vincular su Slack una vez, desde su página en el servidor del equipo.",
    self: "Ese eres tú: menciona al compañero a quien quieres preguntar.",
    stranger:
      "Primero vincula tu Slack con tu lugar en la oficina: en el servidor del equipo abre la página de tu cuenta, pulsa Vincular Slack y envíame aquí por mensaje directo el código que aparece.",
    shared:
      "No respondo en canales compartidos con otra empresa. Pregúntame por mensaje directo o en uno de tus canales.",
    linked: "Vinculado: en esta oficina eres {name}.",
    codeWrong:
      "Ese código no funciona: puede que haya caducado. Crea uno nuevo en la página de tu cuenta.",
    failed: "El clon de {name} no pudo responder esta vez.",
    files: "Llegaron archivos: ábrelos en Clone Office.",
  },
  pt: {
    clone: "Clone de {name}",
    asked: "Perguntei ao clone de {name}. A resposta chega nesta conversa.",
    whom: "Para quem pergunto? Mencione a pessoa junto com a pergunta: @Clone Office @nome …",
    what: "O que pergunto ao clone de {name}?",
    unknown:
      "Ainda não sei quem é {name} no escritório: a pessoa precisa vincular o Slack uma vez, pela página dela no servidor da equipe.",
    self: "Esse é você: mencione o colega a quem quer perguntar.",
    stranger:
      "Primeiro vincule seu Slack ao seu lugar no escritório: no servidor da equipe, abra a página da sua conta, toque em Vincular Slack e me envie aqui por mensagem direta o código que aparecer.",
    shared:
      "Não respondo em canais compartilhados com outra empresa. Pergunte por mensagem direta ou em um dos seus canais.",
    linked: "Vinculado: neste escritório você é {name}.",
    codeWrong:
      "Esse código não funciona: pode ter expirado. Crie um novo na página da sua conta.",
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

const hashCode = (code: string) =>
  createHash("sha256").update(`slack-link:${code}`).digest("hex");

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
  sealed: string;
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
  task_id: string;
  channel: string;
  thread_ts: string;
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
  private synced = 0;

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
    await this.sync();
    this.timer ??= setInterval(() => void this.poll(), POLL_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    for (const link of this.links.values()) this.disconnect(link);
    this.links.clear();
  }

  /**
   * What this process holds, brought in line with what is connected: an office connected or its
   * tokens changed by another process is connected (again) here, one let go is let go here too.
   */
  async sync(): Promise<void> {
    if (!this.key) return;
    this.synced = Date.now();
    const rows = await this.db.query<{
      office_id: string;
      sealed: string;
      bot_user: string;
    }>("SELECT office_id, sealed, bot_user FROM office_slack");
    const now = new Set(rows.map((row) => row.office_id));
    for (const [office, link] of this.links)
      if (!now.has(office)) {
        this.disconnect(link);
        this.links.delete(office);
      }
    for (const row of rows) {
      const held = this.links.get(row.office_id);
      if (held?.sealed === row.sealed) continue;
      if (held) this.disconnect(held);
      this.connect(row.office_id, row.sealed, row.bot_user);
    }
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
   * (null), with what was being followed there. Only an owner of the office comes here (the
   * handler asks the accounts first).
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
      await this.db.query("DELETE FROM slack_threads WHERE office_id = $1", [
        office,
      ]);
      await this.sync();
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
    await this.sync();
    this.timer ??= setInterval(() => void this.poll(), POLL_MS);
    this.timer.unref?.();
  }

  // ---- Linking one's Slack, from one's page ----

  /** A code for one's page: sent to the app in Slack, it links that Slack account to them. */
  async linkCode(office: string, user: string): Promise<string> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.db.query(
      "DELETE FROM slack_codes WHERE (office_id = $1 AND user_id = $2) OR expires < $3",
      [office, user, new Date().toISOString()],
    );
    await this.db.query(
      "INSERT INTO slack_codes (code_hash, office_id, user_id, expires) VALUES ($1, $2, $3, $4) ON CONFLICT (code_hash) DO UPDATE SET office_id = $2, user_id = $3, expires = $4",
      [
        hashCode(`${office}:${code}`),
        office,
        user,
        new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
      ],
    );
    return code;
  }

  /** The Slack name linked to someone in the office, if any. */
  async linkedName(office: string, user: string): Promise<string | undefined> {
    const [row] = await this.db.query<{ name: string }>(
      "SELECT name FROM slack_people WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    return row?.name;
  }

  async unlink(office: string, user: string): Promise<void> {
    await this.db.query(
      "DELETE FROM slack_people WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
  }

  /** A code sent to the app: links the Slack account that sent it, the code used up. */
  private async takeCode(
    office: string,
    code: string,
    slackUser: string,
    name: string,
  ): Promise<string | undefined> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ user_id: string }>(
        "DELETE FROM slack_codes WHERE code_hash = $1 AND office_id = $2 AND expires > $3 RETURNING user_id",
        [hashCode(`${office}:${code}`), office, new Date().toISOString()],
      );
      if (!row) return undefined;
      await tx.query(
        "DELETE FROM slack_people WHERE office_id = $1 AND (user_id = $2 OR slack_user = $3)",
        [office, row.user_id, slackUser],
      );
      await tx.query(
        "INSERT INTO slack_people (office_id, slack_user, user_id, name, linked) VALUES ($1, $2, $3, $4, $5)",
        [
          office,
          slackUser,
          row.user_id,
          name.slice(0, 80),
          new Date().toISOString(),
        ],
      );
      const [account] = await tx.query<{ name: string }>(
        "SELECT name FROM auth_users WHERE id = $1",
        [row.user_id],
      );
      return account?.name ?? name;
    });
  }

  // ---- The connection ----

  private connect(office: string, sealed: string, bot: string): void {
    if (!this.key) return;
    let tokens: Tokens;
    try {
      tokens = JSON.parse(openWith(this.key, sealed));
    } catch {
      return;
    }
    const link: Link = {
      office,
      sealed,
      tokens,
      bot,
      stopped: false,
      tries: 0,
    };
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

  /** One mention or direct message: a code, a new request, or more words for the thread's. */
  async take(link: Link, event: SlackEvent): Promise<void> {
    const office = link.office;
    const channel = event.channel as string;
    const user = event.user as string;
    const thread = event.thread_ts ?? (event.ts as string);
    const text = event.text ?? "";
    const direct = event.channel_type === "im";
    const asker = await this.person(link, user);
    const lang = slackLang(asker.locale);
    const reply = (words: string) =>
      this.post(link, channel, thread, words).catch(() => {});
    // A code from one's page, sent directly: this Slack account is them from now on.
    const code = /^\s*(\d{6})\s*$/.exec(plainWords(text))?.[1];
    if (direct && code) {
      const name = await this.takeCode(office, code, user, asker.name);
      return reply(
        name ? words(lang, "linked", name) : words(lang, "codeWrong"),
      );
    }
    // Never where another company reads along.
    if (!direct && !(await this.ownChannel(link, channel)))
      return reply(words(lang, "shared"));
    const caller = await this.callerFor(office, user, asker);
    if (!caller) return reply(words(lang, "stranger"));
    const others = mentioned(text, link.bot);
    const said = plainWords(text);
    const [kept] = event.thread_ts
      ? await this.db.query<ThreadRow>(
          "SELECT * FROM slack_threads WHERE office_id = $1 AND channel = $2 AND thread_ts = $3 AND slack_user = $4 ORDER BY created DESC LIMIT 1",
          [office, channel, event.thread_ts, user],
        )
      : [];
    const via = direct ? "slack-dm" : "slack-channel";
    // More words in a thread they asked in.
    if (kept && others.length === 0) {
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
          via,
          context: task.contextId,
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
      via,
    });
    await reply(words(lang, "asked", target.card.name));
  }

  /** Whether a channel is the workspace's own, not shared with another company; unsure is no. */
  private async ownChannel(link: Link, channel: string): Promise<boolean> {
    try {
      const { channel: found } = await this.call<{
        channel?: { is_ext_shared?: boolean; is_shared?: boolean };
      }>("conversations.info", { channel }, link.tokens.bot);
      return Boolean(found) && !found?.is_ext_shared && !found?.is_shared;
    } catch {
      return false;
    }
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
      via: "slack-channel" | "slack-dm";
      context?: string;
    },
  ): Promise<Task> {
    // Where the answer goes, for the clone and the look before it leaves to weigh.
    const where =
      at.via === "slack-dm"
        ? "(Asked from Slack, in a direct message: the answer goes back to them alone.)"
        : "(Asked from Slack, in a channel: the answer is posted in its thread, for everyone in that channel to read.)";
    const task = await this.relay.send(
      caller,
      to,
      `${said}\n\n${where}`,
      [],
      at.context,
      "person",
      at.via,
    );
    await this.db.query(
      "INSERT INTO slack_threads (office_id, task_id, channel, thread_ts, asker, slack_user, lang, posted, done, created) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, false, $8)",
      [
        at.link.office,
        task.id,
        at.channel,
        at.thread,
        caller.id,
        at.user,
        at.lang,
        new Date().toISOString(),
      ],
    );
    return task;
  }

  /** The account a Slack account is: linked with a code, or by an email Google checked for it. */
  private async accountFor(
    office: string,
    slackUser: string,
    person: SlackPerson,
  ): Promise<{ id: string; name: string } | undefined> {
    const [linked] = await this.db.query<{ id: string; name: string }>(
      "SELECT u.id, u.name FROM slack_people s JOIN auth_users u ON u.id = s.user_id JOIN office_people p ON p.user_id = u.id AND p.office_id = s.office_id WHERE s.office_id = $1 AND s.slack_user = $2",
      [office, slackUser],
    );
    if (linked) return linked;
    if (!person.email) return undefined;
    const [checked] = await this.db
      .query<{ id: string; name: string }>(
        `SELECT u.id, u.name FROM auth_users u JOIN office_people p ON p.user_id = u.id WHERE p.office_id = $1 AND lower(u.email) = lower($2) AND u."emailVerified" = true`,
        [office, person.email],
      )
      .catch(() => []);
    return checked;
  }

  /** The asker's place in the office: theirs, or one on the web made for their account. */
  private async callerFor(
    office: string,
    slackUser: string,
    person: SlackPerson,
  ): Promise<Caller | undefined> {
    const account = await this.accountFor(office, slackUser, person);
    if (!account) return undefined;
    return (
      (await this.relay.callerFor(office, account.id)) ??
      this.relay.joinWeb(office, account.id, {
        name: account.name || person.name,
        description: "",
      })
    );
  }

  /** A colleague mentioned in Slack, as a member of the office: linked or Google-checked, never a guess. */
  private async colleague(
    link: Link,
    office: string,
    user: string,
  ): Promise<Member | undefined> {
    const them = await this.person(link, user);
    const account = await this.accountFor(office, user, them);
    return account ? this.relay.memberOf(office, account.id) : undefined;
  }

  /** A Slack user as the app may read them, asked once each for a while. */
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
    if (this.polling) return;
    this.polling = true;
    try {
      if (Date.now() - this.synced > SYNC_MS) await this.sync().catch(() => {});
      if (!this.links.size) return;
      // Followed this long, a request is let go.
      await this.db.query(
        "UPDATE slack_threads SET done = true WHERE NOT done AND created < $1",
        [
          new Date(
            Date.now() - FOLLOW_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        ],
      );
      // Only the offices this process holds a connection for, the oldest first, each its share.
      const rows = await this.db.query<ThreadRow>(
        "SELECT * FROM slack_threads WHERE NOT done AND office_id = ANY($1::text[]) ORDER BY created LIMIT 500",
        [[...this.links.keys()]],
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
    const where = [row.office_id, row.task_id];
    const task = await this.relay
      .taskFor(caller, row.task_id)
      .catch(() => undefined);
    if (!task) {
      await this.db.query(
        "UPDATE slack_threads SET done = true WHERE office_id = $1 AND task_id = $2",
        where,
      );
      return;
    }
    const answers = task.history.filter((message) => message.role === "agent");
    const final = FINAL.includes(task.status.state);
    // Claimed in the database first: of relays sharing it, one posts each answer.
    const from = await this.db.transaction(async (tx) => {
      const [now] = await tx.query<{ posted: number }>(
        "SELECT posted FROM slack_threads WHERE office_id = $1 AND task_id = $2 AND NOT done FOR UPDATE",
        where,
      );
      if (!now) return undefined;
      const posted = Number(now.posted);
      if (posted >= answers.length && !final) return undefined;
      await tx.query(
        "UPDATE slack_threads SET posted = $3, done = $4 WHERE office_id = $1 AND task_id = $2",
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
    let sent = from;
    try {
      for (const answer of answers.slice(from)) {
        const text = answer.parts
          .map((part) => part.text)
          .join("\n")
          .trim();
        const files = answer.files?.length
          ? `\n\n_${words(lang, "files")}_`
          : "";
        await this.post(
          link,
          row.channel,
          row.thread_ts,
          `${slackMrkdwn(text)}${files}`,
          answer.metadata?.by === "person" ? name : words(lang, "clone", name),
        );
        sent += 1;
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
    } catch (error) {
      // A thread that is gone for good (the channel archived, the app taken out) is let go.
      if (error instanceof SlackRefused && GONE.has(error.code)) return;
      // What Slack did not take is given back, to be posted on the next look.
      await this.db.query(
        "UPDATE slack_threads SET posted = $3, done = false WHERE office_id = $1 AND task_id = $2 AND posted = $4",
        [...where, sent, Math.max(from, answers.length)],
      );
    }
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
