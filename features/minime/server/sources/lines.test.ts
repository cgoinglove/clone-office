import assert from "node:assert/strict";
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { boundedLines, mapLimit, tailLines } from "./lines";

const dir = mkdtempSync(join(tmpdir(), "minime-lines-"));
after(() => rmSync(dir, { recursive: true, force: true }));

async function collect<T>(lines: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const line of lines) out.push(line);
  return out;
}

test("lines come with the offset to resume from, and a line still being written waits", async () => {
  const file = join(dir, "grow.jsonl");
  writeFileSync(file, "one\ntwo\nthr");
  const first = await collect(boundedLines(file));
  assert.deepEqual(
    first.map((l) => l.line),
    ["one", "two"],
  );
  assert.equal(first.at(-1)?.end, 8);
  appendFileSync(file, "ee\nfour\n");
  const rest = await collect(boundedLines(file, { start: 8 }));
  assert.deepEqual(
    rest.map((l) => l.line),
    ["three", "four"],
  );
});

test("a line over the limit is skipped, not held, and reading goes on after it", async () => {
  const file = join(dir, "big.jsonl");
  const huge = "x".repeat(3 * 1024 * 1024);
  writeFileSync(file, `before\n${huge}\nafter\r\n`);
  const lines = await collect(boundedLines(file, { maxLine: 1024 * 1024 }));
  assert.deepEqual(
    lines.filter((l) => !l.skipped).map((l) => l.line),
    ["before", "after"],
  );
  // The skipped line still moves the resume point past it.
  assert.equal(lines[1].skipped, true);
  assert.equal(lines[1].end, 7 + huge.length + 1);
});

test("tail lines come newest first, skip huge lines and stop at the byte budget", async () => {
  const file = join(dir, "history.jsonl");
  const rows = Array.from({ length: 5000 }, (_, i) => `{"n":${i}}`);
  rows.splice(2500, 0, "y".repeat(3 * 1024 * 1024));
  writeFileSync(file, `${rows.join("\n")}\n`);
  const newest = (
    await collect(tailLines(file, { maxLine: 1024 * 1024 }))
  ).slice(0, 2);
  assert.deepEqual(newest, ['{"n":4999}', '{"n":4998}']);
  const all = await collect(
    tailLines(file, { maxBytes: 64 * 1024 * 1024, maxLine: 1024 * 1024 }),
  );
  assert.equal(all.length, 5000);
  assert.equal(all.at(-1), '{"n":0}');
  const bounded = await collect(tailLines(file, { maxBytes: 1000 }));
  assert.ok(bounded.length > 0 && bounded.length < 120);
});

test("mapLimit keeps order and never runs more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  const out = await mapLimit([5, 1, 4, 2, 3, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, n));
    running -= 1;
    return n * 2;
  });
  assert.deepEqual(out, [10, 2, 8, 4, 6, 12, 14]);
  assert.ok(peak <= 3);
});
