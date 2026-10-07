// The mini-me's conversations with its person, kept by sub-office itself: one JSON-lines file per
// conversation under chats/. The brain's own session is only a working copy: when a long
// conversation is carried into a fresh session, or the person changes brains, the record here stays
// whole. Lines are only ever appended, so a crash loses at most the line being written.

import { appendFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimeHome } from "../server/paths.ts";

/**
 * "office": an answer from a colleague's mini-me to a request sent from this conversation.
 * "told": what the mini-me answered a colleague for the person, told to them ("do it and tell me").
 * "flow": one of the person's flows ran (its name); the mini-me's answer follows.
 * "meeting": what a clone said in a meeting of the office's clones, its person's name first.
 */
export type ChatRole =
  | "me"
  | "minime"
  | "saved"
  | "error"
  | "office"
  | "told"
  | "flow"
  | "meeting";

export interface ChatMessage {
  role: ChatRole;
  text: string;
  at: string;
  /** Files on this computer that came with it (a colleague's answer, a photo from the phone). */
  files?: string[];
}

export interface ChatInfo {
  id: string;
  title: string;
  created: string;
  updated: string;
  /** How many times the person spoke. */
  turns: number;
  /** The brain session that carries the conversation now; none right after it was carried over. */
  session?: string;
  /** How much of the model's context that session used at its last answer. */
  context?: number;
  /** The mini-me's own summary of what came before, when the conversation was carried over. */
  summary?: string;
  /** How many of the conversation's lines that summary covers; what follows it is said since. */
  carriedFrom?: number;
  /** The last brain session that was looked back on (the review after an answer). */
  reviewed?: string;
}

type Line =
  | { type: "chat"; id: string; title: string; at: string }
  | {
      type: "message";
      role: ChatRole;
      text: string;
      at: string;
      files?: string[];
    }
  | { type: "session"; session: string; context?: number; at: string }
  | { type: "carried"; summary: string; at: string }
  | { type: "reviewed"; session: string; at: string };

const ID = /^[a-z0-9][a-z0-9-]{5,63}$/;

export function chatsDir(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "chats");
}

function chatPath(id: string): string {
  if (!ID.test(id)) throw new Error("Not a conversation id.");
  return join(/*turbopackIgnore: true*/ chatsDir(), `${id}.jsonl`);
}

/** Ids sort by when the conversation began. */
export function newChatId(now = new Date()): string {
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return `${now.getTime().toString(36)}-${random}`;
}

async function append(id: string, line: Line): Promise<void> {
  await mkdir(chatsDir(), { recursive: true });
  await appendFile(chatPath(id), `${JSON.stringify(line)}\n`, "utf8");
}

export async function createChat(
  title: string,
  now = new Date(),
): Promise<ChatInfo> {
  const id = newChatId(now);
  const at = now.toISOString();
  const clean = title.replace(/\s+/g, " ").trim();
  const short = clean.length > 60 ? `${clean.slice(0, 60)}…` : clean;
  await append(id, { type: "chat", id, title: short, at });
  return { id, title: short, created: at, updated: at, turns: 0 };
}

/** A line just added to a conversation, heard in this process (the messenger sends some on). */
export interface ChatNews {
  chat: string;
  role: ChatRole;
  text: string;
  at: string;
  files?: string[];
}

const hearing = globalThis as typeof globalThis & {
  __minimeChatNews?: Set<(news: ChatNews) => void>;
};

/** Hear each line added to any conversation; returns a function that stops hearing. */
export function onChatMessage(listener: (news: ChatNews) => void): () => void {
  hearing.__minimeChatNews ??= new Set();
  hearing.__minimeChatNews.add(listener);
  return () => {
    hearing.__minimeChatNews?.delete(listener);
  };
}

export async function appendMessage(
  id: string,
  role: ChatRole,
  text: string,
  files: string[] = [],
): Promise<void> {
  const at = new Date().toISOString();
  const more = files.length ? { files } : {};
  await append(id, { type: "message", role, text, at, ...more });
  for (const listener of hearing.__minimeChatNews ?? [])
    try {
      listener({ chat: id, role, text, at, ...more });
    } catch {
      // One listener failing never stops the line from being kept.
    }
}

