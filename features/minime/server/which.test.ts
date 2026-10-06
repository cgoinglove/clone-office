import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { findOnPath } from "./which";

test("commands are found on PATH, with Windows' endings on Windows", () => {
  const dir = mkdtempSync(join(tmpdir(), "which-"));
  try {
    writeFileSync(join(dir, "tool"), "");
    writeFileSync(join(dir, "tool.cmd"), "");
    assert.equal(findOnPath("tool", { PATH: dir }, "linux"), join(dir, "tool"));
    assert.equal(
      findOnPath("tool", { Path: dir, PATHEXT: ".EXE;.CMD" }, "win32"),
      join(dir, "tool.cmd"),
    );
    assert.equal(findOnPath("missing", { PATH: dir }, "linux"), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
