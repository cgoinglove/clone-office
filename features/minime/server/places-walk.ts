// The part of finding where the person's work lives (places.ts) that touches their folders, run as
// a process of its own: on macOS, opening the desktop, documents or downloads folder waits for the
// person to answer a consent dialog, and a wait like that inside the app's server would hold one of
// the few threads every file read shares, and with a few of them the whole app. Here, the app gives
// this process a job on stdin, reads what it finds line by line on stdout, and ends it when its
// time is up, keeping what came so far (each folder is said as soon as it is read). Nothing here
// opens a file but a repository's own: git's records of it (the end of its reflog, a worktree's
// pointer), its README and its manifest; the rest is names, sizes and times.
//
// Node runs this file as is in development; the package bundles it (dist/places-walk.mjs).

import { execFile } from "node:child_process";
import type { Dir, Dirent } from "node:fs";
import { open, opendir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, resolve, sep } from "node:path";
import { createInterface } from "node:readline";
import { isExcluded } from "./exclude.ts";
import { minimeHome } from "./paths.ts";

/** The clone's own folder, wherever it was put: never read as the person's work. */
function isOwn(path: string): boolean {
  const own = minimeHome();
  return path === own || path.startsWith(own + sep);
}

/** Folders under a top folder the walk goes into, the top folder being the first. */
const MAX_DEPTH = 4;
/** Names read from one folder; past this the rest of it is not looked at. */
const MAX_ENTRIES_PER_FOLDER = 1_000;
/** Files looked at (their size and time) in one folder; a folder of a million photos costs this. */
const MAX_FILES_PER_FOLDER = 300;
/** Names read in all, shared out among the top folders that are there. */
const MAX_ENTRIES = 40_000;
/** Recent file names kept per folder, newest first. */
const KEEP_RECENT = 12;
/** The most of a repository's file list read: enough for its shape, bounded for a huge one. */
const LISTING_BYTES = 2 * 1024 * 1024;
/** The end of a repository's reflog read to count what happened there lately. */
const REFLOG_BYTES = 256 * 1024;

/** Names never entered: what a package manager, a build or an app fills, and system folders. */
const SKIP = new Set(
  [
    "node_modules",
    "bower_components",
    "vendor",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    "__pycache__",
    "venv",
    "env",
    "Pods",
    "DerivedData",
    "Library",
    "Applications",
    "AppData",
    "System Volume Information",
    "$RECYCLE.BIN",
    "site-packages",
    "Caches",
  ].map((name) => name.toLowerCase()),
);

/** Folders that are one thing to an app (a photo library, an app), never walked into. */
const BUNDLES =
  /\.(app|photoslibrary|musiclibrary|tvlibrary|imovielibrary|fcpbundle|lrlibrary|lrdata|bundle|framework|xcodeproj|xcworkspace|pkg)$/i;

/** File names that say what they hold too plainly to show anyone: keys and secrets. */
const SECRET_NAME =
  /\.(pem|key|p12|pfx|kdbx|keychain(-db)?|ovpn|env)$|^id_(rsa|dsa|ecdsa|ed25519)|passw(or)?d|secret|credential/i;

/** The files changed lately right inside one folder (not in its subfolders), as the walk saw them. */
export interface DirChanges {
  path: string;
  files: number;
  changed: number;
  /** The newest, by name, with their times. */
  recent: { name: string; at: number }[];
  /** By kind (extension). */
  kinds: Record<string, number>;
}

/** A job for this process: walk the work folders, or describe repositories. */
export type WalkJob =
  | {
      mode: "walk";
      since: number;
      excludes: string[];
      roots: string[];
      /** Folders the person worked in with AI tools: which repository holds each, and when it changed. */
      ai: string[];
      /** How long the walk may take, shared out among the top folders; the app ends it at its own deadline. */
      ms?: number;
    }
  | { mode: "describe"; since: number; repos: string[] };

/** One line this process writes. */
export type WalkLine =
  /** A folder's own files changed lately, said as soon as it is read, so a walk cut short keeps it. */
  | { type: "dir"; dir: DirChanges }
  /** A repository that changed lately: when, and how much happened there (its reflog's entries). */
  | { type: "repo"; path: string; changed: number; activity: number }
  | {
      type: "ai";
      path: string;
      exists: boolean;
      /** The repository it lies in (or is), if any, never the home folder or a work folder itself. */
      repo: string | null;
      changed: number;
      activity: number;
    }
  | { type: "denied"; root: string }
  | { type: "cut"; root: string }
  | { type: "described"; path: string; lines: string[] };

const say = (line: WalkLine) =>
  process.stdout.write(`${JSON.stringify(line)}\n`);

