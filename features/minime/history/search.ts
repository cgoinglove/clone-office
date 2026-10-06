// Searching the conversation index the way Hermes Agent's session_search does: with words, the
// best-matching sessions, each with the message that matched and a scroll pointer; without words,
// the most recent sessions; and reading inside one session around a message. Results are the
// actual messages, never summaries, and each is clipped (Hermes caps a read at 2,000 characters
// per message, because one huge message once tripled a request).

import type { DatabaseSync } from "node:sqlite";
import { folderName } from "../server/sources/common.ts";
import { matchQuery, queryWords } from "./cjk.ts";

const READ_MAX = 2000;
const SNIPPET = 160;
/** Matching messages scanned before keeping the best per session. */
const SCAN_LIMIT = 300;

export interface SessionInfo {
  session: string;
  tool: string;
  folder: string;
  title: string;
  started: string;
  last: string;
  messages: number;
}

export interface SearchHit extends SessionInfo {
  match_message_id: number;
  role: string;
  at: string;
  snippet: string;
}

export interface Bounds {
  /** Inclusive lower bound: an ISO date, "today", or a relative span such as 24h, 7d, 2w. */
  after?: string;
  /** Exclusive upper bound, in the same forms. */
  before?: string;
}

const iso = (ms: number | null) => (ms ? new Date(ms).toISOString() : "");

