import assert from "node:assert/strict";
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, before, test } from "node:test";
import { isExcluded } from "../server/exclude";
import { indexTerms, matchQuery } from "./cjk";
import { openHistoryForRead, walSafe } from "./db";
import { indexHistory } from "./indexer";
import { parseBound, readSession, searchSessions } from "./search";

const root = mkdtempSync(join(tmpdir(), "minime-history-"));
const claude = join(root, "claude");
const db = join(root, "home", "index", "history.db");
const saved = {
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CODEX_HOME: process.env.CODEX_HOME,
  HERMES_HOME: process.env.HERMES_HOME,
  VSCODE_APPDATA: process.env.VSCODE_APPDATA,
};

const user = (text: string, at: string) =>
  JSON.stringify({
    type: "user",
    timestamp: at,
    message: { role: "user", content: text },
  });
const assistant = (text: string, at: string) =>
  JSON.stringify({
    type: "assistant",
    timestamp: at,
    message: { role: "assistant", content: [{ type: "text", text }] },
  });
const toolResult = (bytes: number) =>
  JSON.stringify({
    type: "user",
    toolUseResult: { stdout: "z".repeat(bytes) },
    message: { role: "user", content: [{ type: "tool_result", content: "z" }] },
  });

function session(project: string, id: string, lines: string[]): string {
  const dir = join(claude, "projects", project.replaceAll("/", "-"));
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(
    file,
    `${JSON.stringify({ type: "summary", cwd: project })}\n${lines.join("\n")}\n`,
  );
  return file;
}

