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
    JSON.stringify({
      office: { relay: "http://r", token: "abc123" },
      host: { port: 3200, key: "office-key-xyz", on: true },
    }),
  );
  const files = await storedFiles(root);
  const settings = files.find((f) => f.path === "settings.json");
  assert.ok(settings?.text?.includes("http://r"));
  assert.ok(!settings?.text?.includes("abc123"));
  assert.ok(!settings?.text?.includes("office-key-xyz"));
});

test("the office opened on this computer is one entry with its whole size, not its database's files", async () => {
  mkdirSync(join(root, "relay", "base", "1"), { recursive: true });
  writeFileSync(join(root, "relay", "PG_VERSION"), "17");
  writeFileSync(join(root, "relay", "base", "1", "1259"), Buffer.alloc(100));
  const files = await storedFiles(root);
  const office = files.filter((f) => f.path.startsWith("relay"));
  assert.deepEqual(
    office.map((f) => [f.group, f.path, f.size]),
    [["office", "relay/", 102]],
  );
});

test("a connected service's sign-in is listed with the services, its tokens and verifier masked", async () => {
  mkdirSync(join(root, "connectors"), { recursive: true });
  writeFileSync(
    join(root, "connectors", "notion.json"),
    JSON.stringify({
      client: { client_id: "registered", client_secret: "client-secret-1" },
      tokens: {
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
      },
      connected: "2026-10-06T21:00:00.000Z",
    }),
  );
  writeFileSync(
    join(root, "connectors", "pending.json"),
    JSON.stringify({ "the-state": { id: "linear", verifier: "verifier-1" } }),
  );
  const files = await storedFiles(root);
  const kept = files.filter((f) => f.group === "connectors");
  assert.deepEqual(
    kept.map((f) => f.path),
    ["connectors/notion.json", "connectors/pending.json"],
  );
  const shown = kept.map((f) => f.text ?? "").join("\n");
  assert.ok(shown.includes("registered") && shown.includes("2026-10-06"));
  for (const secret of [
    "client-secret-1",
    "access-token-1",
    "refresh-token-1",
    "verifier-1",
  ])
    assert.ok(!shown.includes(secret), secret);
});
