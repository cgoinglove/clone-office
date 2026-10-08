import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-runlog-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("the last 30 days of runs, by what they were for, with tokens and the reported cost", async () => {
  const { usageSummary } = await import("./runlog.ts");
  mkdirSync(join(root, "logs"), { recursive: true });
  const now = Date.parse("2026-10-08T12:00:00Z");
  const line = (at: string, purpose: string, extra: object = {}) =>
    JSON.stringify({
      at,
      purpose,
      brain: "claude-code",
      model: "sonnet",
      ok: true,
      ms: 1,
      ...extra,
    });
  writeFileSync(
    join(root, "logs", "runs.1.jsonl"),
    `${line("2026-10-01T09:00:00Z", "task", { usage: { input: 10, output: 5 }, cost_usd: 0.25 })}\n`,
  );
  writeFileSync(
    join(root, "logs", "runs.jsonl"),
    [
      line("2026-08-01T09:00:00Z", "task", { usage: { input: 999 } }),
      line("2026-10-07T09:00:00Z", "request", {
        ok: false,
        usage: { input: 3 },
      }),
      line("2026-10-07T10:00:00Z", "check", { cost_usd: 0.5 }),
      line("2026-10-07T11:00:00Z", "review"),
      "not json",
      "",
    ].join("\n"),
  );
  const { lines } = await usageSummary(30, now);
  assert.deepEqual(lines, [
    { group: "conversations", runs: 1, failed: 0, tokens: 15, cost: 0.25 },
    { group: "colleagues", runs: 2, failed: 1, tokens: 3, cost: 0.5 },
    { group: "learning", runs: 1, failed: 0, tokens: 0 },
  ]);
});
