// The person's Codex conversations as the clone's hands, with a stand-in for Codex on PATH that
// writes down how it was started and, for work, changes files where it was told to work: listing
// beside Claude Code's, asking a copy that reads only, and work in a copy of the project whose
// changes reach the person's folder only when they allow it.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, beforeEach, test } from "node:test";

const root = realpathSync(mkdtempSync(join(tmpdir(), "minime-codex-")));
const home = join(root, "home");
const codex = join(root, "codex");
const bin = join(root, "bin");
const calls = join(root, "calls.jsonl");
const script = join(root, "script.json");
const leftOut = join(root, "left-out");
for (const dir of [home, codex, bin, leftOut, join(root, "claude")])
  mkdirSync(dir, { recursive: true });
process.env.CLONE_OFFICE_HOME = home;
process.env.CODEX_HOME = codex;
process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
// The person's own key in their shell is never what a copy is billed to.
process.env.CODEX_API_KEY = "sk-from-the-shell";
// work_session refuses when nobody could be asked; these tests answer through `approve` instead.
process.env.MINIME_GATE_URL = "http://127.0.0.1:9/api/me/gate";
after(() => rmSync(root, { recursive: true, force: true }));

// Left out: a folder by its path, and any folder by its name (`kept-out` inside a project).
writeFileSync(
  join(home, "settings.json"),
  JSON.stringify({ exclude: ["/work/client-a", leftOut, "kept-out"] }),
);
writeFileSync(join(home, "secret.key"), "key");

