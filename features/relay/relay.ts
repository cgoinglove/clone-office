// The relay: a small server a team runs, that carries requests between its members' mini-mes.
// A mini-me sits on its person's computer, out of reach, so it comes to the relay: it joins with the
// office's key, gets its own token, publishes its card, and waits at its inbox for what concerns
// it (a request to it, news of a request it sent). The relay keeps only cards, requests and their
// messages; nothing a mini-me learned about its person comes here.
//
// The shapes follow A2A v1.0.0 (a2a-protocol.org): an AgentCard per member, a Task per request
// with a contextId, Messages with text parts and the roles user (the one asking) and agent (the
// one asked), and A2A's task states. A full A2A binding can be put in front of this later.
//
// Someone without a mini-me can be asked by a link: the request goes to a guest instead of a
// member, and whoever opens the link answers on a page (page.ts). The link is the only key to it,
// and it ends after two weeks or once answered.
//
// One relay can hold several offices; each has its own key, and members, requests and invites stay
// within it. Everything is kept in Postgres (db.ts). A member's token is kept only as a hash.
//
// Files go with a request's messages: a mini-me puts a file here first, then names it on the
// message it sends. Only the one who put it and the two members of its request can take it; it is
// kept two weeks, and one never named on a message one day.
//
// A member can also share one of its clone's skills (how its person does one kind of task) with
// the office, for colleagues' clones to add (skills.ts): kept whole and small, one per name, until
// the one who shared it or an owner of the office takes it out.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { keyCode } from "../../lib/key-code.ts";
import type { Database, Sql } from "./db.ts";
import {
  checkSkill,
  isSkillName,
  type SharedSkill,
  type SharedSkillContent,
  SKILLS_PER_OFFICE,
  type SkillFileData,
} from "./skills.ts";

export type TaskState =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

/** How long a link can be answered. */
export const LINK_DAYS = 14;

/** How long a file named on a request is kept; one never named, a day. */
export const FILE_DAYS = 14;
const LOOSE_FILE_HOURS = 24;
/** The largest file, and all of an office's files together; a relay's own may set others. */
export const FILE_BYTES =
  (Number(process.env.RELAY_FILE_MB) || 25) * 1024 * 1024;
const OFFICE_FILE_BYTES =
  (Number(process.env.RELAY_OFFICE_FILE_MB) || 1024) * 1024 * 1024;
/** How many files one message may name. */
export const FILES_PER_MESSAGE = 10;

/** States after which a request takes no more messages. */
export const FINAL: TaskState[] = [
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "REJECTED",
];

/** Every state a request can be in. */
export const TASK_STATES: TaskState[] = [
  "SUBMITTED",
  "WORKING",
  "INPUT_REQUIRED",
  ...FINAL,
];

/** What a member shows the office: A2A's AgentCard, with the person's status as an extension. */
export interface Card {
  name: string;
  description: string;
  skills?: {
    id: string;
    name: string;
    description: string;
    examples?: string[];
  }[];
  /** What the person looks after, that colleagues come to them for: how a clone finds whom to ask. */
  owns?: string[];
  /** Working, in a meeting, off: what the person is doing now, as they set it. */
  status?: string;
  /** How to work with the person (their ME.md), in lines they confirmed one by one. */
  howToWork?: string[];
}

