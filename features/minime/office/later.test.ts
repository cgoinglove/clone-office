import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-later-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a request's question waits only a little at the screen; the person's own conversation waits longer", async () => {
  const { ASK_TIMEOUT_MS, OFFICE_ASK_LIVE_MS, timeoutFor } = await import(
    "../gate/gate"
  );
  assert.equal(timeoutFor("office-request-3f2a"), OFFICE_ASK_LIVE_MS);
  assert.ok(OFFICE_ASK_LIVE_MS < ASK_TIMEOUT_MS);
  assert.equal(timeoutFor("chat-1"), ASK_TIMEOUT_MS);
  assert.equal(timeoutFor("office-rules"), ASK_TIMEOUT_MS);
});

test("the person's choice on an answer they were shown: send it, the fixed one, hold it, or their own words", async () => {
  const { decideCheck } = await import("./check");
  const shown = {
    labels: { send: "Send", revised: "Send without the reason", hold: "Hold" },
    reply: "Not before 3, I have a doctor's appointment.",
    revised: "Not before 3.",
  };
  assert.deepEqual(decideCheck("Send", shown), { send: shown.reply });
  assert.deepEqual(decideCheck("Send without the reason", shown), {
    send: "Not before 3.",
  });
  assert.deepEqual(decideCheck("Hold", shown), {
    hold: true,
    problem: undefined,
  });
  assert.deepEqual(decideCheck("4 works.", shown), { send: "4 works." });
});

test("questions kept for later wait while their request is open, and go when it closes", async () => {
  const { changeState } = await import("./state");
  const { forgetLater, laterQuestions } = await import("./handle");
  await changeState((s) => {
    s.later.a = {
      task: "t-open",
      kind: "question",
      question: "Take REF-12?",
      at: "x",
    };
    s.later.b = {
      task: "t-done",
      kind: "question",
      question: "Lunch?",
      at: "x",
    };
    s.later.c = {
      task: "t-cancel",
      kind: "question",
      question: "Review?",
      at: "x",
    };
  });
  const task = (id: string, state: string) =>
    ({
      id,
      status: { state, timestamp: "" },
      history: [],
      metadata: { from: "", to: "", created: "" },
      contextId: "",
    }) as never;
  await forgetLater("t-cancel");
  const open = await laterQuestions([
    task("t-open", "WORKING"),
    task("t-done", "COMPLETED"),
  ]);
  assert.deepEqual(
    open.map((q) => q.id),
    ["a"],
  );
  const { loadState } = await import("./state");
  assert.deepEqual(
    Object.keys((await loadState()).later),
    ["a"],
    "closed ones are dropped from the file too",
  );
});

test("a request tells the brain to wait for the person rather than guess", async () => {
  const { requestPrompt } = await import("./handle");
  assert.match(
    requestPrompt(undefined, "Take REF-12?"),
    /If they have not answered yet, set waiting_on_person/,
  );
});
