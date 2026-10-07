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
// A meeting is the clones talking together, the office's standup or a question to everyone: the
// clones present when it opens take part, each says one thing a round (or passes), a round ends
// once all have spoken or its time is up, and after the last one each clone tells its person what
// matters to them. Everyone in the office can read it; nobody's person needs to be there.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Database, Sql } from "./db.ts";

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
  metadata: { from: string; at: string; by?: "person" };
}

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
}

/** A member making a call: who, in which office. */
export interface Caller {
  id: string;
  office: string;
  card: Card;
}

export type InboxEvent =
  | { seq: number; type: "task" | "update"; task: Task }
  | { seq: number; type: "meeting"; meeting: Meeting };

/** The office's standup, or one clone's question to everyone. */
export type MeetingKind = "standup" | "question";

/** How many rounds each kind has: a standup reports then answers; a question answers then follows up. */
export const MEETING_ROUNDS: Record<MeetingKind, number> = {
  standup: 2,
  question: 2,
};

/** How long a round waits for the clones that have not spoken yet. */
export const ROUND_MS = 4 * 60 * 1000;

/** A member is present when its clone came to its inbox this recently (it waits there all along). */
export const PRESENT_MS = 2 * 60 * 1000;

/** A standup opened this recently is the day's: opening one again joins it instead. */
const STANDUP_HOURS = 10;

/** How much one post may say. */
export const POST_CHARS = 2000;

/** Meetings older than this are let go. */
const MEETING_DAYS = 60;

/** One thing a clone said in a meeting, or that it had nothing to say this round (empty text). */
export interface MeetingPost {
  id: string;
  from: string;
  round: number;
  /** The post it answers, when it answers one. */
  replyTo?: string;
  text: string;
  at: string;
}

export interface Meeting {
  /** Also the A2A contextId of its posts. */
  id: string;
  kind: MeetingKind;
  /** The standup's focus, or the question asked. */
  topic: string;
  /** The language the clones speak in it, as the one who opened it speaks (e.g. "Korean"). */
  language: string;
  /** The member who opened it. */
  openedBy: string;
  /** The members taking part: those present when it opened. */
  members: string[];
  round: number;
  rounds: number;
  state: "open" | "closed";
  created: string;
  /** When the round now under way ends, whoever has not spoken. */
  roundEnds: string;
  closed?: string;
  posts: MeetingPost[];
}

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
  // Meetings: the clones talking together.
  [
    "CREATE TABLE meetings (id TEXT PRIMARY KEY, office_id TEXT NOT NULL REFERENCES offices (id) ON DELETE CASCADE, kind TEXT NOT NULL, topic TEXT NOT NULL, language TEXT NOT NULL, opened_by TEXT NOT NULL, members JSONB NOT NULL, round INT NOT NULL, rounds INT NOT NULL, state TEXT NOT NULL, created TIMESTAMPTZ NOT NULL, round_ends TIMESTAMPTZ NOT NULL, closed TIMESTAMPTZ)",
    "CREATE INDEX meetings_office ON meetings (office_id, created DESC)",
    "CREATE INDEX meetings_open ON meetings (state, round_ends)",
    "CREATE TABLE meeting_posts (seq BIGSERIAL PRIMARY KEY, id TEXT UNIQUE NOT NULL, meeting_id TEXT NOT NULL REFERENCES meetings (id) ON DELETE CASCADE, from_member TEXT NOT NULL, round INT NOT NULL, reply_to TEXT, text TEXT NOT NULL, at TIMESTAMPTZ NOT NULL)",
    "CREATE UNIQUE INDEX meeting_posts_once ON meeting_posts (meeting_id, from_member, round)",
  ],
  // Who wrote a message: the member's person themselves, or their clone (the default).
  ["ALTER TABLE messages ADD COLUMN by_person BOOLEAN NOT NULL DEFAULT false"],
];

/**
 * What an office keeps for all its members: the OAuth client a vendor wants registered first, and
 * when the clones hold their standup.
 */
const TEAM_SETTING = /^(connector:[a-z0-9-]{1,40}|meeting:standup)$/;

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

interface TaskRow {
  id: string;
  context_id: string;
  from_member: string;
  to_member: string;
  state: TaskState;
  created: unknown;
  updated: unknown;
}

interface MeetingRow {
  id: string;
  office_id: string;
  kind: MeetingKind;
  topic: string;
  language: string;
  opened_by: string;
  members: string[] | string;
  round: number;
  rounds: number;
  state: "open" | "closed";
  created: unknown;
  round_ends: unknown;
  closed: unknown;
}

