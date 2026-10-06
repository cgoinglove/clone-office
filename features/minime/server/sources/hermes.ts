// Hermes Agent keeps every session in one SQLite file, ~/.hermes/state.db (HERMES_HOME moves it):
// a `sessions` table that may name the folder each ran in, and a `messages` table with role "user"
// or "assistant". Sessions started by its scheduler or by another agent are not the person typing.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hermesHome } from "../paths";
import { type Conversation, isoTime, makeTurn, type Turn } from "./common";

const TOOL = "Hermes Agent";

export interface Message {
  role: string;
  content: string;
  at: string;
}

export function messageTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let lastAssistant = "";
  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.content.trim()) lastAssistant = message.content;
      continue;
    }
    if (message.role !== "user") continue;
    const turn = makeTurn(message.at, message.content, lastAssistant);
    if (turn) turns.push(turn);
    lastAssistant = "";
  }
  return turns;
}

function openReadOnly(path: string): DatabaseSync | undefined {
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined;
  }
}

function readSession(path: string, id: string): Turn[] {
  const db = openReadOnly(path);
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        "SELECT role, content, timestamp FROM messages WHERE session_id = ? ORDER BY id",
      )
      .all(id) as { role: string; content: string | null; timestamp: number }[];
    return messageTurns(
      rows.map((row) => ({
        role: row.role,
        content: row.content ?? "",
        at: isoTime(row.timestamp),
      })),
    );
  } finally {
    db.close();
  }
}

export async function hermesConversations(): Promise<Conversation[]> {
  const path = join(hermesHome(), "state.db");
  if (!existsSync(path)) return [];
  const db = openReadOnly(path);
  if (!db) throw new Error("Hermes Agent's database could not be opened.");
  let rows: { id: string; folder: string | null; last: number | null }[];
  try {
    const columns = new Set(
      (
        db.prepare("PRAGMA table_info(sessions)").all() as { name: string }[]
      ).map((column) => column.name),
    );
    // Older versions of the file have no folder columns.
    const folder = ["git_repo_root", "cwd"].filter((c) => columns.has(c));
    rows = db
      .prepare(
        `SELECT s.id AS id,
                ${folder.length ? `coalesce(${folder.map((c) => `s.${c}`).join(", ")})` : "NULL"} AS folder,
                MAX(m.timestamp) AS last
           FROM sessions s JOIN messages m ON m.session_id = s.id
          WHERE s.source NOT IN ('cron', 'subagent') AND m.role = 'user'
          GROUP BY s.id`,
      )
      .all() as typeof rows;
  } finally {
    db.close();
  }
  return rows.map((row) => ({
    tool: TOOL,
    cwd: row.folder || undefined,
    updatedMs: Date.parse(isoTime(row.last)) || 0,
    turns: async () => readSession(path, row.id),
  }));
}
