import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { awakeSignal, awakeTimeout } from "./waits.ts";

// The wall clock is set by hand: a timer of Node's fires once after the computer wakes, however long
// it slept, while the wall clock has moved on by the whole sleep.
function clock() {
  let now = 0;
  mock.timers.enable({ apis: ["setInterval"] });
  mock.method(Date, "now", () => now);
  return {
    pass(ms: number) {
      for (let step = 0; step < ms; step += 1_000) {
        now += 1_000;
        mock.timers.tick(1_000);
      }
    },
    sleep(ms: number) {
      now += ms;
    },
  };
}

test("an awake deadline fires after its time awake, and sleep does not count", () => {
  const time = clock();
  try {
    let fired = 0;
    awakeTimeout(60_000, () => fired++);
    time.pass(30_000);
    assert.equal(fired, 0);
    // The laptop closes for twelve minutes in the middle of the work.
    time.sleep(12 * 60_000);
    time.pass(5_000);
    assert.equal(fired, 0, "the sleep used none of its time");
    time.pass(20_000);
    assert.equal(fired, 0);
    time.pass(5_000);
    assert.equal(fired, 1, "it fires once the time awake is used");
    time.pass(60_000);
    assert.equal(fired, 1, "and only once");
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});

test("a stopped awake deadline never fires, and its signal aborts as a timeout", () => {
  const time = clock();
  try {
    let fired = 0;
    const stop = awakeTimeout(10_000, () => fired++);
    stop();
    time.pass(60_000);
    assert.equal(fired, 0);
    const { signal } = awakeSignal(10_000);
    time.pass(10_000);
    assert.equal(signal.aborted, true);
    assert.equal((signal.reason as DOMException).name, "TimeoutError");
  } finally {
    mock.timers.reset();
    mock.restoreAll();
  }
});
