// What every AI tool's records become before the mini-me reads them: conversations, each a list of
// turns in which the person typed something, usually right after the AI had spoken. Each tool keeps
// its records differently; the readers beside this file only translate them into this shape.

import { open } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, sep } from "node:path";
import { minimeHome } from "../paths.ts";
import { boundedLines } from "./lines.ts";

export interface Turn {
  at: string;
  /** What the person typed, without what the tool wrapped around it. */
  prompt: string;
  /** The end of what the AI said right before; empty when it had said nothing. */
  before: string;
}

export interface Conversation {
  /** The tool's name as people know it, such as "Claude Code". */
  tool: string;
  /** The folder it ran in, when the tool records one. */
  cwd?: string;
  /** When it last changed, in milliseconds; the newest are read first. */
  updatedMs: number;
  turns(): Promise<Turn[]>;
}

const PROMPT_MAX = 1200;
const BEFORE_MAX = 500;

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Removes what AI tools and editors wrapped around the person's own words. */
export function cleanPrompt(text: string): string {
  return text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/g, "")
    .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/g, "")
    .replace(
      /<pasted_content[^>]*>([\s\S]*?)<\/pasted_content>/g,
      (_, body: string) => `[pasted ${body.length} chars]`,
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One turn from raw text, or nothing when none of the person's own words are left. */
export function makeTurn(
  at: string,
  raw: string,
  before: string,
): Turn | undefined {
  const prompt = cleanPrompt(raw);
  if (prompt.length < 2) return undefined;
  return {
    at,
    prompt: clip(prompt, PROMPT_MAX),
    before: before.trim() ? before.trim().slice(-BEFORE_MAX) : "",
  };
}

/** An ISO time from seconds, milliseconds or a date string; empty when there is none. */
export function isoTime(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value) && value > 0)
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  return "";
}

export type Lines = AsyncIterable<string> | Iterable<string>;

/**
 * A file's lines, read as they are needed so a large session never sits in memory whole. Lines
 * longer than the reader's limit (a pasted image, say) are skipped.
 */
export async function* streamLines(file: string): AsyncIterable<string> {
  for await (const { line, skipped } of boundedLines(file))
    if (!skipped) yield line;
}

/** The complete lines in the first bytes of a file, for headers such as the folder a session ran in. */
export async function headLines(
  file: string,
  bytes = 64 * 1024,
): Promise<string[]> {
  const handle = await open(file, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    const lines = buffer.subarray(0, bytesRead).toString("utf8").split("\n");
    // The last piece may be cut off unless the file ended inside the buffer.
    return bytesRead === bytes ? lines.slice(0, -1) : lines;
  } finally {
    await handle.close();
  }
}

/** A worktree's sessions count toward the repository it came from. */
export function projectRoot(path: string): string {
  // Worktrees live under `<repo>/.claude/worktrees/<name>`, or beside the repo as
  // `<repo>.cc/worktrees/<name>` or `<repo>.claude-worktrees/<name>`.
  const at = path.indexOf(`${sep}worktrees${sep}`);
  if (at > 0) {
    const parent = path.slice(0, at);
    if (parent.endsWith(`${sep}.claude`))
      return parent.slice(0, -`${sep}.claude`.length);
    if (parent.endsWith(".cc")) return parent.slice(0, -".cc".length);
    return parent;
  }
  const beside = path.indexOf(`.claude-worktrees${sep}`);
  if (beside > 0) return path.slice(0, beside);
  return path;
}

/** How a folder is shown: its own name, or "~" for the home folder. */
export function folderName(path: string): string {
  return path === homedir() ? "~" : basename(path) || path;
}

/**
 * Folders that are not the person's own work: temporary places, where apps keep their data, and
 * the mini-me's own folder.
 */
export function isNoise(path: string): boolean {
  const home = homedir();
  const places = [
    minimeHome(),
    tmpdir(),
    "/tmp",
    "/private/",
    "/var/folders/",
    `${home}${sep}Library${sep}`,
    `${home}${sep}.cache${sep}`,
    process.env.APPDATA,
    process.env.LOCALAPPDATA,
  ].filter((place): place is string => Boolean(place));
  return (
    path.includes(`${sep}.sub-office`) ||
    places.some((place) => path === place || path.startsWith(place))
  );
}
