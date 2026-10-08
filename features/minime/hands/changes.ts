// What a piece of work changed in its folder, for the clone to tell its person plainly: each file
// whose changes differ from before the work ran, with git's own count of lines added and removed,
// and each new file. Only in a git repository; elsewhere nothing is said rather than guessed.

import { execFile } from "node:child_process";

export interface Snapshot {
  /** Per file, git's "added removed" against the last commit, as it stood. */
  counts: Map<string, string>;
  untracked: Set<string>;
}

function git(cwd: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout) => resolve(error ? undefined : stdout),
    );
  });
}

/** The folder's changes as they stand, or nothing when it is not a git repository. */
export async function snapshot(cwd: string): Promise<Snapshot | undefined> {
  if (
    (await git(cwd, ["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true"
  )
    return undefined;
  // A repository with no commit yet has no HEAD: its changes are what is staged.
  const numstat =
    (await git(cwd, ["diff", "--numstat", "HEAD"])) ??
    (await git(cwd, ["diff", "--numstat", "--cached"])) ??
    "";
  const counts = new Map<string, string>();
  for (const line of numstat.split("\n")) {
    const [added, removed, ...path] = line.split("\t");
    if (path.length) counts.set(path.join("\t"), `${added} ${removed}`);
  }
  const others =
    (await git(cwd, ["ls-files", "--others", "--exclude-standard"])) ?? "";
  return {
    counts,
    untracked: new Set(others.split("\n").filter(Boolean)),
  };
}

/** Each file the work changed since `before`, as "path (+added −removed)" or "path (new)". */
export function changedSince(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = [];
  for (const [path, count] of after.counts) {
    if (before.counts.get(path) === count) continue;
    const [added, removed] = count.split(" ");
    lines.push(
      added === "-" ? `${path} (binary)` : `${path} (+${added} −${removed})`,
    );
  }
  for (const path of after.untracked)
    if (!before.untracked.has(path)) lines.push(`${path} (new)`);
  return lines;
}
