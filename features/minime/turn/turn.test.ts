import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-turn-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("what waits is worded as its card, with whose it is, and answered as the page answers it", async () => {
  const { askPerson } = await import("../gate/gate.ts");
  const { words } = await import("../server/words.ts");
  const { answerTurn, turnEntries } = await import("./turn.ts");
  const answered: [string, string][] = [];
  const kept = [
    {
      id: "k1",
      task: "t-old",
      from: "Ben",
      question: "Can you take the Friday release?",
      choices: ["Yes", "No"],
      at: "2026-10-01T09:00:00.000Z",
    },
    {
      id: "k2",
      task: "t-closed",
      question: "Lunch?",
      at: "2026-10-01T09:30:00.000Z",
    },
  ];
  const side = {
    kept: async () => kept,
    phoned: async () => {},
    about: async (task: string) =>
      task === "t-closed"
        ? { from: "Cleo", text: "Lunch?", open: false }
        : { from: "Ben", text: "Who ships Friday?", open: true },
    answer: async (id: string, given: string) => {
      answered.push([id, given]);
      return true;
    },
    away: async () => false,
  };
  const w = await words();
  const question = askPerson("office-request-t-live", {
    kind: "question",
    question: "Thursday or Friday?",
    choices: ["Thursday", "Friday"],
  });
  const permission = askPerson("office-request-t-live", {
    kind: "permission",
    tool: "Read",
    input: { file_path: "/tmp/plan.md" },
  });

  const entries = await turnEntries(side, w);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["later:k1", `ask:${question.id}`, `ask:${permission.id}`],
    "oldest first; a request closed meanwhile has nothing to answer",
  );
  const live = entries[1];
  assert.equal(live?.about, "Ben asked: “Who ships Friday?”");
  assert.deepEqual(
    live?.choices.map((choice) => choice.label),
    ["Thursday", "Friday"],
  );
  assert.equal(live?.words, true);
  assert.equal(entries[2]?.words, false, "a permission takes only its choices");

  // A choice answers it; the session waiting on it hears the choice's words.
  const chose = await answerTurn(side, w, {
    value: live?.choices[1]?.value,
  });
  assert.deepEqual(chose, { ok: true, outcome: "Answer: Friday" });
  assert.deepEqual(await question.done, { answered: true, answer: "Friday" });

  // Words do not answer a permission; its own choice does.
  const typed = await answerTurn(side, w, {
    value: `ask:${permission.id}:`,
    words: "sure",
  });
  assert.equal(typed.ok, false);
  const allowed = await answerTurn(side, w, {
    value: `ask:${permission.id}:allow`,
  });
  assert.deepEqual(allowed, { ok: true, outcome: "Allowed" });
  assert.deepEqual(await permission.done, {
    answered: true,
    answer: "allow",
  });

  // A kept question takes the person's own words, and goes on with its request.
  const own = await answerTurn(side, w, {
    value: "later:k1:",
    words: "Only if Ana reviews it.",
  });
  assert.equal(own.ok, true);
  assert.deepEqual(answered, [["k1", "Only if Ana reviews it."]]);

  // Answered already: it no longer waits.
  assert.deepEqual(
    await answerTurn(side, w, { value: live?.choices[0]?.value }),
    { ok: false, outcome: "This question no longer waits." },
  );
});
