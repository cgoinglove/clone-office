// A session's own scratch folder, scratch/<session>/ under the clone's folder, for what it only
// needs while it works: a tool's whole answer that was too long to read at once, a command's long
// output, a file it writes to look at again. Named in the session's system prompt, writable by the
// clone's own write_file and its sandboxed shell (hands/shell.ts) and readable with Read, after the
// session folder Claude Code keeps beside a conversation for its tool results and Hermes Agent's
// spillover cache. Folders not used for SCRATCH_DAYS are removed on their own; nothing else (the
// workspace, where what is made for the person goes, or any of the clone's other files) is touched.
//
// A tool's answer over the session's limit goes there whole and the model gets a preview with the
// path and size instead of a cut, as Claude Code persists an oversized tool result
// ("<persisted-output>", a 2 KB preview and the file's path) and Hermes Agent spills one (a preview
// up to the last line break within 1,500 characters). The limit follows the model's window, as
// Hermes' budget does: one result at most 15% of it and all of one step's at most 30%, within fixed
// bounds, so a small model on the person's computer is never filled by one answer.

import { lstat, mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathRule } from "../gate/rules.ts";
import { minimeHome } from "../server/paths.ts";
import { partOf, unmark } from "./untrusted.ts";

/**
 * Days a scratch folder is kept after it was last used. A conversation taken up again within the
 * week still finds what it saved; past that, whole answers from the person's services and long
 * outputs do not pile up on their computer. Each use of a session touches its folder again.
 */
export const SCRATCH_DAYS = 7;

/** How often one process looks for old folders, at most. */
const CLEAN_EVERY_MS = 60 * 60 * 1000;

const KEY = /^[a-zA-Z0-9-]{8,64}$/;

export function scratchRoot(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "scratch");
}

/** The scratch folder for a session, by its id (a session copied for a look back keeps its own). */
export function scratchDir(key: string): string {
  if (!KEY.test(key)) throw new Error("Not a session id.");
  return join(/*turbopackIgnore: true*/ scratchRoot(), key);
}

/**
 * Makes the folder (for its person alone) and marks it used now, so it is kept another
 * SCRATCH_DAYS; old ones are looked for at most once an hour.
 */
export async function prepareScratch(key: string): Promise<string> {
  const dir = scratchDir(key);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const now = new Date();
  await utimes(dir, now, now).catch(() => {});
  cleanScratchSometimes();
  return dir;
}

let lastClean = 0;

function cleanScratchSometimes(): void {
  if (Date.now() - lastClean < CLEAN_EVERY_MS) return;
  lastClean = Date.now();
  cleanScratch().catch(() => {});
}

/**
 * Removes the scratch folders last used more than `days` ago. Only real folders named as sessions
 * are, directly under scratch/: a link or anything else there is left alone, never followed.
 */
export async function cleanScratch(
  now = Date.now(),
  days = SCRATCH_DAYS,
): Promise<string[]> {
  const root = scratchRoot();
  const removed: string[] = [];
  const names = await readdir(root).catch(() => [] as string[]);
  for (const name of names) {
    if (!KEY.test(name)) continue;
    const path = join(/*turbopackIgnore: true*/ root, name);
    const info = await lstat(path).catch(() => undefined);
    if (!info?.isDirectory() || info.isSymbolicLink()) continue;
    if (now - info.mtimeMs < days * 24 * 60 * 60 * 1000) continue;
    await rm(path, { recursive: true, force: true }).catch(() => {});
    removed.push(name);
  }
  return removed;
}

/** The session's system prompt names its folder, last, so the start every session shares stays the same. */
export function scratchGuidance(dir: string): string {
  return `## Scratch folder
Your scratch folder for this conversation is ${dir}. Put temporary files there (notes to yourself, intermediate results, a script you run once); it is removed some days after the conversation was last used. What you make for your person goes in your workspace instead. When a tool's answer is too long to show at once, it is saved there whole and you get its path: read it in parts with Read (offset and limit) or search it with Grep, rather than calling the tool again.`;
}

/**
 * A system prompt without its scratch folder's section: what every session shares, for a vendor's
 * cache key, which should not change with each session's folder.
 */
export function withoutScratch(system: string): string {
  const at = system.lastIndexOf("\n\n## Scratch folder\n");
  return at < 0 ? system : system.slice(0, at);
}

/** The rule that lets a session read its own scratch folder without asking (Claude Code's syntax). */
export const scratchRule = (dir: string) => `Read(${pathRule(dir)}/**)`;

// ---- Answers too long to read at once ----

/** Characters per token, as prune.ts estimates them: low, so a window is never overrated. */
const CHARS_PER_TOKEN = 3;
/** The most of the window one result, and all of one step's results, may take. */
const RESULT_SHARE = 0.15;
const STEP_SHARE = 0.3;
/** Bounds on those, in characters: never less than a usable answer, never more than a large window needs. */
const RESULT_MIN = 8_000;
const RESULT_MAX = 50_000;
const STEP_MIN = 16_000;
const STEP_MAX = 150_000;
/** The preview shown in place of a saved answer, in characters (Claude Code shows 2 KB). */
export const PREVIEW_CHARS = 2_000;
/** A line longer than this is broken in the saved file, so Read (which cuts lines at 2,000) loses nothing. */
const SAVED_LINE = 1_000;

