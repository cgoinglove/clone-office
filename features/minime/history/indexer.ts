// Building the conversation index a little at a time. Each pass looks at the person's AI session
// files, newest first, and reads only what was added since the last pass: every file's read
// position is stored, so a session that grows is continued, never re-read. A pass stops at its
// time budget or byte budget and the next pass carries on, so the index fills up within bounded
// work however many gigabytes the records hold (Hermes Agent indexes its sessions as they happen;
// here the records belong to other tools, so they are caught up in passes).
// Only what the person typed and what the AI answered in text is kept, each clipped; tool calls
// and their results, which are most of the bytes, are never stored. Folders the person excluded,
// temporary folders and the mini-me's own folder are left out, and anything already indexed
// from them is removed.

import { basename, dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { chatFiles, chatLineMessage } from "../chat/store.ts";
import { tryLock } from "../memory/files.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import {
  type LineMessage,
  lineMessage,
  projectDirs,
} from "../server/sources/claude-code.ts";
import {
  codexRolloutFiles,
  rolloutLineMessage,
} from "../server/sources/codex.ts";
import { isNoise, projectRoot } from "../server/sources/common.ts";
import { boundedLines } from "../server/sources/lines.ts";
import { indexTerms } from "./cjk.ts";
import { historyDbPath, openHistoryForWrite } from "./db.ts";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** Each message is kept up to this many characters; a read returns at most 2,000 (Hermes). */
export const MESSAGE_MAX = 4000;
const TITLE_MAX = 120;
/** Rows written per transaction, so an interrupted pass loses little and resumes cleanly. */
const BATCH = 400;
const PRUNE_PER_PASS = 500;

export interface IndexOptions {
  /** Index file; the default lives under the mini-me's home. */
  path?: string;
  /** Stop after this long; the next pass carries on. */
  budgetMs?: number;
  /** Stop after reading this many bytes of records. */
  maxBytes?: number;
  /** Only sessions changed within this many days; older ones are dropped from the index. */
  windowDays?: number;
  /** Only sessions changed within this many hours: a quick refresh before a search. */
  recentHours?: number;
  /** Exclude patterns; the person's settings by default. */
  excludes?: string[];
  now?: number;
  /** Bytes read so far in this pass, and how many were waiting when it started. */
  onProgress?: (done: number, total: number) => void;
}

export interface IndexReport {
  /** Another pass held the index; this one did nothing. */
  busy: boolean;
  /** Every file in range was read to its end. */
  complete: boolean;
  files: number;
  read: number;
  messages: number;
  bytes: number;
  removed: number;
  ms: number;
}

interface SourceFile {
  path: string;
  tool: string;
  session: string;
  project?: string;
  mtimeMs: number;
  size: number;
  parse: (line: string) => LineMessage | undefined;
}

/** Every session file the person's AI tools keep, with the project folder it ran in. */
export async function listSessionFiles(): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  for (const dir of await projectDirs().catch(() => [])) {
    const project = projectRoot(dir.cwd);
    for (const file of dir.files)
      out.push({
        path: file.path,
        tool: "Claude Code",
        session: basename(file.path, ".jsonl"),
        project,
        mtimeMs: file.mtimeMs,
        size: file.size,
        parse: lineMessage,
      });
  }
  // The person's own conversations with their mini-me, so it can find what they talked about.
  for (const file of await chatFiles().catch(() => []))
    out.push({
      path: file.path,
      tool: "mini-me",
      session: file.id,
      mtimeMs: file.mtimeMs,
      size: file.size,
      parse: chatLineMessage,
    });
  for (const file of await codexRolloutFiles().catch(() => []))
    out.push({
      path: file.path,
      tool: "Codex",
      session: file.session,
      project: file.cwd ? projectRoot(file.cwd) : undefined,
      mtimeMs: file.mtimeMs,
      size: file.size,
      parse: rolloutLineMessage,
    });
  return out;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function removeFile(db: DatabaseSync, id: number | bigint): void {
  db.prepare(
    "DELETE FROM messages_fts WHERE rowid IN (SELECT id FROM messages WHERE file_id = ?)",
  ).run(id);
  db.prepare("DELETE FROM messages WHERE file_id = ?").run(id);
  db.prepare("DELETE FROM files WHERE id = ?").run(id);
}

interface FileRow {
  id: number;
  size: number;
  mtime: number;
  offset: number;
  messages: number;
  started: number | null;
  last: number | null;
  title: string | null;
}

/**
 * Read the rest of the search window in bounded passes, one after another, until it is all read,
 * another writer holds the index, or \`maxMs\` runs out. For after a learning, which reads only the
 * conversations it needs; what is left is picked up again by the next call.
 */
