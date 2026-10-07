import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cleanPreferences,
  DEFAULT_PREFERENCES,
  quietFor,
} from "./preferences.ts";

test("preferences keep only what makes sense, and default to the careful way", () => {
  assert.deepEqual(cleanPreferences(undefined), DEFAULT_PREFERENCES);
  const kept = cleanPreferences({
    autonomy: "everything",
    defaultTrust: "ask",
    batchHours: [17, 9, 9, 25, -1, 12.5],
    review: "yes",
    quiet: { on: true, from: 23, to: 6 },
  });
  assert.equal(kept.autonomy, "ask", "an unknown mode is the careful one");
  assert.equal(kept.defaultTrust, "ask");
  assert.deepEqual(kept.batchHours, [9, 17]);
  assert.equal(kept.review, true);
  assert.deepEqual(kept.quiet, { on: true, from: 23, to: 6 });
  assert.equal(
    kept.meetings,
    false,
    "the clone takes part in meetings only when asked",
  );
  assert.equal(cleanPreferences({ meetings: "yes" }).meetings, false);
  assert.equal(cleanPreferences({ meetings: true }).meetings, true);
  assert.deepEqual(
    cleanPreferences({ batchHours: [] }).batchHours,
    [10, 14, 17],
  );
});

test("quiet hours wrap past midnight and end at their hour", () => {
  const quiet = { on: true, from: 22, to: 7 };
  const at = (hour: number, minute = 0) => new Date(2026, 9, 7, hour, minute);
  assert.equal(quietFor(quiet, at(21, 59)), 0);
  assert.equal(quietFor(quiet, at(22)), 9 * 60 * 60 * 1000);
  assert.equal(quietFor(quiet, at(6, 30)), 30 * 60 * 1000);
  assert.equal(quietFor(quiet, at(7)), 0);
  assert.equal(quietFor({ ...quiet, on: false }, at(23)), 0);
  assert.equal(
    quietFor({ on: true, from: 12, to: 13 }, at(12, 15)),
    45 * 60 * 1000,
  );
});
