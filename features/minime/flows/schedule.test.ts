import assert from "node:assert/strict";
import { test } from "node:test";
import {
  catchUpMs,
  cleanWhen,
  decide,
  localStamp,
  nextRun,
  type When,
} from "./schedule";

// Local times throughout, as the person's computer keeps them.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) =>
  new Date(y, mo - 1, d, h, mi);

test("schedules are taken from the shape the mini-me writes, never from words", () => {
  const now = at(2026, 10, 6, 14, 5);
  assert.deepEqual(
    cleanWhen({ kind: "weekly", days: [5, 1, 1, 9], time: "9:00" }, now),
    {
      kind: "weekly",
      days: [1, 5],
      time: "09:00",
    },
  );
  assert.equal(
    cleanWhen({ kind: "weekly", days: [], time: "09:00" }),
    undefined,
  );
  assert.equal(cleanWhen({ kind: "every", minutes: 5 }), undefined);
  assert.deepEqual(cleanWhen({ kind: "every", minutes: 120 }), {
    kind: "every",
    minutes: 120,
  });
  assert.deepEqual(cleanWhen({ kind: "once", in_minutes: 60 }, now), {
    kind: "once",
    at: "2026-10-06T15:05",
  });
  assert.equal(
    cleanWhen({ kind: "once", at: "2026-10-06T09:00" }, now),
    undefined,
    "a one-off in the past is no schedule",
  );
  assert.equal(cleanWhen("weekdays at 9"), undefined);
});

test("the next time: on the listed days, by periods from when it was made, or once", () => {
  const weekdays: When = {
    kind: "weekly",
    days: [1, 2, 3, 4, 5],
    time: "09:00",
  };
  // Friday 10:00 → Monday 09:00.
  assert.equal(
    localStamp(nextRun(weekdays, at(2026, 10, 9, 10)) as Date),
    "2026-10-12T09:00",
  );
  // Monday 08:59 → the same morning.
  assert.equal(
    localStamp(nextRun(weekdays, at(2026, 10, 12, 8, 59)) as Date),
    "2026-10-12T09:00",
  );
  const every: When = { kind: "every", minutes: 90 };
  assert.equal(
    localStamp(
      nextRun(every, at(2026, 10, 6, 13, 0), at(2026, 10, 6, 10, 0)) as Date,
    ),
    "2026-10-06T14:30",
  );
  const once: When = { kind: "once", at: "2026-10-06T15:00" };
  assert.equal(
    localStamp(nextRun(once, at(2026, 10, 6, 14)) as Date),
    "2026-10-06T15:00",
  );
  assert.equal(nextRun(once, at(2026, 10, 6, 15)), undefined);
});

test("a missed run is made up within its window (a day's run 12 hours late); later it is missed", () => {
  const daily: When = {
    kind: "weekly",
    days: [0, 1, 2, 3, 4, 5, 6],
    time: "09:00",
  };
  assert.equal(catchUpMs(daily), 12 * 60 * 60 * 1000);
  assert.equal(catchUpMs({ kind: "every", minutes: 30 }), 15 * 60 * 1000);
  const made = at(2026, 10, 1, 12);
  // Opened at 09:40: made up.
  const late = decide(daily, made, at(2026, 10, 5, 9), at(2026, 10, 6, 9, 40));
  assert.ok(late.run && localStamp(late.slot) === "2026-10-06T09:00");
  // Opened at 15:00: still made up the same day.
  const afternoon = decide(
    daily,
    made,
    at(2026, 10, 5, 9),
    at(2026, 10, 6, 15),
  );
  assert.ok(afternoon.run);
  // Opened at 22:00: missed, and only today's slot counts.
  const missed = decide(daily, made, at(2026, 10, 3, 9), at(2026, 10, 6, 22));
  assert.ok(!missed.run && "missed" in missed);
  assert.equal(localStamp(missed.missed), "2026-10-06T09:00");
  // Already handled today: nothing.
  assert.deepEqual(
    decide(daily, made, at(2026, 10, 6, 9), at(2026, 10, 6, 15)),
    {
      run: false,
    },
  );
});
