import assert from "node:assert/strict";
import { test } from "node:test";
import { sessionLost } from "./turn";

test("a conversation goes on from its own record only when the brain lost its session", () => {
  assert.ok(sessionLost("session-missing"));
  assert.ok(sessionLost("No conversation found with session ID: 1234"));
  assert.ok(sessionLost("prompt is too long: 210000 tokens > 200000 maximum"));
  assert.ok(
    sessionLost("This model's maximum context length is 128000 tokens"),
  );
  assert.ok(
    !sessionLost("529 overloaded_error"),
    "a busy service would fail again",
  );
  assert.ok(!sessionLost("The brain did not finish in time"));
  assert.ok(!sessionLost("brain-key-wrong"));
  assert.ok(!sessionLost(undefined));
});

test("a carried-over conversation keeps the person's own words as said, newest kept first", async () => {
  const { SUMMARY_PROMPT, theirWords } = await import("./turn");
  for (const heading of ["Goal:", "Settled:", "Done:", "Open:", "In use:"])
    assert.ok(SUMMARY_PROMPT.includes(heading), heading);
  assert.match(SUMMARY_PROMPT, /keep everything in it that still matters/);
  const at = "2026-10-08T00:00:00Z";
  const words = theirWords(
    [
      { role: "me", text: "First, shorter answers please.", at },
      { role: "minime", text: "Noted.", at },
      { role: "me", text: "x".repeat(2000), at },
      { role: "me", text: "Send it to Minsu.", at },
    ],
    1530,
    1500,
  );
  assert.doesNotMatch(words, /Noted/, "only theirs");
  assert.match(words, /Send it to Minsu\.$/, "newest last");
  assert.match(words, /x…/, "a long one is cut");
  assert.doesNotMatch(
    words,
    /shorter answers/,
    "the oldest goes first when it does not fit",
  );
});
