// Cursor keeps its chats in a SQLite file, User/globalStorage/state.vscdb. Each chat ("composer") is
// a `composerData:<id>` row that lists its messages ("bubbles") in order and says when it last
// changed; each bubble is its own `bubbleId:<composer>:<bubble>` row, type 1 for the person and 2
// for the AI. Which folder a chat ran in is kept per window: newer files have a `composerHeaders`
// table naming the window, whose folder is in workspaceStorage/<window>/workspace.json; for older
// chats, each window's own database lists its chats. The files are opened read-only, and SQLite
// pulls out only the few fields needed, so the large rows never reach this process.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { cursorUserDir } from "../paths.ts";
import { cleanPrompt, isoTime, type LineMessage } from "./common.ts";

export interface Bubble {
  id: string;
  type: number;
  text: string;
  at: string;
}

export interface CursorChat {
  id: string;
  /** How many bubbles the chat lists; it grows as the chat goes on. */
  count: number;
  updatedMs: number;
  title?: string;
  folder?: string;
}

export function cursorDbPath(): string {
  return join(cursorUserDir(), "globalStorage", "state.vscdb");
}

/** Both sides of one chat, in the order the chat lists its bubbles. */
export function chatMessages(
  order: string[],
  bubbles: Bubble[],
): LineMessage[] {
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const listed = order.map((id) => byId.get(id)).filter(Boolean) as Bubble[];
  const sequence = listed.length
    ? listed
    : [...bubbles].sort((a, b) => a.at.localeCompare(b.at));
  const out: LineMessage[] = [];
  for (const bubble of sequence) {
    if (bubble.type === 1) {
      const text = cleanPrompt(bubble.text);
      if (text.length >= 2) out.push({ role: "user", at: bubble.at, text });
    } else if (bubble.type === 2 && bubble.text.trim())
      out.push({ role: "assistant", at: bubble.at, text: bubble.text.trim() });
  }
  return out;
}

/** A folder from what Cursor wrote: a plain path, or a file:// address. Remote folders are left out. */
export function folderOf(value: unknown): string | undefined {
  if (typeof value !== "string" || !value) return undefined;
  if (value.startsWith("file://")) {
    try {
      return fileURLToPath(value);
    } catch {
      return undefined;
    }
  }
  return value.includes("://") ? undefined : value;
}

function openReadOnly(path: string): DatabaseSync | undefined {
  try {
    return new DatabaseSync(path, { readOnly: true });
  } catch {
    return undefined;
  }
}

/** The folder a window had open: its folder, or where its saved workspace file is. */
async function windowFolder(dir: string): Promise<string | undefined> {
  try {
    const saved = JSON.parse(
      await readFile(join(dir, "workspace.json"), "utf8"),
    ) as { folder?: unknown; workspace?: unknown };
    const folder = folderOf(saved?.folder);
    if (folder) return folder;
    const workspace = folderOf(saved?.workspace);
    return workspace ? dirname(workspace) : undefined;
  } catch {
    return undefined;
  }
}

/** Older chats by the folder they ran in, from each window's own database. */
async function olderChatFolders(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    const folder = await windowFolder(join(root, dir));
    const db = folder && openReadOnly(join(root, dir, "state.vscdb"));
    if (!folder || !db) continue;
    try {
      const row = db
        .prepare(
          "SELECT json_extract(value, '$.allComposers') AS chats FROM ItemTable WHERE key = 'composer.composerData'",
        )
        .get() as { chats: string | null } | undefined;
      for (const chat of JSON.parse(row?.chats ?? "[]") as {
        composerId?: string;
      }[])
        if (chat.composerId) out.set(chat.composerId, folder);
    } catch {
      // This window has no chats, or an older layout.
    } finally {
      db.close();
    }
  }
  return out;
}

/**
 * Every chat in which something was said, with when it last changed, without reading its bubbles:
 * one pass over the chats' own rows, and one lookup of each chat's last bubble for its time.
 */
