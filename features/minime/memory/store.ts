// A mini-me's memory: two small files the mini-me curates itself, in the person's Clone Office home.
//   USER.md    who the person is: role, what they own, how they work and talk, what they expect
//   MEMORY.md  the environment of their work: tools, places, standing conventions
// Both are written into every session's prompt, so each has a hard character limit. A write that
// would pass it is refused with the current entries, and the mini-me consolidates in the same
// turn. Entries are separated by "§" lines so one entry may span several lines. Anything longer
// about one person or one project goes to notes (notes.ts), which are opened only when needed.
//
// Ported from Hermes Agent (tools/memory_tool_store.py, MIT, Nous Research): same limits,
// matching, batch and failure rules, so the learning loop behaves as it does there.

import { join } from "node:path";
import { atomicWrite, readText, withLock } from "./files.ts";
import { scanForThreats, threatMessage } from "./threats.ts";

export type Target = "user" | "memory";

export const ENTRY_DELIMITER = "\n§\n";
export const DEFAULT_LIMITS: Record<Target, number> = {
  user: 1375,
  memory: 2200,
};
export const FILE_NAME: Record<Target, string> = {
  user: "USER.md",
  memory: "MEMORY.md",
};
const HEADER: Record<Target, string> = {
  user: "USER PROFILE (who the person is)",
  memory: "MEMORY (your notes on their work)",
};

/** Failed consolidation attempts in one run before memory gives up for that run. */
const MAX_FAILURES = 3;

export type WriteResult =
  | {
      success: true;
      done: true;
      target: Target;
      usage: string;
      entry_count: number;
      message?: string;
      note: string;
      replaced_entry?: string;
      removed_entry?: string;
      replaced_entries?: Record<number, string>;
      removed_entries?: Record<number, string>;
    }
  | {
      success: false;
      error: string;
      done?: true;
      current_entries?: string[];
      usage?: string;
      matches?: string[];
    };

export interface BatchOp {
  action?: string;
  content?: string;
  new_text?: string;
  old_text?: string;
}

/** What changed, for the screen's "remembered" line. */
export interface Change {
  target: Target;
  action: "add" | "replace" | "remove";
  entry: string;
  previous?: string;
}

function fail(error: string, extra: Partial<WriteResult> = {}): WriteResult {
  return { success: false, error, ...extra } as WriteResult;
}

