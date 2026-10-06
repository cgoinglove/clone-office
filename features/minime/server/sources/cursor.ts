// Cursor keeps its chats in a SQLite file, User/globalStorage/state.vscdb. Each chat ("composer") is
// a `composerData:<id>` row that lists its messages ("bubbles") in order; each bubble is its own
// `bubbleId:<composer>:<bubble>` row, type 1 for the person and 2 for the AI. Newer bubbles name the
// folder the chat ran in (`workspaceUris`; `workspaceProjectDir` is Cursor's own data folder, not
// the person's). For older chats, each folder's own database under workspaceStorage lists its
// chats. The files are opened read-only, and SQLite pulls out only the few fields needed, so the
// large rows never reach this process.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { cursorUserDir } from "../paths";
import { type Conversation, isoTime, makeTurn, type Turn } from "./common";

const TOOL = "Cursor";

export interface Bubble {
  id: string;
  type: number;
  text: string;
  at: string;
}

/** The person's turns in one chat, in the order the chat lists its bubbles. */
export function chatTurns(order: string[], bubbles: Bubble[]): Turn[] {
  const byId = new Map(bubbles.map((bubble) => [bubble.id, bubble]));
  const listed = order.map((id) => byId.get(id)).filter(Boolean) as Bubble[];
  const sequence = listed.length
    ? listed
    : [...bubbles].sort((a, b) => a.at.localeCompare(b.at));
  const turns: Turn[] = [];
  let lastAssistant = "";
  for (const bubble of sequence) {
    if (bubble.type === 2) {
      if (bubble.text.trim()) lastAssistant = bubble.text;
      continue;
    }
    if (bubble.type !== 1) continue;
    const turn = makeTurn(bubble.at, bubble.text, lastAssistant);
    if (turn) turns.push(turn);
    lastAssistant = "";
  }
  return turns;
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

const BUBBLES_FROM = "bubbleId:";
const BUBBLES_TO = "bubbleId;";
const CHAT_ID = "substr(key, 10, instr(substr(key, 10), ':') - 1)";

interface ChatRow {
  id: string;
  typed: number;
  updated: string | number | null;
  folder: string | null;
}

function readChat(path: string, id: string): Turn[] {
  const db = openReadOnly(path);
  if (!db) return [];
  try {
    const headers = db
      .prepare(
        "SELECT json_extract(value, '$.fullConversationHeadersOnly') AS headers FROM cursorDiskKV WHERE key = ?",
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
           FROM cursorDiskKV WHERE key >= ? AND key < ?`,
      )
      .all(prefix, `bubbleId:${id};`) as {
      id: string;
      type: number | null;
      text: string | null;
      at: string | number | null;
    }[];
    return chatTurns(
      order,
      rows.map((row) => ({
        id: row.id,
        type: Number(row.type),
        text: row.text ?? "",
        at: isoTime(row.at),
      })),
    );
  } finally {
    db.close();
  }
}

/** Older chats by the folder they ran in, from each folder's own database. */
async function chatFolders(): Promise<Map<string, string>> {
  const root = join(cursorUserDir(), "workspaceStorage");
  const out = new Map<string, string>();
  let dirs: string[] = [];
  try {
    dirs = await readdir(root);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    let folder: string | undefined;
    try {
      folder = folderOf(
        JSON.parse(await readFile(join(root, dir, "workspace.json"), "utf8"))
          ?.folder,
      );
    } catch {
      continue;
    }
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
      // This folder has no chats, or an older layout.
    } finally {
      db.close();
    }
  }
  return out;
}

export async function cursorConversations(): Promise<Conversation[]> {
  const path = join(cursorUserDir(), "globalStorage", "state.vscdb");
  if (!existsSync(path)) return [];
  const db = openReadOnly(path);
  if (!db) throw new Error("Cursor's chat database could not be opened.");
  let rows: ChatRow[];
  try {
    // One pass over the bubbles: how many each chat has from the person, when it last changed, and
    // the folder any of its bubbles names.
    rows = db
      .prepare(
        `SELECT ${CHAT_ID} AS id,
                SUM(json_extract(value, '$.type') = 1 AND length(json_extract(value, '$.text')) > 0) AS typed,
                MAX(json_extract(value, '$.createdAt')) AS updated,
                MAX(json_extract(value, '$.workspaceUris[0]')) AS folder
           FROM cursorDiskKV WHERE key >= ? AND key < ?
          GROUP BY id`,
      )
      .all(BUBBLES_FROM, BUBBLES_TO) as unknown as ChatRow[];
    // Older bubbles carry no time; the chat itself does.
    const times = db
      .prepare(
        `SELECT substr(key, 14) AS id,
                coalesce(json_extract(value, '$.lastUpdatedAt'), json_extract(value, '$.createdAt')) AS at
           FROM cursorDiskKV WHERE key >= 'composerData:' AND key < 'composerData;'`,
      )
      .all() as { id: string; at: string | number | null }[];
    const chatTime = new Map(times.map((row) => [row.id, row.at]));
    for (const row of rows) row.updated ??= chatTime.get(row.id) ?? null;
  } finally {
    db.close();
  }
  const older = await chatFolders();
  return rows
    .filter((row) => row.typed > 0)
    .map((row) => ({
      tool: TOOL,
      cwd: folderOf(row.folder) ?? older.get(row.id),
      updatedMs: Date.parse(isoTime(row.updated)) || 0,
      turns: async () => readChat(path, row.id),
    }));
}
