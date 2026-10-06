// Everything a mini-me keeps on this computer, file by file, so the person can see exactly what is
// stored and where. Text files (memory, skills, notes, the record of the last reading, settings)
// come with their text; the search index and anything large come with their size only.

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { minimeHome } from "./paths.ts";

export type StoredGroup =
  | "memory"
  | "skills"
  | "notes"
  | "chats"
  | "logs"
  | "reading"
  | "settings"
  | "index"
  | "backup"
  | "other";

export const STORED_GROUPS: StoredGroup[] = [
  "memory",
  "skills",
  "notes",
  "chats",
  "logs",
  "reading",
  "settings",
  "index",
  "backup",
  "other",
];

export interface StoredFile {
  /** Relative to the mini-me's folder, with "/" on every system. */
  path: string;
  group: StoredGroup;
  size: number;
  modified: string;
  /** For text files up to TEXT_MAX. */
  text?: string;
}

const TEXT = /\.(md|json|jsonl|txt|ya?ml)$/i;
const TEXT_MAX = 100_000;
const FILES_MAX = 1000;

function groupOf(path: string): StoredGroup {
  const first = path.split("/")[0];
  if (first === "memories") return "memory";
  if (first === "skills") return "skills";
  if (first === "notes") return "notes";
  if (first === "chats") return "chats";
  if (first === "logs") return "logs";
  if (path === "learn.json") return "reading";
  if (path === "settings.json") return "settings";
  if (first === "index") return "index";
  if (first === "backup") return "backup";
  return "other";
}

/** Credentials kept in a JSON file (the office token) are shown masked: a screen gets shared. */
function masked(name: string, text: string): string {
  if (!name.endsWith(".json")) return text;
  try {
    return JSON.stringify(
      JSON.parse(text),
      (key, value) =>
        typeof value === "string" && /token|secret|password/i.test(key)
          ? "••••••"
          : value,
      2,
    );
  } catch {
    return text;
  }
}

export async function storedFiles(home = minimeHome()): Promise<StoredFile[]> {
  const out: StoredFile[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (depth > 8 || out.length >= FILES_MAX) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (out.length >= FILES_MAX) return;
      if (entry.name === ".lock" || entry.name.endsWith(".tmp")) continue;
      const full = join(/*turbopackIgnore: true*/ dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const info = await stat(full).catch(() => undefined);
      if (!info) continue;
      const path = relative(home, full).split(sep).join("/");
      const file: StoredFile = {
        path,
        group: groupOf(path),
        size: info.size,
        modified: new Date(info.mtimeMs).toISOString(),
      };
      if (TEXT.test(entry.name) && info.size <= TEXT_MAX) {
        const text = await readFile(full, "utf8").catch(() => undefined);
        file.text = text === undefined ? undefined : masked(entry.name, text);
      }
      out.push(file);
    }
  };
  await walk(home, 0);
  return out.sort(
    (a, b) =>
      STORED_GROUPS.indexOf(a.group) - STORED_GROUPS.indexOf(b.group) ||
      a.path.localeCompare(b.path),
  );
}
