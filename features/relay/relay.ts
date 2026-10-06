// The relay: a small server a team runs, that carries requests between its members' mini-mes.
// A mini-me sits on its person's computer, out of reach, so it comes to the relay: it joins with the
// office's key, gets its own token, publishes its card, and waits at its inbox for what concerns
// it (a request to it, news of a request it sent). The relay keeps only cards, requests and their
// messages; nothing a mini-me learned about its person comes here.
//
// The shapes follow A2A v1.0.0 (a2a-protocol.org): an AgentCard per member, a Task per request
// with a contextId, Messages with text parts and the roles user (the one asking) and agent (the
// one asked), and A2A's task states. A full A2A binding can be put in front of this later.

import { randomBytes, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

export type TaskState =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

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
  metadata: { from: string; to: string; created: string };
}

export interface Member {
  id: string;
  card: Card;
  seen: string;
}

export interface InboxEvent {
  seq: number;
  type: "task" | "update";
  task: Task;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, token TEXT UNIQUE NOT NULL, card TEXT NOT NULL, joined TEXT NOT NULL, seen TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, context_id TEXT NOT NULL, from_member TEXT NOT NULL, to_member TEXT NOT NULL, state TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, role TEXT NOT NULL, from_member TEXT NOT NULL, text TEXT NOT NULL, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, member TEXT NOT NULL, type TEXT NOT NULL, task_id TEXT NOT NULL, at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_member ON events (member, seq);
CREATE INDEX IF NOT EXISTS messages_task ON messages (task_id, at);
`;

// Node runs this file without a build, so no TypeScript-only syntax such as parameter properties.
export class RelayError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Relay {
  private db: DatabaseSync;
  private waiters = new Map<string, Set<() => void>>();
  readonly key: string;

  constructor(path: string, key: string) {
    this.key = key;
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  /** Join with the office's key, or update one's card with one's token. */
  join(input: { key?: string; token?: string; card: Card }): {
    id: string;
    token: string;
  } {
    const card = cleanCard(input.card);
    const now = new Date().toISOString();
    if (input.token) {
      const member = this.memberByToken(input.token);
      this.db
        .prepare("UPDATE members SET card = ?, seen = ? WHERE id = ?")
        .run(JSON.stringify(card), now, member.id);
      return { id: member.id, token: input.token };
    }
    if (input.key !== this.key)
      throw new RelayError(403, "That is not this office's key.");
    const id = `m-${randomUUID().slice(0, 8)}`;
    const token = randomBytes(24).toString("base64url");
    this.db
      .prepare(
        "INSERT INTO members (id, token, card, joined, seen) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, token, JSON.stringify(card), now, now);
    return { id, token };
  }

  /** The member a token belongs to; throws when it belongs to none. */
  memberByToken(token: string): { id: string; card: Card } {
    const row = this.db
      .prepare("SELECT id, card FROM members WHERE token = ?")
      .get(token) as { id: string; card: string } | undefined;
    if (!row) throw new RelayError(401, "Unknown member.");
    return { id: row.id, card: JSON.parse(row.card) };
  }

  members(): Member[] {
    return (
      this.db
        .prepare("SELECT id, card, seen FROM members ORDER BY joined")
        .all() as { id: string; card: string; seen: string }[]
    ).map((row) => ({
      id: row.id,
      card: JSON.parse(row.card),
      seen: row.seen,
    }));
  }

  /** A request from one member to another. */
  send(from: string, to: string, text: string): Task {
    if (from === to)
      throw new RelayError(400, "A mini-me does not ask itself.");
    if (!this.members().some((m) => m.id === to))
      throw new RelayError(404, "No such member.");
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        "INSERT INTO tasks (id, context_id, from_member, to_member, state, created, updated) VALUES (?, ?, ?, ?, 'SUBMITTED', ?, ?)",
      )
      .run(id, randomUUID(), from, to, now, now);
    this.addMessage(id, "user", from, text, now);
    this.notify(to, "task", id);
    return this.task(id);
  }

  /** A message on a request, and its new state, from either side. */
  update(
    member: string,
    id: string,
    change: { state?: TaskState; text?: string },
  ): Task {
    const row = this.taskRow(id);
    const asked = row.to_member === member;
    if (!asked && row.from_member !== member)
      throw new RelayError(404, "No such request.");
    if (FINAL.includes(row.state as TaskState))
      throw new RelayError(409, "That request is closed.");
    const now = new Date().toISOString();
    if (change.text?.trim())
      this.addMessage(id, asked ? "agent" : "user", member, change.text, now);
    // The one asked moves the request along; the one asking can only answer a question or cancel.
    let state = row.state as TaskState;
    if (asked && change.state) state = change.state;
    if (!asked)
      state =
        change.state === "CANCELED"
          ? "CANCELED"
          : state === "INPUT_REQUIRED" && change.text
            ? "WORKING"
            : state;
    this.db
      .prepare("UPDATE tasks SET state = ?, updated = ? WHERE id = ?")
      .run(state, now, id);
    this.notify(asked ? row.from_member : row.to_member, "update", id);
    return this.task(id);
  }

  task(id: string): Task {
    const row = this.taskRow(id);
    const history = (
      this.db
        .prepare(
          "SELECT id, role, from_member, text, at FROM messages WHERE task_id = ? ORDER BY at, rowid",
        )
        .all(id) as {
        id: string;
        role: "user" | "agent";
        from_member: string;
        text: string;
        at: string;
      }[]
    ).map(
      (m): Message => ({
        messageId: m.id,
        role: m.role,
        parts: [{ text: m.text }],
        taskId: id,
        contextId: row.context_id,
        metadata: { from: m.from_member, at: m.at },
      }),
    );
    const last = history.at(-1);
    return {
      id,
      contextId: row.context_id,
      status: {
        state: row.state as TaskState,
        ...(last ? { message: last } : {}),
        timestamp: row.updated,
      },
      history,
      metadata: {
        from: row.from_member,
        to: row.to_member,
        created: row.created,
      },
    };
  }

  /** The member's requests, sent and received, latest first. */
  tasks(member: string, limit = 50): Task[] {
    return (
      this.db
        .prepare(
          "SELECT id FROM tasks WHERE from_member = ? OR to_member = ? ORDER BY updated DESC LIMIT ?",
        )
        .all(member, member, limit) as { id: string }[]
    ).map((row) => this.task(row.id));
  }

  /** What concerns the member after `after`, waiting up to `waitMs` for something to come. */
  async inbox(
    member: string,
    after: number,
    waitMs: number,
  ): Promise<InboxEvent[]> {
    this.db
      .prepare("UPDATE members SET seen = ? WHERE id = ?")
      .run(new Date().toISOString(), member);
    let events = this.events(member, after);
    if (events.length || waitMs <= 0) return events;
    await new Promise<void>((resolve) => {
      const waiters = this.waiters.get(member) ?? new Set();
      const done = () => {
        clearTimeout(timer);
        waiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      waiters.add(done);
      this.waiters.set(member, waiters);
    });
    events = this.events(member, after);
    return events;
  }

  private events(member: string, after: number): InboxEvent[] {
    return (
      this.db
        .prepare(
          "SELECT seq, type, task_id FROM events WHERE member = ? AND seq > ? ORDER BY seq LIMIT 50",
        )
        .all(member, after) as {
        seq: number;
        type: "task" | "update";
        task_id: string;
      }[]
    ).map((row) => ({
      seq: row.seq,
      type: row.type,
      task: this.task(row.task_id),
    }));
  }

  private taskRow(id: string) {
    const row = this.db
      .prepare(
        "SELECT context_id, from_member, to_member, state, created, updated FROM tasks WHERE id = ?",
      )
      .get(id) as
      | {
          context_id: string;
          from_member: string;
          to_member: string;
          state: string;
          created: string;
          updated: string;
        }
      | undefined;
    if (!row) throw new RelayError(404, "No such request.");
    return row;
  }

  private addMessage(
    task: string,
    role: "user" | "agent",
    from: string,
    text: string,
    at: string,
  ): void {
    this.db
      .prepare(
        "INSERT INTO messages (id, task_id, role, from_member, text, at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(randomUUID(), task, role, from, text.slice(0, 20_000), at);
  }

  private notify(member: string, type: "task" | "update", task: string): void {
    this.db
      .prepare(
        "INSERT INTO events (member, type, task_id, at) VALUES (?, ?, ?, ?)",
      )
      .run(member, type, task, new Date().toISOString());
    for (const wake of this.waiters.get(member) ?? []) wake();
  }
}

function cleanCard(card: Card): Card {
  const name = String(card?.name ?? "")
    .trim()
    .slice(0, 80);
  if (!name) throw new RelayError(400, "A card needs a name.");
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
  };
}
