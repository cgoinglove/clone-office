import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { changedSince, snapshot } from "./changes.ts";

const root = mkdtempSync(join(tmpdir(), "clone-changes-"));
after(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });

test("what a piece of work changed: files whose changes moved, and new files", async () => {
  const repo = join(root, "repo");
  execFileSync("git", ["init", "-q", repo]);
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  writeFileSync(join(repo, "a.ts"), "one\ntwo\n");
  writeFileSync(join(repo, "b.ts"), "keep\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "start");
  // Already changed before the work: not the work's doing.
  writeFileSync(join(repo, "b.ts"), "keep\nmine\n");
  writeFileSync(join(repo, "draft.md"), "mine\n");

  const before = await snapshot(repo);
  assert.ok(before);
  writeFileSync(join(repo, "a.ts"), "one\n2\nthree\n");
  writeFileSync(join(repo, "c.ts"), "new\n");
  const after = await snapshot(repo);
  assert.ok(after);
  assert.deepEqual(changedSince(before, after), [
    "a.ts (+2 −1)",
    "c.ts (new)",
  ]);
});

test("outside a git repository nothing is said", async () => {
  const plain = join(root, "plain");
  execFileSync("mkdir", ["-p", plain]);
  assert.equal(await snapshot(plain), undefined);
});
