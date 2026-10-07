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
