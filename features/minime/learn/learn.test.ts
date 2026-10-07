import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanExample, LEARN_PROMPT, LEARN_SCHEMA } from "./learn.ts";

test("the first reading also shows what the clone would answer a colleague, from the material only", () => {
  assert.ok("example" in LEARN_SCHEMA.properties);
  assert.ok(!LEARN_SCHEMA.required.includes("example"), "it may give none");
  assert.match(LEARN_PROMPT, /what you will do for their colleagues/);
  assert.match(LEARN_PROMPT, /Only from what the material shows/);
  assert.deepEqual(
    cleanExample({
      question: " Did the status values change? ",
      answer: " Yes. ",
    }),
    { question: "Did the status values change?", answer: "Yes." },
  );
  assert.equal(cleanExample({ question: "Only a question" }), undefined);
  assert.equal(cleanExample("not an example"), undefined);
  assert.equal(cleanExample(undefined), undefined);
  assert.equal(
    cleanExample({ question: "q", answer: "a".repeat(2000) })?.answer.length,
    800,
  );
});

test("the first reading says who they are at work, for them to confirm, not to keep as memory", () => {
  assert.ok("about" in LEARN_SCHEMA.properties);
  assert.ok(!LEARN_SCHEMA.required.includes("about"));
  assert.match(LEARN_PROMPT, /this is not memory/);
  assert.match(LEARN_PROMPT, /never a task in progress or its status/);
});