/**
 * Where a repository keeps its own files: its .git folder, or, for a worktree or a submodule whose
 * .git is a file, the folder that file names. Nothing when the folder is not a repository.
 */
export async function gitDirOf(path: string): Promise<string | null> {
  const dot = join(path, ".git");
  const info = await stat(dot).catch(() => undefined);
  if (!info) return null;
  if (info.isDirectory()) return dot;
  if (!info.isFile() || info.size > 4096) return null;
  const text = await readFile(dot, "utf8").catch(() => "");
  const named = /^gitdir:\s*(.+)$/m.exec(text)?.[1]?.trim();
  if (!named) return null;
  return isAbsolute(named) ? named : resolve(path, named);
}

/** When git last touched a repository, cheaply: its index, its HEAD's log, its last fetch. */
async function gitChanged(gitDir: string): Promise<number> {
  const times = await Promise.all(
    ["index", join("logs", "HEAD"), "FETCH_HEAD"].map((file) =>
      stat(join(gitDir, file)).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    ),
  );
  return Math.max(0, ...times);
}

/**
 * How much happened in a repository since a time: the entries of its HEAD's reflog (commits,
 * checkouts, pulls, rebases) from then on, read from the end of the log only, so a long history
 * costs no more than a short one.
 */
export async function gitActivity(
  gitDir: string,
  since: number,
): Promise<number> {
  const file = await open(join(gitDir, "logs", "HEAD"), "r").catch(
    () => undefined,
  );
  if (!file) return 0;
  try {
    const { size } = await file.stat();
    const length = Math.min(size, REFLOG_BYTES);
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, size - length);
    const lines = buffer.toString("utf8").split("\n");
    // The first line may be cut by where the read began.
    if (length < size) lines.shift();
    const after = since / 1000;
    let count = 0;
    for (const line of lines) {
      const at = Number(/> (\d{9,11}) [+-]\d{4}\t/.exec(line)?.[1]);
      if (at >= after) count += 1;
    }
    return count;
  } catch {
    return 0;
  } finally {
    await file.close().catch(() => undefined);
  }
}

/**
 * Walks one work folder within its share of names and of time, nearest folders first: each folder's
 * own changed files are said as soon as it is read, and a repository is said as one thing, never
 * walked into (git says what happened there). How the folders make places is the app's to decide
 * (places.ts), from all of it at once.
 */
