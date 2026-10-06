import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { keep } from "./learn";
import { startOver } from "./reset";

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
  mkdirSync(join(root, "skills", "general", "daily-report"), {
    recursive: true,
  });
  writeFileSync(
    join(root, "learn.json"),
    '{"last":{"at":"2026-10-06T00:00:00Z"}}',
  );
  writeFileSync(join(root, "settings.json"), '{"exclude":["work"]}');
  const { backup, moved } = await startOver(new Date("2026-10-06T01:02:03Z"));
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