export function parseEntries(raw: string): string[] {
  return [
    ...new Set(
      raw
        .replace(/^﻿/, "")
        .split(ENTRY_DELIMITER)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/**
 * Text as a model may retype it: curly quotes and backticks as one quote, dashes as one hyphen,
 * a written "\\n" and any run of spaces or line breaks as one space (Hermes Agent saw a third of
 * replace and remove calls miss on these alone).
 */
const fold = (text: string) =>
  text
    .replaceAll("\\n", " ")
    .replace(/["`\u2018-\u201F]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");

/** The entries `oldText` appears in: as written, else as retyped, if it holds a letter or digit. */
export function substringMatches(entries: string[], oldText: string): number[] {
  const exact = entries.flatMap((entry, i) =>
    entry.includes(oldText) ? [i] : [],
  );
  if (exact.length) return exact;
  const needle = fold(oldText);
  return /[\p{L}\p{N}]/u.test(needle)
    ? entries.flatMap((entry, i) => (fold(entry).includes(needle) ? [i] : []))
    : [];
}

/** The entry `oldText` selects: an exact whole entry first, else one distinct substring match. */
export function findUniqueMatch(
  entries: string[],
  oldText: string,
): { index?: number; ambiguous: boolean } {
  const exact = entries.flatMap((entry, i) => (entry === oldText ? [i] : []));
  const matches = exact.length ? exact : substringMatches(entries, oldText);
  if (new Set(matches.map((i) => entries[i])).size > 1)
    return { ambiguous: true };
  return { index: matches[0], ambiguous: false };
}

export class MemoryStore {
  private failures = 0;
  readonly changes: Change[] = [];

  readonly dir: string;
  readonly limits: Record<Target, number>;

  constructor(dir: string, limits: Record<Target, number> = DEFAULT_LIMITS) {
    this.dir = dir;
    this.limits = limits;
  }

  path(target: Target): string {
    return join(/*turbopackIgnore: true*/ this.dir, FILE_NAME[target]);
  }

  /** Call when a new run starts using this store. */
  resetRun(): void {
    this.failures = 0;
    this.changes.length = 0;
  }

  async entries(target: Target): Promise<string[]> {
    const read = await this.readRaw(target);
    return read.ok ? parseEntries(read.raw) : [];
  }

  usage(target: Target, entries: string[]): string {
    const used = entries.join(ENTRY_DELIMITER).length;
    const limit = this.limits[target];
    const percent =
      limit > 0 ? Math.min(100, Math.floor((used / limit) * 100)) : 0;
    return `${percent}% — ${used.toLocaleString("en-US")}/${limit.toLocaleString("en-US")} chars`;
  }

  /**
   * The block a session starts with: a header with how full the store is, then the entries. An
   * entry that fails the threat scan (written by hand, say) is kept on disk, where the person can
   * see and remove it, but replaced by a placeholder here.
   */
  async render(target: Target): Promise<string> {
    const entries = await this.entries(target);
    if (!entries.length) return "";
    const shown = entries.map((entry) => {
      const found = scanForThreats(entry);
      return found.length
        ? `[BLOCKED: ${FILE_NAME[target]} entry contained threat pattern(s): ${found.join(", ")}. Removed from the prompt; use memory(action=remove) to delete the original.]`
        : entry;
    });
    const rule = "═".repeat(46);
    return `${rule}\n${HEADER[target]} [${this.usage(target, entries)}]\n${rule}\n${shown.join(ENTRY_DELIMITER)}`;
  }

  async add(target: Target, content: string): Promise<WriteResult> {
    const text = content.trim();
    if (!text) return fail("Content cannot be empty.");
    const blocked = threatMessage(text);
    if (blocked) return fail(blocked);
    return this.mutate(target, (entries, limit) => {
      if (entries.includes(text))
        return this.success(
          target,
          entries,
          "Entry already exists (no duplicate added).",
        );
      const next = [...entries, text];
      if (next.join(ENTRY_DELIMITER).length > limit)
        return this.overflow(
          target,
          entries,
          `Memory at ${this.count(entries)}/${limit.toLocaleString("en-US")} chars. Adding this entry (${text.length} chars) would exceed the limit. Consolidate now: use 'replace' to merge overlapping entries into shorter ones or 'remove' stale or less important entries (see current_entries below), then retry this add — all in this turn.`,
        );
      return {
        entries: next,
        message: "Entry added.",
        changes: [{ target, action: "add", entry: text }],
      };
    });
  }

  async replace(
    target: Target,
    oldText: string,
    newContent: string,
  ): Promise<WriteResult> {
    const find = oldText.trim();
    const text = newContent.trim();
    if (!find) return fail("old_text cannot be empty.");
    if (!text)
      return fail(
        "new_content cannot be empty. Use 'remove' to delete entries.",
      );
    const blocked = threatMessage(text);
    if (blocked) return fail(blocked);
    return this.edit(target, find, text);
  }

  async remove(target: Target, oldText: string): Promise<WriteResult> {
    const find = oldText.trim();
    if (!find) return fail("old_text cannot be empty.");
    return this.edit(target, find, undefined);
  }

  /**
   * Several changes at once, all or nothing, with the limit checked only on the final result, so
   * one call can free room and add. Aborts do not repeat the entries the caller already has.
   */
  async batch(target: Target, operations: BatchOp[]): Promise<WriteResult> {
    if (!operations.length) return fail("operations list is empty.");
    for (const [i, op] of operations.entries()) {
      const content = op.content || op.new_text;
      if ((op.action === "add" || op.action === "replace") && content) {
        const blocked = threatMessage(content);
        if (blocked) return fail(`Operation ${i + 1}: ${blocked}`);
      }
    }
    return this.mutate(target, (entries, limit) => {
      const working = [...entries];
      const changes: Change[] = [];
      const replaced: Record<number, string> = {};
      const removed: Record<number, string> = {};
      for (const [i, op] of operations.entries()) {
        const action = op.action ?? "unknown";
        const content = (op.content || op.new_text || "").trim();
        const oldText = (op.old_text ?? "").trim();
        const at = `Operation ${i + 1} (${action})`;
        if (action === "add") {
          if (!content)
            return this.batchFailure(
              target,
              entries,
              `${at}: content is required.`,
            );
          if (!working.includes(content)) {
            working.push(content);
            changes.push({ target, action: "add", entry: content });
          }
          continue;
        }
        if (action !== "replace" && action !== "remove")
          return this.batchFailure(
            target,
            entries,
            `${at}: unknown action. Use add, replace, or remove.`,
          );
        if (!oldText)
          return this.batchFailure(
            target,
            entries,
            `${at}: old_text is required.`,
          );
        if (action === "replace" && !content)
          return this.batchFailure(
            target,
            entries,
            `${at}: content is required (use action='remove' to delete).`,
          );
        const { index, ambiguous } = findUniqueMatch(working, oldText);
        if (ambiguous)
          return this.batchFailure(
            target,
            entries,
            `${at}: '${oldText}' matched multiple distinct entries -- be more specific.`,
          );
        if (index === undefined)
          return this.batchFailure(
            target,
            entries,
            `${at}: no entry matched '${oldText}'.`,
          );
        const previous = working[index];
        if (action === "replace") {
          working.splice(index, 1, content);
          replaced[i + 1] = previous;
          changes.push({ target, action: "replace", entry: content, previous });
        } else {
          working.splice(index, 1);
          removed[i + 1] = previous;
          changes.push({ target, action: "remove", entry: previous });
        }
      }
      if (entries.length && !working.length)
        return this.batchFailure(
          target,
          entries,
          `Refusing to empty ${FILE_NAME[target]}: this batch would remove every entry from a previously non-empty store. Keep at least one entry — merge overlapping entries into a shorter one instead of removing the last one. To delete the final entry deliberately, use single remove() calls.`,
        );
      const total = working.join(ENTRY_DELIMITER).length;
      if (total > limit)
        return this.batchFailure(
          target,
          entries,
          `After applying all ${operations.length} operations, memory would be at ${total.toLocaleString("en-US")}/${limit.toLocaleString("en-US")} chars -- over the limit. Remove or shorten more entries in the same batch, then retry.`,
        );
      return {
        entries: working,
        message: `Applied ${operations.length} operation(s).`,
        changes,
        extra: {
          ...(Object.keys(replaced).length
            ? { replaced_entries: replaced }
            : {}),
          ...(Object.keys(removed).length ? { removed_entries: removed } : {}),
        },
      };
    });
  }

  // Internals ---------------------------------------------------------------------------------

  private count(entries: string[]): string {
    return entries.join(ENTRY_DELIMITER).length.toLocaleString("en-US");
  }

  private edit(
    target: Target,
    oldText: string,
    newContent: string | undefined,
  ): Promise<WriteResult> {
    return this.mutate(target, (entries, limit) => {
      const { index, ambiguous } = findUniqueMatch(entries, oldText);
      if (ambiguous)
        return fail(
          `Multiple entries matched '${oldText}'. Be more specific.`,
          {
            matches: substringMatches(entries, oldText)
              .map((i) => entries[i])
              .map((entry) =>
                entry.length > 80 ? `${entry.slice(0, 80)}...` : entry,
              ),
          },
        );
      if (index === undefined)
        return this.failure(
          fail(
            `No entry matched '${oldText}'. Check current_entries below and retry with the exact text of the entry you want to ${newContent === undefined ? "remove" : "replace"}.`,
            { current_entries: entries },
          ),
        );
      const previous = entries[index];
      if (newContent === undefined)
        return {
          entries: entries.filter((_, i) => i !== index),
          message: "Entry removed.",
          changes: [{ target, action: "remove", entry: previous }],
          extra: { removed_entry: previous },
        };
      const next = entries.map((entry, i) =>
        i === index ? newContent : entry,
      );
      const total = next.join(ENTRY_DELIMITER).length;
      if (total > limit)
        return this.overflow(
          target,
          entries,
          `Replacement would put memory at ${total.toLocaleString("en-US")}/${limit.toLocaleString("en-US")} chars. Shorten the new content, or 'remove' other stale or less important entries to make room (see current_entries below), then retry — all in this turn.`,
        );
      return {
        entries: next,
        message: "Entry replaced.",
        changes: [{ target, action: "replace", entry: newContent, previous }],
        extra: { replaced_entry: previous },
      };
    });
  }

  /** Past the per-run cap, a terminal result so the mini-me stops retrying and answers. */
  private failure(result: WriteResult): WriteResult {
    this.failures += 1;
    if (this.failures <= MAX_FAILURES) return result;
    return fail(
      `Memory consolidation failed ${this.failures} times this run. Stop retrying memory calls — leave memory unchanged for now and continue with your reply. The fact can be saved in a later run.`,
      { done: true },
    );
  }

  private overflow(
    target: Target,
    entries: string[],
    message: string,
  ): WriteResult {
    return this.failure(
      fail(message, {
        current_entries: entries,
        usage: this.usage(target, entries),
      }),
    );
  }

  private batchFailure(
    target: Target,
    entries: string[],
    message: string,
  ): WriteResult {
    return this.failure(
      fail(`${message} No operations were applied (batch is all-or-nothing).`, {
        usage: this.usage(target, entries),
      }),
    );
  }

  private success(
    target: Target,
    entries: string[],
    message?: string,
    extra: Record<string, unknown> = {},
  ): WriteResult {
    // A successful write means consolidation made progress; the failure count restarts.
    this.failures = 0;
    return {
      success: true,
      done: true,
      target,
      usage: this.usage(target, entries),
      entry_count: entries.length,
      ...(message ? { message } : {}),
      ...extra,
      note: "Write saved. This update is complete — do not repeat it.",
    };
  }

  /**
   * Lock, re-read the file, apply the change, write atomically. A file that exists but cannot
   * be read is never treated as empty: saving would wipe it.
   */
  private async mutate(
    target: Target,
    change: (
      entries: string[],
      limit: number,
    ) =>
      | WriteResult
      | {
          entries: string[];
          message: string;
          changes: Change[];
          extra?: Record<string, unknown>;
        },
  ): Promise<WriteResult> {
    return withLock(this.dir, async () => {
      const read = await this.readRaw(target);
      if (!read.ok)
        return fail(
          `Refusing to write ${FILE_NAME[target]}: the file exists but could not be read right now. Saving would wipe existing memory, so nothing was changed — retry in a moment.`,
        );
      const entries = parseEntries(read.raw);
      const result = change(entries, this.limits[target]);
      if ("success" in result) return result;
      await atomicWrite(
        this.path(target),
        result.entries.join(ENTRY_DELIMITER),
      );
      this.changes.push(...result.changes);
      return this.success(target, result.entries, result.message, result.extra);
    });
  }

  private readRaw(target: Target): Promise<{ ok: boolean; raw: string }> {
    return readText(this.path(target));
  }
}
