import assert from "node:assert/strict";
import { test } from "node:test";
import { errorCode } from "../server/ndjson.ts";
import { PROBE_PROMPT, probeProblem } from "./probe.ts";

test("a brain that does not answer is said as what the person can do about it", () => {
  const claude = { claudeCode: true, local: false };
  const keyed = { claudeCode: false, local: false };
  const local = { claudeCode: false, local: true };
  assert.equal(
    probeProblem("Invalid API key · Please run /login", claude),
    "claude-signed-out",
  );
  assert.equal(
    probeProblem("401 Unauthorized: invalid x-api-key", keyed),
    "brain-key-wrong",
  );
  assert.equal(
    probeProblem("connect ECONNREFUSED 127.0.0.1:11434", local),
    "brain-local-unreachable",
  );
  assert.equal(probeProblem("fetch failed", keyed), "brain-unreachable");
  assert.equal(probeProblem("529 overloaded_error", keyed), "ai-busy");
  assert.equal(
    probeProblem("model 'opus' is not available on your plan", claude),
    "brain-no-answer",
    "anything else is shown as it came, under a plain line",
  );
  assert.equal(
    errorCode("Not logged in · Please run /login"),
    "claude-signed-out",
  );
  assert.match(PROBE_PROMPT, /single word OK/);
});
