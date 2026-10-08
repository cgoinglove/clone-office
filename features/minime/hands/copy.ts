// A separate copy of one of the person's projects, for work that runs with nobody to ask before each
// change (a Codex conversation, sandboxed to the copy: hands/codex.ts). The copy holds the project's
// files as they are now (tracked, and new ones git does not ignore; never in folders the person
// left out) in a git repository of its own, so the person's own repository and files are never
// written to while the work runs. What the work changed is one patch, shown to the person before it
// touches their folder, and applied there only if every file it touches is still as it was copied
// (`git apply --check`). Line endings and filters follow the person's repository, so the patch is
// the one `git diff` would make there.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { constants, existsSync } from "node:fs";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { isExcluded } from "../server/exclude.ts";
import { mapLimit } from "../server/sources/lines.ts";

/** More than this is not copied: the work is refused rather than filling the disk. */
const MAX_FILES = 100_000;
const MAX_BYTES = 1024 ** 3;
/** A copy left behind (the app stopped while it worked) is removed after a day. */
const STALE_MS = 24 * 60 * 60 * 1000;

export class CopyError extends Error {
  readonly reason: "not-git" | "too-big" | "git";
  constructor(reason: "not-git" | "too-big" | "git", message: string) {
    super(message);
    this.reason = reason;
  }
}

interface GitResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