export async function catchUpIndex(
  options: { maxMs?: number } = {},
): Promise<IndexReport | undefined> {
  const deadline = Date.now() + (options.maxMs ?? 10 * 60 * 1000);
  let report: IndexReport | undefined;
  while (Date.now() < deadline) {
    report = await indexHistory({
      budgetMs: Math.min(4000, deadline - Date.now()),
    });
    if (report.complete || report.busy) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return report;
}

/** One bounded pass. Never throws for a single bad file: it is skipped and reported as read. */
export async function indexHistory(
  options: IndexOptions = {},
): Promise<IndexReport> {
  const started = Date.now();
  const now = options.now ?? started;
  const deadline = started + (options.budgetMs ?? 8000);
  const maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
  const windowStart = now - (options.windowDays ?? 90) * DAY;
  const since = options.recentHours
    ? now - options.recentHours * HOUR
    : windowStart;
  const path = options.path ?? historyDbPath();
  const report: IndexReport = {
    busy: false,
    complete: true,
    files: 0,
    read: 0,
    messages: 0,
    bytes: 0,
    removed: 0,
    ms: 0,
  };
  const release = await tryLock(dirname(path), 5 * 60 * 1000);
  if (!release) return { ...report, busy: true, complete: false };
  try {
    const db = openHistoryForWrite(path);
    try {
      const excludes = options.excludes ?? loadExcludes();
      const getFile = db.prepare(
        "SELECT id, size, mtime, offset, messages, started, last, title FROM files WHERE path = ?",
      );
      const addFile = db.prepare(
        "INSERT INTO files (path, tool, session, project) VALUES (?, ?, ?, ?) RETURNING id",
      );
      const saveFile = db.prepare(
        "UPDATE files SET size = ?, mtime = ?, offset = ?, messages = ?, started = ?, last = ?, title = ?, project = ? WHERE id = ?",
      );
      const addMessage = db.prepare(
        "INSERT INTO messages (file_id, seq, role, at, text) VALUES (?, ?, ?, ?, ?) RETURNING id",
      );
      const addTerms = db.prepare(
        "INSERT INTO messages_fts (rowid, terms) VALUES (?, ?)",
      );

      const files = (await listSessionFiles())
        .filter((file) => file.mtimeMs >= since)
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
      report.files = files.length;
      // What is waiting to be read, for a progress estimate; excluded files count as nothing.
      let waiting = 0;
      for (const file of files) {
        if (
          file.project &&
          (isExcluded(file.project, excludes) || isNoise(file.project))
        )
          continue;
        const known = getFile.get(file.path) as FileRow | undefined;
        if (!known || file.size < known.offset) waiting += file.size;
        else if (
          known.offset !== file.size ||
          known.mtime !== Math.floor(file.mtimeMs)
        )
          waiting += file.size - known.offset;
      }
      const progress = (extra: number) =>
        options.onProgress?.(report.bytes + extra, waiting);
      progress(0);
      for (const file of files) {
        const row = getFile.get(file.path) as FileRow | undefined;
        if (
          (file.project &&
            (isExcluded(file.project, excludes) || isNoise(file.project))) ||
          isExcluded(file.path, excludes)
        ) {
          if (row) {
            removeFile(db, row.id);
            report.removed += 1;
          }
          continue;
        }
        const mtime = Math.floor(file.mtimeMs);
        if (row && row.offset === file.size && row.mtime === mtime) continue;
        if (Date.now() > deadline || report.bytes >= maxBytes) {
          report.complete = false;
          break;
        }
        let state: FileRow;
        if (!row || file.size < row.offset) {
          if (row) removeFile(db, row.id);
          const created = addFile.get(
            file.path,
            file.tool,
            file.session,
            file.project ?? null,
          ) as { id: number };
          state = {
            id: created.id,
            size: 0,
            mtime: 0,
            offset: 0,
            messages: 0,
            started: null,
            last: null,
            title: null,
          };
        } else state = row;
        report.read += 1;
        const startOffset = state.offset;
        let offset = state.offset;
        let pending = 0;
        let lines = 0;
        let clockAt = state.offset;
        let stopped = false;
        const save = () => {
          saveFile.run(
            file.size,
            mtime,
            offset,
            state.messages,
            state.started,
            state.last,
            state.title,
            file.project ?? null,
            state.id,
          );
        };
        db.exec("BEGIN");
        try {
          for await (const { line, end, skipped } of boundedLines(file.path, {
            start: state.offset,
          })) {
            offset = end;
            const message = skipped ? undefined : file.parse(line);
            if (message) {
              const text = clip(message.text, MESSAGE_MAX);
              const at = Date.parse(message.at) || mtime;
              const inserted = addMessage.get(
                state.id,
                state.messages,
                message.role,
                at,
                text,
              ) as { id: number };
              addTerms.run(inserted.id, indexTerms(text));
              state.messages += 1;
              state.started =
                state.started === null ? at : Math.min(state.started, at);
              state.last = state.last === null ? at : Math.max(state.last, at);
              if (!state.title && message.role === "user")
                state.title = clip(text.replace(/\s+/g, " "), TITLE_MAX);
              report.messages += 1;
              pending += 1;
            }
            if (pending >= BATCH) {
              save();
              db.exec("COMMIT");
              db.exec("BEGIN");
              pending = 0;
            }
            // The byte budget is checked on every line; the clock every 256 lines or 8 MB, which
            // is cheap and still keeps a pass close to its time budget.
            lines += 1;
            const used = report.bytes + (offset - startOffset);
            if (used >= maxBytes) {
              stopped = true;
              break;
            }
            if (lines % 256 === 0 || offset - clockAt >= 8 * 1024 * 1024) {
              clockAt = offset;
              progress(offset - startOffset);
              if (Date.now() > deadline) {
                stopped = true;
                break;
              }
            }
          }
          save();
          db.exec("COMMIT");
        } catch {
          // An unreadable file: keep what was read, and do not stop the pass.
          try {
            save();
            db.exec("COMMIT");
          } catch {
            db.exec("ROLLBACK");
          }
        }
        report.bytes += offset - startOffset;
        progress(0);
        if (stopped) {
          report.complete = false;
          break;
        }
      }

      // Sessions that left the window are dropped, so the index stays bounded too.
      const old = db
        .prepare("SELECT id FROM files WHERE mtime < ? LIMIT ?")
        .all(windowStart, PRUNE_PER_PASS) as { id: number }[];
      if (old.length) {
        db.exec("BEGIN");
        for (const { id } of old) removeFile(db, id);
        db.exec("COMMIT");
        report.removed += old.length;
      }
    } finally {
      db.close();
    }
  } finally {
    await release();
  }
  report.ms = Date.now() - started;
  return report;
}
