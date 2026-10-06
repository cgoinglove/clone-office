import assert from "node:assert/strict";
import { test } from "node:test";
import { awakeCommand } from "./awake";

test("the computer is kept awake the way each system allows, and only while the app runs", () => {
  assert.deepEqual(awakeCommand("darwin", 42), [
    "caffeinate",
    ["-i", "-w", "42"],
  ]);
  const linux = awakeCommand("linux", 42);
  assert.equal(linux?.[0], "systemd-inhibit");
  assert.ok(linux?.[1].at(-1)?.includes("kill -0 42"));
  assert.equal(awakeCommand("win32", 42), undefined);
});