async function walkRoot(
  root: string,
  job: Extract<WalkJob, { mode: "walk" }>,
  share: { entries: number; until: number },
): Promise<number> {
  let used = 0;
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }];
  while (queue.length) {
    if (used > share.entries || Date.now() > share.until) {
      say({ type: "cut", root });
      break;
    }
    const { path, depth } = queue.shift() as { path: string; depth: number };
    used += 1;
    if (depth > 0) {
      const gitDir = await gitDirOf(path);
      if (gitDir) {
        const changed = await gitChanged(gitDir);
        if (changed >= job.since)
          say({
            type: "repo",
            path,
            changed,
            activity: await gitActivity(gitDir, job.since),
          });
        continue;
      }
    }
    let dir: Dir;
    try {
      dir = await opendir(path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (depth === 0 && (code === "EPERM" || code === "EACCES"))
        say({ type: "denied", root });
      continue;
    }
    const seen: Dirent[] = [];
    // One entry at a time up to the bound, so a folder of a million files costs no more than one of
    // a thousand.
    try {
      for (let at = 0; at < MAX_ENTRIES_PER_FOLDER; at++) {
        const entry = await dir.read();
        if (!entry) break;
        seen.push(entry);
      }
    } catch {
      // A folder that stops answering midway keeps what was read.
    } finally {
      await dir.close().catch(() => undefined);
    }
    used += seen.length;
    const own: DirChanges = {
      path,
      files: 0,
      changed: 0,
      recent: [],
      kinds: {},
    };
    let looked = 0;
    for (const entry of seen) {
      const name = entry.name;
      if (name.startsWith(".") || name.startsWith("~$")) continue;
      const full = join(path, name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (
          depth + 1 >= MAX_DEPTH ||
          SKIP.has(name.toLowerCase()) ||
          BUNDLES.test(name) ||
          isOwn(full) ||
          isExcluded(full, job.excludes)
        )
          continue;
        queue.push({ path: full, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile() || SECRET_NAME.test(name)) continue;
      if (looked >= MAX_FILES_PER_FOLDER) continue;
      looked += 1;
      const info = await stat(full).catch(() => undefined);
      if (!info || info.mtimeMs < job.since) continue;
      own.files += 1;
      own.changed = Math.max(own.changed, info.mtimeMs);
      const kind = extname(name).slice(1).toLowerCase() || "(none)";
      own.kinds[kind] = (own.kinds[kind] ?? 0) + 1;
      own.recent.push({ name, at: info.mtimeMs });
    }
    if (own.files) {
      own.recent.sort((a, b) => b.at - a.at);
      own.recent.length = Math.min(own.recent.length, KEEP_RECENT);
      say({ type: "dir", dir: own });
    }
  }
  return used;
}

/** The folders that ask the person before an app reads them (macOS), read last. */
function asksFirst(path: string, home = homedir()): boolean {
  if (process.platform !== "darwin") return false;
  return ["Desktop", "Documents", "Downloads"].some(
    (name) =>
      path === join(home, name) || path.startsWith(join(home, name) + sep),
  );
}

/**
 * The repository a folder lies in, looking up from it to just below the home folder and the work
 * folders (a home folder or a Documents folder kept in git holds a person's whole life, not one
 * piece of work).
 */
async function repoOf(
  path: string,
  stops: Set<string>,
): Promise<string | null> {
  for (let at = path; !stops.has(at); ) {
    if (await gitDirOf(at)) return at;
    const up = dirname(at);
    if (up === at) break;
    at = up;
  }
  return null;
}

async function walk(job: Extract<WalkJob, { mode: "walk" }>): Promise<void> {
  const started = Date.now();
  const deadline = started + (job.ms ?? 5_000);
  const stops = new Set([homedir(), ...job.roots]);
  // What cannot make anyone wait goes first, so a consent dialog left unanswered costs only the
  // folders behind it.
  const [early, late] = [false, true].map((asks) =>
    job.ai.filter((path) => asksFirst(path) === asks),
  );
  const aiFolder = async (path: string) => {
    if (isExcluded(path, job.excludes)) {
      say({
        type: "ai",
        path,
        exists: true,
        repo: null,
        changed: 0,
        activity: 0,
      });
      return;
    }
    const info = await stat(path).catch(() => undefined);
    const repo = info?.isDirectory() ? await repoOf(path, stops) : null;
    const gitDir = repo ? await gitDirOf(repo) : null;
    say({
      type: "ai",
      path,
      exists: Boolean(info?.isDirectory()),
      repo,
      changed: gitDir ? await gitChanged(gitDir) : 0,
      activity: gitDir ? await gitActivity(gitDir, job.since) : 0,
    });
  };
  for (const path of early) await aiFolder(path);
  // Only the work folders that are there share the walk, the waiting ones last.
  const there: string[] = [];
  for (const root of [...new Set(job.roots)]) {
    const info = await stat(root).catch(() => undefined);
    if (info?.isDirectory() && !isExcluded(root, job.excludes))
      there.push(root);
  }
  const ordered = [
    ...there.filter((root) => !asksFirst(root)),
    ...there.filter((root) => asksFirst(root)),
  ];
  let entries = MAX_ENTRIES;
  for (const [index, root] of ordered.entries()) {
    if (index === there.filter((one) => !asksFirst(one)).length)
      for (const path of late) await aiFolder(path);
    // Each top folder its share of what is left, so one huge folder never starves the rest.
    const left = ordered.length - index;
    entries -= await walkRoot(root, job, {
      entries: entries / left,
      until: Date.now() + Math.max(0, deadline - Date.now()) / left,
    });
  }
  if (ordered.every((root) => !asksFirst(root)))
    for (const path of late) await aiFolder(path);
}

// ---- What a repository is ----

function git(
  args: string[],
  cwd: string,
  timeout = 4000,
  maxBuffer = 1024 * 1024,
) {
  return new Promise<string>((resolve) => {
    execFile(
      "git",
      args,
      { cwd, encoding: "utf8", timeout, maxBuffer, windowsHide: true },
      // A listing cut at the buffer's end still says what is at the top of the repository.
      (_error, stdout) => resolve(stdout ?? ""),
    );
  });
}

/** A remote's address with any name or password in it taken out: host and path only. */
export function plainRemote(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const scp = /^[^@\s]+@([^:\s]+):(.+)$/.exec(trimmed);
  if (scp) return `${scp[1]}/${scp[2].replace(/\.git$/, "")}`;
  try {
    const parsed = new URL(trimmed);
    return `${parsed.host}${parsed.pathname.replace(/\.git$/, "")}`;
  } catch {
    return "";
  }
}

/** The opening of a README: its title and first lines of prose, without badges, pictures or markup. */
export function readmeHead(text: string, max = 500): string {
  const lines = text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/<[^>]*>/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/[*_`]{1,3}/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line && !/^(\||---|===|\[)/.test(line));
  let out = "";
  for (const line of lines) {
    const next = `${out}${out ? " " : ""}${line.replace(/^#+\s*/, "")}`;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** A manifest's few lines: what the project calls itself and what it is built on. */
async function manifest(path: string): Promise<string> {
  const pkg = await readFile(join(path, "package.json"), "utf8").catch(
    () => "",
  );
  if (pkg) {
    try {
      const data = JSON.parse(pkg) as {
        name?: string;
        description?: string;
        dependencies?: Record<string, string>;
      };
      const deps = Object.keys(data.dependencies ?? {}).slice(0, 14);
      return [
        data.name && `package ${data.name}`,
        data.description && `"${String(data.description).slice(0, 160)}"`,
        deps.length && `built on ${deps.join(", ")}`,
      ]
        .filter(Boolean)
        .join(" · ");
    } catch {
      return "";
    }
  }
  for (const [file, pattern] of [
    ["pyproject.toml", /^(name|description)\s*=\s*"([^"]{1,160})"/gm],
    ["Cargo.toml", /^(name|description)\s*=\s*"([^"]{1,160})"/gm],
    ["go.mod", /^(module)\s+(\S+)/gm],
  ] as const) {
    const text = await readFile(join(path, file), "utf8").catch(() => "");
    if (!text) continue;
    const found = [...text.slice(0, 4000).matchAll(pattern)].map(
      (match) => `${match[1]} ${match[2]}`,
    );
    if (found.length) return `${file}: ${found.slice(0, 3).join(" · ")}`;
  }
  return "";
}

const top = (counts: Record<string, number>, n: number) =>
  Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([name, count]) => `${name} ${count}`)
    .join(", ");

/** What a repository is and how it is laid out, from git and its own README and manifest. */
async function describeRepo(
  path: string,
  since: number,
  days: number,
): Promise<string[]> {
  const [remote, last, count, listing, readme, made] = await Promise.all([
    git(["remote", "get-url", "origin"], path),
    git(["log", "-1", "--format=%cd", "--date=short"], path),
    git(
      [
        "rev-list",
        "--count",
        `--since=${new Date(since).toISOString()}`,
        "HEAD",
      ],
      path,
    ),
    git(["ls-files", "-z"], path, 6000, LISTING_BYTES),
    (async () => {
      for (const name of ["README.md", "readme.md", "README", "README.txt"]) {
        const text = await readFile(join(path, name), "utf8").catch(() => "");
        if (text) return readmeHead(text.slice(0, 6000));
      }
      return "";
    })(),
    manifest(path),
  ]);
  // A listing cut at its buffer ends partway through a name: that one is dropped and counted as more.
  const cut = listing.length >= LISTING_BYTES - 1024;
  const files = listing.split("\0").filter(Boolean);
  if (cut) files.pop();
  const tops: Record<string, number> = {};
  const kinds: Record<string, number> = {};
  for (const file of files) {
    const parts = file.split("/");
    const head = parts.length > 1 ? `${parts[0]}/` : parts[0];
    tops[head] = (tops[head] ?? 0) + 1;
    const kind = extname(file).slice(1).toLowerCase();
    if (kind) kinds[kind] = (kinds[kind] ?? 0) + 1;
  }
  return [
    `git repository${remote.trim() ? ` (${plainRemote(remote)})` : ""}; last commit ${last.trim() || "unknown"}; ${Number(count.trim()) || 0} commits in the last ${days} days`,
    made && `- ${made}`,
    readme && `- README: ${readme}`,
    files.length &&
      `- ${files.length}${cut ? "+" : ""} tracked files; at the top: ${top(tops, 12)}`,
    Object.keys(kinds).length && `- by kind: ${top(kinds, 8)}`,
  ].filter((line): line is string => Boolean(line));
}

async function describe(
  job: Extract<WalkJob, { mode: "describe" }>,
): Promise<void> {
  const days = Math.max(1, Math.round((Date.now() - job.since) / 86_400_000));
  // What cannot make anyone wait first, as in the walk.
  const repos = [...job.repos].sort(
    (a, b) => Number(asksFirst(a)) - Number(asksFirst(b)),
  );
  for (const path of repos)
    say({
      type: "described",
      path,
      lines: await describeRepo(path, job.since, days).catch(() => []),
    });
}

async function main(): Promise<void> {
  const lines: string[] = [];
  for await (const line of createInterface({ input: process.stdin }))
    lines.push(line);
  const job = JSON.parse(lines.join("\n")) as WalkJob;
  if (job.mode === "walk") await walk(job);
  else await describe(job);
}

// Run as a process of its own; imported (by the tests), it only lends its helpers.
if (process.argv[1] && /places-walk\.(ts|mjs)$/.test(process.argv[1]))
  main().then(
    () => process.exit(0),
    () => process.exit(1),
  );