/** A file named on a message: taken from the relay by its id (GET /files/:id). */
export interface FileRef {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface Message {
  messageId: string;
  role: "user" | "agent";
  parts: { text: string }[];
  /** The files that go with it, like A2A's file parts, by reference. */
  files?: FileRef[];
  taskId: string;
  contextId: string;
  /**
   * `by: "person"`: the member's person wrote it themselves (or a guest answering by a link), not
   * their clone; it travels to A2A clients in the message's metadata as it is.
   */
  metadata: {
    from: string;
    at: string;
    by?: "person";
    /**
     * Where its words were written, when not in Clone Office itself: a Slack channel (the answer
     * is read by everyone in it) or a direct message with the team's Slack app (slack.ts).
     */
    via?: Via;
  };
}

/** Where a message was written, when not in Clone Office itself. */
export type Via = "slack-channel" | "slack-dm";

export interface Task {
  id: string;
  contextId: string;
  status: { state: TaskState; message?: Message; timestamp: string };
  history: Message[];
  metadata: {
    from: string;
    to: string;
    created: string;
    /** Asked by a link: the name of the one asked. */
    guest?: string;
    /** To the one who made it only: the link's path on this relay. */
    link?: string;
  };
}

export interface Member {
  id: string;
  card: Card;
  seen: string;
  /** Here on the web, with no clone: the person reads and answers what is asked themselves. */
  web?: true;
}

/** A member making a call: who, in which office. */
export interface Caller {
  id: string;
  office: string;
  card: Card;
  /** The account on the server this clone is its person's, when it has one. */
  user?: string;
}

export type InboxEvent =
  | { seq: number; type: "task" | "update"; task: Task }
  | { seq: number; type: "own"; own: OwnNews };

/** What a clone hears of its person on the team server's page: words to it, or a question answered. */
export type OwnNews =
  | { id: string; kind: "said"; text: string; proof?: OwnProof }
  | { id: string; kind: "chosen"; value: string; proof?: OwnProof }
  | { id: string; kind: "pair"; key: string };

/**
 * What a paired browser signed (people-pages' script, home-client.ts): its public key, the words it
 * signed, and the signature. The clone checks it against the browsers its person paired.
 */
export interface OwnProof {
  key: string;
  signed: string;
  sig: string;
}

/** One line of a person's conversation with their own clone on the team server's page. */
export interface OwnMessage {
  id: string;
  /** The person's words ("said"), the clone's answer ("answer"), or its question to them ("ask"). */
  kind: "said" | "answer" | "ask";
  text: string;
  at: string;
  /** Said: the clone has taken it and is answering. */
  taken?: boolean;
  /** An answer: the words it answers, and a code the page words in place of text (a failure). */
  replyTo?: string;
  code?: string;
  /** A question: its choices as its buttons carry them, and the one given (or "settled" elsewhere). */
  choices?: { label: string; value: string }[];
  chosen?: string;
  /** A browser asking to be paired: its public key. */
  key?: string;
}

/** How long the page keeps a person's conversation with their clone. */
export const OWN_HOURS = 24;
/** How much one line of it may say. */
export const OWN_CHARS = 8000;
/** How many of its lines the page shows: the newest. */
const OWN_SHOWN = 200;
/** How many lines one person's conversation may hold in a day, both sides. */
const OWN_DAILY = 600;
/** How many of the person's words may wait for their clone at once. */
const OWN_WAITING = 5;

/** A member is present when its clone came to its inbox this recently (it waits there all along). */
export const PRESENT_MS = 2 * 60 * 1000;

/** Where every relay process hears that a member has news: the payload is the member's id. */
const CHANNEL = "relay_events";
/** How often a waiting inbox looks again, in case news was not heard (no LISTEN where it runs). */
const RECHECK_MS = 2000;
/** Inbox news older than this is let go; a mini-me that was away longer reads its requests whole. */
const EVENT_DAYS = 30;

/** The schema, one list of statements per version; a version is never changed once released. */
const MIGRATIONS: string[][] = [
  [
    "CREATE TABLE offices (id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', created TIMESTAMPTZ NOT NULL DEFAULT now())",
    "CREATE TABLE members (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, card JSONB NOT NULL, joined TIMESTAMPTZ NOT NULL, seen TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX members_office ON members (office_id, joined)",
    "CREATE TABLE tasks (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, context_id TEXT NOT NULL, from_member TEXT NOT NULL, to_member TEXT NOT NULL, state TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, updated TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX tasks_from ON tasks (from_member, updated DESC)",
    "CREATE INDEX tasks_to ON tasks (to_member, updated DESC)",
    "CREATE TABLE messages (seq BIGSERIAL PRIMARY KEY, id TEXT UNIQUE NOT NULL, task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE, role TEXT NOT NULL, from_member TEXT NOT NULL, text TEXT NOT NULL, at TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX messages_task ON messages (task_id, seq)",
    "CREATE TABLE events (seq BIGSERIAL PRIMARY KEY, member TEXT NOT NULL, type TEXT NOT NULL, task_id TEXT NOT NULL, at TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX events_member ON events (member, seq)",
    "CREATE TABLE links (token TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks (id) ON DELETE CASCADE, name TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, expires TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX links_task ON links (task_id)",
  ],
  [
    "CREATE TABLE files (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, owner TEXT NOT NULL, task_id TEXT REFERENCES tasks (id) ON DELETE CASCADE, name TEXT NOT NULL, type TEXT NOT NULL, size INTEGER NOT NULL, bytes BYTEA NOT NULL, created TIMESTAMPTZ NOT NULL, expires TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX files_task ON files (task_id)",
    "CREATE INDEX files_office ON files (office_id, expires)",
    "ALTER TABLE messages ADD COLUMN files JSONB NOT NULL DEFAULT '[]'::jsonb",
  ],
  [
    "CREATE TABLE office_settings (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, name TEXT NOT NULL, value JSONB NOT NULL, by_member TEXT NOT NULL, updated TIMESTAMPTZ NOT NULL, PRIMARY KEY (office_id, name))",
  ],
  // People with an account (accounts.ts): their place in an office, the mini-me that is theirs, and
  // the one-time codes that connect a computer.
  [
    "ALTER TABLE members ADD COLUMN user_id TEXT",
    "CREATE UNIQUE INDEX members_user ON members (office_id, user_id) WHERE user_id IS NOT NULL",
    "CREATE TABLE office_people (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, user_id TEXT NOT NULL, role TEXT NOT NULL, joined TIMESTAMPTZ NOT NULL, PRIMARY KEY (office_id, user_id))",
    "CREATE INDEX office_people_user ON office_people (user_id)",
    "CREATE TABLE setup_codes (code_hash TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, user_id TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL, used TIMESTAMPTZ)",
    "CREATE TABLE server_settings (name TEXT PRIMARY KEY, value TEXT NOT NULL)",
  ],
  // Meetings, the clones talking together: since taken out, what they held goes after its 60 days.
  [
    "CREATE TABLE meetings (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, kind TEXT NOT NULL, topic TEXT NOT NULL, language TEXT NOT NULL, opened_by TEXT NOT NULL, members JSONB NOT NULL, round INT NOT NULL, rounds INT NOT NULL, state TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, round_ends TIMESTAMPTZ NOT NULL, closed TIMESTAMPTZ)",
    "CREATE INDEX meetings_office ON meetings (office_id, created DESC)",
    "CREATE INDEX meetings_open ON meetings (state, round_ends)",
    "CREATE TABLE meeting_posts (seq BIGSERIAL PRIMARY KEY, id TEXT UNIQUE NOT NULL, meeting_id TEXT NOT NULL REFERENCES meetings (id) ON DELETE CASCADE, from_member TEXT NOT NULL, round INT NOT NULL, reply_to TEXT, text TEXT NOT NULL, at TIMESTAMPTZ NOT NULL)",
    "CREATE UNIQUE INDEX meeting_posts_once ON meeting_posts (meeting_id, from_member, round)",
  ],
  // Who wrote a message: the member's person themselves, or their clone (the default).
  ["ALTER TABLE messages ADD COLUMN by_person BOOLEAN NOT NULL DEFAULT false"],
  // Calls made with the office's team keys, a count per member, vendor and day (team-ai.ts).
  [
    "CREATE TABLE ai_calls (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, member_id TEXT NOT NULL, provider TEXT NOT NULL, day DATE NOT NULL, calls INT NOT NULL DEFAULT 0, PRIMARY KEY (office_id, member_id, provider, day))",
  ],
  // A2A clients go on by their conversation (contextId).
  ["CREATE INDEX tasks_context ON tasks (context_id)"],
  // Skills the members share with their office (skills.ts): one per name, its files whole.
  [
    "CREATE TABLE shared_skills (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, name TEXT NOT NULL, category TEXT, description TEXT NOT NULL, paths JSONB NOT NULL, files JSONB NOT NULL, size INT NOT NULL, hash TEXT NOT NULL, by_member TEXT NOT NULL, by_name TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, updated TIMESTAMPTZ NOT NULL, PRIMARY KEY (office_id, name))",
  ],
  // What was done to an account by someone else (accounts.ts): a reset link made for it, told on
  // the person's own page.
  [
    "CREATE TABLE account_events (user_id TEXT NOT NULL, kind TEXT NOT NULL, by_name TEXT NOT NULL, at TIMESTAMPTZ NOT NULL)",
    "CREATE INDEX account_events_user ON account_events (user_id, at DESC)",
  ],
  // A reset link's own record: the admin who made it and its token's hash, so the link is
  // checked again when used, and its person can stop it (accounts.ts `resetPassword`).
  [
    "ALTER TABLE account_events ADD COLUMN by_user TEXT",
    "ALTER TABLE account_events ADD COLUMN token_hash TEXT",
    "ALTER TABLE account_events ADD COLUMN done TEXT",
    "ALTER TABLE account_events ADD COLUMN done_at TIMESTAMPTZ",
    "CREATE UNIQUE INDEX account_events_token ON account_events (token_hash) WHERE token_hash IS NOT NULL",
  ],
  // Invites, one per person (`makeInvite`): a link that works once for a clone and once for an
  // account, for a week, kept only as its token's hash. The office's key stays its own: the key
  // the server's operator holds, never handed out in a link.
  [
    "CREATE TABLE invites (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL, by_member TEXT, by_user TEXT, by_name TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, expires TIMESTAMPTZ NOT NULL, member_id TEXT, member_at TIMESTAMPTZ, user_id TEXT, user_at TIMESTAMPTZ, cancelled TIMESTAMPTZ)",
    "CREATE INDEX invites_office ON invites (office_id, created DESC)",
  ],
  // Someone in the office on the web, with no computer of theirs connected (`joinWeb`): they ask
  // and answer from the team server's pages themselves, until a computer's clone takes their place.
  ["ALTER TABLE members ADD COLUMN on_web BOOLEAN NOT NULL DEFAULT false"],
  // A clone's own link to make its person's account (`own`), and a few words from the one who
  // made an invite about whom it is for (`note`).
  [
    "ALTER TABLE invites ADD COLUMN own BOOLEAN NOT NULL DEFAULT false",
    "ALTER TABLE invites ADD COLUMN note TEXT NOT NULL DEFAULT ''",
  ],
  // A person talking to their own clone from the team server's page (`ownSay`): what they said and
  // what it answers, kept a day at most so the page can show it (the clone keeps the conversation
  // on its computer), and whether the clone lets them (`own_chat`, which its person turns on).
  [
    "ALTER TABLE members ADD COLUMN own_chat BOOLEAN NOT NULL DEFAULT false",
    "CREATE TABLE own_messages (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members (id) ON DELETE CASCADE, kind TEXT NOT NULL, text TEXT NOT NULL, data JSONB NOT NULL DEFAULT '{}'::jsonb, at TIMESTAMPTZ NOT NULL, taken TIMESTAMPTZ)",
    "CREATE INDEX own_messages_member ON own_messages (member_id, at)",
  ],
  // The browsers the person paired with their clone (`ownPair`): only words signed by one of them
  // run, which the clone checks itself; the relay keeps the list it says, for the page to know.
  [
    "ALTER TABLE members ADD COLUMN own_keys JSONB NOT NULL DEFAULT '[]'::jsonb",
  ],
  // The team's Slack (slack.ts): the app an owner connected, its tokens sealed; each request asked
  // from it, its thread and how many of its answers were posted there; whose Slack is whose, linked
  // once by a code from their page; and where a message was written (`via`). The meetings' news,
  // which nothing reads any more, goes.
  [
    "DELETE FROM events WHERE type = 'meeting'",
    "ALTER TABLE messages ADD COLUMN via TEXT",
    "CREATE TABLE office_slack (office_id TEXT PRIMARY KEY REFERENCES offices (id) ON DELETE CASCADE, sealed TEXT NOT NULL, team TEXT NOT NULL, bot_user TEXT NOT NULL, set_by TEXT NOT NULL, updated TIMESTAMPTZ NOT NULL)",
    "CREATE TABLE slack_threads (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, task_id TEXT NOT NULL, channel TEXT NOT NULL, thread_ts TEXT NOT NULL, asker TEXT NOT NULL, slack_user TEXT NOT NULL, lang TEXT NOT NULL, posted INT NOT NULL DEFAULT 0, done BOOLEAN NOT NULL DEFAULT false, created TIMESTAMPTZ NOT NULL, PRIMARY KEY (office_id, task_id))",
    "CREATE INDEX slack_threads_thread ON slack_threads (office_id, channel, thread_ts, created DESC)",
    "CREATE INDEX slack_threads_open ON slack_threads (office_id, created) WHERE NOT done",
    "CREATE TABLE slack_people (office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, slack_user TEXT NOT NULL, user_id TEXT NOT NULL, name TEXT NOT NULL, linked TIMESTAMPTZ NOT NULL, PRIMARY KEY (office_id, slack_user))",
    "CREATE UNIQUE INDEX slack_people_user ON slack_people (office_id, user_id)",
    "CREATE TABLE slack_codes (code_hash TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, user_id TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL)",
  ],
];

/** How long an invite works. */
export const INVITE_DAYS = 7;
/** The most invites an office keeps open at once, so making them never grows without end. */
const OPEN_INVITES = 200;
/** The most one person who does not own the office keeps open, so one cannot use up the rest. */
const OPEN_INVITES_EACH = 10;
/** How long a clone's own link to make its person's account works: it is opened as it is made. */
const OWN_LINK_MS = 15 * 60 * 1000;

/** One invite as an office's people see it: who made it, until when, and what it was used for. */
export interface Invite {
  id: string;
  by: string;
  /** Whom it is for, in the words of the one who made it. */
  note: string;
  created: string;
  expires: string;
  /** A clone joined with it, and an account was made with it. */
  clone: boolean;
  account: boolean;
  /** Still works: not cancelled, not past its time, and something left to use it for. */
  open: boolean;
}

/** What an office keeps for all its members: the OAuth client a vendor wants registered first. */
const TEAM_SETTING = /^connector:[a-z0-9-]{1,40}$/;

// Node runs this file without a build, so no TypeScript-only syntax such as parameter properties.
// The code is what a mini-me's screen shows in its person's language; the message is for logs.
export class RelayError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const iso = (value: unknown): string => new Date(value as string).toISOString();
const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

interface InviteRow {
  id: string;
  by_name: string;
  note: string | null;
  created: unknown;
  expires: unknown;
  member_id: string | null;
  user_at: unknown;
  cancelled: unknown;
}

const stamp = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

function inviteOf(row: InviteRow): Invite {
  const clone = Boolean(row.member_id);
  const account = Boolean(row.user_at);
  return {
    id: row.id,
    by: row.by_name,
    note: row.note ?? "",
    created: stamp(row.created),
    expires: stamp(row.expires),
    clone,
    account,
    open:
      !row.cancelled &&
      new Date(stamp(row.expires)).getTime() > Date.now() &&
      !(clone && account),
  };
}

interface TaskRow {
  id: string;
  context_id: string;
  from_member: string;
  to_member: string;
  state: TaskState;
  created: unknown;
  updated: unknown;
}

interface SkillRow {
  name: string;
  category: string | null;
  description: string;
  paths: { path: string; size: number }[] | string;
  size: number;
  hash: string;
  by_member: string;
  by_name: string;
  updated: unknown;
}

/** A shared skill's columns, its sharer's name as their card has it now (or as it was, once gone). */
const SKILL_COLUMNS =
  "s.name, s.category, s.description, s.paths, s.size, s.hash, s.by_member, COALESCE(m.card->>'name', s.by_name) AS by_name, s.updated";

function sharedSkillOf(
  row: SkillRow,
  member: Caller,
  owner: boolean,
): SharedSkill {
  return {
    name: row.name,
    ...(row.category ? { category: row.category } : {}),
    description: row.description,
    files: typeof row.paths === "string" ? JSON.parse(row.paths) : row.paths,
    size: Number(row.size),
    hash: row.hash,
    by: row.by_member,
    byName: row.by_name,
    updated: iso(row.updated),
    removable: owner || row.by_member === member.id,
  };
}

export class Relay {
  private db: Database;
  private waiters = new Map<string, Set<() => void>>();
  private stopListening: (() => Promise<void>) | null = null;

  private constructor(db: Database) {
    this.db = db;
  }

  /** The relay over a database: its schema brought up to date, and listening for news. */
  static async open(db: Database): Promise<Relay> {
    const relay = new Relay(db);
    await migrate(db);
    relay.stopListening = await db.listen(CHANNEL, (member) =>
      relay.wake(member),
    );
    return relay;
  }

  /** Stops listening; the database is closed by whoever opened it. */
  async close(): Promise<void> {
    await this.stopListening?.();
    for (const set of this.waiters.values()) for (const wake of set) wake();
  }

