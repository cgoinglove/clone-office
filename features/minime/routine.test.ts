import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanRoutines, routineNow } from "./routine";

const plan = {
  label: "Plan my day",
  days: [1, 2, 3, 4, 5],
  hour: 9,
  why: "Weekday mornings",
};
const report = {
  label: "Draft the weekly report",
  days: [5],
  hour: 16,
  why: "Friday afternoons",
};

test("a routine is offered around its hour on its days, and not otherwise", () => {
  const at = (day: number, hour: number) =>
    new Date(2026, 9, 4 + day, hour, 30); // Oct 4 2026 is a Sunday
  assert.equal(routineNow([plan, report], at(1, 9))?.label, "Plan my day");
  assert.equal(routineNow([plan, report], at(1, 10))?.label, "Plan my day");
  assert.equal(
    routineNow([plan, report], at(1, 11)),
    undefined,
    "two hours after its hour it is gone",
  );
  assert.equal(
    routineNow([plan, report], at(0, 9)),
    undefined,
    "not on a Sunday",
  );
  assert.equal(
    routineNow([plan, report], at(5, 16))?.label,
    "Draft the weekly report",
  );
});

test("only what a routine can hold is kept", () => {
  assert.deepEqual(
    cleanRoutines([
      { ...plan, days: [1, 1, 9, "2"] },
      { label: "", days: [1], hour: 9, why: "" },
      { label: "x", days: [], hour: 9, why: "" },
      { label: "y", days: [1], hour: 25, why: "" },
      "nope",
    ]),
    [{ ...plan, days: [1, 2] }],
  );
});
