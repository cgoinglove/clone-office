import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { CHECKED_FOR_MS, rememberedFor } from "./probe.ts";

const root = mkdtempSync(join(tmpdir(), "minime-probe-"));
const saved = process.env.CLONE_OFFICE_HOME;
before(() => {
  process.env.CLONE_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.CLONE_OFFICE_HOME;
  else process.env.CLONE_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

const keep = (choice: string, at: number, ms = 2100) => {
  mkdirSync(join(root, "brain"), { recursive: true });
  writeFileSync(
    join(root, "brain", "checked.json"),
    JSON.stringify({ choice, at: new Date(at).toISOString(), ms }),
  );
};

test("an answer stands for the same choice for a day, never for another choice, an old one or one from the future", async () => {
  const now = Date.now();
  const choice = JSON.stringify({ kind: "claude-code", model: "sonnet" });
  assert.equal(await rememberedFor(choice, now), undefined, "nothing kept yet");
  keep(choice, now - 60 * 60 * 1000);
  assert.equal((await rememberedFor(choice, now))?.ms, 2100);
  assert.equal(
    await rememberedFor(
      JSON.stringify({ kind: "claude-code", model: "opus" }),
      now,
    ),
    undefined,
    "another model is asked anew",
  );
  keep(choice, now - CHECKED_FOR_MS - 1);
  assert.equal(await rememberedFor(choice, now), undefined, "a day gone");
  keep(choice, now + 60_000);
  assert.equal(await rememberedFor(choice, now), undefined, "a clock set back");
  writeFileSync(join(root, "brain", "checked.json"), "not json");
  assert.equal(await rememberedFor(choice, now), undefined, "unreadable");
});
