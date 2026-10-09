// Where the person's work lives on this computer: the folders they changed lately and the ones
// they worked in with their AI tools, found the same way on every system and every kind of work (a
// developer's repositories, a designer's folders of pictures, someone's documents), so the first
// reading knows what each one is and the clone can find things later by path.
//
// The places never overlap: no place lies inside another, so nothing is read or counted twice and
// leaving one out never leaves out another by surprise. A repository is one place (a folder they
// worked in with AI inside it counts for it); a folder they worked in with AI is one place, taking
// in such folders inside it; a folder holding either of those is a collection (a "projects" folder,
// the desktop), never a place itself, and what changed in its other folders makes a place of each
// folder right under it. A work folder (the desktop, documents, downloads…) is a collection too,
// unless nothing but loose files and a few plain folders changed in it: then it is one place.
//
// The walk is bounded so a large disk never stalls it: the usual places a person keeps work (the
// desktop, documents, downloads, pictures, videos, music and the usual code folders), at most four
// folders deep, a thousand names and three hundred files a folder, a budget of names and of time
// shared among the work folders. It reads names, sizes and times only; folders the person keeps out
// are never entered, hidden folders and what a package manager or a build fills are skipped, links
// are not followed, and a repository is not walked at all (git says what happened there).
// Everything that touches their folders runs in a process of its own (places-walk.ts), ended when
// its time is up: on macOS a folder that asks the person first would otherwise hold the app's file
// reads until answered.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, dirname, relative, sep } from "node:path";
import { createInterface } from "node:readline";
import { isExcluded, loadExcludes } from "./exclude.ts";
import { type FolderTool, recentFolders } from "./folders.ts";
import { placesWalkPath } from "./paths.ts";
import type { DirChanges, WalkJob, WalkLine } from "./places-walk.ts";
import { folderName } from "./sources/common.ts";

const DAY = 24 * 60 * 60 * 1000;

/** How far back a change counts as recent. */
export const PLACES_DAYS = 30;

/** How long the walk, and describing the repositories, may take before what came so far is used. */
const WALK_MS = 6_000;
const DESCRIBE_MS = 10_000;
/** How many places are offered. */
export const MAX_PLACES = 30;
/** How long a walk is reused before the disk is walked again. */
const FRESH_MS = 10 * 60 * 1000;
/** Recent file names kept per place, newest first. */
const KEEP_RECENT = 12;

export interface Place {
  path: string;
  /** The path as the person reads it: "~/…" under their home folder. */
  shown?: string;
  name: string;
  /** A git repository, or a plain folder. */
  kind: "repo" | "folder";
  /** Conversations with AI tools there in the last days, and in which tools. */
  sessions: number;
  tools: FolderTool[];
  /** Files changed there lately (a plain folder's; a repository's changes are git's). */
  files: number;
  /** What happened in a repository lately: its reflog's entries (commits, checkouts, pulls). */
  activity: number;
  /** When something there last changed, as far as was seen (ms), or 0. */
  changed: number;
  /** The collection it lies in (a folder holding several places), if any but the home folder. */
  within?: string;
}

/** What the walk saw of a place, kept for the reading: never sent to the page. */
export interface PlaceDetail extends Place {
  /** The newest files, by name relative to the place, with their times. */
  recent: { name: string; at: number }[];
  /** Files lately by kind (extension), and by the folder right under the place. */
  kinds: Record<string, number>;
  folders: Record<string, number>;
}

/**
 * A folder holding places, as the page groups them: so a "projects" folder with twenty
 * repositories reads as one thing that can be left out whole, and the conversations someone had
 * in the collection itself (over all of it) can be left out with it.
 */
export interface PlaceGroup {
  path: string;
  shown?: string;
  name: string;
  sessions: number;
  tools: FolderTool[];
}

export interface Places {
  /** The places, the busiest first. */
  places: PlaceDetail[];
  /** The collections the places lie in, as `within` names them. */
  groups: PlaceGroup[];
}

/** The folders a person keeps work in on this system. */
export function workRoots(home = homedir()): string[] {
  return [
    "Projects",
    "projects",
    "Developer",
    "dev",
    "code",
    "Code",
    "src",
    "workspace",
    "Workspace",
    "work",
    "Work",
    "repos",
    "git",
    "GitHub",
    "Sites",
    "Pictures",
    "Movies",
    "Videos",
    "Music",
    "OneDrive",
    "Dropbox",
    "Desktop",
    "Documents",
    "Downloads",
  ].map((name) => `${home}${sep}${name}`);
}

/**
 * Runs a job in the walking process and gives back every line it wrote before it ended or its time
 * was up. It is killed outright at the deadline: a read waiting on the system is never waited for.
 */