  /**
   * The office `key` opens, made when there is none: a relay a team starts with `--key` keeps that
   * key. Without a key, the relay's first office (made with a new key when there is none yet).
   */
  async office(key?: string): Promise<{ id: string; key: string }> {
    return this.db.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(4174002)");
      const found = key
        ? await tx.query<{ id: string; key: string }>(
            "SELECT id, key FROM offices WHERE key = $1",
            [key],
          )
        : await tx.query<{ id: string; key: string }>(
            "SELECT id, key FROM offices ORDER BY created, id LIMIT 1",
          );
      if (found[0]) return found[0];
      const made = {
        id: `o-${randomBytes(6).toString("hex")}`,
        key: key ?? randomBytes(9).toString("base64url"),
      };
      await tx.query("INSERT INTO offices (id, key) VALUES ($1, $2)", [
        made.id,
        made.key,
      ]);
      return made;
    });
  }

  /** The key of a member's office, for its invite link. */
  async officeKey(office: string): Promise<string> {
    const [row] = await this.db.query<{ key: string }>(
      "SELECT key FROM offices WHERE id = $1",
      [office],
    );
    if (!row) throw new RelayError(404, "No such office.", "not-found");
    return row.key;
  }

  /**
   * Whether a link's key opens an office here, for its invite page: the office's own key, or an
   * invite that still works for something.
   */
  async knows(key: string): Promise<boolean> {
    const rows = await this.db.query("SELECT 1 FROM offices WHERE key = $1", [
      key,
    ]);
    if (rows.length) return true;
    const invite = await this.invite(key);
    return Boolean(invite && (!invite.clone || !invite.account));
  }

  /**
   * A new invite to a member's office (or, from the server's pages, a person's): a link for one
   * person, which works once to join a clone and once to make an account, for a week. Someone who
   * does not own the office keeps at most a few open, and the office at most OPEN_INVITES.
   *
   * `forMember` makes a clone's own link instead, for its person to make their account with: the
   * clone is joined already, so only the account is left, which becomes that clone's person's. It
   * comes only from the clone's own token, works for minutes, and the one made before it ends.
   */
  async makeInvite(
    office: string,
    by: {
      member?: string;
      user?: string;
      name: string;
      /** Whom it is for, in the maker's words. */
      note?: string;
      /** The maker owns the office: no limit of their own. */
      owner?: boolean;
      forMember?: string;
    },
  ): Promise<{ token: string; expires: string }> {
    const token = randomBytes(18).toString("base64url");
    const own = Boolean(by.forMember);
    const expires = new Date(
      Date.now() + (own ? OWN_LINK_MS : INVITE_DAYS * 24 * 60 * 60 * 1000),
    ).toISOString();
    await this.db.transaction(async (tx) => {
      // Past their time, invites are let go as new ones are made; too many open ones refuse more.
      await tx.query(
        "DELETE FROM invites WHERE office_id = $1 AND expires < now() - interval '30 days'",
        [office],
      );
      if (own)
        await tx.query(
          "UPDATE invites SET cancelled = now() WHERE office_id = $1 AND own AND member_id = $2 AND user_at IS NULL AND cancelled IS NULL",
          [office, by.forMember],
        );
      else {
        const [{ open, mine }] = await tx.query<{ open: number; mine: number }>(
          "SELECT count(*)::int AS open, count(*) FILTER (WHERE (by_member IS NOT NULL AND by_member = $2) OR (by_user IS NOT NULL AND by_user = $3))::int AS mine FROM invites WHERE office_id = $1 AND NOT own AND cancelled IS NULL AND expires > now() AND (member_id IS NULL OR user_at IS NULL)",
          [office, by.member ?? null, by.user ?? null],
        );
        if (open >= OPEN_INVITES)
          throw new RelayError(
            429,
            "Too many invites are open.",
            "too-many-invites",
          );
        // A person's own limit, which only time or use lifts: they cannot see the office's list.
        if (!by.owner && mine >= OPEN_INVITES_EACH)
          throw new RelayError(
            429,
            `You have ${OPEN_INVITES_EACH} invites open.`,
            "too-many-invites-mine",
          );
      }
      await tx.query(
        "INSERT INTO invites (id, office_id, token_hash, by_member, by_user, by_name, created, expires, member_id, member_at, own, note) VALUES ($1, $2, $3, $4, $5, $6, now(), $7, $8, CASE WHEN $8::text IS NULL THEN NULL ELSE now() END, $9, $10)",
        [
          `i-${randomBytes(6).toString("hex")}`,
          office,
          hashToken(token),
          by.member ?? null,
          by.user ?? null,
          by.name.slice(0, 80),
          expires,
          by.forMember ?? null,
          own,
          (by.note ?? "").trim().slice(0, 80),
        ],
      );
    });
    return { token, expires };
  }

  /** An invite by its token while it is not cancelled nor past its time, with its office. */
  async invite(
    token: string,
  ): Promise<
    (Invite & { office: string; member?: string; user?: string }) | undefined
  > {
    const [row] = await this.db.query<
      InviteRow & { office_id: string; user_id: string | null }
    >(
      "SELECT * FROM invites WHERE token_hash = $1 AND cancelled IS NULL AND expires > now()",
      [hashToken(token)],
    );
    return row
      ? {
          ...inviteOf(row),
          office: row.office_id,
          ...(row.member_id ? { member: row.member_id } : {}),
          ...(row.user_id ? { user: row.user_id } : {}),
        }
      : undefined;
  }

  /** Whether a link's key was an invite that no longer works (used, cancelled or past its time). */
  async inviteEnded(token: string): Promise<boolean> {
    const [row] = await this.db.query(
      "SELECT 1 FROM invites WHERE token_hash = $1",
      [hashToken(token)],
    );
    return Boolean(row) && !(await this.knows(token));
  }

  /** The offices here, the first made first: the server's own is the first. */
  async officesByAge(limit = 10): Promise<{ id: string; key: string }[]> {
    return this.db.query<{ id: string; key: string }>(
      "SELECT id, key FROM offices ORDER BY created, id LIMIT $1",
      [limit],
    );
  }

  /** An office's invites of the last weeks, the newest first, for its owners. */
  async invites(office: string): Promise<Invite[]> {
    const rows = await this.db.query<InviteRow>(
      "SELECT * FROM invites WHERE office_id = $1 AND NOT own AND created > now() - interval '30 days' ORDER BY created DESC LIMIT 100",
      [office],
    );
    return rows.map(inviteOf);
  }

  /** Stops an invite of an office from working; what it was used for stays. */
  async cancelInvite(office: string, id: string): Promise<boolean> {
    const rows = await this.db.query(
      "UPDATE invites SET cancelled = now() WHERE id = $1 AND office_id = $2 AND cancelled IS NULL RETURNING 1",
      [id, office],
    );
    return rows.length > 0;
  }

  /**
   * Takes an invite for an account, once: the account's person is then the one it was for. Taken
   * before the account is made, so two people never make one each with the same link; `undo` gives
   * it back should the account not be made.
   */
  async takeInviteForAccount(token: string): Promise<
    | {
        office: string;
        settle: (user: string) => Promise<void>;
        undo: () => Promise<void>;
      }
    | undefined
  > {
    const [row] = await this.db.query<{ id: string; office_id: string }>(
      "UPDATE invites SET user_at = now() WHERE token_hash = $1 AND user_at IS NULL AND cancelled IS NULL AND expires > now() RETURNING id, office_id",
      [hashToken(token)],
    );
    if (!row) return undefined;
    return {
      office: row.office_id,
      settle: async (user) => {
        // A clone's own link makes its person's account: that clone is now this account's. An
        // invite's two halves are never joined otherwise: whoever used the other half of a shared
        // link may be someone else, and a clone becomes a person's by pairing it while signed in.
        const [invite] = await this.db.query<{
          member_id: string | null;
          own: boolean;
        }>(
          "UPDATE invites SET user_id = $2 WHERE id = $1 RETURNING member_id, own",
          [row.id, user],
        );
        if (invite?.own && invite.member_id)
          await this.db.query(
            "UPDATE members SET user_id = $2 WHERE id = $1 AND user_id IS NULL AND NOT EXISTS (SELECT 1 FROM members WHERE office_id = $3 AND user_id = $2)",
            [invite.member_id, user, row.office_id],
          );
      },
      undo: async () => {
        await this.db.query(
          "UPDATE invites SET user_at = NULL WHERE id = $1 AND user_id IS NULL",
          [row.id],
        );
      },
    };
  }

  /** Join with an office's key, or update one's card with one's token. */
  async join(input: {
    key?: string;
    token?: string;
    card: Card;
  }): Promise<{ id: string; token: string }> {
    const card = cleanCard(input.card);
    const now = new Date().toISOString();
    if (input.token) {
      const member = await this.memberByToken(input.token);
      await this.db.query(
        "UPDATE members SET card = $1::jsonb, seen = $2 WHERE id = $3",
        [JSON.stringify(card), now, member.id],
      );
      return { id: member.id, token: input.token };
    }
    const id = `m-${randomBytes(6).toString("hex")}`;
    const token = randomBytes(24).toString("base64url");
    // The office's own key, or an invite not yet used for a clone, which this join uses: the
    // member goes in with it as one step, so two clones never join with the same link.
    const joined = await this.db.transaction(async (tx) => {
      const [office] = input.key
        ? await tx.query<{ id: string }>(
            "SELECT id FROM offices WHERE key = $1",
            [input.key],
          )
        : [];
      const [invite] =
        !office && input.key
          ? await tx.query<{ office_id: string }>(
              "UPDATE invites SET member_id = $2, member_at = now() WHERE token_hash = $1 AND member_id IS NULL AND cancelled IS NULL AND expires > now() RETURNING office_id",
              [hashToken(input.key), id],
            )
          : [];
      const at = office?.id ?? invite?.office_id;
      if (!at) return false;
      // A clone joined with an invite is nobody's account's until its person pairs it while
      // signed in: the link's other half may have been used by someone else.
      await tx.query(
        "INSERT INTO members (id, office_id, token_hash, card, joined, seen) VALUES ($1, $2, $3, $4::jsonb, $5, $5)",
        [id, at, hashToken(token), JSON.stringify(card), now],
      );
      return true;
    });
    if (!joined)
      throw new RelayError(
        403,
        "That is not this office's key, or its invite was used already or has ended.",
        "office-key-wrong",
      );
    return { id, token };
  }

  /**
   * The mini-me of a person with an account, given a new token: theirs when they had one in this
   * office (one person, one mini-me: connecting another computer moves it there, and the token the
   * last one held stops working), else a new member with their name on its card.
   */
  async joinAs(
    office: string,
    user: string,
    name: string,
    /**
     * The token this computer's clone already holds in the office, joined with an invite: shown
     * with the setup code, both secrets of one person, that clone becomes the account's instead of
     * a second place being made for them.
     */
    adopt?: string,
  ): Promise<{ id: string; token: string; moved: boolean }> {
    const token = randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    return this.db.transaction(async (tx) => {
      const [had] = await tx.query<{ id: string; on_web: boolean }>(
        "SELECT id, on_web FROM members WHERE office_id = $1 AND user_id = $2 FOR UPDATE",
        [office, user],
      );
      if (had) {
        // The clone this computer joined with the invite before its person took part on the web
        // becomes that place: one person has one place, which this computer now takes, and what
        // the clone asked and was asked, its files and shares, goes with it rather than
        // being split from the person's history.
        if (adopt) {
          const [clone] = await tx.query<{ id: string }>(
            "SELECT id FROM members WHERE token_hash = $1 AND office_id = $2 AND user_id IS NULL AND id <> $3 FOR UPDATE",
            [hashToken(adopt), office, had.id],
          );
          if (clone) {
            await moveMember(tx, office, clone.id, had.id);
            await tx.query("DELETE FROM members WHERE id = $1", [clone.id]);
          }
        }
        // talking to it from the page is off until the computer now holding it turns it on
        await tx.query(
          "UPDATE members SET token_hash = $1, seen = $2, on_web = false, own_chat = false WHERE id = $3",
          [hashToken(token), now, had.id],
        );
        // Moved from another computer, whose token stops working; a place on the web is taken over.
        return { id: had.id, token, moved: !had.on_web };
      }
      if (adopt) {
        const [kept] = await tx.query<{ id: string }>(
          "UPDATE members SET user_id = $3, token_hash = $4, seen = $5, on_web = false WHERE token_hash = $1 AND office_id = $2 AND user_id IS NULL RETURNING id",
          [hashToken(adopt), office, user, hashToken(token), now],
        );
        // This computer's own clone, now the account's: nothing moved.
        if (kept) return { id: kept.id, token, moved: false };
      }
      const id = `m-${randomBytes(6).toString("hex")}`;
      await tx.query(
        "INSERT INTO members (id, office_id, token_hash, card, joined, seen, user_id) VALUES ($1, $2, $3, $4::jsonb, $5, $5, $6)",
        [
          id,
          office,
          hashToken(token),
          JSON.stringify(cleanCard({ name } as Card)),
          now,
          user,
        ],
      );
      return { id, token, moved: false };
    });
  }

  /** A person's mini-me in an office, if they connected one. */
  async memberOf(office: string, user: string): Promise<Member | undefined> {
    const [row] = await this.db.query<{
      id: string;
      card: Card;
      seen: unknown;
      on_web: boolean;
    }>(
      "SELECT id, card, seen, on_web FROM members WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    return row
      ? {
          id: row.id,
          card: row.card,
          seen: iso(row.seen),
          ...(row.on_web ? { web: true as const } : {}),
        }
      : undefined;
  }

  /**
   * A person with an account takes part on the web, with no computer of theirs connected: their
   * place in the office, made once (the clone they connect later takes it over, `joinAs`), as the
   * caller the pages act as; seen as they come.
   */
  async joinWeb(
    office: string,
    user: string,
    card: { name: string; description: string },
  ): Promise<Caller> {
    const now = new Date().toISOString();
    return this.db.transaction(async (tx) => {
      const [had] = await tx.query<{ id: string; card: Card }>(
        "SELECT id, card FROM members WHERE office_id = $1 AND user_id = $2 FOR UPDATE",
        [office, user],
      );
      if (had) {
        await tx.query("UPDATE members SET seen = $2 WHERE id = $1", [
          had.id,
          now,
        ]);
        return { id: had.id, office, card: had.card, user };
      }
      const id = `m-${randomBytes(6).toString("hex")}`;
      // Status "web": no clone at work for them, whatever their card said (room-data.ts statusCode).
      const clean = cleanCard({ ...card, status: "web" } as Card);
      // a token nobody holds: the person acts through their signed-in pages
      await tx.query(
        "INSERT INTO members (id, office_id, token_hash, card, joined, seen, user_id, on_web) VALUES ($1, $2, $3, $4::jsonb, $5, $5, $6, true)",
        [
          id,
          office,
          hashToken(randomBytes(24).toString("base64url")),
          JSON.stringify(clean),
          now,
          user,
        ],
      );
      return { id, office, card: clean, user };
    });
  }

  /** The place a signed-in person acts as on the web, when they have one in the office. */
  async callerFor(office: string, user: string): Promise<Caller | undefined> {
    const [row] = await this.db.query<{ id: string; card: Card }>(
      "SELECT id, card FROM members WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    return row ? { id: row.id, office, card: row.card, user } : undefined;
  }

  /** The member a token belongs to; throws when it belongs to none. */
  async memberByToken(token: string): Promise<Caller> {
    const [row] = token
      ? await this.db.query<{
          id: string;
          office_id: string;
          card: Card;
          user_id: string | null;
        }>(
          "SELECT id, office_id, card, user_id FROM members WHERE token_hash = $1",
          [hashToken(token)],
        )
      : [];
    if (!row)
      throw new RelayError(401, "Unknown member.", "office-member-unknown");
    return {
      id: row.id,
      office: row.office_id,
      card: row.card,
      ...(row.user_id ? { user: row.user_id } : {}),
    };
  }

  /** The members of an office, in the order they joined. */
  async members(office: string): Promise<Member[]> {
    const rows = await this.db.query<{
      id: string;
      card: Card;
      seen: unknown;
      on_web: boolean;
    }>(
      "SELECT id, card, seen, on_web FROM members WHERE office_id = $1 ORDER BY joined, id",
      [office],
    );
    return rows.map((row) => ({
      id: row.id,
      card: row.card,
      seen: iso(row.seen),
      ...(row.on_web ? { web: true as const } : {}),
    }));
  }

  /** A request from one member to another in the same office, with files it put here first. */
  async send(
    from: Caller,
    to: string,
    text: string,
    files: string[] = [],
    /** The conversation it belongs to, as an A2A client names it; a new one when none. */
    contextId?: string,
    /** Written by the member's person themselves, not their clone. */
    by?: "person",
    /** Where its words were written, when not in Clone Office itself. */
    via?: Via,
  ): Promise<Task> {
    if (from.id === to)
      throw new RelayError(400, "A clone does not ask itself.", "bad-request");
    const [found] = await this.db.query(
      "SELECT 1 FROM members WHERE id = $1 AND office_id = $2",
      [to, from.office],
    );
    if (!found)
      throw new RelayError(404, "No such member.", "no-such-colleague");
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO tasks (id, office_id, context_id, from_member, to_member, state, created, updated) VALUES ($1, $2, $3, $4, $5, 'SUBMITTED', $6, $6)",
        [
          id,
          from.office,
          contextId && /^[\w.:-]{1,100}$/.test(contextId)
            ? contextId
            : randomUUID(),
          from.id,
          to,
          now,
        ],
      );
      await addMessage(
        tx,
        id,
        "user",
        from.id,
        text,
        now,
        await attach(tx, from, id, files, now),
        by === "person",
        via,
      );
      await notify(tx, to, "task", id, now);
    });
    this.wake(to);
    return this.task(id);
  }

  /**
   * A file a member puts here, to name on a message it sends next. Kept a day unless named; what
   * has expired goes first, and an office keeps no more than its share.
   */
  async putFile(
    member: Caller,
    input: { name: string; type?: string; bytes: Uint8Array },
    now = new Date(),
  ): Promise<FileRef> {
    const size = input.bytes.byteLength;
    if (!size) throw new RelayError(400, "The file is empty.", "bad-request");
    if (size > FILE_BYTES)
      throw new RelayError(413, "The file is too large.", "file-too-large");
    const name =
      input.name
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 200) || "file";
    const type =
      /^[\w.+-]+\/[\w.+-]+$/.test(input.type ?? "") &&
      (input.type ?? "").length <= 100
        ? (input.type as string)
        : "application/octet-stream";
    const at = now.toISOString();
    const id = `f-${randomBytes(12).toString("base64url")}`;
    await this.db.transaction(async (tx) => {
      await tx.query("DELETE FROM files WHERE expires < $1", [at]);
      const [used] = await tx.query<{ total: string | number | null }>(
        "SELECT sum(size) AS total FROM files WHERE office_id = $1",
        [member.office],
      );
      if (Number(used?.total ?? 0) + size > OFFICE_FILE_BYTES)
        throw new RelayError(
          413,
          "The office keeps no more files for now.",
          "files-full",
        );
      // Sent as base64 text and decoded by the database: PGlite takes a bytea parameter ten to
      // twenty times slower (a 25 MB file, seconds).
      await tx.query(
        "INSERT INTO files (id, office_id, owner, name, type, size, bytes, created, expires) VALUES ($1, $2, $3, $4, $5, $6, decode($7, 'base64'), $8, $9)",
        [
          id,
          member.office,
          member.id,
          name,
          type,
          size,
          Buffer.from(input.bytes).toString("base64"),
          at,
          new Date(
            now.getTime() + LOOSE_FILE_HOURS * 60 * 60 * 1000,
          ).toISOString(),
        ],
      );
    });
    return { id, name, type, size };
  }

  /** Something the office keeps for all its members, with who set it and when. */
  async teamSetting(
    member: Caller,
    name: string,
  ): Promise<{ value: unknown; by: string; updated: string } | undefined> {
    if (!TEAM_SETTING.test(name))
      throw new RelayError(400, "Not an office setting.", "bad-request");
    const [row] = await this.db.query<{
      value: unknown;
      by_member: string;
      updated: unknown;
    }>(
      "SELECT value, by_member, updated FROM office_settings WHERE office_id = $1 AND name = $2",
      [member.office, name],
    );
    return row
      ? { value: row.value, by: row.by_member, updated: iso(row.updated) }
      : undefined;
  }

  /** Sets (or, with null, clears) something the office keeps for all its members. */
  async setTeamSetting(
    member: Caller,
    name: string,
    value: unknown,
  ): Promise<void> {
    if (!TEAM_SETTING.test(name))
      throw new RelayError(400, "Not an office setting.", "bad-request");
    if (value === null || value === undefined) {
      await this.db.query(
        "DELETE FROM office_settings WHERE office_id = $1 AND name = $2",
        [member.office, name],
      );
      return;
    }
    const text = JSON.stringify(value);
    if (text.length > 4000)
      throw new RelayError(400, "Too large.", "bad-request");
    await this.db.query(
      "INSERT INTO office_settings (office_id, name, value, by_member, updated) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (office_id, name) DO UPDATE SET value = $3::jsonb, by_member = $4, updated = $5",
      [member.office, name, text, member.id, new Date().toISOString()],
    );
  }

  // ---- Team keys (team-ai.ts) ----

  /**
   * A value the office keeps that no member reads back through /settings: a team key, sealed.
   * Kept beside the settings, under a name TEAM_SETTING never takes.
   */
  async officeSecret(
    office: string,
    name: string,
  ): Promise<{ value: unknown; by: string; updated: string } | undefined> {
    if (!/^ai:[a-z]{2,20}$/.test(name))
      throw new RelayError(400, "Not an office secret.", "bad-request");
    const [row] = await this.db.query<{
      value: unknown;
      by_member: string;
      updated: unknown;
    }>(
      "SELECT value, by_member, updated FROM office_settings WHERE office_id = $1 AND name = $2",
      [office, name],
    );
    return row
      ? { value: row.value, by: row.by_member, updated: iso(row.updated) }
      : undefined;
  }

  async setOfficeSecret(
    member: Caller,
    name: string,
    value: unknown,
  ): Promise<void> {
    if (!/^ai:[a-z]{2,20}$/.test(name))
      throw new RelayError(400, "Not an office secret.", "bad-request");
    if (value === null || value === undefined) {
      await this.db.query(
        "DELETE FROM office_settings WHERE office_id = $1 AND name = $2",
        [member.office, name],
      );
      return;
    }
    await this.db.query(
      "INSERT INTO office_settings (office_id, name, value, by_member, updated) VALUES ($1, $2, $3::jsonb, $4, $5) ON CONFLICT (office_id, name) DO UPDATE SET value = $3::jsonb, by_member = $4, updated = $5",
      [
        member.office,
        name,
        JSON.stringify(value),
        member.id,
        new Date().toISOString(),
      ],
    );
  }

  /** Whether a member's person owns its office (an account's role there, accounts.ts). */
  async ownsOffice(member: Caller): Promise<boolean> {
    const rows = await this.db.query(
      "SELECT 1 FROM members m JOIN office_people p ON p.office_id = m.office_id AND p.user_id = m.user_id WHERE m.id = $1 AND p.role = 'owner'",
      [member.id],
    );
    return rows.length > 0;
  }

  /** Whether a member is still in an office. */
  async isMember(office: string, id: string): Promise<boolean> {
    const rows = await this.db.query(
      "SELECT 1 FROM members WHERE office_id = $1 AND id = $2",
      [office, id],
    );
    return rows.length > 0;
  }

  // ---- Skills the members share (skills.ts) ----

  /**
   * Shares one of a member's skills with their office, or the newer version of one they shared:
   * a skill by that name another member shares stays theirs.
   */
  async shareSkill(
    member: Caller,
    input: { name: unknown; category?: unknown; files: unknown },
    now = new Date(),
  ): Promise<SharedSkill> {
    const skill = checkSkill({
      name: input.name,
      category: input.category,
      files: input.files,
    });
    if ("code" in skill)
      throw new RelayError(skill.status, skill.message, skill.code);
    const at = now.toISOString();
    await this.db.transaction(async (tx) => {
      // One sharer at a time per office, so two never take the same name or the last place.
      await tx.query("SELECT 1 FROM offices WHERE id = $1 FOR UPDATE", [
        member.office,
      ]);
      const [held] = await tx.query<{ by_member: string }>(
        "SELECT by_member FROM shared_skills WHERE office_id = $1 AND name = $2",
        [member.office, skill.name],
      );
      if (held && held.by_member !== member.id)
        throw new RelayError(
          409,
          "A colleague shares a skill by that name already.",
          "skill-taken",
        );
      if (!held) {
        const [count] = await tx.query<{ n: string | number }>(
          "SELECT count(*) AS n FROM shared_skills WHERE office_id = $1",
          [member.office],
        );
        if (Number(count?.n ?? 0) >= SKILLS_PER_OFFICE)
          throw new RelayError(
            413,
            "The office keeps no more skills for now.",
            "skills-full",
          );
      }
      const paths = skill.files.map((file) => ({
        path: file.path,
        size: file.bytes.byteLength,
      }));
      const files: SkillFileData[] = skill.files.map((file) => ({
        path: file.path,
        data: Buffer.from(file.bytes).toString("base64"),
      }));
      await tx.query(
        "INSERT INTO shared_skills (office_id, name, category, description, paths, files, size, hash, by_member, by_name, created, updated) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $11) ON CONFLICT (office_id, name) DO UPDATE SET category = $3, description = $4, paths = $5::jsonb, files = $6::jsonb, size = $7, hash = $8, by_name = $10, updated = $11",
        [
          member.office,
          skill.name,
          skill.category ?? null,
          skill.description,
          JSON.stringify(paths),
          JSON.stringify(files),
          skill.size,
          skill.hash,
          member.id,
          member.card.name.slice(0, 80),
          at,
        ],
      );
    });
    return (await this.sharedSkill(member, skill.name)) as SharedSkill;
  }

  /** The skills an office's members share, by name, without their files. */
  async sharedSkills(member: Caller): Promise<SharedSkill[]> {
    const rows = await this.db.query<SkillRow>(
      `SELECT ${SKILL_COLUMNS} FROM shared_skills s LEFT JOIN members m ON m.id = s.by_member AND m.office_id = s.office_id WHERE s.office_id = $1 ORDER BY s.name`,
      [member.office],
    );
    const owner = rows.length ? await this.ownsOffice(member) : false;
    return rows.map((row) => sharedSkillOf(row, member, owner));
  }

  /** One shared skill with its files, for a member's clone to add. */
  async sharedSkill(member: Caller, name: string): Promise<SharedSkillContent> {
    const [row] = isSkillName(name)
      ? await this.db.query<SkillRow & { files: SkillFileData[] | string }>(
          `SELECT ${SKILL_COLUMNS}, s.files FROM shared_skills s LEFT JOIN members m ON m.id = s.by_member AND m.office_id = s.office_id WHERE s.office_id = $1 AND s.name = $2`,
          [member.office, name],
        )
      : [];
    if (!row) throw new RelayError(404, "No such skill.", "not-found");
    const content =
      typeof row.files === "string" ? JSON.parse(row.files) : row.files;
    return {
      ...sharedSkillOf(row, member, await this.ownsOffice(member)),
      content,
    };
  }

  /** Takes a skill out of the office: the one who shared it, or an owner of the office. */
  async unshareSkill(member: Caller, name: string): Promise<void> {
    const [row] = isSkillName(name)
      ? await this.db.query<{ by_member: string }>(
          "SELECT by_member FROM shared_skills WHERE office_id = $1 AND name = $2",
          [member.office, name],
        )
      : [];
    if (!row) throw new RelayError(404, "No such skill.", "not-found");
    if (row.by_member !== member.id && !(await this.ownsOffice(member)))
      throw new RelayError(
        403,
        "Only the one who shared it, or an owner of the office, takes it out.",
        "skill-not-yours",
      );
    await this.db.query(
      "DELETE FROM shared_skills WHERE office_id = $1 AND name = $2",
      [member.office, name],
    );
  }

  /** One more call a member made with a team key today. */
  async countAiCall(
    member: Caller,
    provider: string,
    now = new Date(),
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO ai_calls (office_id, member_id, provider, day, calls) VALUES ($1, $2, $3, $4, 1) ON CONFLICT (office_id, member_id, provider, day) DO UPDATE SET calls = ai_calls.calls + 1",
      [member.office, member.id, provider, now.toISOString().slice(0, 10)],
    );
  }

  /** The calls a member made today (UTC) with one vendor's team key. */
  async aiCallsToday(
    member: Caller,
    provider: string,
    now = new Date(),
  ): Promise<number> {
    const [row] = await this.db.query<{ calls: unknown }>(
      "SELECT calls FROM ai_calls WHERE office_id = $1 AND member_id = $2 AND provider = $3 AND day = $4",
      [member.office, member.id, provider, now.toISOString().slice(0, 10)],
    );
    return Number(row?.calls ?? 0);
  }

  /** The calls each member made with the office's team keys since a day. */
  async aiCalls(
    office: string,
    since: Date,
  ): Promise<{ member: string; provider: string; calls: number }[]> {
    const rows = await this.db.query<{
      member_id: string;
      provider: string;
      calls: unknown;
    }>(
      "SELECT member_id, provider, SUM(calls) AS calls FROM ai_calls WHERE office_id = $1 AND day >= $2 GROUP BY member_id, provider",
      [office, since.toISOString().slice(0, 10)],
    );
    return rows.map((row) => ({
      member: row.member_id,
      provider: row.provider,
      calls: Number(row.calls),
    }));
  }

  /** A file, for the member who put it here or either member of the request it went with. */
  async file(
    member: Caller,
    id: string,
    now = new Date(),
  ): Promise<{ ref: FileRef; bytes: Uint8Array }> {
    // Who may take it is settled first; the bytes are read only for them.
    const [row] = await this.db.query<{
      id: string;
      name: string;
      type: string;
      size: number;
      owner: string;
      from_member: string | null;
      to_member: string | null;
      expires: unknown;
    }>(
      "SELECT f.id, f.name, f.type, f.size, f.owner, t.from_member, t.to_member, f.expires FROM files f LEFT JOIN tasks t ON t.id = f.task_id WHERE f.id = $1 AND f.office_id = $2",
      [id, member.office],
    );
    const allowed =
      row &&
      [row.owner, row.from_member, row.to_member].includes(member.id) &&
      now.getTime() < new Date(row.expires as string).getTime();
    if (!row || !allowed)
      throw new RelayError(404, "No such file.", "file-missing");
    // As base64 text, as it was put (see `putFile`).
    const [content] = await this.db.query<{ bytes: string }>(
      "SELECT encode(bytes, 'base64') AS bytes FROM files WHERE id = $1",
      [id],
    );
    if (!content) throw new RelayError(404, "No such file.", "file-missing");
    return {
      ref: { id: row.id, name: row.name, type: row.type, size: row.size },
      bytes: new Uint8Array(Buffer.from(content.bytes, "base64")),
    };
  }

  /**
   * A request to someone without a mini-me, by a link: whoever opens it answers on a page. The
   * token is the link's only key, so it is returned to the one asking and nowhere else.
   */
  async sendLink(
    from: Caller,
    name: string,
    text: string,
    now = new Date(),
  ): Promise<{ task: Task; token: string }> {
    const guest = name.trim().slice(0, 80);
    if (!guest || !text.trim())
      throw new RelayError(
        400,
        "A link needs a name and a request.",
        "bad-request",
      );
    const id = randomUUID();
    const token = randomBytes(24).toString("base64url");
    const at = now.toISOString();
    await this.db.transaction(async (tx) => {
      await tx.query(
        "INSERT INTO tasks (id, office_id, context_id, from_member, to_member, state, created, updated) VALUES ($1, $2, $3, $4, $5, 'SUBMITTED', $6, $6)",
        [id, from.office, randomUUID(), from.id, `link:${id.slice(0, 8)}`, at],
      );
      await tx.query(
        "INSERT INTO links (token, task_id, name, created, expires) VALUES ($1, $2, $3, $4, $5)",
        [
          token,
          id,
          guest,
          at,
          new Date(
            now.getTime() + LINK_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString(),
        ],
      );
      await addMessage(tx, id, "user", from.id, text, at);
    });
    return { task: await this.taskFor(from, id), token };
  }

  /** What a link shows: the request, who asked, and whether it can still be answered. */
  async link(
    token: string,
    now = new Date(),
  ): Promise<{ task: Task; name: string; asker?: Card; open: boolean }> {
    const [row] = await this.db.query<{
      task_id: string;
      name: string;
      expires: unknown;
    }>("SELECT task_id, name, expires FROM links WHERE token = $1", [token]);
    if (!row) throw new RelayError(404, "No such link.", "not-found");
    const task = await this.task(row.task_id);
    const [asker] = await this.db.query<{ card: Card }>(
      "SELECT card FROM members WHERE id = $1",
      [task.metadata.from],
    );
    return {
      task,
      name: row.name,
      asker: asker?.card,
      open:
        !FINAL.includes(task.status.state) &&
        now.getTime() < new Date(row.expires as string).getTime(),
    };
  }

  /** The answer given on a link's page; the one asking hears of it at their inbox. */
  async answerLink(
    token: string,
    text: string,
    now = new Date(),
  ): Promise<Task> {
    const { task, name, open } = await this.link(token, now);
    if (!open)
      throw new RelayError(409, "That link is closed.", "request-closed");
    if (!text.trim())
      throw new RelayError(400, "An answer is needed.", "bad-request");
    const at = now.toISOString();
    await this.db.transaction(async (tx) => {
      // Two answers at once: the first closes it, the second finds it closed.
      const closed = await tx.query(
        `UPDATE tasks SET state = 'COMPLETED', updated = $1 WHERE id = $2 AND state NOT IN (${FINAL.map((state) => `'${state}'`).join(", ")}) RETURNING id`,
        [at, task.id],
      );
      if (!closed.length)
        throw new RelayError(409, "That link is closed.", "request-closed");
      await addMessage(
        tx,
        task.id,
        "agent",
        `guest:${name}`,
        text,
        at,
        [],
        true,
      );
      await notify(tx, task.metadata.from, "update", task.id, at);
    });
    this.wake(task.metadata.from);
    return this.task(task.id);
  }

  /** A message on a request, and its new state, from either side. */
  async update(
    member: Caller,
    id: string,
    change: {
      state?: TaskState;
      text?: string;
      files?: string[];
      /** Written by the member's person themselves, not their clone. */
      by?: "person";
    },
  ): Promise<Task> {
    const now = new Date().toISOString();
    const other = await this.db.transaction(async (tx) => {
      const [row] = await tx.query<TaskRow>(
        "SELECT id, context_id, from_member, to_member, state, created, updated FROM tasks WHERE id = $1 FOR UPDATE",
        [id],
      );
      const asked = row?.to_member === member.id;
      if (!row || (!asked && row.from_member !== member.id))
        throw new RelayError(404, "No such request.", "not-found");
      if (FINAL.includes(row.state))
        throw new RelayError(409, "That request is closed.", "request-closed");
      const files = await attach(tx, member, id, change.files ?? [], now);
      if (change.text?.trim() || files.length)
        await addMessage(
          tx,
          id,
          asked ? "agent" : "user",
          member.id,
          change.text ?? "",
          now,
          files,
          change.by === "person",
        );
      // The one asked moves the request along; the one asking can only answer a question or cancel.
      let state = row.state;
      if (asked && change.state) state = change.state;
      if (!asked)
        state =
          change.state === "CANCELED"
            ? "CANCELED"
            : state === "INPUT_REQUIRED" && change.text
              ? "WORKING"
              : state;
      await tx.query(
        "UPDATE tasks SET state = $1, updated = $2 WHERE id = $3",
        [state, now, id],
      );
      const to = asked ? row.from_member : row.to_member;
      await notify(tx, to, "update", id, now);
      return to;
    });
    this.wake(other);
    return this.task(id);
  }

  async task(id: string): Promise<Task> {
    const [task] = await this.build([await this.taskRow(this.db, id)]);
    return task;
  }

  /**
   * Requests from their rows, in the rows' order, with three queries however many there are. For
   * `member`, a link request they made carries the link's path, to give again.
   */
  private async build(rows: TaskRow[], member?: string): Promise<Task[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const [messages, links] = await Promise.all([
      this.db.query<{
        task_id: string;
        id: string;
        role: "user" | "agent";
        from_member: string;
        text: string;
        files: FileRef[] | string | null;
        at: unknown;
        by_person: boolean | null;
        via: Via | null;
      }>(
        "SELECT task_id, id, role, from_member, text, files, at, by_person, via FROM messages WHERE task_id = ANY($1::text[]) ORDER BY seq",
        [ids],
      ),
      this.db.query<{ task_id: string; name: string; token: string }>(
        "SELECT task_id, name, token FROM links WHERE task_id = ANY($1::text[])",
        [ids],
      ),
    ]);
    const byTask = new Map<string, typeof messages>();
    for (const m of messages) {
      const list = byTask.get(m.task_id);
      if (list) list.push(m);
      else byTask.set(m.task_id, [m]);
    }
    const linkOf = new Map(links.map((link) => [link.task_id, link]));
    return rows.map((row): Task => {
      const history = (byTask.get(row.id) ?? []).map((m): Message => {
        const files = (
          typeof m.files === "string" ? JSON.parse(m.files) : (m.files ?? [])
        ) as FileRef[];
        return {
          messageId: m.id,
          role: m.role,
          parts: [{ text: m.text }],
          ...(files.length ? { files } : {}),
          taskId: row.id,
          contextId: row.context_id,
          metadata: {
            from: m.from_member,
            at: iso(m.at),
            ...(m.by_person ? { by: "person" as const } : {}),
            ...(m.via ? { via: m.via } : {}),
          },
        };
      });
      const last = history.at(-1);
      const link = row.to_member.startsWith("link:")
        ? linkOf.get(row.id)
        : undefined;
      return {
        id: row.id,
        contextId: row.context_id,
        status: {
          state: row.state,
          ...(last ? { message: last } : {}),
          timestamp: iso(row.updated),
        },
        history,
        metadata: {
          from: row.from_member,
          to: row.to_member,
          created: iso(row.created),
          ...(link ? { guest: link.name } : {}),
          ...(link && member && row.from_member === member
            ? { link: `/r/${link.token}` }
            : {}),
        },
      };
    });
  }

  /** One request, for the member who sent it or was asked; no one else learns it exists. */
  async taskFor(member: Caller, id: string): Promise<Task> {
    const row = await this.taskRow(this.db, id);
    if (row.from_member !== member.id && row.to_member !== member.id)
      throw new RelayError(404, "No such request.", "not-found");
    const [task] = await this.build([row], member.id);
    return task;
  }

  /** The member's requests, sent and received, latest first. */
  async tasks(member: Caller, limit = 50): Promise<Task[]> {
    const rows = await this.db.query<TaskRow>(
      "SELECT id, context_id, from_member, to_member, state, created, updated FROM tasks WHERE from_member = $1 OR to_member = $1 ORDER BY updated DESC, id LIMIT $2",
      [member.id, limit],
    );
    return this.build(rows, member.id);
  }

  /**
   * The member's requests with one other member, latest first, filtered and paged by the database
   * (A2A's ListTasks): `contextId` one conversation, `state` one state.
   */
  async tasksBetween(
    member: Caller,
    other: string,
    filter: { contextId?: string; state?: TaskState },
    page: { limit: number; offset: number },
  ): Promise<{ tasks: Task[]; total: number }> {
    const where =
      "((from_member = $1 AND to_member = $2) OR (from_member = $2 AND to_member = $1)) AND ($3 = '' OR context_id = $3) AND ($4 = '' OR state = $4)";
    const params = [
      member.id,
      other,
      filter.contextId ?? "",
      filter.state ?? "",
    ];
    const [rows, [count]] = await Promise.all([
      this.db.query<TaskRow>(
        `SELECT id, context_id, from_member, to_member, state, created, updated FROM tasks WHERE ${where} ORDER BY updated DESC, id LIMIT $5 OFFSET $6`,
        [...params, page.limit, page.offset],
      ),
      this.db.query<{ total: string | number }>(
        `SELECT count(*) AS total FROM tasks WHERE ${where}`,
        params,
      ),
    ]);
    return {
      tasks: await this.build(rows, member.id),
      total: Number(count?.total ?? 0),
    };
  }

  /** The request still open that `member` sent `to` in one conversation, the latest. */
  async openIn(
    member: Caller,
    to: string,
    contextId: string,
  ): Promise<string | undefined> {
    const [row] = await this.db.query<{ id: string }>(
      "SELECT id FROM tasks WHERE context_id = $1 AND from_member = $2 AND to_member = $3 AND state <> ALL($4::text[]) ORDER BY updated DESC, id LIMIT 1",
      [contextId, member.id, to, FINAL],
    );
    return row?.id;
  }

  /** What concerns the member after `after`, waiting up to `waitMs` for something to come. */
  async inbox(
    member: Caller,
    after: number,
    waitMs: number,
  ): Promise<InboxEvent[]> {
    await this.db.query("UPDATE members SET seen = $1 WHERE id = $2", [
      new Date().toISOString(),
      member.id,
    ]);
    let events = await this.events(member.id, after);
    const deadline = Date.now() + waitMs;
    // Woken at once by news heard here or from another process; looked at again now and then in
    // case the news was not heard.
    while (!events.length && Date.now() < deadline) {
      await this.waitFor(
        member.id,
        Math.min(RECHECK_MS, deadline - Date.now()),
      );
      events = await this.events(member.id, after);
    }
    return events;
  }

  /**
   * Waits until a request the member is part of comes to a state `done` accepts, or `ms` pass;
   * answers the request as it is then. An A2A caller that asked to wait for the answer waits here.
   */
  async waitForTask(
    member: Caller,
    id: string,
    done: (task: Task) => boolean,
    ms: number,
  ): Promise<Task> {
    const deadline = Date.now() + ms;
    let task = await this.taskFor(member, id);
    while (!done(task) && Date.now() < deadline) {
      await this.waitFor(
        member.id,
        Math.min(RECHECK_MS, deadline - Date.now()),
      );
      task = await this.taskFor(member, id);
    }
    return task;
  }

  /** Lets go of inbox news no one needs any more. */
  async tidy(now = new Date()): Promise<void> {
    await this.db.query("DELETE FROM events WHERE at < $1", [
      new Date(now.getTime() - EVENT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    ]);
    // What meetings of the clones held before they were taken out, after its 60 days.
    await this.db.query("DELETE FROM meetings WHERE created < $1", [
      new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    ]);
    // Files past their two weeks, even in an office that puts no new one.
    await this.db.query("DELETE FROM files WHERE expires < $1", [
      now.toISOString(),
    ]);
    // A person's conversation with their clone past its day.
    await this.db.query("DELETE FROM own_messages WHERE at < $1", [
      new Date(now.getTime() - OWN_HOURS * 60 * 60 * 1000).toISOString(),
    ]);
    // Postgres reclaims what was deleted by itself (autovacuum); PGlite has no such worker.
    if (this.db.kind === "pglite") await this.db.exec("VACUUM");
  }

  // ---- A person talking to their own clone from the team server's page ----

  /** The clone says whether its person may talk to it from the team server's page. */
  async ownAllow(
    member: Caller,
    on: boolean,
    keys: string[] = [],
  ): Promise<void> {
    // the fingerprints of the browsers it trusts, for the page to know whether it is one
    const known = keys
      .filter((key) => typeof key === "string" && /^\d{12}$/.test(key))
      .slice(0, 20);
    await this.db.query(
      "UPDATE members SET own_chat = $2, own_keys = $3::jsonb WHERE id = $1",
      [member.id, on, JSON.stringify(known)],
    );
  }

  /**
   * The person's conversation with their clone as their page shows it: the last day's lines, oldest
   * first, and whether the clone lets them talk to it from here.
   */
  async ownThread(
    member: string,
    now = new Date(),
  ): Promise<{ on: boolean; keys: string[]; messages: OwnMessage[] }> {
    const [row] = await this.db.query<{ own_chat: boolean; own_keys: unknown }>(
      "SELECT own_chat, own_keys FROM members WHERE id = $1",
      [member],
    );
    const since = new Date(now.getTime() - OWN_HOURS * 3_600_000).toISOString();
    // The newest lines, and every question still waiting however old within the day.
    const rows = await this.db.query<OwnRow>(
      "SELECT * FROM (SELECT * FROM own_messages WHERE member_id = $1 AND at > $2 AND kind <> 'pair' ORDER BY at DESC, id DESC LIMIT $3) newest UNION SELECT * FROM own_messages WHERE member_id = $1 AND at > $2 AND kind = 'ask' AND NOT (data ? 'chosen') ORDER BY at, id",
      [member, since, OWN_SHOWN],
    );
    return {
      on: Boolean(row?.own_chat),
      keys: Array.isArray(row?.own_keys) ? (row.own_keys as string[]) : [],
      messages: rows.map(ownMessage),
    };
  }

  /** The person's words to their clone, for it to take from its inbox. */
  async ownSay(
    member: string,
    text: string,
    proof?: OwnProof,
  ): Promise<OwnMessage> {
    const words = String(text ?? "").trim();
    if (!words)
      throw new RelayError(400, "Say something first.", "bad-request");
    if (words.length > OWN_CHARS)
      throw new RelayError(400, "That is too long.", "too-long");
    const at = new Date().toISOString();
    const id = `o-${randomBytes(9).toString("base64url")}`;
    await this.db.transaction(async (tx) => {
      const [row] = await tx.query<{
        own_chat: boolean;
        on_web: boolean;
        own_keys: unknown;
      }>("SELECT own_chat, on_web, own_keys FROM members WHERE id = $1", [
        member,
      ]);
      if (!row || row.on_web)
        throw new RelayError(409, "No clone to talk to.", "no-clone");
      if (!row.own_chat)
        throw new RelayError(
          409,
          "Talking to the clone from here is off.",
          "web-chat-off",
        );
      pairedProof(row.own_keys, proof);
      await ownRoom(tx, member, at, "said");
      await tx.query(
        "INSERT INTO own_messages (id, member_id, kind, text, data, at) VALUES ($1, $2, 'said', $3, $4::jsonb, $5)",
        [id, member, words, JSON.stringify(proof ? { proof } : {}), at],
      );
      await notify(tx, member, "own", id, at);
    });
    return { id, kind: "said", text: words, at };
  }

  /** The clone has taken the person's words and is answering them. */
  async ownTake(member: Caller, id: string): Promise<void> {
    await this.db.query(
      "UPDATE own_messages SET taken = $3 WHERE id = $1 AND member_id = $2 AND kind = 'said' AND taken IS NULL",
      [id, member.id, new Date().toISOString()],
    );
  }

  /** The clone's answer to its person's words: its text, or a code their page words. */
  async ownAnswer(
    member: Caller,
    input: { replyTo?: string; text?: string; code?: string },
  ): Promise<OwnMessage> {
    const text = String(input.text ?? "").slice(0, OWN_CHARS * 3);
    const code =
      typeof input.code === "string" &&
      /^[a-z][a-z-]{1,40}(@\d{9,12})?$/.test(input.code)
        ? input.code
        : undefined;
    if (!text.trim() && !code)
      throw new RelayError(400, "An answer needs words.", "bad-request");
    const replyTo =
      typeof input.replyTo === "string" && /^o-[\w-]{6,40}$/.test(input.replyTo)
        ? input.replyTo
        : undefined;
    const at = new Date().toISOString();
    const id = `o-${randomBytes(9).toString("base64url")}`;
    const data = { ...(replyTo ? { replyTo } : {}), ...(code ? { code } : {}) };
    await this.db.transaction(async (tx) => {
      await ownRoom(tx, member.id, at, "answer");
      await tx.query(
        "INSERT INTO own_messages (id, member_id, kind, text, data, at) VALUES ($1, $2, 'answer', $3, $4::jsonb, $5)",
        [id, member.id, text, JSON.stringify(data), at],
      );
    });
    if (replyTo) await this.ownTake(member, replyTo);
    return { id, kind: "answer", text, at, ...data };
  }

  /** The clone's question to its person, with its choices as buttons carry them. */
  async ownAsk(
    member: Caller,
    input: { text?: string; choices?: unknown },
  ): Promise<OwnMessage> {
    const text = String(input.text ?? "")
      .trim()
      .slice(0, OWN_CHARS);
    const choices = (Array.isArray(input.choices) ? input.choices : [])
      .slice(0, 8)
      .map((one: { label?: unknown; value?: unknown }) => ({
        label: String(one?.label ?? "").slice(0, 120),
        value: String(one?.value ?? "").slice(0, 200),
      }))
      .filter((one) => one.label && one.value);
    if (!text || !choices.length)
      throw new RelayError(
        400,
        "A question needs words and choices.",
        "bad-request",
      );
    const at = new Date().toISOString();
    const id = `o-${randomBytes(9).toString("base64url")}`;
    await this.db.transaction(async (tx) => {
      await ownRoom(tx, member.id, at, "ask");
      await tx.query(
        "INSERT INTO own_messages (id, member_id, kind, text, data, at) VALUES ($1, $2, 'ask', $3, $4::jsonb, $5)",
        [id, member.id, text, JSON.stringify({ choices }), at],
      );
    });
    return { id, kind: "ask", text, at, choices };
  }

  /**
   * The person's answer to their clone's question, from their page: one of its choices, once; the
   * clone hears it in its inbox.
   */
  async ownChoose(
    member: string,
    ask: string,
    value: string,
    proof?: OwnProof,
  ): Promise<void> {
    const at = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      const [row] = await tx.query<OwnRow>(
        "SELECT * FROM own_messages WHERE id = $1 AND member_id = $2 AND kind = 'ask' FOR UPDATE",
        [ask, member],
      );
      if (!row || typeof row.data?.chosen === "string")
        throw new RelayError(
          409,
          "This question is no longer waiting.",
          "no-longer-waiting",
        );
      if (!(row.data?.choices ?? []).some((one) => one.value === value))
        throw new RelayError(400, "Not one of its choices.", "bad-request");
      const [keys] = await tx.query<{ own_keys: unknown }>(
        "SELECT own_keys FROM members WHERE id = $1",
        [member],
      );
      pairedProof(keys?.own_keys, proof);
      await tx.query(
        "UPDATE own_messages SET data = data || $2::jsonb WHERE id = $1",
        [
          ask,
          JSON.stringify({
            chosen: value,
            ...(proof ? { chosenProof: proof } : {}),
          }),
        ],
      );
      await notify(tx, member, "own", ask, at);
    });
  }

  /**
   * A browser asking to be paired with the person's clone, by its public key: the clone asks its
   * person on their computer whether the code the page shows is the one it computes.
   */
  async ownPair(member: string, key: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{80,200}$/.test(key))
      throw new RelayError(400, "Not a key.", "bad-request");
    const at = new Date().toISOString();
    const id = `o-${randomBytes(9).toString("base64url")}`;
    await this.db.transaction(async (tx) => {
      const [row] = await tx.query<{ own_chat: boolean; on_web: boolean }>(
        "SELECT own_chat, on_web FROM members WHERE id = $1 FOR UPDATE",
        [member],
      );
      if (!row || row.on_web)
        throw new RelayError(409, "No clone to talk to.", "no-clone");
      if (!row.own_chat)
        throw new RelayError(
          409,
          "Talking to the clone from here is off.",
          "web-chat-off",
        );
      // one asking at a time: a page asking again replaces its own earlier ask
      await tx.query(
        "DELETE FROM own_messages WHERE member_id = $1 AND kind = 'pair'",
        [member],
      );
      await tx.query(
        "INSERT INTO own_messages (id, member_id, kind, text, data, at) VALUES ($1, $2, 'pair', '', $3::jsonb, $4)",
        [id, member, JSON.stringify({ key }), at],
      );
      await notify(tx, member, "own", id, at);
    });
  }

  /** A question answered elsewhere (on the computer, the phone) or no longer asked: it stops waiting here. */
  async ownSettle(member: Caller, ask: string): Promise<void> {
    await this.db.query(
      "UPDATE own_messages SET data = data || '{\"chosen\":\"settled\"}'::jsonb WHERE id = $1 AND member_id = $2 AND kind = 'ask' AND NOT (data ? 'chosen')",
      [ask, member.id],
    );
  }

  private async events(member: string, after: number): Promise<InboxEvent[]> {
    // News of a kind no longer kept (a meeting of the clones) is passed over in the database itself,
    // so a page of nothing else never holds the inbox back.
    const rows = await this.db.query<{
      seq: string | number;
      type: string;
      task_id: string;
    }>(
      "SELECT seq, type, task_id FROM events WHERE member = $1 AND seq > $2 AND type IN ('task', 'update', 'own') ORDER BY seq LIMIT 50",
      [member, after],
    );
    // Each request once, however many of the news are about it, as it is now.
    const ids = [
      ...new Set(
        rows
          .filter((row) => row.type === "task" || row.type === "update")
          .map((row) => row.task_id),
      ),
    ];
    const found = ids.length
      ? await this.db.query<TaskRow>(
          "SELECT id, context_id, from_member, to_member, state, created, updated FROM tasks WHERE id = ANY($1::text[])",
          [ids],
        )
      : [];
    const built = new Map(
      (await this.build(found, member)).map((task) => [task.id, task]),
    );
    const out: InboxEvent[] = [];
    for (const row of rows) {
      const seq = Number(row.seq);
      if (row.type === "own") {
        // Words from the person's page, or their answer to the clone's question; gone since, none.
        const [own] = await this.db.query<OwnRow>(
          "SELECT * FROM own_messages WHERE id = $1 AND member_id = $2",
          [row.task_id, member],
        );
        if (own?.kind === "said")
          out.push({
            seq,
            type: "own",
            own: {
              id: own.id,
              kind: "said",
              text: own.text,
              ...(own.data?.proof ? { proof: own.data.proof } : {}),
            },
          });
        else if (own?.kind === "ask" && typeof own.data?.chosen === "string")
          out.push({
            seq,
            type: "own",
            own: {
              id: own.id,
              kind: "chosen",
              value: own.data.chosen,
              ...(own.data.chosenProof ? { proof: own.data.chosenProof } : {}),
            },
          });
        else if (own?.kind === "pair" && typeof own.data?.key === "string")
          out.push({
            seq,
            type: "own",
            own: { id: own.id, kind: "pair", key: own.data.key },
          });
        continue;
      }
      // News of a kind no longer kept (a meeting of the clones) is passed over.
      if (row.type !== "task" && row.type !== "update") continue;
      // A request gone since (its office closed) is no news either.
      const task = built.get(row.task_id);
      if (task) out.push({ seq, type: row.type, task });
    }
    return out;
  }

  private waitFor(member: string, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const waiters = this.waiters.get(member) ?? new Set();
      const done = () => {
        clearTimeout(timer);
        waiters.delete(done);
        if (!waiters.size) this.waiters.delete(member);
        resolve();
      };
      const timer = setTimeout(done, ms);
      waiters.add(done);
      this.waiters.set(member, waiters);
    });
  }

  private wake(member: string): void {
    for (const wake of [...(this.waiters.get(member) ?? [])]) wake();
  }

  private async taskRow(sql: Sql, id: string): Promise<TaskRow> {
    const [row] = await sql.query<TaskRow>(
      "SELECT id, context_id, from_member, to_member, state, created, updated FROM tasks WHERE id = $1",
      [id],
    );
    if (!row) throw new RelayError(404, "No such request.", "not-found");
    return row;
  }
}

