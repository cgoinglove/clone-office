import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-scratch-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a session's scratch folder is its own, named by its id, and only real old session folders are cleaned", async () => {
  const scratch = await import("./scratch.ts");
  assert.throws(() => scratch.scratchDir("../../etc"), /Not a session id/);
  const dir = await scratch.prepareScratch("session-0001");
  assert.equal(dir, join(root, "scratch", "session-0001"));
  if (process.platform !== "win32")
    assert.equal(statSync(dir).mode & 0o777, 0o700, "for its person alone");

  // Last used ten days ago, three days ago, and a link and a stray file that are not sessions'.
  const old = scratch.scratchDir("session-old-01");
  const recent = scratch.scratchDir("session-new-01");
  mkdirSync(old, { recursive: true });
  mkdirSync(recent, { recursive: true });
  writeFileSync(join(old, "a.txt"), "x");
  const outside = mkdtempSync(join(tmpdir(), "minime-scratch-outside-"));
  writeFileSync(join(outside, "keep.txt"), "keep");
  symlinkSync(outside, join(root, "scratch", "session-link-1"));
  writeFileSync(join(root, "scratch", "notes.txt"), "not a session");
  const now = Date.now();
  const days = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);
  utimesSync(old, days(10), days(10));
  utimesSync(recent, days(3), days(3));
  const removed = await scratch.cleanScratch(now);
  assert.deepEqual(removed, ["session-old-01"]);
  assert.equal(existsSync(old), false);
  assert.equal(existsSync(recent), true);
  assert.equal(
    readFileSync(join(outside, "keep.txt"), "utf8"),
    "keep",
    "a link is never followed",
  );
  assert.equal(existsSync(join(root, "scratch", "notes.txt")), true);
  rmSync(outside, { recursive: true, force: true });

  assert.equal(
    scratch.withoutScratch(`Start.\n\n${scratch.scratchGuidance(dir)}`),
    "Start.",
    "a vendor's cache key leaves each session's folder out",
  );
  assert.match(scratch.scratchRule(dir), /^Read\(~\/|^Read\(\/\//);
});

test("a result's room follows the model's window, within bounds", async () => {
  const { resultLimits } = await import("./scratch.ts");
  assert.deepEqual(resultLimits(32_000), { result: 14_400, step: 28_800 });
  assert.deepEqual(resultLimits(128_000), { result: 50_000, step: 115_200 });
  assert.deepEqual(resultLimits(1_000_000), { result: 50_000, step: 150_000 });
  assert.deepEqual(resultLimits(4_000), { result: 8_000, step: 16_000 });
});

test("a saved answer can be read in parts: JSON laid out, long lines broken, nothing left out", async () => {
  const { pageable, preview } = await import("./scratch.ts");
  const json = JSON.stringify({
    items: Array.from({ length: 200 }, (_, at) => ({ at, name: `page ${at}` })),
  });
  const laid = pageable(json);
  assert.ok(laid.split("\n").length > 200);
  assert.deepEqual(JSON.parse(laid), JSON.parse(json));
  const long = "x".repeat(2500);
  const broken = pageable(`head\n${long}`);
  assert.deepEqual(
    broken.split("\n").map((line) => line.length),
    [4, 1000, 1000, 500],
  );
  assert.equal(broken.replaceAll("\n", ""), `head${long}`);
  assert.equal(
    preview(`${"a".repeat(1500)}\n${"b".repeat(1000)}`),
    "a".repeat(1500),
  );
});

test("a long answer goes to the scratch folder with a preview and its path; a step's answers share its room", async () => {
  const { Spill, cut } = await import("./scratch.ts");
  const dir = join(root, "scratch", "session-spill-1");
  const spill = new Spill({ dir, window: 32_000 });
  assert.equal(await spill.take("Grep", "short"), "short");
  const big = Array.from({ length: 3000 }, (_, at) => `line ${at}`).join("\n");
  const saved = await spill.take("mcp__notion__search", big);
  assert.match(saved, /^<persisted-output>/);
  assert.match(saved, /Output too large \(\d[\d,]* characters, 3,000 lines\)/);
  const path = /Full output saved to: (\S+)/.exec(saved)?.[1] ?? "";
  assert.ok(path.startsWith(dir), path);
  assert.equal(readFileSync(path, "utf8"), big, "kept whole");
  assert.ok(saved.length < 2_600, "the model reads a preview only");
  if (process.platform !== "win32")
    assert.equal(statSync(path).mode & 0o777, 0o600);

  // Each under the limit, but together past the step's room: the later one is saved instead.
  const step = new Spill({ dir, window: 32_000 });
  const part = "y".repeat(12_000);
  assert.equal(await step.take("a", part), part);
  assert.equal(await step.take("b", part), part);
  assert.match(await step.take("c", part), /<persisted-output>/);
  step.nextStep();
  assert.equal(await step.take("d", part), part, "a new step has its room");

  // Without a folder (a session that cannot read files back) it is cut, head and tail kept.
  const bare = new Spill({ window: 32_000 });
  const cutText = await bare.take("tool", big);
  assert.match(cutText, /^line 0\n/);
  assert.match(cutText, /line 2999$/);
  assert.match(cutText, /characters cut from the middle/);
  assert.equal(cut("abc", 10), "abc");
});
