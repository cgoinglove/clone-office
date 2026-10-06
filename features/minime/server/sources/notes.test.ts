import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryKind, splitNote } from "./notes";

test("a memory note's kind is read from its front matter, at the top or nested", () => {
  assert.equal(
    memoryKind("---\nname: x\ntype: feedback\n---\nbody"),
    "feedback",
  );
  assert.equal(
    memoryKind("---\nname: x\nmetadata:\n  type: user\n---\nbody"),
    "user",
  );
  assert.equal(memoryKind("no front matter"), undefined);
});

test("notes are cut into small pieces, without front matter or bare headings", () => {
  const text = `---\ntype: user\n---\n# Heading\n\n${"- prefers short answers with the reason first\n".repeat(30)}`;
  const pieces = splitNote(text, 200);
  assert.ok(pieces.length > 1);
  assert.ok(pieces.every((piece) => piece.length <= 201));
  assert.ok(!pieces.some((piece) => piece.includes("type: user")));
  assert.deepEqual(splitNote("# Only a heading\n\n---\n"), []);
});
