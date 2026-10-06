import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { storedFiles } from "./stored";

const root = mkdtempSync(join(tmpdir(), "minime-stored-"));
after(() => rmSync(root, { recursive: true, force: true }));

test("every kept file is listed by kind, with text for text files and size for the rest", async () => {
  mkdirSync(join(root, "memories"), { recursive: true });
  mkdirSync(join(root, "skills", "writing", "weekly-report"), {
    recursive: true,
  });
  mkdirSync(join(root, "index"), { recursive: true });
  mkdirSync(join(root, "backup", "2026-10-06"), { recursive: true });
  writeFileSync(join(root, "memories", "USER.md"), "Short answers.");
  writeFileSync(join(root, "memories", ".lock"), "");
  writeFileSync(
    join(root, "skills", "writing", "weekly-report", "SKILL.md"),
    "---\nname: weekly-report\n---\n",
  );
  writeFileSync(join(root, "index", "history.db"), Buffer.alloc(64));
  writeFileSync(join(root, "settings.json"), '{"exclude":[]}');
  writeFileSync(join(root, "learn.json"), '{"last":{}}');
  writeFileSync(join(root, "backup", "2026-10-06", "learn.json"), "{}");

  const files = await storedFiles(root);
  assert.deepEqual(
    files.map((f) => [f.group, f.path]),
    [
      ["memory", "memories/USER.md"],
      ["skills", "skills/writing/weekly-report/SKILL.md"],
      ["reading", "learn.json"],
      ["settings", "settings.json"],
      ["index", "index/history.db"],
      ["backup", "backup/2026-10-06/learn.json"],
    ],
  );
  assert.equal(files[0].text, "Short answers.");
  assert.equal(files[4].text, undefined, "the index is shown by size only");
  assert.equal(files[4].size, 64);
});

test("a credential in a kept file is shown masked", async () => {
  writeFileSync(
    join(root, "settings.json"),
    JSON.stringify({ office: { relay: "http://r", token: "abc123" } }),
  );
  const files = await storedFiles(root);
  const settings = files.find((f) => f.path === "settings.json");
  assert.ok(settings?.text?.includes("http://r"));
  assert.ok(!settings?.text?.includes("abc123"));
});