writeFileSync(
  join(bin, "codex"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  const behaviour = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, "utf8"));
  const cwd = args[args.indexOf("-C") + 1];
  const seen = {};
  if (behaviour.work) {
    fs.appendFileSync(path.join(cwd, "a.txt"), "three\\n");
    fs.writeFileSync(path.join(cwd, "new.txt"), "new\\n");
    fs.rmSync(path.join(cwd, "..", "old.txt"));
    seen.untracked = fs.existsSync(path.join(cwd, "..", "notes.txt"));
    seen.ignored = fs.existsSync(path.join(cwd, "..", "ignored.txt"));
    seen.leftOut = fs.existsSync(path.join(cwd, "..", "kept-out", "p.txt"));
  }
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, cwd: process.cwd(), prompt, key: process.env.CODEX_API_KEY ?? null, seen }) + "\\n");
  const out = (e) => process.stdout.write(JSON.stringify(e) + "\\n");
  out({ type: "thread.started", thread_id: "t-1" });
  out({ type: "turn.started" });
  out({ type: "item.completed", item: { id: "i1", type: "agent_message", text: behaviour.answer } });
  out({ type: "turn.completed", usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5, reasoning_output_tokens: 0 } });
});
`,
);
chmodSync(join(bin, "codex"), 0o755);

const lastCall = (): {
  args: string[];
  cwd: string;
  prompt: string;
  key: string | null;
  seen: Record<string, boolean>;
} => JSON.parse(readFileSync(calls, "utf8").trim().split("\n").at(-1) ?? "");

let made = 0;
/** One Codex conversation as Codex keeps it: a rollout whose first line says where it ran. */
function rollout(
  id: string,
  cwd: string,
  options: {
    said?: string;
    source?: unknown;
    ageDays?: number;
    archived?: boolean;
  } = {},
): string {
  const dir = options.archived
    ? join(codex, "archived_sessions")
    : join(codex, "sessions", "2026", "10", "08");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `rollout-2026-10-08T10-00-0${made++}-${id}.jsonl`);
  const lines = [
    {
      timestamp: "2026-10-08T10:00:00Z",
      type: "session_meta",
      payload: {
        id,
        session_id: id,
        cwd,
        originator: "codex_cli_rs",
        cli_version: "0.161.0",
        source: options.source ?? "cli",
      },
    },
    {
      timestamp: "2026-10-08T10:00:01Z",
      type: "event_msg",
      payload: { type: "user_message", message: options.said ?? "hello" },
    },
  ];
  writeFileSync(file, lines.map((l) => `${JSON.stringify(l)}\n`).join(""));
  const when = (Date.now() - (options.ageDays ?? 0) * 86_400_000) / 1000;
  utimesSync(file, when, when);
  return file;
}

const gitIn = (dir: string, ...args: string[]) =>
  execFileSync("git", args, { cwd: dir, encoding: "utf8" });

/** A project in git with work under way: a change not committed, a new file, an ignored one. */
function project(name: string): string {
  const dir = join(root, name);
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "kept-out"), { recursive: true });
  gitIn(dir, "init", "-q");
  writeFileSync(join(dir, "src", "a.txt"), "one\n");
  writeFileSync(join(dir, "old.txt"), "old\n");
  writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
  writeFileSync(join(dir, "kept-out", "p.txt"), "private\n");
  gitIn(dir, "add", "-A");
  gitIn(
    dir,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@example.com",
    "commit",
    "-qm",
    "start",
  );
  writeFileSync(join(dir, "src", "a.txt"), "one\ntwo\n");
  writeFileSync(join(dir, "notes.txt"), "notes\n");
  writeFileSync(join(dir, "ignored.txt"), "ignored\n");
  return dir;
}

beforeEach(() => {
  writeFileSync(script, JSON.stringify({ answer: "It pages with a cursor." }));
});

test("Codex conversations are listed beside Claude Code's, by the name given, without what is left out", async () => {
  const claude = join(root, "claude", "projects", "-work-api");
  mkdirSync(claude, { recursive: true });
  writeFileSync(
    join(claude, "c1.jsonl"),
    `${JSON.stringify({ type: "user", cwd: "/work/api", message: { content: "hi" } })}\n${JSON.stringify({ type: "custom-title", customTitle: "api", sessionId: "c1" })}\n`,
  );
  const old = (Date.now() - 2 * 3_600_000) / 1000;
  utimesSync(join(claude, "c1.jsonl"), old, old);
  rollout("x1", "/work/payments");
  rollout("x2", "/work/web", {
    said: "Fix the checkout page\nIt double charges.",
    ageDays: 1,
  });
  rollout("x3", "/work/client-a");
  rollout("x4", home);
  rollout("x5", "/work/payments", { source: "exec" });
  rollout("x6", "/work/payments", { source: { subagent: "review" } });
  rollout("x7", "/work/old", { ageDays: 60 });
  rollout("x8", "/work/payments", { archived: true });
  writeFileSync(
    join(codex, "session_index.jsonl"),
    [
      { id: "x1", thread_name: "old name", updated_at: "2026-10-01T00:00:00Z" },
      { id: "x1", thread_name: "payments", updated_at: "2026-10-08T00:00:00Z" },
    ]
      .map((l) => `${JSON.stringify(l)}\n`)
      .join(""),
  );

  const { listSessions, findSession } = await import("./sessions.ts");
  const sessions = await listSessions();
  assert.deepEqual(
    sessions.map((s) => [s.tool, s.id, s.name, s.named, s.cwd]),
    [
      ["codex", "x1", "payments", true, "/work/payments"],
      ["claude-code", "c1", "api", true, "/work/api"],
      ["codex", "x2", "Fix the checkout page", false, "/work/web"],
    ],
  );
  assert.equal(findSession(sessions, "Payments")?.id, "x1");

  const { callHandsTool } = await import("./tools.ts");
  const listed = await callHandsTool("sessions", {});
  assert.match(listed.result, /"payments" · Codex · x1 · \/work\/payments/);
  assert.match(listed.result, /"api" · Claude Code · c1/);
  assert.match(listed.result, /"Fix the checkout page" \(its title\) · Codex/);
});

test("a Codex conversation is asked through a copy kept nowhere, that reads only and never what is left out", async () => {
  const folder = join(root, "asked");
  mkdirSync(folder, { recursive: true });
  const file = rollout("ask-1", folder, { said: "Build the orders API" });
  const before = readFileSync(file);

  const { askSession } = await import("./sessions.ts");
  const answer = await askSession("ask-1", "How does /orders page?");
  assert.equal(answer.ok, true);
  assert.equal(answer.text, "It pages with a cursor.");
  assert.equal(answer.session?.tool, "codex");

  const call = lastCall();
  assert.equal(call.cwd, folder);
  assert.equal(call.key, null, "the shell's key is not passed on");
  assert.match(call.prompt, /How does \/orders page\?[\s\S]*Read only/);
  const args = call.args;
  assert.equal(args[0], "exec");
  for (const flag of ["--json", "--ephemeral", "--ignore-rules"])
    assert.ok(args.includes(flag), `${flag} is given`);
  assert.deepEqual(args.slice(-3), ["fork", "ask-1", "-"]);
  assert.equal(args[args.indexOf("-C") + 1], folder);
  const config = args.filter((_, i) => args[i - 1] === "-c");
  assert.ok(config.includes('default_permissions="clone_office"'));
  assert.ok(config.includes('approval_policy="never"'));
  assert.ok(config.includes('approvals_reviewer="user"'));
  assert.ok(
    config.includes("permissions.clone_office.network={enabled=false}"),
  );
  const files = config.find((c) =>
    c.startsWith("permissions.clone_office.filesystem="),
  );
  assert.ok(files?.includes('":root"="read"'));
  assert.ok(files?.includes(`${JSON.stringify(leftOut)}="deny"`));
  assert.ok(
    files?.includes(`${JSON.stringify(join(home, "secret.key"))}="deny"`),
  );
  assert.ok(!files?.includes('="write"'), "nothing may be written");
  assert.ok(!args.includes("--sandbox"));

  assert.deepEqual(readFileSync(file), before, "the conversation is untouched");
  const run = JSON.parse(
    readFileSync(join(home, "logs", "runs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .at(-1) ?? "",
  );
  assert.equal(run.brain, "codex");
  assert.deepEqual(run.usage, { input: 10, output: 5, cache_read: 2 });
});

test("work happens in a copy of the project and reaches the person's folder only when they allow it", async () => {
  const folder = project("allowed");
  rollout("work-1", join(folder, "src"));
  writeFileSync(
    script,
    JSON.stringify({ work: true, answer: "Added three; ran nothing." }),
  );
  const cards: Record<string, unknown>[] = [];
  const { workSession } = await import("./sessions.ts");
  const work = await workSession("work-1", "Add three to a.txt", {
    chat: "c",
    allow: [],
    approve: async (card) => {
      cards.push({ ...card });
      // While the card is up, the person's folder is as it was.
      assert.equal(
        readFileSync(join(folder, "src", "a.txt"), "utf8"),
        "one\ntwo\n",
      );
      return "allow";
    },
  });
  assert.equal(work.ok, true, work.text);

  const call = lastCall();
  assert.ok(call.cwd.startsWith(join(home, "hands", "work")), call.cwd);
  assert.ok(call.cwd.endsWith("src"), "it works where the conversation did");
  assert.match(call.prompt, /Add three to a\.txt[\s\S]*copy of this project/);
  assert.deepEqual(call.seen, {
    untracked: true,
    ignored: false,
    leftOut: false,
  });
  const config = call.args.filter((_, i) => call.args[i - 1] === "-c");
  const files = config.find((c) =>
    c.startsWith("permissions.clone_office.filesystem="),
  );
  const copyDir = call.cwd.slice(0, -"/src".length);
  assert.ok(files?.includes(`${JSON.stringify(copyDir)}="write"`));
  assert.ok(files?.includes(`${JSON.stringify(join(copyDir, ".git"))}="read"`));
  assert.ok(!files?.includes(`${JSON.stringify(folder)}="write"`));

  assert.equal(cards.length, 1);
  assert.equal(cards[0].folder, folder);
  assert.deepEqual(cards[0].changed, [
    "D old.txt",
    "M src/a.txt",
    "A src/new.txt",
  ]);
  assert.match(String(cards[0].diff), /\+three/);

  assert.equal(
    readFileSync(join(folder, "src", "a.txt"), "utf8"),
    "one\ntwo\nthree\n",
  );
  assert.equal(readFileSync(join(folder, "src", "new.txt"), "utf8"), "new\n");
  assert.equal(existsSync(join(folder, "old.txt")), false);
  assert.equal(readFileSync(join(folder, "ignored.txt"), "utf8"), "ignored\n");
  assert.equal(readFileSync(join(folder, "notes.txt"), "utf8"), "notes\n");
  // The person's repository itself was not written to: nothing staged, no worktree.
  assert.equal(gitIn(folder, "diff", "--cached", "--name-only"), "");
  assert.equal(gitIn(folder, "worktree", "list").trim().split("\n").length, 1);
  assert.deepEqual(
    readdirSync(join(home, "hands", "work")),
    [],
    "the copy is gone",
  );
});

test("changes the person does not allow, or that no longer fit, never reach their folder and are kept", async () => {
  const { workSession } = await import("./sessions.ts");
  writeFileSync(script, JSON.stringify({ work: true, answer: "Done." }));

  const declined = project("declined");
  rollout("work-2", join(declined, "src"));
  const no = await workSession("work-2", "Add three", {
    chat: "c",
    allow: [],
    approve: async () => "deny",
  });
  assert.equal(no.ok, false);
  assert.match(no.text, /did not let the changes into their files/);
  assert.equal(
    readFileSync(join(declined, "src", "a.txt"), "utf8"),
    "one\ntwo\n",
  );
  assert.equal(existsSync(join(declined, "old.txt")), true);
  const kept = /kept in (\S+\.patch)/.exec(no.text)?.[1] ?? "";
  assert.match(readFileSync(kept, "utf8"), /\+three/);

  const moved = project("moved");
  rollout("work-3", join(moved, "src"));
  const late = await workSession("work-3", "Add three", {
    chat: "c",
    allow: [],
    approve: async () => {
      // The person changes the same file while the card is up.
      writeFileSync(join(moved, "src", "a.txt"), "rewritten\n");
      return "allow";
    },
  });
  assert.equal(late.ok, false);
  assert.match(late.text, /could not apply them/);
  assert.equal(
    readFileSync(join(moved, "src", "a.txt"), "utf8"),
    "rewritten\n",
  );
  assert.equal(existsSync(join(moved, "src", "new.txt")), false, "all or none");
  assert.equal(existsSync(join(moved, "old.txt")), true);
});

test("a Codex conversation outside git can be asked but not given work", async () => {
  const folder = join(root, "plain");
  mkdirSync(folder, { recursive: true });
  rollout("work-4", folder);
  writeFileSync(calls, "");
  const { workSession } = await import("./sessions.ts");
  const work = await workSession("work-4", "Change it", {
    chat: "c",
    allow: [],
    approve: async () => "allow",
  });
  assert.equal(work.ok, false);
  assert.match(work.text, /not in a git repository[\s\S]*ask_session/);
  assert.equal(readFileSync(calls, "utf8"), "", "Codex was not started");
});

test("the card for a Codex conversation's changes shows them, and is asked every time", async () => {
  const { changeOf, describe } = await import("../ask-text.ts");
  const input = {
    session: "payments",
    folder: "/work/payments",
    changed: ["M src/a.txt"],
    diff: "diff --git a/src/a.txt b/src/a.txt\n+three",
    copy: "/x",
  };
  assert.equal(
    changeOf("mcp__minime__apply_changes", input),
    "M src/a.txt\n\ndiff --git a/src/a.txt b/src/a.txt\n+three",
  );
  const t = Object.assign((key: string) => key, {
    has: () => true,
  }) as unknown as Parameters<typeof describe>[0];
  assert.equal(
    describe(t, "mcp__minime__apply_changes", input),
    "doing.mcp__minime__apply_changes: /work/payments",
  );
  const { ruleFor } = await import("../gate/rules.ts");
  assert.equal(ruleFor("mcp__minime__apply_changes", input), undefined);
  // Not even the most trusting mode, nor a rule written by hand, lets it through unasked.
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({
      preferences: { autonomy: "auto" },
      trust: { allow: ["mcp__minime__apply_changes"] },
    }),
  );
  const { alreadyAllowed } = await import("../gate/enrich.ts");
  assert.equal(
    await alreadyAllowed(
      { kind: "permission", tool: "mcp__minime__apply_changes", input },
      true,
    ),
    false,
  );
});

test("a task let to change files in its folder goes in without a card only when every change is there and none is left out", async () => {
  const { withinFolder } = await import("./codex.ts");
  const copy = { dir: "/tmp/w/1", cwd: "/tmp/w/1/web", root: "/home/p/repo" };
  const change = (...paths: string[]) =>
    paths.map((path) => ({ status: "M", path }));
  assert.equal(withinFolder(copy, change("web/a.ts", "web/x/b.ts"), []), true);
  assert.equal(
    withinFolder(copy, change("web/a.ts", "api/server.ts"), []),
    false,
    "a file outside the folder the card named",
  );
  assert.equal(withinFolder(copy, change("package.json"), []), false);
  assert.equal(withinFolder(copy, change("website/a.ts"), []), false);
  assert.equal(
    withinFolder(copy, change("web/secret/k.txt"), ["/home/p/repo/web/secret"]),
    false,
    "a folder left out",
  );
  // The conversation ran at the repository's root: the whole of it is its folder.
  assert.equal(
    withinFolder({ ...copy, cwd: copy.dir }, change("api/a.ts"), []),
    true,
  );
});

test("the copy keeps what the person ignores only in .git/info/exclude out, and starts in a folder that has nothing copied", async () => {
  const { makeWorkCopy, removeWorkCopy } = await import("./copy.ts");
  const repo = mkdtempSync(join(tmpdir(), "clone-copy-"));
  const home = mkdtempSync(join(tmpdir(), "clone-copy-home-"));
  try {
    execFileSync("git", ["init", "-q", repo]);
    writeFileSync(join(repo, "a.ts"), "a\n");
    writeFileSync(
      join(repo, ".git", "info", "exclude"),
      "out/\nbuild-scripts/\n",
    );
    mkdirSync(join(repo, "out"));
    writeFileSync(join(repo, "out", "bundle.js"), "x\n");
    mkdirSync(join(repo, "build-scripts"));
    writeFileSync(join(repo, "build-scripts", "make.sh"), "echo\n");
    const copy = await makeWorkCopy(join(repo, "build-scripts"), {
      home,
      excludes: [],
    });
    assert.equal(existsSync(join(copy.dir, "out")), false);
    assert.equal(
      readFileSync(join(copy.dir, ".git", "info", "exclude"), "utf8"),
      "out/\nbuild-scripts/\n",
    );
    assert.equal(existsSync(copy.cwd), true, "the work can start there");
    await removeWorkCopy(copy, home);
  } finally {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});
