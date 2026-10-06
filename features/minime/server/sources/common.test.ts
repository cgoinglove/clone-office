import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanPrompt, isoTime, makeTurn, projectRoot } from "./common";

test("prompts lose what tools and editors wrapped around them", () => {
  const raw = [
    "<system-reminder>internal</system-reminder>",
    "<ide_selection>selected code</ide_selection>",
    "make it simpler",
    '<pasted_content id="1">0123456789</pasted_content>',
  ].join("\n");
  assert.equal(cleanPrompt(raw), "make it simpler\n[pasted 10 chars]");
});

test("a turn keeps only the end of what the AI said before", () => {
  const turn = makeTurn(
    "2026-09-01T00:00:00Z",
    "  yes, ship it ",
    "x".repeat(800),
  );
  assert.equal(turn?.prompt, "yes, ship it");
  assert.equal(turn?.before.length, 500);
  assert.equal(
    makeTurn("", "<system-reminder>only</system-reminder>", ""),
    undefined,
  );
});

test("times come in seconds, milliseconds or text", () => {
  assert.equal(isoTime(1_788_000_000), "2026-08-29T10:40:00.000Z");
  assert.equal(isoTime(1_788_000_000_000), "2026-08-29T10:40:00.000Z");
  assert.equal(isoTime("2026-08-28T08:00:00Z"), "2026-08-28T08:00:00.000Z");
  assert.equal(isoTime(null), "");
});

test("a worktree's sessions count toward the repository it came from", () => {
  assert.equal(
    projectRoot("/u/project/app/.claude/worktrees/fix-login"),
    "/u/project/app",
  );
  assert.equal(
    projectRoot("/u/project/app.cc/worktrees/smoke-test"),
    "/u/project/app",
  );
  assert.equal(
    projectRoot("/u/project/app.claude-worktrees/try"),
    "/u/project/app",
  );
  assert.equal(projectRoot("/u/project/app"), "/u/project/app");
});
