import assert from "node:assert/strict";
import { test } from "node:test";
import { AskSchema, WHY_CHARS } from "./ask-schema.ts";

test("a question keeps the reason the clone gave for it", () => {
  const parsed = AskSchema.parse({
    kind: "question",
    question: "Move the release review to Thursday?",
    choices: ["Yes", "No"],
    why: "Thursday is free after 2pm.",
  });
  assert.equal(parsed.kind, "question");
  assert.equal(
    parsed.kind === "question" ? parsed.why : undefined,
    "Thursday is free after 2pm.",
  );
});

test("a reason longer than one sentence is refused, not kept", () => {
  assert.equal(
    AskSchema.safeParse({
      kind: "question",
      question: "?",
      why: "x".repeat(WHY_CHARS + 1),
    }).success,
    false,
  );
});
