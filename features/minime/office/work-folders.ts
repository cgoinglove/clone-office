// Where the person's work lives, for answering a colleague from the work itself: the folders the
// person's own reading put on its map (kept by code in settings.json `workFolders` as the reading
// saves the map, never taken from the map page, which a session may write) and the folders they
// worked in with AI lately (from their AI tools' own records), read without asking while a
// colleague's request is answered (preferences `answerFromWork`), never changed. A folder is taken
// only as the real folder it leads to, under their home and below its top: never the home itself,
// a hidden folder, a system one (Library, AppData, a cloud drive's own folder) at any depth,
// Desktop, Documents and the like as a whole, a folder kept out, the clone's own, or a name a
// permission rule could not hold. Files that hold keys and passwords are never read there
// (gate/secrets.ts), and what the answer says still passes the look before it leaves (check.ts).

import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathRule } from "../gate/rules.ts";
import { withLock } from "../memory/files.ts";
import {
  isExcluded,
  loadExcludes,
  settingsPath,
  writeSettings,
} from "../server/exclude.ts";
import { recentFolders } from "../server/folders.ts";
import { minimeHome } from "../server/paths.ts";

/** How many folders a colleague's request may read in. */
const MOST = 30;
/** How far back the folders worked in with AI count. */
const DAYS = 30;

/** The folders right under home that hold everything of a kind: one is taken only below them. */
const BROAD = new Set(
  [
    "Desktop",
    "Documents",
    "Downloads",
    "Pictures",
    "Movies",
    "Music",
    "Videos",
    "Public",
    "Dropbox",
    "OneDrive",
    "Google Drive",
    "iCloud Drive",
  ].map((name) => name.toLowerCase()),
);

/** Folders no colleague's request reads in, at any depth: the system's and the apps' own. */
const NEVER = new Set(
  [
    "Library",
    "Applications",
    "AppData",
    "Application Support",
    "CloudStorage",
    "Mobile Documents",
    "Containers",
    "Group Containers",
    "Keychains",
    "node_modules",
  ].map((name) => name.toLowerCase()),
);

/** Characters a permission rule would read as its own (a list's comma, a pattern's star). */
const UNRULY = /[(),*?[\]{}"'\n\r\t\\]/;

/** On a disk that does not tell letters' cases apart, nor does this. */
const folded = (path: string) =>
  process.platform === "darwin" || process.platform === "win32"
    ? path.toLowerCase()
    : path;

const inside = (path: string, folder: string) => {
  const rel = relative(folded(folder), folded(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** Whether a path, as given or as it really is, may be read for colleagues. */
function allowed(
  path: string,
  home: string,
  clone: string,
  excludes: string[],
): boolean {
  if (!inside(path, home) || UNRULY.test(path)) return false;
  const parts = relative(folded(home), folded(path)).split(sep).filter(Boolean);
  if (!parts.length) return false;
  if (parts.some((part) => part.startsWith(".") || NEVER.has(part)))
    return false;
  if (parts.length === 1 && BROAD.has(parts[0])) return false;
  if (parts[0].startsWith("onedrive") && parts.length === 1) return false;
  if (inside(path, clone) || inside(clone, path)) return false;
  return !isExcluded(path, excludes);
}

/** A folder as it may be read for colleagues (the real one it leads to), or none. */
export async function workFolder(
  given: string,
  options: { home?: string; clone?: string; excludes?: string[] } = {},
): Promise<string | undefined> {
  const home = options.home ?? homedir();
  const clone = options.clone ?? minimeHome();
  const excludes = options.excludes ?? loadExcludes();
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
  if (!path || !allowed(path, home, clone, excludes)) return undefined;
  // A link is taken as where it leads, which must pass the same way.
  const real = await realpath(path).catch(() => undefined);
  if (!real) return undefined;
  const realHome = await realpath(home).catch(() => home);
  const realClone = await realpath(clone).catch(() => clone);
  if (!allowed(real, realHome, realClone, excludes)) return undefined;
  const info = await stat(real).catch(() => undefined);
  return info?.isDirectory() ? real : undefined;
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Keeps the map's folders as the person's own reading found them (learn.ts `keepMap`). */
export async function keepWorkFolders(paths: string[]): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    await writeSettings(
      `${JSON.stringify({ ...settings, workFolders: paths.slice(0, 60) }, null, 2)}\n`,
    );
  });
}

/** The folders a colleague's request may read in, none inside another, the outermost kept. */
export async function workFolders(now = Date.now()): Promise<string[]> {
  const excludes = loadExcludes();
  const kept = (await readSettings()).workFolders;
  const recent = await recentFolders(
    now - DAYS * 24 * 60 * 60 * 1000,
    MOST,
  ).catch(() => []);
  const found: string[] = [];
  for (const given of [
    ...(Array.isArray(kept)
      ? kept.filter((path): path is string => typeof path === "string")
      : []),
    ...recent.map((folder) => folder.path),
  ]) {
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
