import assert from "node:assert/strict";
import { test } from "node:test";
import { passing, requestPrompt } from "./handle";

test("a busy or rate-limited AI service is waited out; other failures are not", () => {
  assert.ok(passing("API Error: 529 Overloaded. This is a server-side issue"));
  assert.ok(passing("429 rate_limit_error"));
  assert.ok(
    !passing("Claude Code did not finish in time."),
    "a run that used all its time would repeat its tools and questions",
  );
  assert.ok(!passing("403 Forbidden: account overloaded with requests"));
  assert.ok(passing("fetch failed: ECONNRESET"));
  assert.ok(!passing("claude-missing"));
  assert.ok(!passing(undefined));
});

test("a request names who asked and keeps promises with the person", () => {
  const prompt = requestPrompt(
    { name: "Ana", description: "Payments" },
    "Can we meet on Friday?",
  );
  assert.match(prompt, /the clone of Ana \(Payments\)/);
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
  // The person's own instructions for the kind are theirs, not a fault to hold back.
  assert.match(
    checkPrompt("a", "b", [], false, undefined, ["End with the docs link."]),
    /told you to handle requests like this[\s\S]*- End with the docs link\./,
  );
});

test("the check holds back what none of the answer's sources show, where sources are asked for", async () => {
  const { checkPrompt } = await import("./check");
  const grounded = checkPrompt(
    "Is the release out?",
    "Yes, it shipped Tuesday.",
    [],
    false,
    undefined,
    [],
    [],
    false,
    ["their Claude Code conversation in api, yesterday"],
  );
  assert.match(grounded, /- their Claude Code conversation in api, yesterday/);
  assert.match(grounded, /none of the places above show/);
  assert.match(
    checkPrompt("Q", "A", [], false, undefined, [], [], false, []),
    /named nowhere its facts came from/,
  );
  // A meeting's line asks for no sources: nothing is held back for that.
  assert.doesNotMatch(checkPrompt("Q", "A"), /none of the places above show/);
});

test("a request is put with the person's menu, and asks for a line to tell them", async () => {
  const { requestPrompt } = await import("./handle");
  const { cleanMenu } = await import("./menu");
  const prompt = requestPrompt(
    { name: "Ana", description: "Web" },
    "How does /orders page?",
    cleanMenu([
      { name: "API questions", description: "How it works", trust: "auto" },
    ]),
  );
  assert.match(prompt, /- api-questions: API questions — How it works/);
  assert.match(prompt, /Put in menu the id/);
  assert.match(prompt, /In note, write one line for your person/);
  assert.doesNotMatch(requestPrompt(undefined, "Hi"), /Put in menu/);
});

test("an answer of a kind the person sees first is shown to them whatever the check finds", async () => {
  const { checkPrompt } = await import("./check");
  assert.match(
    checkPrompt("Q", "A", [], true),
    /wants to see answers to this kind/,
  );
  assert.doesNotMatch(checkPrompt("Q", "A"), /wants to see answers/);
});

test("ME.md is written from the card: who, how to work with them, what to ask them for", async () => {
  const { meMarkdown } = await import("./me");
  const md = meMarkdown(
    {
      name: "Ben",
      description: "Payments backend; I look after /orders and refunds.",
      howToWork: [
        "Send the endpoint and what you tried.",
        "I answer within a day.",
      ],
    },
    [
      {
        id: "api",
        name: "Payments API questions",
        description: "Which endpoint, what you tried",
        trust: "ask",
      },
    ],
  );
  assert.match(md, /^# Ben\n\nPayments backend/);
  assert.match(
    md,
    /## How to work with me\n\n- Send the endpoint and what you tried\.\n- I answer within a day\./,
  );
  assert.match(
    md,
    /## What you can ask me for\n\n- \*\*Payments API questions\*\*: Which endpoint, what you tried/,
  );
  assert.doesNotMatch(
    meMarkdown({ name: "Ana", description: "" }, []),
    /How to work/,
  );
});
