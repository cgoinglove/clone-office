// What a piece of work changed in its folder, for the clone to tell its person plainly: each file
// whose content is not what it was before the work ran (git's own count of lines added and removed
// against the last commit beside it), each new file, each file put back as committed, and each file
// removed. Only in a git repository; elsewhere nothing is said rather than guessed.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export interface Snapshot {
  /** The repository's own folder, which the paths are relative to. */
  top: string;
  /** Each file that differs from the last commit or is new, by a hash of what it holds now. */
  files: Map<string, string>;
  /** Per file, git's "added removed" against the last commit, as it stood. */
  counts: Map<string, string>;
  untracked: Set<string>;
}

/** A file the work deleted that the last commit has. */
const GONE = "gone";

function git(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });
}

const lines = (text: string | undefined) =>
  (text ?? "").split("\n").filter(Boolean);

async function contentOf(top: string, path: string): Promise<string> {
  try {
    return createHash("sha256")
      .update(await readFile(join(top, path)))
      .digest("hex");
  } catch {
    return GONE;
  }
}

/** The folder's changes as they stand, or nothing when it is not a git repository. */
export async function snapshot(cwd: string): Promise<Snapshot | undefined> {
  const top = (await git(cwd, ["rev-parse", "--show-toplevel"]))?.trim();
  if (!top) return undefined;
  // A repository with no commit yet has no HEAD: its changes are what is staged.
  const head = (await git(top, ["rev-parse", "--verify", "-q", "HEAD"]))
    ? ["HEAD"]
    : ["--cached"];
  const numstat = (await git(top, ["diff", "--numstat", ...head])) ?? "";
  const counts = new Map<string, string>();
  for (const line of lines(numstat)) {
    const [added, removed, ...path] = line.split("\t");
    if (path.length) counts.set(path.join("\t"), `${added} ${removed}`);
  }
  const changed = lines(
    await git(top, ["diff", "--name-only", "--no-renames", ...head]),
  );
  const untracked = new Set(
    lines(await git(top, ["ls-files", "--others", "--exclude-standard"])),
  );
  const files = new Map<string, string>();
  for (const path of [...changed, ...untracked])
    files.set(path, await contentOf(top, path));
  return { top, files, counts, untracked };
}

/**
 * Each file the work changed since `before`: "path (+added −removed)", "path (new)", "path (as
 * committed again)", "path (removed)" or "path (binary)".
 */
export function changedSince(before: Snapshot, after: Snapshot): string[] {
  const out: string[] = [];
  const paths = new Set([...before.files.keys(), ...after.files.keys()]);
  for (const path of [...paths].sort()) {
    const was = before.files.get(path);
    const now = after.files.get(path);
    if (was === now) continue;
    if (now === undefined)
      out.push(
        before.untracked.has(path)
          ? `${path} (removed)`
          : `${path} (as committed again)`,
      );
    else if (now === GONE) out.push(`${path} (removed)`);
    else if (after.untracked.has(path))
      out.push(
        before.untracked.has(path) ? `${path} (changed)` : `${path} (new)`,
      );
    else {
      const [added, removed] = (after.counts.get(path) ?? "").split(" ");
      out.push(
        added === "-"
          ? `${path} (binary)`
          : added === undefined || removed === undefined
            ? `${path} (changed)`
            : `${path} (+${added} −${removed})`,
      );
    }
  }
  return out;
}