/** Brings the schema up to date, one process at a time. */
async function migrate(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query("SELECT pg_advisory_xact_lock(4174001)");
    await tx.query(
      "CREATE TABLE IF NOT EXISTS relay_schema (version INT NOT NULL)",
    );
    const [row] = await tx.query<{ version: number }>(
      "SELECT version FROM relay_schema",
    );
    const from = row?.version ?? 0;
    for (const statements of MIGRATIONS.slice(from))
      for (const statement of statements) await tx.query(statement);
    if (!row)
      await tx.query("INSERT INTO relay_schema (version) VALUES ($1)", [
        MIGRATIONS.length,
      ]);
    else if (from < MIGRATIONS.length)
      await tx.query("UPDATE relay_schema SET version = $1", [
        MIGRATIONS.length,
      ]);
  });
}

async function addMessage(
  tx: Sql,
  task: string,
  role: "user" | "agent",
  from: string,
  text: string,
  at: string,
  files: FileRef[] = [],
  byPerson = false,
  via?: Via,
): Promise<void> {
  await tx.query(
    "INSERT INTO messages (id, task_id, role, from_member, text, files, at, by_person, via) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9)",
    [
      randomUUID(),
      task,
      role,
      from,
      text.slice(0, 20_000),
      JSON.stringify(files),
      at,
      byPerson,
      via ?? null,
    ],
  );
}

