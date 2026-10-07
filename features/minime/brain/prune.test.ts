import assert from "node:assert/strict";
import { test } from "node:test";
import type { ModelMessage } from "ai";
import { carryPoint, contextWindow, sessionLost } from "./context.ts";
import { estimateTokens, pruneToolResults, underPressure } from "./prune.ts";

const result = (id: string, toolName: string, value: string): ModelMessage => ({
  role: "tool",
  content: [
    {
      type: "tool-result",
      toolCallId: id,
      toolName,
      output: { type: "text", value },
    },
  ],
});
const big = (letter: string) => letter.repeat(5000);
const valueOf = (message: ModelMessage | undefined) =>
  (message?.content as { output: { value: string } }[])[0]?.output.value ?? "";

test("earlier tool results are cut when the window fills; the latest stay whole and nothing else changes", () => {
  const messages: ModelMessage[] = [
    { role: "user", content: "Sum up the payments thread." },
    result("1", "conversation_read", big("a")),
    result("2", "Read", big("b")),
    result("3", "conversation_read", big("a")),
    result("4", "Read", "short"),
    result("5", "WebFetch", big("c")),
  ];
  const cut = pruneToolResults(messages);
  assert.equal(cut[0], messages[0], "not a tool result");
  assert.match(
    valueOf(cut[1]),
    /An earlier result of conversation_read, 5000 characters, cut/,
  );
  assert.match(valueOf(cut[1]), /Call the tool again/);
  assert.match(valueOf(cut[2]), /An earlier result of Read/);
  assert.match(
    valueOf(cut[3]),
    /The same result as an earlier call of conversation_read/,
  );
  assert.equal(valueOf(cut[4]), "short", "the last two stay whole");
  assert.equal(valueOf(cut[5]), big("c"));
  assert.ok(estimateTokens(cut) < estimateTokens(messages));

  const repeated = pruneToolResults([
    ...messages.slice(0, 2),
    result("6", "conversation_read", big("a")),
    result("7", "Read", "x"),
    result("8", "Read", "y"),
  ]);
  assert.match(
    valueOf(repeated[2]),
    /The same result as an earlier call of conversation_read/,
  );
});

test("pressure is the measured tokens when known, an estimate otherwise", () => {
  const few: ModelMessage[] = [{ role: "user", content: "hi" }];
  assert.equal(underPressure(few, 32_000), false);
  assert.equal(underPressure(few, 32_000, 20_000), true);
  assert.equal(
    underPressure([result("1", "Read", "x".repeat(60_000))], 32_000),
    true,
  );
});

test("the carry point follows the brain's window, and a lost or overfull session is told from other failures", () => {
  assert.equal(contextWindow({ kind: "claude-code" }), 200_000);
  assert.equal(carryPoint({ kind: "claude-code" }), 100_000);
  assert.equal(
    carryPoint({ kind: "api", provider: "local", model: "qwen3" }),
    24_000,
  );
  assert.equal(
    carryPoint({ kind: "api", provider: "openai", model: "x" }),
    96_000,
  );
  for (const said of [
    "session-missing",
    "prompt is too long: 220000 tokens > 200000 maximum",
    "The input token count (1200000) exceeds the maximum number of tokens allowed (1048576).",
    "This model's maximum context length is 128000 tokens.",
    "context_length_exceeded",
  ])
    assert.ok(sessionLost(said), said);
  for (const said of ["529 overloaded", "401 invalid x-api-key", "timed out"])
    assert.equal(sessionLost(said), false, said);
});
