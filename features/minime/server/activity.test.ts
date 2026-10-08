import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-activity-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("what was done in the person's name is kept, latest first, long words cut", async () => {
  const { activityPath, logActivity, readActivity } = await import(
    "./activity.ts"
  );
  await logActivity({
    kind: "asked",
    task: "t1",
    to: "Ben",
    text: "Who ships Friday?",
  });
  await logActivity({
    kind: "answered",
    task: "t2",
    to: "Cleo",
    text: "x".repeat(1000),
    how: "as-is",
  });
  appendFileSync(activityPath(), "cut short {\n");
  await logActivity({
    kind: "rule",
    rule: "mcp__notion__notion-search",
    added: true,
  });
  const lines = await readActivity();
  assert.deepEqual(
    lines.map((line) => line.kind),
    ["rule", "answered", "asked"],
  );
  const answered = lines[1];
  assert.ok(answered?.kind === "answered" && answered.text.length === 400);
  assert.ok(lines.every((line) => !Number.isNaN(Date.parse(line.at))));
});
