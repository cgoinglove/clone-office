import assert from "node:assert/strict";
import { test } from "node:test";
import { cacheHint } from "./loop.ts";

test("the cache is kept an hour where a person types between calls, and keyed by the unchanging start", () => {
  const talk = cacheHint("task", "You are their clone.");
  assert.equal(talk.human, true);
  assert.equal(cacheHint("flow", "You are their clone.").human, false);
  assert.equal(cacheHint("request", "You are their clone.").human, false);
  // The same start, the same key, whenever it is asked; another purpose or start, another key.
  assert.equal(talk.key, cacheHint("task", "You are their clone.").key);
  assert.notEqual(talk.key, cacheHint("flow", "You are their clone.").key);
  assert.notEqual(talk.key, cacheHint("task", "You are someone else.").key);
  assert.ok(talk.key.length <= 64, "OpenAI's limit");
});