/** Git as the person has it, never pointed elsewhere by this process's environment. */
function git(
  args: string[],
  cwd: string,
  input?: string | Buffer,
  env: Record<string, string> = {},
): Promise<GitResult> {
  const base = { ...process.env };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"])
    delete base[key];
  return new Promise((done) => {
    let settled = false;
    const finish = (result: GitResult) => {
      if (settled) return;
      settled = true;
      done(result);
    };
    const child = spawn("git", args, {
      cwd,
      env: {
        ...base,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const out: Buffer[] = [];
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      finish({ code: -1, stdout: Buffer.alloc(0), stderr: error.message }),
    );
    child.on("close", (code) =>
      finish({ code: code ?? -1, stdout: Buffer.concat(out), stderr }),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(input ?? "");
  });
}

const text = (result: GitResult) => result.stdout.toString("utf8").trim();

/** The top of the git repository a folder is in, or nothing when it is not in one. */
async function repoRoot(folder: string): Promise<string | undefined> {
  const found = await git(["rev-parse", "--show-toplevel"], folder);
  return found.code === 0 && text(found) ? resolve(text(found)) : undefined;
}

export interface WorkCopy {
  /** The copy's own folder, the only place the work may change. */
  dir: string;
  /** The person's repository it was copied from. */
  root: string;
  /** Where in the copy the conversation's own folder is. */
  cwd: string;
  /** The copy as it was made, as a git tree. */
  base: string;
}

export interface Changes {
  /** What changed, as `git apply` takes it (bytes, so no file's encoding is touched). */
  patch: Buffer;
  /** Each file and how: M changed, A added, D deleted. */
  changed: { status: string; path: string }[];
}

const workRoot = (home: string) => join(home, "hands", "work");

async function sweep(home: string): Promise<void> {
  const root = workRoot(home);
  const names = await readdir(root).catch(() => [] as string[]);
  for (const name of names) {
    const path = join(root, name);
    const info = await stat(path).catch(() => undefined);
    if (info && Date.now() - info.mtimeMs > STALE_MS)
      await rm(path, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Copy the repository `cwd` is in, as it is now, into a folder of the clone's own (copy-on-write
 * where the disk can). Files in folders the person left out are not copied.
 */
export async function makeWorkCopy(
  cwd: string,
  options: { home: string; excludes: readonly string[] },
): Promise<WorkCopy> {
  const root = await repoRoot(cwd);
  if (!root)
    throw new CopyError("not-git", `${cwd} is not in a git repository.`);
  await sweep(options.home);
  const listed = await git(
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    root,
  );
  if (listed.code !== 0)
    throw new CopyError("git", listed.stderr.trim() || "git ls-files failed.");
  const paths = [
    ...new Set(listed.stdout.toString("utf8").split("\0").filter(Boolean)),
  ].filter((path) => !isExcluded(join(root, path), options.excludes));
  if (paths.length > MAX_FILES)
    throw new CopyError(
      "too-big",
      `${root} has ${paths.length} files; at most ${MAX_FILES} are copied.`,
    );
  // Deleted in the folder but not yet in git, or a submodule (a folder): not copied.
  const entries = (
    await mapLimit(paths, 32, async (path) => {
      const info = await lstat(join(root, path)).catch(() => undefined);
      return info && (info.isFile() || info.isSymbolicLink())
        ? { path, info }
        : undefined;
    })
  ).filter((entry) => entry !== undefined);
  const bytes = entries.reduce(
    (sum, { info }) => sum + (info.isFile() ? info.size : 0),
    0,
  );
  if (bytes > MAX_BYTES)
    throw new CopyError(
      "too-big",
      `${root} holds more than ${MAX_BYTES / 1024 ** 3} GB of files.`,
    );
  const dir = join(
    workRoot(options.home),
    `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    const copied = await mapLimit(entries, 32, async ({ path, info }) => {
      const from = join(root, path);
      const to = join(dir, path);
      await mkdir(dirname(to), { recursive: true });
      if (info.isSymbolicLink()) {
        try {
          await symlink(await readlink(from), to);
          return path;
        } catch {
          // A link this computer will not make (Windows without the right): left out.
          return undefined;
        }
      }
      await copyFile(from, to, constants.COPYFILE_FICLONE);
      await chmod(to, info.mode & 0o777);
      return path;
    });
    const kept = copied.filter((path): path is string => Boolean(path));
    const init = await git(["init", "-q", "--template="], dir);
    if (init.code !== 0) throw new CopyError("git", init.stderr.trim());
    // Line endings as the person's repository has them, so the copy's patch applies there.
    for (const key of ["core.autocrlf", "core.eol"]) {
      const value = text(await git(["config", "--get", key], root));
      if (value) await git(["config", key, value], dir);
    }
    // Its own attributes and ignore list too: what the person ignores only in .git/info/exclude
    // (build output, a local .env) must not come back in the patch as new files.
    for (const name of ["attributes", "exclude"]) {
      const gitPath = text(
        await git(["rev-parse", "--git-path", `info/${name}`], root),
      );
      const from = gitPath ? resolve(root, gitPath) : "";
      if (from && existsSync(from)) {
        await mkdir(join(dir, ".git", "info"), { recursive: true });
        await copyFile(from, join(dir, ".git", "info", name));
      }
    }
    if (kept.length) {
      // Every copied file, tracked ones git would otherwise ignore included.
      const added = await git(
        [...SAFE, "add", "-f", "--pathspec-from-file=-", "--pathspec-file-nul"],
        dir,
        kept.join("\0"),
        { GIT_LITERAL_PATHSPECS: "1" },
      );
      if (added.code !== 0) throw new CopyError("git", added.stderr.trim());
    }
    const base = await git(["write-tree"], dir);
    if (base.code !== 0) throw new CopyError("git", base.stderr.trim());
    // Git names the top by its real path (/private/var, not /var), so the folder is compared so too.
    const at = relative(root, await realpath(cwd).catch(() => resolve(cwd)));
    const here = at && !at.startsWith("..") ? join(dir, at) : dir;
    // A folder holding only what git ignores or what was left out has nothing copied into it, but
    // the work still starts there.
    await mkdir(here, { recursive: true });
    return { dir, root, cwd: here, base: text(base) };
  } catch (error) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

/** Options for git in the copy: no warnings that stop an add, no monitor process of the person's. */
const SAFE = ["-c", "core.safecrlf=false", "-c", "core.fsmonitor=false"];

/** What the work changed in the copy since it was made. */
export async function changesIn(copy: WorkCopy): Promise<Changes> {
  const added = await git([...SAFE, "add", "-A"], copy.dir);
  if (added.code !== 0) throw new CopyError("git", added.stderr.trim());
  const tree = await git(["write-tree"], copy.dir);
  if (tree.code !== 0) throw new CopyError("git", tree.stderr.trim());
  const now = text(tree);
  if (now === copy.base) return { patch: Buffer.alloc(0), changed: [] };
  const patch = await git(
    ["diff-tree", "-r", "-p", "--binary", copy.base, now],
    copy.dir,
  );
  const names = await git(
    ["diff-tree", "-r", "--name-status", "-z", copy.base, now],
    copy.dir,
  );
  if (patch.code !== 0 || names.code !== 0)
    throw new CopyError("git", (patch.stderr || names.stderr).trim());
  const parts = names.stdout.toString("utf8").split("\0").filter(Boolean);
  const changed: { status: string; path: string }[] = [];
  for (let i = 0; i + 1 < parts.length; i += 2)
    changed.push({ status: parts[i], path: parts[i + 1] });
  return { patch: patch.stdout, changed };
}

/**
 * Apply the changes to the person's repository, all or none: first checked against the files as
 * they are now, so a file they changed since the copy was made stops it with nothing applied.
 */
export async function applyChanges(
  root: string,
  patch: Buffer,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const args = ["apply", "--binary", "--whitespace=nowarn"];
  const check = await git([...args, "--check", "-"], root, patch);
  if (check.code !== 0)
    return { ok: false, error: check.stderr.trim() || "git apply --check" };
  const applied = await git([...args, "-"], root, patch);
  return applied.code === 0
    ? { ok: true }
    : { ok: false, error: applied.stderr.trim() || "git apply" };
}

/** Remove a copy once it was decided on; only ever one of the clone's own copies. */
export async function removeWorkCopy(
  copy: WorkCopy,
  home: string,
): Promise<void> {
  const within = relative(workRoot(home), copy.dir);
  if (!within || within.startsWith("..") || isAbsolute(within)) return;
  await rm(copy.dir, { recursive: true, force: true }).catch(() => {});
}

/** Keep changes that were not applied, so they are not lost: `git apply <file>` applies them later. */
export async function keepPatch(home: string, patch: Buffer): Promise<string> {
  const dir = join(home, "hands", "changes");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(
    dir,
    `${new Date().toISOString().replace(/[:.]/g, "-")}.patch`,
  );
  await writeFile(file, patch, { mode: 0o600 });
  return file;
}
