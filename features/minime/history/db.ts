// The conversation index: a SQLite file under the mini-me's home that lets the mini-me search what
// its person discussed with their AI tools. It is derived data: the tools' own records stay where
// they are and are only read, and deleting this file loses nothing, it is rebuilt from them.
// SQLite comes with Node (node:sqlite), as OpenClaw uses it for its memory search, so nothing
// native has to be installed. Full-text search is FTS5 with BM25 ranking, as in Hermes Agent's
// session search; the text is turned into CJK-aware terms first (cjk.ts).

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { minimeHome } from "../server/paths.ts";

/** Raise it when the tables or what a reader keeps change; the index is then rebuilt from the records. */
export const SCHEMA_VERSION = 2;

export function historyDbPath(): string {
  return join(minimeHome(), "index", "history.db");
}

/**
 * Whether this SQLite is free of the WAL-reset corruption bug: 3.51.3 and later, or the fixed
 * 3.50.7+ and 3.44.6+ lines (the same check OpenClaw makes before it uses WAL).
 */
export function walSafe(version: string): boolean {
  const [major, minor, patch] = version.split(".").map(Number);
  if (major !== 3) return major > 3;
  if (minor > 51) return true;
  if (minor === 51) return patch >= 3;
  if (minor === 50) return patch >= 7;
  if (minor === 44) return patch >= 6;
  return false;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  tool TEXT NOT NULL,
  session TEXT NOT NULL,
  project TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  mtime INTEGER NOT NULL DEFAULT 0,
  offset INTEGER NOT NULL DEFAULT 0,
  started INTEGER,
  last INTEGER,
  title TEXT,
  messages INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS files_last ON files(last);
CREATE INDEX IF NOT EXISTS files_session ON files(session);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  file_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL,
  at INTEGER,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_file_seq ON messages(file_id, seq);
CREATE INDEX IF NOT EXISTS messages_at ON messages(at);
`;

const FTS_CONTENTLESS =
  "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(terms, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 2')";
// SQLite before 3.43 cannot delete from a contentless table; store the terms instead.
const FTS_STORED =
  "CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(terms, tokenize='unicode61 remove_diacritics 2')";

/**
 * Open the index for writing, creating or upgrading it. A file from another schema version is
 * a cache, so it is emptied and rebuilt rather than migrated.
 */
export function openHistoryForWrite(path = historyDbPath()): DatabaseSync {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  const version = String(
    (db.prepare("SELECT sqlite_version() AS v").get() as { v: string }).v,
  );
  db.exec(`PRAGMA journal_mode = ${walSafe(version) ? "WAL" : "DELETE"}`);
  db.exec("PRAGMA busy_timeout = 3000");
  db.exec("PRAGMA synchronous = NORMAL");
  const current = Number(
    (db.prepare("PRAGMA user_version").get() as { user_version: number })
      .user_version,
  );
  if (current !== SCHEMA_VERSION) {
    db.exec(
      "DROP TABLE IF EXISTS messages_fts; DROP TABLE IF EXISTS messages; DROP TABLE IF EXISTS files;",
    );
    db.exec(SCHEMA);
    try {
      db.exec(FTS_CONTENTLESS);
    } catch {
      db.exec(FTS_STORED);
    }
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }
  return db;
}

/** Open the index to read; undefined when it does not exist yet or is from another version. */
export function openHistoryForRead(
  path = historyDbPath(),
): DatabaseSync | undefined {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined;
  }
  try {
    db.exec("PRAGMA busy_timeout = 3000");
    const current = Number(
      (db.prepare("PRAGMA user_version").get() as { user_version: number })
        .user_version,
    );
    if (current === SCHEMA_VERSION) return db;
  } catch {
    // Not an index this code can read.
  }
  db.close();
  return undefined;
}