/**
 * Names files on a request: ones the member put here and not yet named on another request. They
 * are kept from now for FILE_DAYS.
 */
async function attach(
  tx: Sql,
  member: Caller,
  task: string,
  ids: string[],
  now: string,
): Promise<FileRef[]> {
  const wanted = [...new Set(ids)];
  if (!wanted.length) return [];
  if (wanted.length > FILES_PER_MESSAGE)
    throw new RelayError(400, "Too many files at once.", "bad-request");
  const expires = new Date(
    Date.parse(now) + FILE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const named: FileRef[] = [];
  for (const id of wanted) {
    const [row] = await tx.query<FileRef>(
      "UPDATE files SET task_id = $1, expires = $2 WHERE id = $3 AND owner = $4 AND office_id = $5 AND (task_id IS NULL OR task_id = $1) AND expires > $6 RETURNING id, name, type, size",
      [task, expires, id, member.id, member.office, now],
    );
    if (!row) throw new RelayError(400, "No such file.", "file-missing");
    named.push({
      id: row.id,
      name: row.name,
      type: row.type,
      size: Number(row.size),
    });
  }
  return named;
}

/**
 * Everything of one member's in an office put under another's id, as one person's two places become
 * one (`joinAs`): the requests either way and their messages, files and what it set or shared. The day's count of team-key calls stays where it was made.
 */
async function moveMember(
  tx: Sql,
  office: string,
  from: string,
  to: string,
): Promise<void> {
  const args = [office, from, to];
  await tx.query(
    "UPDATE messages SET from_member = $3 WHERE from_member = $2 AND task_id IN (SELECT id FROM tasks WHERE office_id = $1)",
    args,
  );
  await tx.query(
    "UPDATE tasks SET from_member = $3 WHERE office_id = $1 AND from_member = $2",
    args,
  );
  await tx.query(
    "UPDATE tasks SET to_member = $3 WHERE office_id = $1 AND to_member = $2",
    args,
  );
  await tx.query(
    "UPDATE files SET owner = $3 WHERE office_id = $1 AND owner = $2",
    args,
  );
  for (const table of ["shared_skills", "office_settings", "invites"])
    await tx.query(
      `UPDATE ${table} SET by_member = $3 WHERE office_id = $1 AND by_member = $2`,
      args,
    );
}

/**
 * Words from the page come signed by a browser its person paired (own-chat.ts on the clone's side,
 * which alone decides): the relay turns away at once what no paired browser could have signed, so
 * the page says to pair it rather than the clone answering later that it will not act on it.
 */
function pairedProof(keys: unknown, proof: OwnProof | undefined): void {
  const known = Array.isArray(keys) ? (keys as string[]) : [];
  if (!proof || !known.includes(keyCode(proof.key)))
    throw new RelayError(
      403,
      "This browser is not paired with the clone.",
      "web-chat-unpaired",
    );
}

/**
 * Room for one more line of a person's conversation with their clone: only while the clone lets
 * them talk to it from the page, a few of their words waiting at once, and a day's worth at most.
 */
async function ownRoom(
  tx: Sql,
  member: string,
  at: string,
  kind: "said" | "answer" | "ask",
): Promise<void> {
  const [row] = await tx.query<{ own_chat: boolean }>(
    "SELECT own_chat FROM members WHERE id = $1 FOR UPDATE",
    [member],
  );
  if (!row?.own_chat)
    throw new RelayError(
      409,
      "Talking to the clone from here is off.",
      "web-chat-off",
    );
  const [{ day, waiting }] = await tx.query<{ day: number; waiting: number }>(
    "SELECT count(*)::int AS day, count(*) FILTER (WHERE kind = 'said' AND taken IS NULL)::int AS waiting FROM own_messages WHERE member_id = $1 AND at > $2",
    [member, new Date(Date.parse(at) - OWN_HOURS * 3_600_000).toISOString()],
  );
  if (day >= OWN_DAILY || (kind === "said" && waiting >= OWN_WAITING))
    throw new RelayError(429, "Too much at once.", "too-many");
}

interface OwnRow {
  id: string;
  member_id: string;
  kind: "said" | "answer" | "ask" | "pair";
  text: string;
  data: {
    replyTo?: string;
    code?: string;
    choices?: { label: string; value: string }[];
    chosen?: string;
    proof?: OwnProof;
    chosenProof?: OwnProof;
    key?: string;
  } | null;
  at: unknown;
  taken: unknown;
}

function ownMessage(row: OwnRow): OwnMessage {
  const data = row.data ?? {};
  return {
    id: row.id,
    // a browser asking to be paired is never in the conversation (`ownThread`)
    kind: row.kind as OwnMessage["kind"],
    text: row.text,
    at: iso(row.at),
    ...(row.kind === "said" && row.taken ? { taken: true } : {}),
    ...(data.replyTo ? { replyTo: data.replyTo } : {}),
    ...(data.code ? { code: data.code } : {}),
    ...(data.choices ? { choices: data.choices } : {}),
    ...(typeof data.chosen === "string" ? { chosen: data.chosen } : {}),
  };
}

/** News for a member's inbox; every relay process hears it once the transaction commits. */
async function notify(
  tx: Sql,
  member: string,
  type: "task" | "update" | "own",
  task: string,
  at: string,
): Promise<void> {
  await tx.query(
    "INSERT INTO events (member, type, task_id, at) VALUES ($1, $2, $3, $4)",
    [member, type, task, at],
  );
  await tx.query("SELECT pg_notify($1, $2)", [CHANNEL, member]);
}

function cleanCard(card: Card): Card {
  const name = String(card?.name ?? "")
    .trim()
    .slice(0, 80);
  if (!name) throw new RelayError(400, "A card needs a name.", "bad-request");
  return {
    name,
    description: String(card.description ?? "")
      .trim()
      .slice(0, 600),
    ...(Array.isArray(card.skills)
      ? {
          skills: card.skills.slice(0, 20).map((skill) => ({
            id: String(skill.id).slice(0, 60),
            name: String(skill.name).slice(0, 80),
            description: String(skill.description ?? "").slice(0, 300),
            ...(Array.isArray(skill.examples)
              ? {
                  examples: skill.examples
                    .slice(0, 5)
                    .map((e) => String(e).slice(0, 200)),
                }
              : {}),
          })),
        }
      : {}),
    ...(Array.isArray(card.owns)
      ? {
          owns: card.owns
            .slice(0, 6)
            .map((area) => String(area).trim().slice(0, 80))
            .filter(Boolean),
        }
      : {}),
    ...(card.status ? { status: String(card.status).slice(0, 60) } : {}),
    ...(Array.isArray(card.howToWork)
      ? {
          howToWork: card.howToWork
            .slice(0, 12)
            .map((line) => String(line).trim().slice(0, 240))
            .filter(Boolean),
        }
      : {}),
  };
}
