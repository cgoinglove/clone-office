// Codex keeps one JSONL "rollout" per session under ~/.codex/sessions/YYYY/MM/DD, and finished ones
// under archived_sessions (CODEX_HOME moves both). The first line describes the session, including
// the folder it ran in. What the person typed is an `event_msg` of type `user_message`.
//
// Codex can import Claude Code sessions as its own. Those copies are listed in its import records
// and skipped here, because the originals are read from Claude Code.

import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { codexHome } from "../paths.ts";
import {
  cleanPrompt,
  headLines,
  type Lines,
  makeTurn,
  type Turn,
} from "./common.ts";

interface Line {
  type?: string;
  timestamp?: string;
  payload?: {
    type?: string;
    role?: string;
    message?: unknown;
    content?: { type?: string; text?: unknown }[];
    item?: { type?: string; content?: { type?: string; text?: unknown }[] };
  };
}

function texts(payload: Line["payload"]): string {
  const parts = payload?.content;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

/**
 * The Codex editor extension puts the editor's state (active file, open tabs) before the request,
 * under headings; the person's own words follow "## My request for Codex:".
 */
export function codexRequest(text: string): string {
  const marker = /^## My request for Codex:[ \t]*$/m.exec(text);
  if (marker) return text.slice(marker.index + marker[0].length).trim();
  return text.trimStart().startsWith("# Context from my IDE setup:")
    ? ""
    : text;
}

/** What a tool put in front of the model rather than what the person typed. */
function looksInjected(text: string): boolean {
  const start = text.trimStart();
  return start.startsWith("<") || start.startsWith("# AGENTS.md");
}

/**
 * The person's turns in one rollout. Newer Codex records each typed message as a `user_message`
 * event; older sessions only have the raw `user` messages, which also carry injected context.
 */
export async function rolloutTurns(lines: Lines): Promise<Turn[]> {
  const typed: Turn[] = [];
  const raw: Turn[] = [];
  let lastAssistant = "";
  let lastAssistantRaw = "";
  for await (const text of lines) {
    if (!text.includes('"event_msg"') && !text.includes('"response_item"'))
      continue;
    let line: Line;
    try {
      line = JSON.parse(text);
    } catch {
      continue;
    }
    const payload = line.payload;
    const at = line.timestamp ?? "";
    if (line.type === "event_msg") {
      if (
        payload?.type === "agent_message" &&
        typeof payload.message === "string"
      )
        lastAssistant = payload.message;
      if (
        payload?.type === "user_message" &&
        typeof payload.message === "string"
      ) {
        const turn = makeTurn(at, codexRequest(payload.message), lastAssistant);
        if (turn) typed.push(turn);
        lastAssistant = "";
      }
      continue;
    }
    if (line.type === "response_item" && payload?.type === "message") {
      const said = texts(payload);
      if (payload.role === "assistant" && said.trim()) lastAssistantRaw = said;
      if (payload.role === "user" && said && !looksInjected(said)) {
        const turn = makeTurn(at, codexRequest(said), lastAssistantRaw);
        if (turn) raw.push(turn);
        lastAssistantRaw = "";
      }
    }
  }
  return typed.length ? typed : raw;
}

/** Ids of sessions Codex imported from other tools. */
async function importedIds(home: string): Promise<Set<string>> {
  const ids = new Set<string>();
  const files: [string, string][] = [
    ["external_agent_session_imports.json", "imported_thread_id"],
    ["claude-cowork-import-history.json", "importedThreadId"],
  ];
  for (const [file, field] of files) {
    try {
      const records = JSON.parse(
        await readFile(join(/*turbopackIgnore: true*/ home, file), "utf8"),
      )?.records;
      if (!Array.isArray(records)) continue;
      for (const record of records)
        if (typeof record?.[field] === "string") ids.add(record[field]);
    } catch {
      // No imports, or a format this reader does not know; nothing to skip.
    }
  }
  return ids;
}

async function rollouts(home: string): Promise<string[]> {
  const out: string[] = [];
  for (const dir of ["sessions", "archived_sessions"]) {
    try {
      // Paths in the person's home, never files of this app.
      const names = await readdir(join(/*turbopackIgnore: true*/ home, dir), {
        recursive: true,
      });
      for (const name of names)
        if (name.endsWith(".jsonl"))
          out.push(join(/*turbopackIgnore: true*/ home, dir, name));
    } catch {
      // Codex has not made this folder.
    }
  }
  return out;
}

interface SessionMeta {
  id?: string;
  cwd?: string;
  source?: unknown;
}

async function sessionMeta(file: string): Promise<SessionMeta | undefined> {
  const first = (await headLines(file))[0];
  try {
    const line = JSON.parse(first);
    return line?.type === "session_meta" ? line.payload : undefined;
  } catch {
    return undefined;
  }
}

/**
 * One side of a Codex conversation from one rollout line, for the conversation index. Earlier
 * Codex writes `user_message` and `agent_message` events; later versions write `item_completed`
 * events whose item is a `UserMessage` or an `AgentMessage`. Both carry only what the person typed
 * and what Codex answered, never the context Codex put in front of the model.
 */
export function rolloutLineMessage(
  text: string,
): { role: "user" | "assistant"; at: string; text: string } | undefined {
  if (!text.includes('"event_msg"')) return undefined;
  if (
    !text.includes('"user_message"') &&
    !text.includes('"agent_message"') &&
    !text.includes('"UserMessage"') &&
    !text.includes('"AgentMessage"')
  )
    return undefined;
  let line: Line;
  try {
    line = JSON.parse(text);
  } catch {
    return undefined;
  }
  const payload = line.payload;
  if (line.type !== "event_msg" || !payload) return undefined;
  const item = payload.type === "item_completed" ? payload.item : undefined;
  const kind = item ? item.type : payload.type;
  const said = item
    ? texts(item)
    : typeof payload.message === "string"
      ? payload.message
      : "";
  const at = line.timestamp ?? "";
  if (kind === "agent_message" || kind === "AgentMessage")
    return said.trim()
      ? { role: "assistant", at, text: said.trim() }
      : undefined;
  if (kind !== "user_message" && kind !== "UserMessage") return undefined;
  const request = cleanPrompt(codexRequest(said));
  return request.length >= 2 ? { role: "user", at, text: request } : undefined;
}

/** Codex sessions the person had, with the folder each ran in; imports and program runs left out. */
export async function codexRolloutFiles(): Promise<
  {
    path: string;
    session: string;
    cwd?: string;
    mtimeMs: number;
    size: number;
  }[]
> {
  const home = codexHome();
  const [files, imported] = await Promise.all([
    rollouts(home),
    importedIds(home),
  ]);
  const out: {
    path: string;
    session: string;
    cwd?: string;
    mtimeMs: number;
    size: number;
  }[] = [];
  for (const file of files) {
    const meta = await sessionMeta(file).catch(() => undefined);
    if (!meta) continue;
    if (meta.id && imported.has(meta.id)) continue;
    if (meta.source === "exec" || typeof meta.source === "object") continue;
    const info = await stat(file).catch(() => undefined);
    if (!info) continue;
    out.push({
      path: file,
      session: meta.id ?? file,
      cwd: typeof meta.cwd === "string" ? meta.cwd : undefined,
      mtimeMs: info.mtimeMs,
      size: info.size,
    });
  }
  return out;
}