/** How long one tool result and one step's results may be, for a model with this window (tokens). */
export function resultLimits(window: number): { result: number; step: number } {
  const chars = window * CHARS_PER_TOKEN;
  const clamp = (share: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.floor(chars * share)));
  return {
    result: clamp(RESULT_SHARE, RESULT_MIN, RESULT_MAX),
    step: clamp(STEP_SHARE, STEP_MIN, STEP_MAX),
  };
}

/**
 * The text as it is saved, so it can be read in parts: JSON (a service's answer is often one line
 * of it) laid out a field to a line, and any other line too long for Read broken where it is long.
 * Nothing is left out; only line breaks are added.
 */
export function pageable(text: string): string {
  // A web page's or a service's answer comes marked as outside text (untrusted.ts): what it holds
  // is laid out, and the mark kept around it.
  if (unmark(text)) return partOf(text, pageable);
  const json = (raw: string) => {
    const trimmed = raw.trim();
    if (!/^[[{]/.test(trimmed) || trimmed.length <= SAVED_LINE)
      return undefined;
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // Not JSON after all: broken by length below.
      return undefined;
    }
  };
  const whole = json(text);
  if (whole) return whole;
  // JSON after a heading line, as a web page comes: its status and address, then its body.
  const gap = text.indexOf("\n\n");
  const after = gap > 0 && gap < 500 ? json(text.slice(gap + 2)) : undefined;
  if (after) return `${text.slice(0, gap)}\n\n${after}`;
  return text
    .split("\n")
    .flatMap((line) => {
      if (line.length <= SAVED_LINE) return [line];
      const parts: string[] = [];
      for (let at = 0; at < line.length; at += SAVED_LINE)
        parts.push(line.slice(at, at + SAVED_LINE));
      return parts;
    })
    .join("\n");
}

/** The start of a text up to its last line break within `max` characters, as Hermes previews. */
export function preview(text: string, max = PREVIEW_CHARS): string {
  if (text.length <= max) return text;
  const lastBreak = text.lastIndexOf("\n", max);
  return text.slice(0, lastBreak > max / 2 ? lastBreak : max);
}

/**
 * Keeps one session's tool results within its window: each result over the limit, and each that
 * would take the step past its share, is saved whole in the scratch folder and answered with a
 * preview and the path. Without a folder (a session that cannot read files back) the result is cut
 * instead, keeping its start and end, as Codex cuts a long output in the middle, and the cut says so.
 */
export class Spill {
  readonly dir?: string;
  private readonly limits: { result: number; step: number };
  private used = 0;
  private count = 0;

  constructor(options: { dir?: string; window: number }) {
    this.dir = options.dir;
    this.limits = resultLimits(options.window);
  }

  /** The most one result may be, in characters (a Read reads in parts no longer than this). */
  get resultLimit(): number {
    return this.limits.result;
  }

  /** A new step starts: its results count afresh. */
  nextStep(): void {
    this.used = 0;
  }

  /** The text the model gets for one tool's result. */
  async take(tool: string, text: string): Promise<string> {
    const room = Math.max(0, this.limits.step - this.used);
    const limit = Math.min(this.limits.result, Math.max(PREVIEW_CHARS, room));
    if (text.length <= limit) {
      this.used += text.length;
      return text;
    }
    const saved = this.dir ? await this.save(tool, text) : undefined;
    const out = saved ?? cut(text, limit);
    this.used += out.length;
    return out;
  }

  private async save(tool: string, text: string): Promise<string | undefined> {
    const dir = this.dir;
    if (!dir) return undefined;
    const name = `${tool.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60)}-${Date.now().toString(36)}-${++this.count}.txt`;
    const path = join(/*turbopackIgnore: true*/ dir, name);
    const body = pageable(text);
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      // a new file, never one already there (nor a link someone left under its name)
      await writeFile(path, body, { mode: 0o600, flag: "wx" });
    } catch {
      return undefined;
    }
    const lines = body.split("\n").length;
    return `<persisted-output>
Output too large (${text.length.toLocaleString("en-US")} characters, ${lines.toLocaleString("en-US")} lines). Full output saved to: ${path}
Read it in parts with Read (offset and limit, by line) or search it with Grep; do not call the tool again for the same thing.

Preview (first ${PREVIEW_CHARS.toLocaleString("en-US")} characters):
${partOf(text, (body) => preview(body))}
</persisted-output>`;
  }
}

/** The start and end of a text within `max` characters, saying how much was left out between them. */
export function cut(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max * 0.7);
  const tail = Math.floor(max * 0.3);
  const note = `[… ${(text.length - head - tail).toLocaleString("en-US")} characters cut from the middle of ${text.length.toLocaleString("en-US")}. Ask for less, or for the part you need.]`;
  // Each part of an outside text is marked as one, and the note between them is the app's own.
  return `${partOf(text, (body) => body.slice(0, head))}\n\n${note}\n\n${partOf(text, (body) => body.slice(Math.max(0, body.length - tail)))}`;
}
