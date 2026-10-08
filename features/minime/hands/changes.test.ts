import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { changedSince, snapshot } from "./changes.ts";

const root = mkdtempSync(join(tmpdir(), "clone-changes-"));
after(() => rmSync(root, { recursive: true, force: true }));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, ...args], { stdio: "pipe" });

test("what a piece of work changed: by what each file holds, not only git's counts", async () => {
  const repo = join(root, "repo");
  execFileSync("git", ["init", "-q", repo]);
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "user.name", "Test");
  writeFileSync(join(repo, "a.ts"), "one\ntwo\n");
  writeFileSync(join(repo, "b.ts"), "keep\n");
  writeFileSync(join(repo, "c.ts"), "same\n");
  writeFileSync(join(repo, "gone.ts"), "bye\n");
  git(repo, "add", ".");
  git(repo, "commit", "-qm", "start");
  // Changed before the work: the person's own, not the work's doing unless it changes them again.
  writeFileSync(join(repo, "b.ts"), "keep\nmine\n");
  writeFileSync(join(repo, "c.ts"), "theirs\n");
  writeFileSync(join(repo, "draft.md"), "mine\n");
  writeFileSync(join(repo, "notes.md"), "scratch\n");

  const before = await snapshot(join(repo));
  assert.ok(before);
  writeFileSync(join(repo, "a.ts"), "one\n2\nthree\n");
  // The same counts as before (+1 −1), a different line: still the work's.
  writeFileSync(join(repo, "c.ts"), "other\n");
  // Put back as committed.
  writeFileSync(join(repo, "b.ts"), "keep\n");
  unlinkSync(join(repo, "gone.ts"));
  unlinkSync(join(repo, "notes.md"));
  writeFileSync(join(repo, "new.ts"), "new\n");
  const now = await snapshot(repo);
  assert.ok(now);
  assert.deepEqual(changedSince(before, now), [
    "a.ts (+2 −1)",
    "b.ts (as committed again)",
    "c.ts (+1 −1)",
    "gone.ts (removed)",
    "new.ts (new)",
    "notes.md (removed)",
  ]);
});

test("paths are the repository's, from a folder inside it too; outside git nothing is said", async () => {
  const repo = join(root, "repo");
  mkdirSync(join(repo, "web"), { recursive: true });
  const inner = await snapshot(join(repo, "web"));
  assert.equal(inner?.top.endsWith("repo"), true);
  const plain = join(root, "plain");
  mkdirSync(plain, { recursive: true });
  assert.equal(await snapshot(plain), undefined);
});
