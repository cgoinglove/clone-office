import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { hermesConversations, messageTurns } from "./hermes";

test("each user message is paired with the assistant's message before it", () => {
  const turns = messageTurns([
    {
      role: "user",
      content: "summarize the meeting",
      at: "2026-08-01T00:00:00Z",
    },
    { role: "tool", content: "{}", at: "2026-08-01T00:00:01Z" },
    {
      role: "assistant",
      content: "Here is the summary.",
      at: "2026-08-01T00:00:02Z",
    },
    { role: "user", content: "shorter please", at: "2026-08-01T00:00:03Z" },
  ]);
  assert.deepEqual(
    turns.map((t) => [t.prompt, t.before]),
    [
      ["summarize the meeting", ""],
      ["shorter please", "Here is the summary."],
    ],
  );
});

test("sessions started by the scheduler are left out", async () => {
  const home = mkdtempSync(join(tmpdir(), "hermes-"));
  const previous = process.env.HERMES_HOME;
  process.env.HERMES_HOME = home;
  try {
    const db = new DatabaseSync(join(home, "state.db"));
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, git_repo_root TEXT, started_at REAL NOT NULL);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, timestamp REAL NOT NULL);
      INSERT INTO sessions VALUES ('a', 'cli', '/u/app/sub', '/u/app', 1788000000), ('b', 'cron', NULL, NULL, 1788000000);
      INSERT INTO messages (session_id, role, content, timestamp) VALUES ('a', 'user', 'plan my week', 1788000001), ('b', 'user', 'scheduled job', 1788000002);`);
    db.close();
    const found = await hermesConversations();
    assert.equal(found.length, 1);
    assert.equal(found[0].cwd, "/u/app");
    assert.equal((await found[0].turns())[0].prompt, "plan my week");
  } finally {
    if (previous === undefined) delete process.env.HERMES_HOME;
    else process.env.HERMES_HOME = previous;
    rmSync(home, { recursive: true, force: true });
  }
});
