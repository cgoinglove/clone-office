import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import { readGuide } from "./guide";

const dir = join(process.cwd(), "guide");

test("the guide opens at its index and lists every file it has", async () => {
  const index = await readGuide(dir);
  assert.ok("content" in index);
  for (const file of ["memory.md", "reading.md", "trouble.md"]) {
    assert.match(index.content, new RegExp(file.replace(".", "\\.")));
    assert.ok("content" in (await readGuide(dir, file)));
  }
});

test("only guide files can be read", async () => {
  for (const file of ["../AGENTS.md", "/etc/hosts", "index", "Memory.md"])
    assert.ok("error" in (await readGuide(dir, file)), file);
});
