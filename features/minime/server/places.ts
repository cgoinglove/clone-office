// Where the person's work lives on this computer: the folders they changed lately and the ones
// they worked in with their AI tools, found the same way on every system and every kind of work (a
// developer's repositories, a designer's folders of pictures, someone's documents), so the first
// reading knows what each one is and the clone can find things later by path.
//
// The walk is bounded so a large disk never stalls it: the usual places a person keeps work (the
// desktop, documents, downloads, pictures, videos, music and the usual code folders), at most four
// folders deep, at most a few hundred entries a folder, a budget of entries and of time overall.
// It reads names, sizes and times only; folders the person keeps out are never entered, hidden
// folders and what a package manager or a build fills are skipped, links are not followed, and a
// repository is not walked at all (git says what changed there). Everything that touches their
// folders runs in a process of its own (places-walk.ts), ended when its time is up: on macOS a
// folder that asks the person first would otherwise hold the app's file reads until answered.

import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { basename, relative, sep } from "node:path";
import { createInterface } from "node:readline";
import { isExcluded, loadExcludes } from "./exclude.ts";
import { type FolderTool, recentFolders } from "./folders.ts";
import { placesWalkPath } from "./paths.ts";
import type { Group, WalkJob, WalkLine } from "./places-walk.ts";
import { folderName, isNoise } from "./sources/common.ts";

const DAY = 24 * 60 * 60 * 1000;

/** How far back a change counts as recent. */
export const PLACES_DAYS = 30;

/** How long the walk, and describing the repositories, may take before what came so far is used. */
const WALK_MS = 6_000;
const DESCRIBE_MS = 10_000;
/** How many places are offered. */
const MAX_PLACES = 24;
/** How long a walk is reused before the disk is walked again. */
const FRESH_MS = 10 * 60 * 1000;

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
  /** Files changed there lately (plain folders; a repository's changes are git's). */
  files: number;
  /** When something there last changed, as far as was seen (ms), or 0. */
  changed: number;
}

/** What the walk saw of a place, kept for the reading: never sent to the page. */
export interface PlaceDetail extends Place {
  /** The newest files, by name relative to the place, with their times. */
  recent: { name: string; at: number }[];
  /** Files lately by kind (extension), and by the folder right under the place. */
  kinds: Record<string, number>;
  folders: Record<string, number>;
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
    lately * 6 +
    (place.kind === "repo" ? 1 : 0)
  );
}

/**
 * The places from what the walk found and where the person worked with AI tools, the busiest first.
 * A folder they keep out stays on the list, so the screen can show it left out; nothing in it was
 * looked at.
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
): PlaceDetail[] {
  const byPath = new Map<string, PlaceDetail>();
  for (const line of lines) {
    if (line.type !== "group") continue;
    const found: Group = line.group;
    if (isExcluded(found.path, excludes) || isNoise(found.path)) continue;
    byPath.set(found.path, {
      path: found.path,
      name: folderName(found.path),
      kind: found.kind,
      sessions: 0,
      tools: [],
      files: found.files,
      changed: found.changed,
      recent: found.recent,
      kinds: found.kinds,
      folders: found.folders,
    });
  }
  const seen = new Map(
    lines.flatMap((line) =>
      line.type === "ai" ? [[line.path, line] as const] : [],
    ),
  );
  for (const folder of withAi) {
    const known = byPath.get(folder.path);
    if (known) {
      known.sessions = folder.sessions;
      known.tools = folder.tools;
      continue;
    }
    const looked = seen.get(folder.path);
    const out = isExcluded(folder.path, excludes);
    // A folder gone from the disk is not offered; one not looked at in time still is, by its records.
    if (looked && !looked.exists && !out) continue;
    byPath.set(folder.path, {
      path: folder.path,
      name: folder.name,
      kind: looked?.repo ? "repo" : "folder",
      sessions: folder.sessions,
      tools: folder.tools,
      files: 0,
      changed: looked?.changed ?? 0,
      recent: [],
      kinds: {},
      folders: {},
    });
  }
  const home = homedir();
  return (
    [...byPath.values()]
      // The home folder as a whole is not a place of work: what is in it is found where it is.
      .filter((place) => place.path !== home && placeScore(place, now) > 0.5)
      .sort((a, b) => placeScore(b, now) - placeScore(a, now))
      .slice(0, MAX_PLACES)
  );
}

let cached: { at: number; value: Promise<PlaceDetail[]> } | undefined;

/**
 * The places where the person's work lives, the busiest first, each with what the walk saw. The
 * walk is reused for a few minutes, so the screen and the reading that follows it walk once.
 */
export function findPlaces(
  options: { fresh?: boolean } = {},
): Promise<PlaceDetail[]> {
  if (!options.fresh && cached && Date.now() - cached.at < FRESH_MS)
    return cached.value;
  const value = computePlaces().catch(() => [] as PlaceDetail[]);
  cached = { at: Date.now(), value };
  return value;
}

async function computePlaces(now = Date.now()): Promise<PlaceDetail[]> {
  const since = now - PLACES_DAYS * DAY;
  const excludes = loadExcludes();
  const withAi = await recentFolders(since, 40).catch(() => []);
  const lines = await runWalker(
    {
      mode: "walk",
      since,
      excludes,
      roots: workRoots(),
      ai: withAi.map((folder) => folder.path),
    },
    WALK_MS,
  );
  return rankPlaces(lines, withAi, excludes, now);
}

/** A place as the page shows it: what the walk saw beyond that stays on the server. */
export function publicPlace(place: PlaceDetail): Place {
  const { recent: _r, kinds: _k, folders: _f, ...rest } = place;
  return { ...rest, shown: shown(place.path) };
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
      line.type === "repo" ? [[line.path, line.lines] as const] : [],
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
