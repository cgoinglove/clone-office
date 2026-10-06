import assert from "node:assert/strict";
import { test } from "node:test";
import { follow, type LearnEvent } from "./job";

test("following a job replays what happened, then streams until it ends", () => {
  const job = {
    id: "j",
    events: [{ type: "progress", phase: "index", percent: 10 }] as LearnEvent[],
    done: false,
    listeners: new Set<(event: LearnEvent) => void>(),
  };
  const seen: string[] = [];
  let ended = false;
  follow(
    job,
    (event) => seen.push(event.type),
    () => {
      ended = true;
    },
  );
  assert.deepEqual(seen, ["progress"]);
  for (const listener of job.listeners)
    listener({ type: "done", kept: ["a"], tasks: [], at: "now" });
  assert.deepEqual(seen, ["progress", "done"]);
  assert.ok(ended);
  assert.equal(job.listeners.size, 0);
});
