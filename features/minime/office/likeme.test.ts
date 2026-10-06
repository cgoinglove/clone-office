import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-likeme-"));
const saved = process.env.SUB_OFFICE_HOME;
before(() => {
  process.env.SUB_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

test("the like-me score counts answers sent as they were, over the last 30 days and per kind", async () => {
  const { likeMe, recordOutcome } = await import("./likeme");
  const { loadState } = await import("./state");
  const now = Date.parse("2026-10-06T12:00:00Z");
  const day = 24 * 60 * 60 * 1000;
  await recordOutcome("api", "as-is", new Date(now - 40 * day));
  await recordOutcome("api", "as-is", new Date(now - 2 * day));
  await recordOutcome("api", "changed", new Date(now - day));
  await recordOutcome("deploy", "held", new Date(now - day));
  await recordOutcome(undefined, "as-is", new Date(now));
  const score = likeMe((await loadState()).outcomes, now);
  assert.deepEqual(score, {
    total: 4,
    asIs: 2,
    byMenu: { api: { total: 2, asIs: 1 }, deploy: { total: 1, asIs: 0 } },
  });
});
