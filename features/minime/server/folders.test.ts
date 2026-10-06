import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { recentFolders } from "./folders";

const root = mkdtempSync(join(tmpdir(), "minime-folders-"));
const saved = {
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CODEX_HOME: process.env.CODEX_HOME,
  HERMES_HOME: process.env.HERMES_HOME,
  VSCODE_APPDATA: process.env.VSCODE_APPDATA,
};
before(() => {
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  process.env.HERMES_HOME = join(root, "hermes");
  process.env.VSCODE_APPDATA = join(root, "appdata");
});
after(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(root, { recursive: true, force: true });
});

test("folders come from every AI tool's records, most used first", async () => {
  const now = Date.now();
  // Claude Code: two sessions in /work/api.
  const dir = join(root, "claude", "projects", "-work-api");
  mkdirSync(dir, { recursive: true });
  for (const id of ["a", "b"])
    writeFileSync(
      join(dir, `${id}.jsonl`),
      `${JSON.stringify({ type: "user", cwd: "/work/api", message: { role: "user", content: "hi" } })}\n`,
    );
  // Cursor: one chat in /work/web, through the window it ran in.
  const user = join(root, "appdata", "Cursor", "User");
  mkdirSync(join(user, "globalStorage"), { recursive: true });
  mkdirSync(join(user, "workspaceStorage", "w1"), { recursive: true });
  writeFileSync(
    join(user, "workspaceStorage", "w1", "workspace.json"),
    JSON.stringify({ folder: "file:///work/web" }),
  );
  const cursor = new DatabaseSync(join(user, "globalStorage", "state.vscdb"));
  cursor.exec(
    "CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB); CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, workspaceId TEXT)",
  );
  cursor.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)").run(
    "composerData:c1",
    JSON.stringify({
      lastUpdatedAt: now,
      fullConversationHeadersOnly: [{ bubbleId: "b1" }],
    }),
  );
  cursor.exec("INSERT INTO composerHeaders VALUES ('c1', 'w1')");
  cursor.close();

  const folders = await recentFolders(now - 86_400_000);
  assert.deepEqual(
    folders.map((f) => [f.name, f.sessions]),
    [
      ["api", 2],
      ["web", 1],
    ],
  );
});
