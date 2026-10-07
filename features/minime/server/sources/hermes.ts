// Hermes Agent keeps every session in one SQLite file, ~/.hermes/state.db (HERMES_HOME moves it):
// a `sessions` table that may name the folder each ran in and its title, and a `messages` table
// with role "user" or "assistant". Structured content (text with images, say) is stored as JSON
// after a "\0json:" mark. Sessions started by its scheduler or by another agent are not the person
// typing, nor are those its board, its API server or a tool started. Messages the person rewound are
// left out, as Hermes' own search leaves them out, and so are the rows nobody typed: scaffolding
// shown only to the model (a `display_kind` other than a typed /steer), a merge of turns the model
// reads as one (`model_only`), and the summary a compaction hands to the next context (flagged, or,
// in older files, marked by its opening). Sessions hidden from its lists (its bot chat is one) are
// kept, as its search keeps them.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hermesHome } from "../paths.ts";
import { cleanPrompt, isoTime, type LineMessage } from "./common.ts";

const JSON_MARK = "\u0000json:";
/** Where sessions nobody typed in come from: its scheduler, sub-agents, its board, its API, tools. */
const NOT_TYPED = ["cron", "subagent", "kanban", "api_server", "tool"];
/** How Hermes opens the summary a compaction hands to the next context, now and before. */
const SUMMARY_OPENINGS = ["[CONTEXT COMPACTION", "[CONTEXT SUMMARY]:"];

export interface HermesSession {
  id: string;
  /** How many messages it has from either side; it grows as the session goes on. */
  count: number;
  updatedMs: number;
  title?: string;
  folder?: string;
}

export function hermesDbPath(): string {
  return join(hermesHome(), "state.db");
}

/** The text of what Hermes stored: plain text, or the text parts of structured content. */
export function contentText(content: unknown): string {
  if (typeof content !== "string") return "";
  if (!content.startsWith(JSON_MARK)) return content;
  let value: unknown;
  try {
    value = JSON.parse(content.slice(JSON_MARK.length));
  } catch {
    return "";
  }
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((part) =>
      part && typeof part === "object" && typeof part.text === "string"
        ? part.text
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

function openReadOnly(path: string): DatabaseSync | undefined {
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined;
  }
}

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  return new Set(
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
      (column) => column.name,
    ),
  );
}

/**
 * Rows still in the conversation and typed or answered there: rewound ones (inactive, not
 * compacted) are not, nor rows only the model reads. Older files have fewer of these columns.
 */
function kept(db: DatabaseSync, alias = ""): string {
  const columns = columnsOf(db, "messages");
  const terms: string[] = [];
  if (columns.has("active"))
    terms.push(
      columns.has("compacted")
        ? `(coalesce(${alias}active, 1) = 1 OR coalesce(${alias}compacted, 0) = 1)`
        : `coalesce(${alias}active, 1) = 1`,
    );
  if (columns.has("display_kind"))
    terms.push(`coalesce(${alias}display_kind, '') IN ('', 'steer')`);
  if (columns.has("_compressed_summary"))
    terms.push(`coalesce(${alias}_compressed_summary, 0) = 0`);
  if (columns.has("display_metadata"))
    terms.push(
      `NOT (coalesce(json_valid(${alias}display_metadata), 0) AND coalesce(json_extract(CASE WHEN json_valid(${alias}display_metadata) THEN ${alias}display_metadata END, '$.model_only'), 0))`,
    );
  return terms.length ? terms.join(" AND ") : "1";
}

/** The summary a compaction handed on, in a file too old to flag it. */
const isSummary = (text: string) =>
  SUMMARY_OPENINGS.some((opening) => text.trimStart().startsWith(opening));

/** Every session in which the person typed something, without reading its messages. */
export function hermesSessions(path = hermesDbPath()): HermesSession[] {
  if (!existsSync(path)) return [];
  const db = openReadOnly(path);
  if (!db) throw new Error("Hermes Agent's database could not be opened.");
  try {
    const columns = columnsOf(db, "sessions");
    // Older versions of the file have fewer columns.
    const folder = ["git_repo_root", "cwd"].filter((c) => columns.has(c));
    const rows = db
      .prepare(
        `SELECT s.id AS id,
                ${folder.length > 1 ? `coalesce(${folder.map((c) => `s.${c}`).join(", ")})` : folder.length ? `s.${folder[0]}` : "NULL"} AS folder,
                ${columns.has("title") ? "s.title" : "NULL"} AS title,
                COUNT(m.id) AS count,
                SUM(m.role = 'user') AS typed,
                MAX(m.timestamp) AS last
           FROM sessions s JOIN messages m ON m.session_id = s.id
          WHERE s.source NOT IN (${NOT_TYPED.map((source) => `'${source}'`).join(", ")})
            AND m.role IN ('user', 'assistant') AND ${kept(db, "m.")}
          GROUP BY s.id`,
      )
      .all() as {
      id: string;
      folder: string | null;
      title: string | null;
      count: number;
      typed: number;
      last: number | null;
    }[];
    return rows
      .filter((row) => row.typed > 0)
      .map((row) => ({
        id: row.id,
        count: Number(row.count) || 0,
        updatedMs: Date.parse(isoTime(row.last)) || 0,
        title: row.title?.trim() || undefined,
        folder: row.folder || undefined,
      }));
  } finally {
    db.close();
  }
}

/** Both sides of one session, oldest first. */
export function hermesMessages(path: string, id: string): LineMessage[] {
  const db = openReadOnly(path);
  if (!db) return [];
  try {
    const rows = db
      .prepare(
        `SELECT role, content, timestamp FROM messages
          WHERE session_id = ? AND role IN ('user', 'assistant') AND ${kept(db)}
          ORDER BY id`,
      )
      .all(id) as { role: string; content: unknown; timestamp: number }[];
    const out: LineMessage[] = [];
    for (const row of rows) {
      const raw = contentText(row.content);
      const at = isoTime(row.timestamp);
      if (isSummary(raw)) continue;
      if (row.role === "user") {
        const text = cleanPrompt(raw);
        if (text.length >= 2) out.push({ role: "user", at, text });
      } else if (raw.trim())
        out.push({ role: "assistant", at, text: raw.trim() });
    }
    return out;
  } finally {
    db.close();
  }
}
