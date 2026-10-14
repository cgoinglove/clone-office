// Where the person's work lives, for answering a colleague from the work itself: the folders on the
// map the reading kept (WORK_MAP) and the folders they worked in with AI lately, read without asking
// while a colleague's request is answered (preferences `answerFromWork`), never changed. A folder is
// taken only when it is a real folder under their home, below its top (never the home itself, a
// hidden one, or Desktop, Documents and the like as a whole), not kept out and not the clone's own.
// Files that hold keys and passwords are never read there, by name (gate/secrets.ts), and what the
// answer says still passes the look before it leaves (check.ts).

import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { notesDir } from "../brain/session.ts";
import { pathRule } from "../gate/rules.ts";
import { NoteStore, WORK_MAP } from "../memory/notes.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import { recentFolders } from "../server/folders.ts";
import { minimeHome } from "../server/paths.ts";

/** One line of the map page, as the reading writes it (learn.ts `keepMap`). */
const MAP_LINE = /^- `([^`]+)` — (.+)$/;

/** How many folders a colleague's request may read in. */
const MOST = 30;
/** How far back the folders worked in with AI count. */
const DAYS = 30;

/** The folders under home that hold everything of a kind: one is taken only below them. */
const BROAD = new Set([
  "Desktop",
  "Documents",
  "Downloads",
  "Library",
  "Pictures",
  "Movies",
  "Music",
  "Applications",
  "Public",
  "Dropbox",
  "OneDrive",
  "Google Drive",
  "iCloud Drive (Archive)",
]);

const inside = (path: string, folder: string) => {
  const rel = relative(folder, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** A folder as it may be read for a colleague, or none. */
export async function workFolder(
  given: string,
  options: { home?: string; clone?: string; excludes?: string[] } = {},
): Promise<string | undefined> {
  const home = options.home ?? homedir();
  const raw = given.trim();
  if (!raw) return undefined;
  const path =
    raw === "~"
      ? home
      : raw.startsWith("~/")
        ? join(home, raw.slice(2))
        : isAbsolute(raw)
          ? resolve(raw)
          : undefined;
  if (!path || !inside(path, home)) return undefined;
  const parts = relative(home, path).split(sep).filter(Boolean);
  if (!parts.length || parts.some((part) => part.startsWith("."))) return;
  if (parts.length === 1 && BROAD.has(parts[0])) return undefined;
  if (inside(path, options.clone ?? minimeHome())) return undefined;
  if (inside(options.clone ?? minimeHome(), path)) return undefined;
  if (isExcluded(path, options.excludes ?? loadExcludes())) return undefined;
  const info = await stat(path).catch(() => undefined);
  return info?.isDirectory() ? path : undefined;
}

/** The paths on the map of where the person's work lives. */
async function mapped(): Promise<string[]> {
  const seen = await new NoteStore(notesDir(), "transplant")
    .view(WORK_MAP)
    .catch(() => undefined);
  if (!seen || "error" in seen) return [];
  return seen.content
    .split("\n")
    .map((line) => MAP_LINE.exec(line.trim())?.[1])
    .filter((path): path is string => Boolean(path));
}

/** The folders a colleague's request may read in, none inside another, the outermost kept. */
export async function workFolders(now = Date.now()): Promise<string[]> {
  const excludes = loadExcludes();
  const [map, recent] = await Promise.all([
    mapped(),
    recentFolders(now - DAYS * 24 * 60 * 60 * 1000, MOST).catch(() => []),
  ]);
  const found: string[] = [];
  for (const given of [...map, ...recent.map((folder) => folder.path)]) {
    const folder = await workFolder(given, { excludes });
    if (folder && !found.includes(folder)) found.push(folder);
  }
  const outer = found.filter(
    (folder) =>
      !found.some((other) => other !== folder && inside(folder, other)),
  );
  return outer.slice(0, MOST);
}

/** The rules that let a colleague's request read in these folders. */
export function workReadRules(folders: string[]): string[] {
  return folders.map((folder) => `Read(${pathRule(folder)}/**)`);
}

/** How a folder is named to the clone: as the person would write it. */
export const shownFolder = (folder: string) =>
  pathRule(folder).replace(/^\/\//, "/") || basename(folder);
