import assert from "node:assert/strict";
import { test } from "node:test";
import { addNote, isWorking, takeBack, takeNotes, working } from "./steer.ts";

test("a word waits only while the clone works, can be taken back unread, and is read once", () => {
  assert.equal(addNote("c1", "too late"), undefined, "nobody is working");
  const end = working("c1");
  assert.equal(isWorking("c1"), true);
  const first = addNote("c1", "Thursday, not Friday.");
  const second = addNote("c1", "And keep it short.");
  assert.ok(first && second);
  assert.equal(takeBack("c1", first.id), true);
  assert.deepEqual(
    takeNotes("c1").map((note) => note.text),
    ["And keep it short."],
  );
  assert.equal(takeBack("c1", second.id), false, "read: no taking it back");
  assert.deepEqual(takeNotes("c1"), []);
  end();
  assert.equal(isWorking("c1"), false);
});