export function runWalker(job: WalkJob, ms: number): Promise<WalkLine[]> {
  return new Promise((resolve) => {
    const lines: WalkLine[] = [];
    let done = false;
    const child = spawn(process.execPath, ["--no-warnings", placesWalkPath()], {
      stdio: ["pipe", "pipe", "ignore"],
      windowsHide: true,
    });
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve(lines);
    };
    const timer = setTimeout(finish, ms);
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        lines.push(JSON.parse(line) as WalkLine);
      } catch {
        // A line cut by the end of its time is left out.
      }
    });
    child.on("error", finish);
    child.on("close", finish);
    child.stdin.on("error", () => undefined);
    child.stdin.end(JSON.stringify(job));
  });
}

/** How much a place says about the person's work now: conversations there, changes, and how lately. */
export function placeScore(place: Place, now = Date.now()): number {
  const days = place.changed ? (now - place.changed) / DAY : PLACES_DAYS;
  const lately = Math.max(0, PLACES_DAYS - days) / PLACES_DAYS;
  return (
    place.sessions * 2 +
    Math.log2(1 + place.files) * 2 +
    Math.log2(1 + (place.activity ?? 0)) * 2 +
    lately * 6 +
    (place.kind === "repo" ? 1 : 0)
  );
}

/** True when `path` is `parent` or lies inside it. */
const within = (path: string, parent: string) =>
  path === parent ||
  path.startsWith(parent.endsWith(sep) ? parent : parent + sep);

/** The first folder of `path` below `parent`. */
const childOf = (parent: string, path: string) =>
  parent +
  (parent.endsWith(sep) ? "" : sep) +
  relative(parent, path).split(sep)[0];

const empty = (path: string, kind: Place["kind"]): PlaceDetail => ({
  path,
  name: folderName(path),
  kind,
  sessions: 0,
  tools: [],
  files: 0,
  activity: 0,
  changed: 0,
  recent: [],
  kinds: {},
  folders: {},
});

/**
 * The place among `places` that holds `path` (or is it), looking up from it to the first of the
 * home and work folders: as many steps as the path is deep, however many places there are.
 */
function holderOf(
  path: string,
  places: Map<string, PlaceDetail>,
  tops: Set<string>,
): PlaceDetail | undefined {
  for (let at = path; ; at = dirname(at)) {
    const found = places.get(at);
    if (found) return found;
    if (tops.has(at) || dirname(at) === at) return undefined;
  }
}

/** Adds a tool's conversations to a place, the busiest tool first. */
function addTools(place: { tools: FolderTool[] }, tools: FolderTool[]) {
  place.tools = [...new Set([...place.tools, ...tools])];
}

/** Adds what changed in one folder to the place it lies in. */
function addChanges(place: PlaceDetail, dir: DirChanges) {
  place.files += dir.files;
  place.changed = Math.max(place.changed, dir.changed);
  for (const [kind, count] of Object.entries(dir.kinds))
    place.kinds[kind] = (place.kinds[kind] ?? 0) + count;
  const rel = relative(place.path, dir.path);
  const inside = rel ? rel.split(sep) : [];
  if (inside.length)
    place.folders[inside[0]] = (place.folders[inside[0]] ?? 0) + dir.files;
  place.recent.push(
    ...dir.recent.map((file) => ({
      name: [...inside, file.name].join("/"),
      at: file.at,
    })),
  );
  if (place.recent.length > KEEP_RECENT * 4) {
    place.recent.sort((a, b) => b.at - a.at);
    place.recent.length = KEEP_RECENT;
  }
}

/** Adds one place into another that holds it. */
function merge(into: PlaceDetail, from: PlaceDetail) {
  into.sessions += from.sessions;
  addTools(into, from.tools);
  into.activity += from.activity;
  into.files += from.files;
  into.changed = Math.max(into.changed, from.changed);
  for (const [kind, count] of Object.entries(from.kinds))
    into.kinds[kind] = (into.kinds[kind] ?? 0) + count;
  const rel = relative(into.path, from.path).split(sep).filter(Boolean);
  if (rel.length && from.files)
    into.folders[rel[0]] = (into.folders[rel[0]] ?? 0) + from.files;
  into.recent.push(
    ...from.recent.map((file) => ({
      name: [...rel, file.name].join("/"),
      at: file.at,
    })),
  );
}

/**
 * The places from what the walk found and where the person worked with AI tools, the busiest first,
 * none inside another (see the top of this file). A folder they keep out stays on the list, so the
 * screen can show it left out; nothing in it was looked at.
 */
