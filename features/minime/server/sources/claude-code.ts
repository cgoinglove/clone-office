// Claude Code keeps one folder per working directory under ~/.claude/projects, with one JSONL file
// per session. Every session in a folder ran in the same directory, so one header tells the folder.

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { claudeProjectsDir } from "../paths.ts";
import {
  type Conversation,
  cleanPrompt,
  headLines,
  type Lines,
  makeTurn,
  streamLines,
  type Turn,
} from "./common.ts";
import { mapLimit } from "./lines.ts";

const TOOL = "Claude Code";

interface Row {
  type?: string;
  isSidechain?: boolean;
  isMeta?: boolean;
  isCompactSummary?: boolean;
  toolUseResult?: unknown;
  origin?: { kind?: string };
  turnOrigin?: string;
  timestamp?: string;
  message?: { content?: unknown };
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (c): c is { type: string; text: string } =>
        c?.type === "text" && typeof c.text === "string",
    )
    .map((c) => c.text)
    .join("\n");
}

/** True for a prompt the person typed, as opposed to tool results, notices and summaries. */
export function isHumanPrompt(row: Row): boolean {
  if (
    row.type !== "user" ||
    row.toolUseResult ||
    row.isSidechain ||
    row.isMeta ||
    row.isCompactSummary
  )
    return false;
  if (row.origin?.kind && row.origin.kind !== "human") return false;
  if (row.turnOrigin && row.turnOrigin !== "human") return false;
  const content = row.message?.content;
  if (Array.isArray(content) && content.some((c) => c?.type === "tool_result"))
    return false;
  return true;
}

const COMMAND_LOG =
  /^<(command-name|command-message|local-command-stdout|local-command-caveat|command-args)>/;

/** One side of a conversation, as the conversation index keeps it. */
export interface LineMessage {
  role: "user" | "assistant";
  at: string;
  text: string;
}

/**
 * What one record line says, when it is the person's own prompt or the AI's reply in text.
 * Most lines are tool calls and tool results, often megabytes long, so they are recognised by
 * plain text first and never parsed.
 */
export function lineMessage(line: string): LineMessage | undefined {
  const isUser = line.includes('"type":"user"');
  const isAssistant = !isUser && line.includes('"type":"assistant"');
  if (!isUser && !isAssistant) return undefined;
  if (isUser && line.includes('"toolUseResult"')) return undefined;
  if (isAssistant && !line.includes('"type":"text"')) return undefined;
  let row: Row & { isSidechain?: boolean };
  try {
    row = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (row.type === "assistant") {
    if (row.isSidechain) return undefined;
    const said = textOf(row.message?.content).trim();
    return said
      ? { role: "assistant", at: row.timestamp ?? "", text: said }
      : undefined;
  }
  if (!isHumanPrompt(row)) return undefined;
  const raw = textOf(row.message?.content);
  if (COMMAND_LOG.test(raw.trim())) return undefined;
  const text = cleanPrompt(raw);
  return text.length >= 2
    ? { role: "user", at: row.timestamp ?? "", text }
    : undefined;
}

/** The person's turns in one session's lines. */
export async function sessionTurns(lines: Lines): Promise<Turn[]> {
  const turns: Turn[] = [];
  let lastAssistant = "";
  for await (const line of lines) {
    // Skip the many records that are neither side of the conversation without parsing them.
    if (!line.includes('"type":"user"') && !line.includes('"type":"assistant"'))
      continue;
    let row: Row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (row.type === "assistant" && !row.isSidechain) {
      const said = textOf(row.message?.content).trim();
      if (said) lastAssistant = said;
      continue;
    }
    if (!isHumanPrompt(row)) continue;
    const raw = textOf(row.message?.content);
    if (COMMAND_LOG.test(raw.trim())) continue;
    const turn = makeTurn(row.timestamp ?? "", raw, lastAssistant);
    if (!turn) continue;
    turns.push(turn);
    lastAssistant = "";
  }
  return turns;
}

/** The working directory a session ran in, read from the first records of its file. */
async function sessionCwd(file: string): Promise<string | undefined> {
  for (const line of await headLines(file)) {
    if (!line.includes('"cwd"')) continue;
    try {
      const cwd = JSON.parse(line).cwd;
      if (typeof cwd === "string") return cwd;
    } catch {
      // Not a whole record; keep looking.
    }
  }
  return undefined;
}

export interface ProjectDir {
  /** The folder under ~/.claude/projects. */
  dir: string;
  cwd: string;
  files: { path: string; mtimeMs: number; size: number }[];
}

/** Each Claude Code project folder, with the directory its sessions ran in. */
export async function projectDirs(): Promise<ProjectDir[]> {
  const root = claudeProjectsDir();
  let dirs: string[];
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }
  const out: ProjectDir[] = [];
  for (const dir of dirs) {
    const full = join(root, dir);
    let names: string[];
    try {
      names = (await readdir(full)).filter((name) => name.endsWith(".jsonl"));
    } catch {
      continue;
    }
    const files = await mapLimit(names, 32, async (name) => {
      const path = join(full, name);
      const info = await stat(path);
      return { path, mtimeMs: info.mtimeMs, size: info.size };
    });
    files.sort((a, b) => b.mtimeMs - a.mtimeMs);
    // The newest session usually names the folder; an older one does when it was cut short.
    let cwd: string | undefined;
    for (const file of files.slice(0, 3)) {
      cwd = await sessionCwd(file.path);
      if (cwd) break;
    }
    if (cwd) out.push({ dir: full, cwd, files });
  }
  return out;
}

export async function claudeCodeConversations(): Promise<Conversation[]> {
  return (await projectDirs()).flatMap(({ cwd, files }) =>
    files.map((file) => ({
      tool: TOOL,
      cwd,
      updatedMs: file.mtimeMs,
      turns: () => sessionTurns(streamLines(file.path)),
    })),
  );
}
