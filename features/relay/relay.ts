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
  /** Working, in a meeting, off: what the person is doing now, as they set it. */
  status?: string;
  /** How to work with the person (their ME.md), in lines they confirmed one by one. */
  howToWork?: string[];
}

export interface Message {
  messageId: string;
  role: "user" | "agent";
  parts: { text: string }[];
  taskId: string;
  contextId: string;
  metadata: { from: string; at: string };
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

export interface InboxEvent {
  seq: number;
  type: "task" | "update";
  task: Task;
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
];

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

  /** A request from one member to another in the same office. */
  async send(from: Caller, to: string, text: string): Promise<Task> {
    if (from.id === to)
      throw new RelayError(
        400,
        "A mini-me does not ask itself.",
        "bad-request",
      );
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
        [id, from.office, randomUUID(), from.id, to, now],
      );
      await addMessage(tx, id, "user", from.id, text, now);
      await notify(tx, to, "task", id, now);
    });
    this.wake(to);
    return this.task(id);
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
      await addMessage(tx, task.id, "agent", `guest:${name}`, text, at);
      await notify(tx, task.metadata.from, "update", task.id, at);
    });
    this.wake(task.metadata.from);
    return this.task(task.id);
  }

  /** A message on a request, and its new state, from either side. */
  async update(
    member: Caller,
    id: string,
    change: { state?: TaskState; text?: string },
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
      if (change.text?.trim())
        await addMessage(
          tx,
          id,
          asked ? "agent" : "user",
          member.id,
          change.text,
          now,
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
      at: unknown;
    }>(
      "SELECT id, role, from_member, text, at FROM messages WHERE task_id = $1 ORDER BY seq",
      [id],
    );
    const history = messages.map(
      (m): Message => ({
        messageId: m.id,
        role: m.role,
        parts: [{ text: m.text }],
        taskId: id,
        contextId: row.context_id,
        metadata: { from: m.from_member, at: iso(m.at) },
      }),
    );
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

  /** Lets go of inbox news no one needs any more. */
  async tidy(now = new Date()): Promise<void> {
    await this.db.query("DELETE FROM events WHERE at < $1", [
      new Date(now.getTime() - EVENT_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    ]);
  }

  private async events(member: string, after: number): Promise<InboxEvent[]> {
    const rows = await this.db.query<{
      seq: string | number;
      type: "task" | "update";
      task_id: string;
    }>(
      "SELECT seq, type, task_id FROM events WHERE member = $1 AND seq > $2 ORDER BY seq LIMIT 50",
      [member, after],
    );
    const out: InboxEvent[] = [];
    for (const row of rows)
      out.push({
        seq: Number(row.seq),
        type: row.type,
        task: await this.task(row.task_id),
      });
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
): Promise<void> {
  await tx.query(
    "INSERT INTO messages (id, task_id, role, from_member, text, at) VALUES ($1, $2, $3, $4, $5, $6)",
    [randomUUID(), task, role, from, text.slice(0, 20_000), at],
  );
}

/** News for a member's inbox; every relay process hears it once the transaction commits. */
async function notify(
  tx: Sql,
  member: string,
  type: "task" | "update",
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