export async function cursorChats(
  path = cursorDbPath(),
): Promise<CursorChat[]> {
  if (!existsSync(path)) return [];
  const db = openReadOnly(path);
  if (!db) throw new Error("Cursor's chat database could not be opened.");
  let rows: {
    id: string;
    count: number;
    updated: string | number | null;
    title: string | null;
  }[];
  const windows = new Map<string, string>();
  try {
    rows = db
      .prepare(
        `WITH chats AS MATERIALIZED (
           SELECT substr(key, 14) AS id, value FROM cursorDiskKV
            WHERE key >= 'composerData:' AND key < 'composerData;' AND json_valid(value))
         SELECT c.id AS id,
                json_array_length(c.value, '$.fullConversationHeadersOnly') AS count,
                coalesce(json_extract(c.value, '$.lastUpdatedAt'),
                         json_extract(b.value, '$.createdAt'),
                         json_extract(c.value, '$.createdAt')) AS updated,
                json_extract(c.value, '$.name') AS title
           FROM chats c
           LEFT JOIN cursorDiskKV b
             ON b.key = 'bubbleId:' || c.id || ':' || json_extract(c.value, '$.fullConversationHeadersOnly[#-1].bubbleId')
            AND json_valid(b.value)
          WHERE json_array_length(c.value, '$.fullConversationHeadersOnly') > 0`,
      )
      .all() as typeof rows;
    const headers = db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'composerHeaders'",
      )
      .get();
    if (headers)
      for (const row of db
        .prepare(
          "SELECT composerId AS id, workspaceId AS window FROM composerHeaders WHERE workspaceId IS NOT NULL",
        )
        .all() as { id: string; window: string }[])
        windows.set(row.id, row.window);
  } finally {
    db.close();
  }
  const root = join(dirname(dirname(path)), "workspaceStorage");
  const folders = new Map<string, string | undefined>();
  let older: Map<string, string> | undefined;
  const chats: CursorChat[] = [];
  for (const row of rows) {
    const window = windows.get(row.id);
    let folder: string | undefined;
    if (window) {
      if (!folders.has(window))
        folders.set(window, await windowFolder(join(root, window)));
      folder = folders.get(window);
    }
    if (!folder) {
      older ??= await olderChatFolders(root);
      folder = older.get(row.id);
    }
    chats.push({
      id: row.id,
      count: Number(row.count) || 0,
      updatedMs: Date.parse(isoTime(row.updated)) || 0,
      title: row.title?.trim() || undefined,
      folder,
    });
  }
  return chats;
}

/** Both sides of one chat, oldest first. */
export function cursorMessages(path: string, id: string): LineMessage[] {
  const db = openReadOnly(path);
  if (!db) return [];
  try {
    const headers = db
      .prepare(
        "SELECT json_extract(value, '$.fullConversationHeadersOnly') AS headers FROM cursorDiskKV WHERE key = ? AND json_valid(value)",
      )
      .get(`composerData:${id}`) as { headers: string | null } | undefined;
    let order: string[] = [];
    try {
      order = (JSON.parse(headers?.headers ?? "[]") as { bubbleId?: string }[])
        .map((header) => header.bubbleId)
        .filter((bubble): bubble is string => typeof bubble === "string");
    } catch {
      // No order recorded; the bubbles' times decide.
    }
    const prefix = `bubbleId:${id}:`;
    const rows = db
      .prepare(
        `SELECT substr(key, ${prefix.length + 1}) AS id,
                json_extract(value, '$.type') AS type,
                json_extract(value, '$.text') AS text,
                json_extract(value, '$.createdAt') AS at
           FROM cursorDiskKV WHERE key >= ? AND key < ? AND json_valid(value)`,
      )
      .all(prefix, `bubbleId:${id};`) as {
      id: string;
      type: number | null;
      text: string | null;
      at: string | number | null;
    }[];
    return chatMessages(
      order,
      rows.map((row) => ({
        id: row.id,
        type: Number(row.type),
        text: typeof row.text === "string" ? row.text : "",
        at: isoTime(row.at),
      })),
    );
  } finally {
    db.close();
  }
}