const MEETING_COLUMNS =
  "id, office_id, kind, topic, language, opened_by, members, round, rounds, state, created, round_ends, closed";

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

  /** Whether a key opens an office here, for its invite page. */
  async knows(key: string): Promise<boolean> {
    const rows = await this.db.query("SELECT 1 FROM offices WHERE key = $1", [
      key,
    ]);
    return rows.length > 0;
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
    const [office] = input.key
      ? await this.db.query<{ id: string }>(
          "SELECT id FROM offices WHERE key = $1",
          [input.key],
        )
      : [];
    if (!office)
      throw new RelayError(
        403,
        "That is not this office's key.",
        "office-key-wrong",
      );
    const id = `m-${randomBytes(6).toString("hex")}`;
    const token = randomBytes(24).toString("base64url");
    await this.db.query(
      "INSERT INTO members (id, office_id, token_hash, card, joined, seen) VALUES ($1, $2, $3, $4::jsonb, $5, $5)",
      [id, office.id, hashToken(token), JSON.stringify(card), now],
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
  ): Promise<{ id: string; token: string; moved: boolean }> {
    const token = randomBytes(24).toString("base64url");
    const now = new Date().toISOString();
    return this.db.transaction(async (tx) => {
      const [had] = await tx.query<{ id: string }>(
        "SELECT id FROM members WHERE office_id = $1 AND user_id = $2 FOR UPDATE",
        [office, user],
      );
      if (had) {
        await tx.query(
          "UPDATE members SET token_hash = $1, seen = $2 WHERE id = $3",
          [hashToken(token), now, had.id],
        );
        return { id: had.id, token, moved: true };
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
    }>(
      "SELECT id, card, seen FROM members WHERE office_id = $1 AND user_id = $2",
      [office, user],
    );
    return row
      ? { id: row.id, card: row.card, seen: iso(row.seen) }
      : undefined;
  }

  /** The member a token belongs to; throws when it belongs to none. */
  async memberByToken(token: string): Promise<Caller> {
    const [row] = token
      ? await this.db.query<{ id: string; office_id: string; card: Card }>(
          "SELECT id, office_id, card FROM members WHERE token_hash = $1",
          [hashToken(token)],
        )
      : [];
    if (!row)
      throw new RelayError(401, "Unknown member.", "office-member-unknown");
    return { id: row.id, office: row.office_id, card: row.card };
  }

  /** The members of an office, in the order they joined. */
  async members(office: string): Promise<Member[]> {
    const rows = await this.db.query<{ id: string; card: Card; seen: unknown }>(
      "SELECT id, card, seen FROM members WHERE office_id = $1 ORDER BY joined, id",
      [office],
    );
    return rows.map((row) => ({
      id: row.id,
      card: row.card,
      seen: iso(row.seen),
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
      await tx.query(
        "INSERT INTO files (id, office_id, owner, name, type, size, bytes, created, expires) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          id,
          member.office,
          member.id,
          name,
          type,
          size,
          input.bytes,
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

  /** A file, for the member who put it here or either member of the request it went with. */
  async file(
    member: Caller,
    id: string,
    now = new Date(),
  ): Promise<{ ref: FileRef; bytes: Uint8Array }> {
    const [row] = await this.db.query<{
      id: string;
      name: string;
      type: string;
      size: number;
      bytes: Uint8Array;
      owner: string;
      from_member: string | null;
      to_member: string | null;
      expires: unknown;
    }>(
      "SELECT f.id, f.name, f.type, f.size, f.bytes, f.owner, t.from_member, t.to_member, f.expires FROM files f LEFT JOIN tasks t ON t.id = f.task_id WHERE f.id = $1 AND f.office_id = $2",
      [id, member.office],
    );
    const allowed =
      row &&
      [row.owner, row.from_member, row.to_member].includes(member.id) &&
      now.getTime() < new Date(row.expires as string).getTime();
    if (!row || !allowed)
      throw new RelayError(404, "No such file.", "file-missing");
    return {
      ref: { id: row.id, name: row.name, type: row.type, size: row.size },
      bytes: new Uint8Array(row.bytes),
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
    const row = await this.taskRow(this.db, id);
    const messages = await this.db.query<{
      id: string;
      role: "user" | "agent";
      from_member: string;
      text: string;
      files: FileRef[] | string | null;
      at: unknown;
      by_person: boolean | null;
    }>(
      "SELECT id, role, from_member, text, files, at, by_person FROM messages WHERE task_id = $1 ORDER BY seq",
      [id],
    );
    const history = messages.map((m): Message => {
      const files = (
        typeof m.files === "string" ? JSON.parse(m.files) : (m.files ?? [])
      ) as FileRef[];
      return {
        messageId: m.id,
        role: m.role,
        parts: [{ text: m.text }],
        ...(files.length ? { files } : {}),
        taskId: id,
        contextId: row.context_id,
        metadata: {
          from: m.from_member,
          at: iso(m.at),
          ...(m.by_person ? { by: "person" as const } : {}),
        },
      };
    });
    const last = history.at(-1);
    const [link] = row.to_member.startsWith("link:")
      ? await this.db.query<{ name: string }>(
          "SELECT name FROM links WHERE task_id = $1",
          [id],
        )
      : [];
    return {
      id,
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
      },
    };
  }

  /** A link request, as the one who made it sees it: with the link's path, to give again. */
  private async withLink(task: Task, member: string): Promise<Task> {
    if (task.metadata.from !== member || !task.metadata.guest) return task;
    const [row] = await this.db.query<{ token: string }>(
      "SELECT token FROM links WHERE task_id = $1",
      [task.id],
    );
    return row
      ? { ...task, metadata: { ...task.metadata, link: `/r/${row.token}` } }
      : task;
  }

  /** One request, for the member who sent it or was asked; no one else learns it exists. */
  async taskFor(member: Caller, id: string): Promise<Task> {
    const row = await this.taskRow(this.db, id);
    if (row.from_member !== member.id && row.to_member !== member.id)
      throw new RelayError(404, "No such request.", "not-found");
    return this.withLink(await this.task(id), member.id);
  }

  /** The member's requests, sent and received, latest first. */
  async tasks(member: Caller, limit = 50): Promise<Task[]> {
    const rows = await this.db.query<{ id: string }>(
      "SELECT id FROM tasks WHERE from_member = $1 OR to_member = $1 ORDER BY updated DESC, id LIMIT $2",
      [member.id, limit],
    );
    const out: Task[] = [];
    for (const row of rows)
      out.push(await this.withLink(await this.task(row.id), member.id));
    return out;
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

  /**
   * Opens a meeting with the members present now. A standup still going is joined instead; and
   * one opened at the office's set time (`scheduled`) is held once a day, so the clones that each
   * open it at its time hold one together.
   */
  async openMeeting(
    from: Caller,
    input: {
      kind: string;
      topic?: string;
      language?: string;
      scheduled?: boolean;
    },
    now = new Date(),
  ): Promise<Meeting> {
    const kind = input.kind as MeetingKind;
    if (!(kind in MEETING_ROUNDS))
      throw new RelayError(400, "No such kind of meeting.", "bad-request");
    const topic = String(input.topic ?? "")
      .trim()
      .slice(0, 600);
    if (kind === "question" && !topic)
      throw new RelayError(400, "A question needs its words.", "bad-request");
    const language =
      String(input.language ?? "")
        .trim()
        .slice(0, 40) || "English";
    const at = now.toISOString();
    const { id, opened } = await this.db.transaction(async (tx) => {
      // One standup at a time per office: whoever opens it first, the others join.
      await tx.query("SELECT pg_advisory_xact_lock(4174002)");
      if (kind === "standup") {
        const [today] = await tx.query<{ id: string; state: string }>(
          "SELECT id, state FROM meetings WHERE office_id = $1 AND kind = 'standup' AND created > $2 ORDER BY created DESC LIMIT 1",
          [
            from.office,
            new Date(
              now.getTime() - STANDUP_HOURS * 60 * 60 * 1000,
            ).toISOString(),
          ],
        );
        if (today && (today.state === "open" || input.scheduled))
          return { id: today.id, opened: [] as string[] };
      }
      const present = (
        await tx.query<{ id: string }>(
          "SELECT id FROM members WHERE office_id = $1 AND (seen > $2 OR id = $3) ORDER BY joined, id",
          [
            from.office,
            new Date(now.getTime() - PRESENT_MS).toISOString(),
            from.id,
          ],
        )
      ).map((row) => row.id);
      if (present.length < 2)
        throw new RelayError(
          409,
          "Nobody else is in the office now.",
          "meeting-alone",
        );
      const id = randomUUID();
      await tx.query(
        `INSERT INTO meetings (${MEETING_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 1, $8, 'open', $9, $10, NULL)`,
        [
          id,
          from.office,
          kind,
          topic,
          language,
          from.id,
          JSON.stringify(present),
          MEETING_ROUNDS[kind],
          at,
          new Date(now.getTime() + ROUND_MS).toISOString(),
        ],
      );
      // The question is what the one who asked said first.
      if (kind === "question")
        await tx.query(
          "INSERT INTO meeting_posts (id, meeting_id, from_member, round, reply_to, text, at) VALUES ($1, $2, $3, 0, NULL, $4, $5)",
          [randomUUID(), id, from.id, topic, at],
        );
      for (const member of present) await notify(tx, member, "meeting", id, at);
      return { id, opened: present };
    });
    for (const member of opened) this.wake(member);
    return this.meetingById(id);
  }

  /** One meeting of the member's office, with what was said. */
  async meeting(member: Caller, id: string): Promise<Meeting> {
    const meeting = await this.meetingById(id).catch(() => undefined);
    const [row] = meeting
      ? await this.db.query<{ office_id: string }>(
          "SELECT office_id FROM meetings WHERE id = $1",
          [id],
        )
      : [];
    if (!meeting || row?.office_id !== member.office)
      throw new RelayError(404, "No such meeting.", "not-found");
    return meeting;
  }

  /** The office's latest meetings, newest first. */
  async meetings(member: Caller, limit = 10): Promise<Meeting[]> {
    const rows = await this.db.query<{ id: string }>(
      "SELECT id FROM meetings WHERE office_id = $1 ORDER BY created DESC LIMIT $2",
      [member.office, Math.max(1, Math.min(limit, 50))],
    );
    const out: Meeting[] = [];
    for (const row of rows) out.push(await this.meetingById(row.id));
    return out;
  }

  /**
   * What a member's clone says in a round (empty text: it passes). Once a round; a round already
   * past still takes what was not said in it, while the meeting is open. The round ends as soon as
   * everyone has spoken.
   */
  async postToMeeting(
    member: Caller,
    id: string,
    input: { round: number; text?: string; replyTo?: string },
    now = new Date(),
  ): Promise<Meeting> {
    const at = now.toISOString();
    const woken = await this.db.transaction(async (tx) => {
      const [row] = await tx.query<MeetingRow>(
        `SELECT ${MEETING_COLUMNS} FROM meetings WHERE id = $1 FOR UPDATE`,
        [id],
      );
      if (!row || row.office_id !== member.office)
        throw new RelayError(404, "No such meeting.", "not-found");
      const members = listOf(row.members);
      if (!members.includes(member.id))
        throw new RelayError(403, "Not in this meeting.", "meeting-not-in");
      if (row.state !== "open")
        throw new RelayError(409, "The meeting is over.", "meeting-closed");
      const round = Number(input.round);
      if (!Number.isInteger(round) || round < 1 || round > row.round)
        throw new RelayError(
          400,
          "Not a round of this meeting.",
          "bad-request",
        );
      const replyTo = input.replyTo ? String(input.replyTo) : undefined;
      if (replyTo) {
        const [found] = await tx.query(
          "SELECT 1 FROM meeting_posts WHERE id = $1 AND meeting_id = $2",
          [replyTo, id],
        );
        if (!found)
          throw new RelayError(400, "No such post here.", "bad-request");
      }
      const [said] = await tx.query(
        "SELECT 1 FROM meeting_posts WHERE meeting_id = $1 AND from_member = $2 AND round = $3",
        [id, member.id, round],
      );
      if (said)
        throw new RelayError(
          409,
          "Already said in this round.",
          "meeting-said",
        );
      await tx.query(
        "INSERT INTO meeting_posts (id, meeting_id, from_member, round, reply_to, text, at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
        [
          randomUUID(),
          id,
          member.id,
          round,
          replyTo ?? null,
          String(input.text ?? "")
            .trim()
            .slice(0, POST_CHARS),
          at,
        ],
      );
      if (round !== row.round) return [];
      const spoke = new Set(
        (
          await tx.query<{ from_member: string }>(
            "SELECT from_member FROM meeting_posts WHERE meeting_id = $1 AND round = $2",
            [id, round],
          )
        ).map((post) => post.from_member),
      );
      const waiting = expected(row, members).filter((m) => !spoke.has(m));
      return waiting.length ? [] : advance(tx, row, members, now);
    });
    for (const one of woken) this.wake(one);
    return this.meetingById(id);
  }

  /** Ends the rounds whose time is up: the next begins, or the meeting closes. */
  async advanceMeetings(now = new Date()): Promise<void> {
    const due = await this.db.query<{ id: string }>(
      "SELECT id FROM meetings WHERE state = 'open' AND round_ends <= $1",
      [now.toISOString()],
    );
    for (const { id } of due) {
      const woken = await this.db.transaction(async (tx) => {
        const [row] = await tx.query<MeetingRow>(
          `SELECT ${MEETING_COLUMNS} FROM meetings WHERE id = $1 FOR UPDATE`,
          [id],
        );
        if (
          !row ||
          row.state !== "open" ||
          Date.parse(iso(row.round_ends)) > now.getTime()
        )
          return [];
        return advance(tx, row, listOf(row.members), now);
      });
      for (const one of woken) this.wake(one);
    }
  }

  private async meetingById(id: string): Promise<Meeting> {
    const [row] = await this.db.query<MeetingRow>(
      `SELECT ${MEETING_COLUMNS} FROM meetings WHERE id = $1`,
      [id],
    );
    if (!row) throw new RelayError(404, "No such meeting.", "not-found");
    const posts = await this.db.query<{
      id: string;
      from_member: string;
      round: number;
      reply_to: string | null;
      text: string;
      at: unknown;
    }>(
      "SELECT id, from_member, round, reply_to, text, at FROM meeting_posts WHERE meeting_id = $1 ORDER BY seq",
      [id],
    );
    return {
      id: row.id,
      kind: row.kind,
      topic: row.topic,
      language: row.language,
      openedBy: row.opened_by,
      members: listOf(row.members),
      round: Number(row.round),
      rounds: Number(row.rounds),
      state: row.state,
      created: iso(row.created),
      roundEnds: iso(row.round_ends),
      ...(row.closed ? { closed: iso(row.closed) } : {}),
      posts: posts.map((post) => ({
        id: post.id,
        from: post.from_member,
        round: Number(post.round),
        ...(post.reply_to ? { replyTo: post.reply_to } : {}),
        text: post.text,
        at: iso(post.at),
      })),
    };
  }

  /** Lets go of inbox news no one needs any more. */
  async tidy(now = new Date()): Promise<void> {
    await this.db.query("DELETE FROM events WHERE at < $1", [
      new Date(now.getTime() - EVENT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    ]);
    await this.db.query("DELETE FROM meetings WHERE created < $1", [
      new Date(
        now.getTime() - MEETING_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    ]);
  }

  private async events(member: string, after: number): Promise<InboxEvent[]> {
    const rows = await this.db.query<{
      seq: string | number;
      type: "task" | "update" | "meeting";
      task_id: string;
    }>(
      "SELECT seq, type, task_id FROM events WHERE member = $1 AND seq > $2 ORDER BY seq LIMIT 50",
      [member, after],
    );
    const out: InboxEvent[] = [];
    for (const row of rows) {
      const seq = Number(row.seq);
      if (row.type === "meeting") {
        // A meeting let go since is no news.
        const meeting = await this.meetingById(row.task_id).catch(
          () => undefined,
        );
        if (meeting) out.push({ seq, type: "meeting", meeting });
        continue;
      }
      out.push({ seq, type: row.type, task: await this.task(row.task_id) });
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
): Promise<void> {
  await tx.query(
    "INSERT INTO messages (id, task_id, role, from_member, text, files, at, by_person) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)",
    [
      randomUUID(),
      task,
      role,
      from,
      text.slice(0, 20_000),
      JSON.stringify(files),
      at,
      byPerson,
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

/** News for a member's inbox; every relay process hears it once the transaction commits. */
async function notify(
  tx: Sql,
  member: string,
  type: "task" | "update" | "meeting",
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

/** A JSONB list as it comes from either database. */
function listOf(value: string[] | string): string[] {
  return typeof value === "string" ? JSON.parse(value) : value;
}

/** Who is to speak in a meeting's round now: everyone, but not the one who asked a question first. */
function expected(row: MeetingRow, members: string[]): string[] {
  return row.kind === "question" && Number(row.round) === 1
    ? members.filter((m) => m !== row.opened_by)
    : members;
}

/** The next round begins, or the meeting closes; every member hears. Answers who to wake. */
async function advance(
  tx: Sql,
  row: MeetingRow,
  members: string[],
  now: Date,
): Promise<string[]> {
  const at = now.toISOString();
  if (Number(row.round) < Number(row.rounds))
    await tx.query(
      "UPDATE meetings SET round = round + 1, round_ends = $1 WHERE id = $2",
      [new Date(now.getTime() + ROUND_MS).toISOString(), row.id],
    );
  else
    await tx.query(
      "UPDATE meetings SET state = 'closed', closed = $1 WHERE id = $2",
      [at, row.id],
    );
  for (const member of members) await notify(tx, member, "meeting", row.id, at);
  return members;
}