before(() => {
  process.env.CLAUDE_CONFIG_DIR = claude;
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

test("CJK text is indexed as bigrams so two-character Korean words are found inside longer ones", () => {
  assert.equal(indexTerms("미팅메일은 Weekly"), "미팅 팅메 메일 일은 weekly");
  assert.equal(matchQuery("메일 report"), '("메일") AND ("report"*)');
  assert.equal(matchQuery('"; DROP'), '("drop"*)');
  assert.equal(matchQuery("  ...  "), undefined);
});

test("excluded folders match by folder name or by path", () => {
  assert.ok(isExcluded("/work/acme/client-api", ["client-*"]));
  assert.ok(isExcluded("/work/acme/app", ["/work/acme"]));
  assert.ok(!isExcluded("/work/my-app", ["client-*", "/work/acme"]));
});

test("only SQLite versions without the WAL-reset bug get WAL", () => {
  assert.ok(
    walSafe("3.53.4") &&
      walSafe("3.51.3") &&
      walSafe("3.50.7") &&
      walSafe("3.44.6"),
  );
  assert.ok(!walSafe("3.51.2") && !walSafe("3.50.6") && !walSafe("3.47.0"));
});

test("passes fill the index within their budgets, skip tool output, and resume where they stopped", async () => {
  const day = "2026-10-05T09:00:00.000Z";
  // One large session: 200 exchanges with a 300 KB tool result each, plus one 3 MB line.
  const lines: string[] = [];
  for (let i = 0; i < 200; i++) {
    lines.push(
      user(`보고서 ${i} 정리해 줘`, day),
      toolResult(300 * 1024),
      assistant(`정리했어요 ${i}`, day),
    );
    if (i === 100) lines.push(toolResult(3 * 1024 * 1024));
  }
  session("/work/app", "big", lines);
  session("/work/app", "small", [
    user("미팅메일은 세 줄 안으로", day),
    assistant("알겠어요", day),
  ]);
  session("/work/acme/client-api", "company", [user("회사 일", day)]);

  const now = Date.parse("2026-10-06T00:00:00Z");
  let passes = 0;
  let report = await indexHistory({
    path: db,
    maxBytes: 4 * 1024 * 1024,
    excludes: ["client-*"],
    now,
  });
  passes += 1;
  while (!report.complete && passes < 60) {
    report = await indexHistory({
      path: db,
      maxBytes: 4 * 1024 * 1024,
      excludes: ["client-*"],
      now,
    });
    passes += 1;
  }
  assert.ok(report.complete, "the index completes");
  assert.ok(
    passes > 5,
    `a 63 MB session takes several bounded passes (${passes})`,
  );

  const read = openHistoryForRead(db);
  assert.ok(read);
  try {
    const counts = read.prepare("SELECT COUNT(*) AS n FROM messages").get() as {
      n: number;
    };
    assert.equal(
      counts.n,
      402,
      "every prompt and reply, no tool output, nothing twice",
    );
    const hit = searchSessions(read, { query: "메일" });
    assert.equal(hit.mode, "search");
    assert.deepEqual(
      hit.results.map((r) => r.session),
      ["small"],
    );
    assert.match(hit.results[0].snippet, /미팅메일은/);
    assert.equal(
      searchSessions(read, { query: "회사" }).results.length,
      0,
      "excluded folders stay out",
    );
    const browse = searchSessions(read, {});
    assert.equal(browse.mode, "browse");
    assert.deepEqual(browse.results.map((r) => r.session).sort(), [
      "big",
      "small",
    ]);
    const anchor = read
      .prepare(
        "SELECT m.id FROM messages m JOIN files f ON f.id = m.file_id WHERE f.session = 'big' ORDER BY m.seq LIMIT 1 OFFSET 10",
      )
      .get() as { id: number };
    const around = readSession(read, {
      session: "big",
      around: anchor.id,
      window: 2,
    });
    assert.ok("messages" in around && around.messages.length === 5);
  } finally {
    read.close();
  }
});

test("a growing session is continued from where it stopped, and an excluded one is removed", async () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  const day = "2026-10-05T10:00:00.000Z";
  const file = session("/work/notes", "grow", [user("첫 질문", day)]);
  await indexHistory({ path: db, excludes: ["client-*"], now });
  appendFileSync(
    file,
    `${assistant("첫 답", day)}\n${user("두 번째 질문", day)}\n`,
  );
  utimesSync(file, new Date(now - 1000), new Date(now - 1000));
  await indexHistory({ path: db, excludes: ["client-*"], now });
  let read = openHistoryForRead(db);
  assert.ok(read);
  const grown = readSession(read, { session: "grow" });
  read.close();
  assert.deepEqual(
    "messages" in grown ? grown.messages.map((m) => m.text) : [],
    ["첫 질문", "첫 답", "두 번째 질문"],
  );

  await indexHistory({ path: db, excludes: ["client-*", "notes"], now });
  read = openHistoryForRead(db);
  assert.ok(read);
  const gone = readSession(read, { session: "grow" });
  read.close();
  assert.ok(
    "error" in gone,
    "excluding a folder later removes what was indexed from it",
  );
});

test("time bounds read as today, spans or dates", () => {
  const now = Date.parse("2026-10-05T15:00:00");
  assert.equal(parseBound("24h", now), now - 86_400_000);
  assert.equal(parseBound("2w", now), now - 14 * 86_400_000);
  assert.equal(new Date(parseBound("today", now) ?? 0).getHours(), 0);
  assert.equal(parseBound("nonsense", now), undefined);
});

test("a pass limited to recent hours reads only recent sessions and keeps older ones indexed", async () => {
  const now = Date.parse("2026-10-20T00:00:00Z");
  const oldFile = session("/work/archive", "older", [
    user("지난주 질문", "2026-10-10T09:00:00.000Z"),
  ]);
  utimesSync(
    oldFile,
    new Date(now - 10 * 86_400_000),
    new Date(now - 10 * 86_400_000),
  );
  const newFile = session("/work/today", "newer", [
    user("오늘 질문", "2026-10-19T23:00:00.000Z"),
  ]);
  utimesSync(newFile, new Date(now - 3_600_000), new Date(now - 3_600_000));
  const indexed = () => {
    const read = openHistoryForRead(db);
    assert.ok(read);
    const sessions = searchSessions(read, { limit: 50 });
    read.close();
    return "results" in sessions ? sessions.results.map((r) => r.session) : [];
  };

  await indexHistory({ path: db, recentHours: 24, now });
  assert.ok(indexed().includes("newer"));
  assert.ok(
    !indexed().includes("older"),
    "only what the reading needs is read first",
  );

  await indexHistory({ path: db, now });
  assert.ok(
    indexed().includes("older"),
    "the rest of the window is read afterwards",
  );

  await indexHistory({ path: db, recentHours: 24, now });
  assert.ok(
    indexed().includes("older"),
    "a recent pass never drops older sessions",
  );
});

test("chats kept in Cursor's and Hermes Agent's databases are indexed, read again when they change, and leave when deleted", async () => {
  const now = Date.parse("2026-10-06T00:00:00Z");
  const at = (minutes: number) => now - 60 * 60 * 1000 + minutes * 60 * 1000;
  const iso = (minutes: number) => new Date(at(minutes)).toISOString();

  // Cursor: a chat, its bubbles, and the window (folder) it ran in.
  const user = join(root, "appdata", "Cursor", "User");
  mkdirSync(join(user, "globalStorage"), { recursive: true });
  mkdirSync(join(user, "workspaceStorage", "w1"), { recursive: true });
  writeFileSync(
    join(user, "workspaceStorage", "w1", "workspace.json"),
    JSON.stringify({ folder: "file:///work/shop" }),
  );
  const cursor = new DatabaseSync(join(user, "globalStorage", "state.vscdb"));
  cursor.exec(
    "CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB); CREATE TABLE composerHeaders (composerId TEXT PRIMARY KEY, workspaceId TEXT, createdAt INTEGER, lastUpdatedAt INTEGER)",
  );
  const put = cursor.prepare("INSERT INTO cursorDiskKV VALUES (?, ?)");
  const chat = (bubbles: string[], minutes: number) =>
    put.run(
      "composerData:c1",
      JSON.stringify({
        composerId: "c1",
        name: "Orders pagination",
        createdAt: at(0),
        lastUpdatedAt: at(minutes),
        fullConversationHeadersOnly: bubbles.map((bubbleId) => ({ bubbleId })),
      }),
    );
  const bubble = (id: string, type: number, text: string, minutes: number) =>
    put.run(
      `bubbleId:c1:${id}`,
      JSON.stringify({ type, text, createdAt: iso(minutes) }),
    );
  bubble("b1", 1, "add cursor pagination to /orders", 1);
  bubble("b2", 2, "Done: /orders now takes a cursor.", 2);
  chat(["b1", "b2"], 2);
  // An empty draft, as Cursor leaves when its panel opens, and a value that is not JSON.
  put.run("composerData:c2", JSON.stringify({ createdAt: at(3) }));
  put.run("composerData:c3", "not json");
  cursor
    .prepare("INSERT INTO composerHeaders VALUES ('c1', 'w1', ?, ?)")
    .run(at(0), at(2));

  // Hermes Agent: a session the person had, its bot chat (hidden from its lists), and one its
  // scheduler ran.
  mkdirSync(join(root, "hermes"), { recursive: true });
  const hermes = new DatabaseSync(join(root, "hermes", "state.db"));
  hermes.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, source TEXT NOT NULL, cwd TEXT, git_repo_root TEXT, title TEXT, hidden INTEGER DEFAULT 0, started_at REAL NOT NULL);
    CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, timestamp REAL NOT NULL);`);
  hermes
    .prepare(
      "INSERT INTO sessions VALUES ('h1', 'cli', '/work/notes/sub', '/work/notes', 'Weekly plan', 0, ?), ('h2', 'cli', NULL, NULL, NULL, 1, ?), ('h3', 'cron', NULL, NULL, NULL, 0, ?)",
    )
    .run(at(0) / 1000, at(0) / 1000, at(0) / 1000);
  const said = hermes.prepare(
    "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)",
  );
  said.run("h1", "user", "plan my week around the launch", at(5) / 1000);
  said.run("h1", "tool", "{}", at(6) / 1000);
  said.run(
    "h1",
    "assistant",
    `\u0000json:${JSON.stringify([{ type: "text", text: "Monday: launch checklist." }])}`,
    at(7) / 1000,
  );
  said.run("h2", "user", "talk in the bot chat", at(5) / 1000);
  said.run("h3", "user", "scheduled morning plan", at(5) / 1000);
  hermes.close();

  const sessions = () => {
    const read = openHistoryForRead(db);
    assert.ok(read);
    try {
      return read
        .prepare(
          "SELECT session, tool, project, title, messages FROM files WHERE tool IN ('Cursor', 'Hermes Agent') ORDER BY session",
        )
        .all() as {
        session: string;
        tool: string;
        project: string | null;
        title: string | null;
        messages: number;
      }[];
    } finally {
      read.close();
    }
  };

  await indexHistory({ path: db, now });
  assert.deepEqual(
    sessions().map((s) => ({ ...s })),
    [
      {
        session: "c1",
        tool: "Cursor",
        project: "/work/shop",
        title: "Orders pagination",
        messages: 2,
      },
      {
        session: "h1",
        tool: "Hermes Agent",
        project: "/work/notes",
        title: "Weekly plan",
        messages: 2,
      },
      {
        session: "h2",
        tool: "Hermes Agent",
        project: null,
        title: "talk in the bot chat",
        messages: 1,
      },
    ],
    "drafts and scheduled sessions stay out",
  );
  let read = openHistoryForRead(db);
  assert.ok(read);
  assert.deepEqual(
    searchSessions(read, { query: "pagination" }).results.map((r) => r.session),
    ["c1"],
  );
  const plan = readSession(read, { session: "h1" });
  read.close();
  assert.deepEqual(
    "messages" in plan ? plan.messages.map((m) => m.text) : [],
    ["plan my week around the launch", "Monday: launch checklist."],
    "structured content is read as its text",
  );

  // The chat goes on: it is read again whole, nothing twice.
  bubble("b3", 1, "also return the total", 4);
  chat(["b1", "b2", "b3"], 4);
  await indexHistory({ path: db, now });
  assert.equal(sessions().find((s) => s.session === "c1")?.messages, 3);

  // Deleted in Cursor: it leaves the index.
  cursor.exec("DELETE FROM cursorDiskKV WHERE key LIKE '%c1%'");
  cursor.close();
  await indexHistory({ path: db, now });
  assert.deepEqual(
    sessions().map((s) => s.session),
    ["h1", "h2"],
  );
});