export function rankPlaces(
  lines: WalkLine[],
  withAi: {
    path: string;
    name: string;
    sessions: number;
    tools: FolderTool[];
  }[],
  excludes: string[],
  now = Date.now(),
  roots = workRoots(),
  home = homedir(),
): Places {
  const tops = new Set([home, ...roots]);
  const facts = new Map(
    lines.flatMap((line) =>
      line.type === "ai" ? [[line.path, line] as const] : [],
    ),
  );

  // Repositories: those the walk found, and those holding a folder they worked in with AI; one
  // inside another counts for the outer one.
  const repos = new Map<string, PlaceDetail>();
  const repo = (path: string, changed: number, activity: number) => {
    const found = repos.get(path) ?? empty(path, "repo");
    found.changed = Math.max(found.changed, changed);
    found.activity = Math.max(found.activity, activity);
    repos.set(path, found);
    return found;
  };
  for (const line of lines)
    if (line.type === "repo" && !tops.has(line.path))
      repo(line.path, line.changed, line.activity);
  const aiFolders: (typeof withAi)[number][] = [];
  for (const folder of withAi) {
    const fact = facts.get(folder.path);
    // A folder gone from the disk is not offered; one not looked at in time still is, by its records.
    if (fact && !fact.exists && !isExcluded(folder.path, excludes)) continue;
    if (fact?.repo && !tops.has(fact.repo)) {
      const found = repo(fact.repo, fact.changed, fact.activity);
      found.sessions += folder.sessions;
      addTools(found, folder.tools);
    } else aiFolders.push(folder);
  }
  // Shortest first, so the outer one is kept before any inside it is met.
  const kept = new Map<string, PlaceDetail>();
  for (const found of [...repos.values()].sort(
    (a, b) => a.path.length - b.path.length,
  )) {
    const holder = holderOf(found.path, kept, tops);
    if (holder) merge(holder, found);
    else kept.set(found.path, found);
  }
  const outer = [...kept.values()];

  // Folders they worked in with AI, the outermost first: a place unless it is the home folder, a
  // work folder or holds a repository (a collection); one inside another place counts for it.
  const units = new Map(kept);
  const collections = new Map<string, PlaceGroup>();
  for (const folder of [...aiFolders].sort(
    (a, b) => a.path.length - b.path.length,
  )) {
    const holder = holderOf(folder.path, units, tops);
    if (holder) {
      holder.sessions += folder.sessions;
      addTools(holder, folder.tools);
      continue;
    }
    if (
      tops.has(folder.path) ||
      within(home, folder.path) ||
      outer.some((one) => within(one.path, folder.path))
    ) {
      collections.set(folder.path, {
        path: folder.path,
        name: folder.name,
        sessions: folder.sessions,
        tools: folder.tools,
      });
      continue;
    }
    const place = empty(folder.path, "folder");
    place.name = folder.name;
    place.sessions = folder.sessions;
    place.tools = [...folder.tools];
    units.set(place.path, place);
  }

  // Every folder holding a place is a collection, as are the home and work folders.
  const holding = new Set(tops);
  for (const unit of units.values())
    for (let at = dirname(unit.path); !holding.has(at); at = dirname(at)) {
      holding.add(at);
      if (dirname(at) === at) break;
    }
  for (const path of collections.keys()) holding.add(path);

  // What changed elsewhere goes to the place it lies in, else to the folder right under the
  // deepest collection holding it; what lies loose in a collection waits to see if it is one.
  const plain = new Map<string, PlaceDetail>();
  const loose = new Map<string, PlaceDetail>();
  for (const line of lines) {
    if (line.type !== "dir") continue;
    const dir = line.dir;
    if (isExcluded(dir.path, excludes)) continue;
    // Up from the folder: the place it lies in, else the first collection holding it.
    let at = dir.path;
    while (!units.has(at) && !holding.has(at) && dirname(at) !== at)
      at = dirname(at);
    const unit = units.get(at);
    if (unit) {
      addChanges(unit, dir);
      continue;
    }
    if (!holding.has(at)) continue;
    if (at === dir.path) {
      const found = loose.get(at) ?? empty(at, "folder");
      addChanges(found, dir);
      loose.set(at, found);
      continue;
    }
    const path = childOf(at, dir.path);
    const found = plain.get(path) ?? empty(path, "folder");
    addChanges(found, dir);
    plain.set(path, found);
  }

  // A work folder where nothing but loose files and plain folders changed, the loose files the
  // most of it (a downloads folder), is one place; elsewhere loose files are not a place.
  for (const [root, files] of loose) {
    if (!roots.includes(root)) continue;
    const inside = [...plain.values()].filter((one) => within(one.path, root));
    if ([...units.keys()].some((path) => within(path, root))) continue;
    if (files.files < inside.reduce((sum, one) => sum + one.files, 0)) continue;
    for (const one of inside) {
      merge(files, one);
      plain.delete(one.path);
    }
    plain.set(root, files);
  }

  const places = [...units.values(), ...plain.values()]
    .filter((place) => place.path !== home && placeScore(place, now) > 0.5)
    .sort((a, b) => placeScore(b, now) - placeScore(a, now))
    .slice(0, MAX_PLACES);
  // Each place names the collection it lies in, and the page draws those that hold several.
  const groups = new Map<string, PlaceGroup>();
  for (const place of places) {
    place.recent.sort((a, b) => b.at - a.at);
    place.recent.length = Math.min(place.recent.length, KEEP_RECENT);
    let at = dirname(place.path);
    while (!holding.has(at) && dirname(at) !== at) at = dirname(at);
    if (!holding.has(at) || at === home) continue;
    place.within = at;
    if (!groups.has(at))
      groups.set(
        at,
        collections.get(at) ?? {
          path: at,
          name: folderName(at),
          sessions: 0,
          tools: [],
        },
      );
  }
  return { places, groups: [...groups.values()] };
}