export async function setSession(
  id: string,
  session: string,
  context?: number,
): Promise<void> {
  await append(id, {
    type: "session",
    session,
    ...(context ? { context } : {}),
    at: new Date().toISOString(),
  });
}

/** The session was looked back on, so carrying the conversation over need not do it again. */
export async function markReviewed(id: string, session: string): Promise<void> {
  await append(id, { type: "reviewed", session, at: new Date().toISOString() });
}

/** The conversation goes on in a fresh session that starts from this summary. */
export async function carryOver(id: string, summary: string): Promise<void> {
  await append(id, { type: "carried", summary, at: new Date().toISOString() });
}

function parse(raw: string): {
  info?: ChatInfo;
  messages: ChatMessage[];
} {
  let info: ChatInfo | undefined;
  const messages: ChatMessage[] = [];
  for (const text of raw.split("\n")) {
    if (!text.trim()) continue;
    let line: Line;
    try {
      line = JSON.parse(text);
    } catch {
      continue;
    }
    if (line.type === "chat")
      info = {
        id: line.id,
        title: line.title,
        created: line.at,
        updated: line.at,
        turns: 0,
      };
    if (!info) continue;
    info.updated = line.at ?? info.updated;
    if (line.type === "message") {
      messages.push({
        role: line.role,
        text: line.text,
        at: line.at,
        ...(line.files?.length ? { files: line.files } : {}),
      });
      if (line.role === "me") info.turns += 1;
    }
    if (line.type === "session") {
      info.session = line.session;
      info.context = line.context;
    }
    if (line.type === "reviewed") info.reviewed = line.session;
    if (line.type === "carried") {
      info.session = undefined;
      info.context = undefined;
      info.summary = line.summary;
      info.carriedFrom = messages.length;
    }
  }
  return { info, messages };
}

export async function readChat(
  id: string,
): Promise<{ info: ChatInfo; messages: ChatMessage[] } | undefined> {
  let raw: string;
  try {
    raw = await readFile(chatPath(id), "utf8");
  } catch {
    return undefined;
  }
  const { info, messages } = parse(raw);
  return info ? { info, messages } : undefined;
}

/** The latest conversations first. */
export async function listChats(limit = 30): Promise<ChatInfo[]> {
  const names = await readdir(chatsDir()).catch(() => [] as string[]);
  const chats: ChatInfo[] = [];
  for (const name of names) {
    if (!name.endsWith(".jsonl")) continue;
    const id = name.slice(0, -".jsonl".length);
    if (!ID.test(id)) continue;
    const chat = await readChat(id);
    if (chat) chats.push(chat.info);
  }
  return (
    chats
      // Ids sort by when a conversation began, which settles conversations touched in the same instant.
      .sort(
        (a, b) =>
          b.updated.localeCompare(a.updated) || b.id.localeCompare(a.id),
      )
      .slice(0, limit)
  );
}

/** Every conversation file, for the search index over the person's conversations. */
export async function chatFiles(): Promise<
  { path: string; id: string; mtimeMs: number; size: number }[]
> {
  const names = await readdir(chatsDir()).catch(() => [] as string[]);
  const out: { path: string; id: string; mtimeMs: number; size: number }[] = [];
  for (const name of names) {
    const id = name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : "";
    if (!ID.test(id)) continue;
    const path = join(/*turbopackIgnore: true*/ chatsDir(), name);
    const info = await stat(path).catch(() => undefined);
    if (info) out.push({ path, id, mtimeMs: info.mtimeMs, size: info.size });
  }
  return out;
}

/** One side of a conversation with the mini-me from one line of its file, for the index. */
export function chatLineMessage(
  text: string,
): { role: "user" | "assistant"; at: string; text: string } | undefined {
  if (!text.includes('"message"')) return undefined;
  let line: Line;
  try {
    line = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (line.type !== "message" || !line.text) return undefined;
  if (line.role === "me") return { role: "user", at: line.at, text: line.text };
  if (line.role === "minime")
    return { role: "assistant", at: line.at, text: line.text };
  return undefined;
}
