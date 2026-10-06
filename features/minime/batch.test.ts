import assert from "node:assert/strict";
import { test } from "node:test";
import { dueAt } from "./batch";

test("a kept question is brought at the next of the day's moments, or the next morning's", () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 6, h, m);
  assert.equal(dueAt(at(9, 30)).getHours(), 10);
  assert.equal(
    dueAt(at(10, 0)).getHours(),
    14,
    "a moment that has come is past",
  );
  assert.equal(dueAt(at(15, 5)).getHours(), 17);
  const late = dueAt(at(17, 30));
  assert.deepEqual([late.getDate(), late.getHours()], [7, 10]);
  assert.equal(dueAt(at(8), [16, 9]).getHours(), 9, "moments in any order");
});