let cached: { at: number; value: Promise<Places> } | undefined;

/**
 * The places where the person's work lives, the busiest first, each with what the walk saw. The
 * walk is reused for a few minutes, so the screen and the reading that follows it walk once.
 */
export function findPlaces(options: { fresh?: boolean } = {}): Promise<Places> {
  if (!options.fresh && cached && Date.now() - cached.at < FRESH_MS)
    return cached.value;
  const value = computePlaces().catch(
    (): Places => ({ places: [], groups: [] }),
  );
  cached = { at: Date.now(), value };
  return value;
}

async function computePlaces(now = Date.now()): Promise<Places> {
  const since = now - PLACES_DAYS * DAY;
  const excludes = loadExcludes();
  const withAi = await recentFolders(since, 40).catch(() => []);
  const roots = workRoots();
  const lines = await runWalker(
    {
      mode: "walk",
      since,
      excludes,
      roots,
      ai: withAi.map((folder) => folder.path),
      ms: WALK_MS - 600,
    },
    WALK_MS,
  );
  return rankPlaces(lines, withAi, excludes, now, roots);
}

/** A place as the page shows it: what the walk saw beyond that stays on the server. */
export function publicPlace(place: PlaceDetail): Place {
  const { recent: _r, kinds: _k, folders: _f, ...rest } = place;
  return { ...rest, shown: shown(place.path) };
}

/** A collection as the page shows it. */
export function publicGroup(group: PlaceGroup): PlaceGroup {
  return { ...group, shown: shown(group.path) };
}

// ---- What the reading is told about each place ----

const top = (counts: Record<string, number>, n: number) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");

const shown = (path: string) => {
  const home = homedir();
  return path === home
    ? "~"
    : path.startsWith(home + sep)
      ? `~/${relative(home, path).split(sep).join("/")}`
      : path;
};

const day = (at: number) => new Date(at).toISOString().slice(0, 10);

/** A plain folder: what changed lately, by kind and by folder, and the newest files by name. */
export function describeFolder(place: PlaceDetail): string[] {
  return [
    `folder; ${place.files} files changed in the last ${PLACES_DAYS} days${place.changed ? `, the latest ${day(place.changed)}` : ""}`,
    Object.keys(place.kinds).length && `- by kind: ${top(place.kinds, 8)}`,
    Object.keys(place.folders).length &&
      `- in its folders: ${top(place.folders, 8)}`,
    place.recent.length &&
      `- newest: ${place.recent
        .slice(0, 10)
        .map((file) => `${file.name} (${day(file.at)})`)
        .join(", ")}`,
  ].filter((line): line is string => Boolean(line));
}

/**
 * The places as the reading reads them, the busiest first, within `limit` characters: each one's
 * path as written on this computer (so the clone can go back to it), what it is and what changed.
 */
export async function describePlaces(
  places: PlaceDetail[],
  limit: number,
  now = Date.now(),
): Promise<{ text: string; items: number }> {
  const repos = places.filter((place) => place.kind === "repo");
  const lines = repos.length
    ? await runWalker(
        {
          mode: "describe",
          since: now - PLACES_DAYS * DAY,
          repos: repos.map((place) => place.path),
        },
        DESCRIBE_MS,
      )
    : [];
  const described = new Map(
    lines.flatMap((line) =>
      line.type === "described" ? [[line.path, line.lines] as const] : [],
    ),
  );
  const kept: string[] = [];
  let used = 0;
  for (const place of places) {
    const what =
      place.kind === "repo"
        ? (described.get(place.path) ?? [
            "git repository (not looked into in time)",
          ])
        : describeFolder(place);
    const ai = place.sessions
      ? `; ${place.sessions} AI conversations there (${place.tools.join(", ")})`
      : "";
    const block = `### ${basename(place.path) || place.path} — ${shown(place.path)}${ai}\n${what.join("\n")}`;
    const cut = block.length > 1600 ? `${block.slice(0, 1600)}…` : block;
    if (used + cut.length > limit) break;
    kept.push(cut);
    used += cut.length + 2;
  }
  return { text: kept.join("\n\n"), items: kept.length };
}