/** A bound as milliseconds; undefined when absent or not understood. */
export function parseBound(
  value: string | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const text = value.trim().toLowerCase();
  if (text === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.getTime();
  }
  const relative = /^(\d+)\s*(h|d|w)$/.exec(text);
  if (relative) {
    const unit = { h: 3_600_000, d: 86_400_000, w: 604_800_000 }[
      relative[2] as "h" | "d" | "w"
    ];
    return now - Number(relative[1]) * unit;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

interface FileRow {
  id: number;
  session: string;
  tool: string;
  project: string | null;
  title: string | null;
  started: number | null;
  last: number | null;
  messages: number;
}

function info(file: FileRow): SessionInfo {
  return {
    session: file.session,
    tool: file.tool,
    folder: file.project ? folderName(file.project) : "",
    title: file.title ?? "",
    started: iso(file.started),
    last: iso(file.last),
    messages: file.messages,
  };
}

/** Text around the first place one of the words occurs. */
export function snippet(text: string, words: string[]): string {
  const lower = text.toLocaleLowerCase();
  let at = -1;
  for (const word of words) {
    const found = lower.indexOf(word);
    if (found !== -1 && (at === -1 || found < at)) at = found;
  }
  const flat = (part: string) => part.replace(/\s+/g, " ").trim();
  if (at === -1) return flat(text.slice(0, SNIPPET));
  const start = Math.max(0, at - SNIPPET / 2);
  const piece = flat(text.slice(start, start + SNIPPET));
  return `${start > 0 ? "…" : ""}${piece}${start + SNIPPET < text.length ? "…" : ""}`;
}

/** Sessions matching the words, best first, one hit each; or recent sessions when no words. */
export function searchSessions(
  db: DatabaseSync,
  {
    query = "",
    limit = 5,
    sort,
    ...bounds
  }: { query?: string; limit?: number; sort?: "newest" } & Bounds,
):
  | { mode: "search"; query: string; results: SearchHit[] }
  | { mode: "browse"; results: SessionInfo[] } {
  const count = Math.min(Math.max(Math.trunc(limit) || 5, 1), 10);
  const after = parseBound(bounds.after);
  const before = parseBound(bounds.before);
  const match = matchQuery(query);
  const timeSql = `${after !== undefined ? " AND m.at >= :after" : ""}${before !== undefined ? " AND m.at < :before" : ""}`;
  const params: Record<string, number> = {};
  if (after !== undefined) params.after = after;
  if (before !== undefined) params.before = before;
  if (!match) {
    const fileTime = `${after !== undefined ? " AND last >= :after" : ""}${before !== undefined ? " AND last < :before" : ""}`;
    const rows = db
      .prepare(
        `SELECT id, session, tool, project, title, started, last, messages FROM files WHERE messages > 0${fileTime} ORDER BY last DESC LIMIT :limit`,
      )
      .all({ ...params, limit: count }) as unknown as FileRow[];
    return { mode: "browse", results: rows.map(info) };
  }
  const hits = db
    .prepare(
      `SELECT m.id, m.file_id, m.role, m.at, m.text, bm25(messages_fts) AS score
       FROM messages_fts JOIN messages m ON m.id = messages_fts.rowid
       WHERE messages_fts MATCH :match${timeSql}
       ORDER BY ${sort === "newest" ? "m.at DESC" : "score"} LIMIT ${SCAN_LIMIT}`,
    )
    .all({ ...params, match }) as unknown as {
    id: number;
    file_id: number;
    role: string;
    at: number;
    text: string;
  }[];
  const words = queryWords(query);
  const getFile = db.prepare(
    "SELECT id, session, tool, project, title, started, last, messages FROM files WHERE id = ?",
  );
  const seen = new Set<number>();
  const results: SearchHit[] = [];
  for (const hit of hits) {
    if (seen.has(hit.file_id)) continue;
    seen.add(hit.file_id);
    const file = getFile.get(hit.file_id) as FileRow | undefined;
    if (!file) continue;
    results.push({
      ...info(file),
      match_message_id: hit.id,
      role: hit.role,
      at: iso(hit.at),
      snippet: snippet(hit.text, words),
    });
    if (results.length >= count) break;
  }
  return { mode: "search", query, results };
}

export interface ReadMessage {
  id: number;
  role: string;
  at: string;
  text: string;
}

/**
 * Messages of one session: a window around a message, or the start and the end with a pointer
 * for scrolling the middle.
 */
export function readSession(
  db: DatabaseSync,
  {
    session,
    around,
    window = 5,
  }: { session: string; around?: number; window?: number },
):
  | { session: SessionInfo; messages: ReadMessage[]; hint?: string }
  | { error: string } {
  const file = db
    .prepare(
      "SELECT id, session, tool, project, title, started, last, messages FROM files WHERE session = ? ORDER BY last DESC LIMIT 1",
    )
    .get(session) as FileRow | undefined;
  if (!file)
    return {
      error: `No conversation '${session}'. Find one with conversation_search.`,
    };
  const span = Math.min(Math.max(Math.trunc(window) || 5, 1), 20);
  const shape = (row: {
    id: number;
    role: string;
    at: number;
    text: string;
  }): ReadMessage => ({
    id: row.id,
    role: row.role,
    at: iso(row.at),
    text:
      row.text.length > READ_MAX
        ? `${row.text.slice(0, READ_MAX)}… (clipped; scroll around this id for more)`
        : row.text,
  });
  if (around !== undefined) {
    const anchor = db
      .prepare("SELECT seq FROM messages WHERE id = ? AND file_id = ?")
      .get(around, file.id) as { seq: number } | undefined;
    if (!anchor)
      return {
        error: `Message ${around} is not in conversation '${session}'.`,
      };
    const rows = db
      .prepare(
        "SELECT id, role, at, text FROM messages WHERE file_id = ? AND seq BETWEEN ? AND ? ORDER BY seq",
      )
      .all(file.id, anchor.seq - span, anchor.seq + span) as unknown as {
      id: number;
      role: string;
      at: number;
      text: string;
    }[];
    return { session: info(file), messages: rows.map(shape) };
  }
  const head = db
    .prepare(
      "SELECT id, role, at, text FROM messages WHERE file_id = ? ORDER BY seq LIMIT 3",
    )
    .all(file.id) as unknown as {
    id: number;
    role: string;
    at: number;
    text: string;
  }[];
  const tail = (
    db
      .prepare(
        "SELECT id, role, at, text FROM messages WHERE file_id = ? ORDER BY seq DESC LIMIT ?",
      )
      .all(file.id, span + 2) as unknown as {
      id: number;
      role: string;
      at: number;
      text: string;
    }[]
  ).reverse();
  const ids = new Set(head.map((row) => row.id));
  const messages = [...head, ...tail.filter((row) => !ids.has(row.id))].map(
    shape,
  );
  return {
    session: info(file),
    messages,
    ...(file.messages > messages.length
      ? {
          hint: `Showing the start and the end of ${file.messages} messages. Pass around_message_id (any id above) to read the middle.`,
        }
      : {}),
  };
}
