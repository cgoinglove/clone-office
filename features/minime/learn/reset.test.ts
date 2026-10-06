import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { keep } from "./learn";
import { onlyRead, startOver } from "./reset";

const root = mkdtempSync(join(tmpdir(), "minime-reset-"));
const saved = process.env.SUB_OFFICE_HOME;

before(() => {
  process.env.SUB_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

test("kept lines are added once, and only the new ones are reported", async () => {
  const reported: string[] = [];
  const first = await keep(
    ["Answers come short, conclusion first.", "", 7],
    (event) => {
      if (event.type === "memory") reported.push(String(event.content));
    },
  );
  assert.deepEqual(first, ["Answers come short, conclusion first."]);
  const again = await keep(
    ["Answers come short, conclusion first.", "Asks before spending money."],
    (event) => {
      if (event.type === "memory") reported.push(String(event.content));
    },
  );
  assert.deepEqual(again, ["Asks before spending money."]);
  assert.deepEqual(reported, [
    "Answers come short, conclusion first.",
    "Asks before spending money.",
  ]);
});

test("starting over moves what the mini-me keeps into a backup and deletes nothing", async () => {
  // A skill it made from the person's correction: something of theirs.
  mkdirSync(join(root, "skills", "general", "daily-report"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "skills", "general", "daily-report", "SKILL.md"),
    "---\nname: daily-report\n---\n",
  );
  writeFileSync(
    join(root, "learn.json"),
    '{"last":{"at":"2026-10-06T00:00:00Z"}}',
  );
  writeFileSync(join(root, "settings.json"), '{"exclude":["work"]}');
  assert.equal(await onlyRead(), false);
  const { backup, moved } = await startOver(new Date("2026-10-06T01:02:03Z"));
  assert.ok(backup);
  assert.deepEqual(moved, ["memories", "skills", "learn.json"]);
  for (const name of moved) {
    assert.ok(
      !existsSync(join(root, name)),
      `${name} left the mini-me's folder`,
    );
    assert.ok(existsSync(join(backup, name)), `${name} is in the backup`);
  }
  assert.match(
    readFileSync(join(backup, "memories", "USER.md"), "utf8"),
    /conclusion first/,
  );
  assert.ok(
    existsSync(join(root, "settings.json")),
    "the folders left out stay as they are",
  );
});

test("when all it keeps came from a reading, starting over clears it without a backup", async () => {
  const backups = () =>
    existsSync(join(root, "backup")) ? readdirSync(join(root, "backup")) : [];
  const before = backups().length;
  await keep(["Short answers."], () => {});
  // The reading writes its record after the lines it keeps.
  await new Promise((resolve) => setTimeout(resolve, 20));
  writeFileSync(join(root, "learn.json"), '{"last":{}}');
  assert.equal(await onlyRead(), true);
  const { backup, cleared } = await startOver();
  assert.equal(backup, undefined);
  assert.deepEqual(cleared, ["memories", "learn.json"]);
  assert.ok(!existsSync(join(root, "memories")));
  assert.equal(backups().length, before, "no backup made");

  // Memory changed after the reading (brought from another AI, or corrected): theirs, so kept.
  writeFileSync(join(root, "learn.json"), '{"last":{}}');
  await new Promise((resolve) => setTimeout(resolve, 20));
  await keep(["Asks before spending money."], () => {});
  assert.equal(await onlyRead(), false);
  // A conversation with the mini-me is theirs too.
  mkdirSync(join(root, "chats"), { recursive: true });
  writeFileSync(join(root, "chats", "c1.jsonl"), "{}\n");
  assert.equal(await onlyRead(), false);
});
