import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { contentText, hermesMessages, hermesSessions } from "./hermes";

test("structured content is read as its text parts", () => {
  assert.equal(contentText("plain words"), "plain words");
  assert.equal(
    contentText(
      `\u0000json:${JSON.stringify([
        { type: "text", text: "look at this" },
        { type: "image_url", image_url: { url: "data:..." } },
        { type: "text", text: "and this" },
      ])}`,
    ),
    "look at this\nand this",
  );
  assert.equal(contentText("\u0000json:{broken"), "");
  assert.equal(contentText(null), "");
});

test("sessions its scheduler started and messages the person rewound are left out", () => {
  const home = mkdtempSync(join(tmpdir(), "hermes-"));
  try {
    const path = join(home, "state.db");
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, git_repo_root TEXT, hidden INTEGER DEFAULT 0, started_at REAL NOT NULL);
      CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, timestamp REAL NOT NULL, active INTEGER DEFAULT 1, compacted INTEGER DEFAULT 0);
      INSERT INTO sessions VALUES ('a', 'cli', '/u/app/sub', '/u/app', 0, 1788000000), ('b', 'cron', NULL, NULL, 0, 1788000000), ('c', 'desktop', NULL, NULL, 1, 1788000000);
      INSERT INTO messages (session_id, role, content, timestamp, active, compacted) VALUES
        ('a', 'user', 'plan my week', 1788000001, 0, 1), ('a', 'tool', '{}', 1788000002, 1, 0),
        ('a', 'user', 'no, start on Tuesday', 1788000003, 0, 0), ('a', 'assistant', 'Here is the plan.', 1788000004, 1, 0),
        ('b', 'user', 'scheduled job', 1788000002, 1, 0), ('c', 'user', 'talk in the bot chat', 1788000002, 1, 0);`);
    db.close();
    const found = hermesSessions(path);
    assert.deepEqual(
      found.map((s) => [s.id, s.folder ?? null, s.count]),
      [
        ["a", "/u/app", 2],
        ["c", null, 1],
      ],
      "a session hidden from its lists (its bot chat) is kept, as its search keeps it",
    );
    assert.deepEqual(
      hermesMessages(path, "a").map((m) => [m.role, m.text]),
      [
        ["user", "plan my week"],
        ["assistant", "Here is the plan."],
      ],
      "a compacted message stays; a rewound one does not",
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
