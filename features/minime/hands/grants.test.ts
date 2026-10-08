import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "clone-grants-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a task's grant is taken once, for that task in that conversation only", async () => {
  const { grantTaskEdits, takeTaskGrant } = await import("./grants.ts");
  grantTaskEdits("chat-1", "web", "Fix the date filter");
  assert.equal(takeTaskGrant("chat-2", "web", "Fix the date filter"), false);
  assert.equal(takeTaskGrant("chat-1", "web", "Fix something else"), false);
  assert.equal(takeTaskGrant("chat-1", "web", " Fix the date filter "), true);
  assert.equal(
    takeTaskGrant("chat-1", "web", "Fix the date filter"),
    false,
    "one piece of work, not every one after it",
  );
  const now = Date.now();
  grantTaskEdits("chat-1", "web", "Later", now);
  assert.equal(
    takeTaskGrant("chat-1", "web", "Later", now + 2 * 60 * 60 * 1000),
    false,
    "a grant nobody took runs out",
  );
});

test("allowing a piece of work for its task leaves a grant, never a rule", async () => {
  const { askPerson } = await import("../gate/gate.ts");
  const { answerPerson } = await import("../gate/answer.ts");
  const { loadTrust } = await import("../gate/rules.ts");
  const { takeTaskGrant } = await import("./grants.ts");
  const input = { session: "web", task: "Add paging to /orders" };
  const { id, done } = askPerson("chat-9", {
    kind: "permission",
    tool: "mcp__minime__work_session",
    input,
    always: true,
    task: "~/work/web",
  });
  assert.deepEqual(await answerPerson(id, "allow", true), { ok: true });
  assert.deepEqual(await done, { answered: true, answer: "allow" });
  assert.deepEqual(await loadTrust(), []);
  assert.equal(takeTaskGrant("chat-9", input.session, input.task), true);

  // Allowed without it: the work goes on, and each change is asked.
  const plain = askPerson("chat-9", {
    kind: "permission",
    tool: "mcp__minime__work_session",
    input,
    always: true,
    task: "~/work/web",
  });
  await answerPerson(plain.id, "allow", false);
  assert.equal(takeTaskGrant("chat-9", input.session, input.task), false);
});
