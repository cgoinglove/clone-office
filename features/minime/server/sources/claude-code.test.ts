import assert from "node:assert/strict";
import { test } from "node:test";
import { isHumanPrompt, sessionTurns } from "./claude-code";

test("only what the person typed counts", () => {
  assert.equal(
    isHumanPrompt({
      type: "user",
      origin: { kind: "human" },
      message: { content: "hi" },
    }),
    true,
  );
  assert.equal(
    isHumanPrompt({
      type: "user",
      message: { content: "older record without origin" },
    }),
    true,
  );
  assert.equal(
    isHumanPrompt({ type: "user", origin: { kind: "task-notification" } }),
    false,
  );
  assert.equal(
    isHumanPrompt({
      type: "user",
      toolUseResult: {},
      message: { content: [] },
    }),
    false,
  );
  assert.equal(
    isHumanPrompt({
      type: "user",
      isSidechain: true,
      message: { content: "subagent" },
    }),
    false,
  );
  assert.equal(
    isHumanPrompt({
      type: "user",
      message: { content: [{ type: "tool_result" }] },
    }),
    false,
  );
  assert.equal(isHumanPrompt({ type: "assistant" }), false);
});

test("each typed line is paired with what Claude said just before", async () => {
  const lines = [
    {
      type: "user",
      timestamp: "2026-09-01T00:00:00Z",
      message: { content: "add a login page" },
    },
    {
      type: "assistant",
      message: {
        content: [{ type: "text", text: "Should it use email links?" }],
      },
    },
    {
      type: "user",
      timestamp: "2026-09-01T00:01:00Z",
      message: { content: "<command-name>/clear</command-name>" },
    },
    {
      type: "user",
      timestamp: "2026-09-01T00:02:00Z",
      message: { content: "no, passwords" },
    },
  ].map((row) => JSON.stringify(row));
  const turns = await sessionTurns(lines);
  assert.deepEqual(
    turns.map((t) => [t.prompt, t.before]),
    [
      ["add a login page", ""],
      ["no, passwords", "Should it use email links?"],
    ],
  );
});
