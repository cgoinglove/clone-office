import assert from "node:assert/strict";
import { test } from "node:test";
import { passing, requestPrompt } from "./handle";

test("a busy or rate-limited AI service is waited out; other failures are not", () => {
  assert.ok(passing("API Error: 529 Overloaded. This is a server-side issue"));
  assert.ok(passing("429 rate_limit_error"));
  assert.ok(passing("Claude Code did not finish in time."));
  assert.ok(!passing("claude-missing"));
  assert.ok(!passing(undefined));
});

test("a request names who asked and keeps promises with the person", () => {
  const prompt = requestPrompt(
    { name: "Ana", description: "Payments" },
    "Can we meet on Friday?",
  );
  assert.match(prompt, /the mini-me of Ana \(Payments\)/);
  assert.match(prompt, /Can we meet on Friday\?/);
  assert.match(prompt, /Never promise or decide on their behalf/);
});

test("the check knows what the person said, so it does not ask them twice", async () => {
  const { checkPrompt } = await import("./check");
  const prompt = checkPrompt(
    "Can we talk on Tuesday at 11?",
    "Yes, Tuesday 11 works.",
    [
      {
        question: "Can you talk on Tuesday at 11?",
        answer: "Yes, Tuesday 11 is fine.",
      },
    ],
  );
  assert.match(prompt, /They said: Yes, Tuesday 11 is fine\./);
  assert.match(prompt, /a promise or decision in it may go/);
  assert.doesNotMatch(checkPrompt("a", "b"), /They said/);
});
