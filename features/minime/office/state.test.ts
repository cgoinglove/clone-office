import assert from "node:assert/strict";
import { test } from "node:test";
import { type OfficeState, trimmed } from "./state.ts";

test("the office state lets go of old requests nothing waits on, old meetings and the oldest sent", () => {
  const now = Date.parse("2026-10-08T12:00:00Z");
  const old = "2026-01-01T00:00:00Z";
  const recent = "2026-10-01T00:00:00Z";
  const state: OfficeState = {
    after: 0,
    handled: {
      gone: { at: old, session: "s1" },
      fresh: { at: recent },
      theirs: { at: old, person: { since: old } },
      asked: { at: old },
      noted: { at: old, notes: [{ id: "n", text: "x", at: old }] as never },
    },
    sent: Object.fromEntries(
      Array.from({ length: 2005 }, (_, i) => [`t${i}`, { chat: "c" }]),
    ),
    approvals: {},
    outcomes: [],
    later: { q: { task: "asked", kind: "question", question: "?", at: old } },
    meetings: { m1: { at: old }, m2: { at: recent } },
  };
  trimmed(state, now);
  assert.deepEqual(Object.keys(state.handled).sort(), [
    "asked",
    "fresh",
    "noted",
    "theirs",
  ]);
  assert.deepEqual(Object.keys(state.meetings), ["m2"]);
  assert.equal(Object.keys(state.sent).length, 2000);
  assert.ok(!("t0" in state.sent) && "t2004" in state.sent);
});
