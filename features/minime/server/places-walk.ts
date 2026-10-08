// The part of finding where the person's work lives (places.ts) that touches their folders, run as
// a process of its own: on macOS, opening the desktop, documents or downloads folder waits for the
// person to answer a consent dialog, and a wait like that inside the app's server would hold one of
// the few threads every file read shares, and with a few of them the whole app. Here, the app gives
// this process a job on stdin, reads what it finds line by line on stdout, and ends it when its
// time is up, keeping what came so far. Nothing here opens a file but a project's own README and
// manifest; the rest is names, sizes and times.
//
// Node runs this file as is in development; the package bundles it (dist/places-walk.mjs).

import { execFile } from "node:child_process";
import type { Dir, Dirent } from "node:fs";
import { opendir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, sep } from "node:path";
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
/** Entries read from one folder; past this the rest of it is not looked at. */
const MAX_ENTRIES_PER_FOLDER = 400;
/** Entries read in all. */
const MAX_ENTRIES = 40_000;
/** Recent file names kept per place, newest first. */
const KEEP_RECENT = 12;
/** The most of a repository's file list read: enough for its shape, bounded for a huge one. */
const LISTING_BYTES = 2 * 1024 * 1024;

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

/** What changed lately in one place, as the walk saw it. */
export interface Group {
  path: string;
  kind: "repo" | "folder";
  files: number;
  changed: number;
  recent: { name: string; at: number }[];
  kinds: Record<string, number>;
  folders: Record<string, number>;
}

/** A job for this process: walk the work folders, or describe repositories. */
export type WalkJob =
  | {
      mode: "walk";
      since: number;
      excludes: string[];
      roots: string[];
      /** Folders the person worked in with AI tools: is each a repository, and when did it change. */
      ai: string[];
    }
  | { mode: "describe"; since: number; repos: string[] };

/** One line this process writes. */
export type WalkLine =
  | { type: "group"; group: Group }
  | {
      type: "ai";
      path: string;
      exists: boolean;
      repo: boolean;
      changed: number;
    }
  | { type: "denied"; root: string }
  | { type: "cut" }
  | { type: "repo"; path: string; lines: string[] };

const say = (line: WalkLine) =>
  process.stdout.write(`${JSON.stringify(line)}\n`);

/** A place's changes as git sees them, cheaply: the times git last touched it. */
async function repoChanged(path: string): Promise<number> {
  const times = await Promise.all(
    ["index", join("logs", "HEAD"), "FETCH_HEAD"].map((file) =>
      stat(join(path, ".git", file)).then(
        (info) => info.mtimeMs,
        () => 0,
      ),
    ),
  );
  return Math.max(0, ...times);
}

/**
 * Walks one work folder within its bounds and groups what changed lately by place: a repository
 * is its own place, anything else the folder right under the work folder (or the work folder
 * itself for what lies loose in it). Says each place once the folder is done.
 */
async function walkRoot(
  root: string,
  job: Extract<WalkJob, { mode: "walk" }>,
  budget: { entries: number },
): Promise<void> {
  const groups = new Map<string, Group>();
  const group = (path: string, kind: Group["kind"]) => {
    let found = groups.get(path);
    if (!found) {
      found = {
        path,
        kind,
        files: 0,
        changed: 0,
        recent: [],
        kinds: {},
        folders: {},
      };
      groups.set(path, found);
    }
    return found;
  };
  // One folder at a time, nearest first, so a cut walk still holds the top of each place.
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }];
  while (queue.length) {
    if (budget.entries > MAX_ENTRIES) {
      say({ type: "cut" });
      break;
    }
    const { path, depth } = queue.shift() as { path: string; depth: number };
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
    let repo = false;
    // One entry at a time up to the bound, so a folder of a million files costs no more than one of
    // a few hundred.
    try {
      for (let at = 0; at < MAX_ENTRIES_PER_FOLDER; at++) {
        const entry = await dir.read();
        if (!entry) break;
        if (entry.name === ".git") repo = true;
        seen.push(entry);
      }
    } catch {
      // A folder that stops answering midway keeps what was read.
    } finally {
      await dir.close().catch(() => undefined);
    }
    budget.entries += seen.length;
    // A repository is one place, and git says what changed in it.
    if (repo && depth > 0) {
      const changed = await repoChanged(path);
      if (changed >= job.since) {
        const found = group(path, "repo");
        found.changed = Math.max(found.changed, changed);
      }
      continue;
    }
    const rel = relative(root, path).split(sep).filter(Boolean);
    const placePath = rel.length ? join(root, rel[0]) : root;
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
      const info = await stat(full).catch(() => undefined);
      if (!info || info.mtimeMs < job.since) continue;
      const found = group(placePath, "folder");
      found.files += 1;
      found.changed = Math.max(found.changed, info.mtimeMs);
      const kind = extname(name).slice(1).toLowerCase() || "(none)";
      found.kinds[kind] = (found.kinds[kind] ?? 0) + 1;
      const inside = relative(placePath, full).split(sep);
      if (inside.length > 1)
        found.folders[inside[0]] = (found.folders[inside[0]] ?? 0) + 1;
      found.recent.push({ name: inside.join("/"), at: info.mtimeMs });
      if (found.recent.length > KEEP_RECENT * 4) {
        found.recent.sort((a, b) => b.at - a.at);
        found.recent.length = KEEP_RECENT;
      }
    }
  }
  for (const found of groups.values()) {
    found.recent.sort((a, b) => b.at - a.at);
    found.recent.length = Math.min(found.recent.length, KEEP_RECENT);
    say({ type: "group", group: found });
  }
}

/** The folders that ask the person before an app reads them (macOS), read last. */
function asksFirst(path: string, home = homedir()): boolean {
  if (process.platform !== "darwin") return false;
  return ["Desktop", "Documents", "Downloads"].some(
    (name) =>
      path === join(home, name) || path.startsWith(join(home, name) + sep),
  );
}

async function walk(job: Extract<WalkJob, { mode: "walk" }>): Promise<void> {
  const budget = { entries: 0 };
  // What cannot make anyone wait goes first, so a consent dialog left unanswered costs only the
  // folders behind it.
  const [early, late] = [false, true].map((asks) =>
    job.ai.filter((path) => asksFirst(path) === asks),
  );
  const aiFolder = async (path: string) => {
    if (isExcluded(path, job.excludes)) {
      say({ type: "ai", path, exists: true, repo: false, changed: 0 });
      return;
    }
    const info = await stat(path).catch(() => undefined);
    const repo = info
      ? await stat(join(path, ".git")).then(
          () => true,
          () => false,
        )
      : false;
    say({
      type: "ai",
      path,
      exists: Boolean(info?.isDirectory()),
      repo,
      changed: repo ? await repoChanged(path) : 0,
    });
  };
  for (const path of early) await aiFolder(path);
  const roots = [...new Set(job.roots)].sort(
    (a, b) => Number(asksFirst(a)) - Number(asksFirst(b)),
  );
  for (const root of roots) {
    if (asksFirst(root)) continue;
    await walkRoot(root, job, budget);
  }
  for (const path of late) await aiFolder(path);
  for (const root of roots) {
    if (!asksFirst(root)) continue;
    await walkRoot(root, job, budget);
  }
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
      type: "repo",
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
