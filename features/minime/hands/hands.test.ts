import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { allowedByMode } from "../gate/autonomy.ts";
import { ALWAYS_ASKED, ruleFor } from "../gate/rules.ts";
import { browserChannel } from "./browser.ts";
import {
  BASH,
  BROWSER_READ_RULE,
  browserActRules,
  browserReadRules,
  browserTool,
} from "./names.ts";
import {
  callShellTool,
  fold,
  insideWorkspace,
  keptOut,
  secretPaths,
  shellEnv,
} from "./shell.ts";

const root = mkdtempSync(join(tmpdir(), "minime-hands-"));
after(() => rmSync(root, { recursive: true, force: true }));

test("a command is kept 'from now on' only inside the sandbox; outside it is shown every time", () => {
  assert.equal(ruleFor(BASH, { command: "ls", sandboxed: true }), BASH);
  assert.equal(ruleFor(BASH, { command: "ls", sandboxed: false }), undefined);
  assert.equal(ruleFor(BASH, { command: "ls" }), undefined);
});

test("in auto mode a sandboxed command runs alone; outside the sandbox, by hand, never", async () => {
  assert.equal(await allowedByMode(BASH, { sandboxed: true }, "auto"), true);
  assert.equal(await allowedByMode(BASH, { sandboxed: false }, "auto"), false);
  assert.equal(await allowedByMode(BASH, { sandboxed: true }, "ask"), false);
});

test("looking in the browser is one rule; acting is asked; uploading and running code always are", async () => {
  assert.equal(browserTool("mcp__browser__browser_click"), "browser_click");
  assert.equal(browserTool("mcp__minime__bash"), undefined);
  assert.equal(
    ruleFor("mcp__browser__browser_navigate", { url: "https://a.example" }),
    BROWSER_READ_RULE,
  );
  assert.equal(
    ruleFor("mcp__browser__browser_click", { ref: "e1" }),
    undefined,
  );
  assert.equal(ruleFor("mcp__browser__browser_file_upload", {}), undefined);
  assert.ok(browserReadRules().includes("mcp__browser__browser_snapshot"));
  assert.ok(!browserReadRules().includes("mcp__browser__browser_click"));
  const acts = browserActRules();
  assert.ok(acts.includes("mcp__browser__browser_click"));
  assert.ok(!acts.includes("mcp__browser__browser_file_upload"));
  assert.ok(!acts.includes("mcp__browser__browser_run_code_unsafe"));
  assert.equal(
    await allowedByMode("mcp__browser__browser_click", {}, "auto"),
    true,
  );
  assert.equal(
    await allowedByMode("mcp__browser__browser_evaluate", {}, "auto"),
    false,
  );
  assert.equal(
    await allowedByMode("mcp__browser__browser_click", {}, "ask"),
    false,
  );
  assert.ok(ALWAYS_ASKED.has("mcp__minime__skill_install"));
});

test("the browser is Chrome where installed, Edge on Windows, else Chromium", () => {
  assert.equal(
    browserChannel("darwin", () => true),
    "chrome",
  );
  assert.equal(
    browserChannel("darwin", () => false),
    "chromium",
  );
  assert.equal(
    browserChannel("win32", () => false),
    "msedge",
  );
  assert.equal(
    browserChannel("linux", () => false),
    "chromium",
  );
});

test("no command reads keys, secrets or the clone's own sealed files", () => {
  const paths = secretPaths("/home/a", "/home/a/.clone-office");
  for (const kept of [
    "/home/a/.ssh",
    "/home/a/.aws",
    "/home/a/.clone-office/secret.key",
    "/home/a/.clone-office/brain",
    "/home/a/.clone-office/connectors",
    "/home/a/.clone-office/settings.json",
  ])
    assert.ok(paths.includes(kept), kept);
});

test("folders kept out by path are held everywhere; by name only where the sandbox takes patterns", () => {
  assert.deepEqual(keptOut(["~/work/private", "/srv/x"], "linux", "/home/a"), {
    paths: ["/home/a/work/private", "/srv/x"],
    held: true,
  });
  assert.equal(keptOut(["client-*"], "linux", "/home/a").held, false);
  assert.deepEqual(keptOut(["client-*"], "darwin", "/home/a"), {
    paths: ["**/client-*"],
    held: true,
  });
});

test("a command never gets the person's secrets or the app's own settings, and keeps its caches in the workspace", () => {
  const env = shellEnv(
    {
      PATH: "/bin",
      HOME: "/home/a",
      OPENAI_API_KEY: "sk-x",
      GITHUB_TOKEN: "t",
      DATABASE_URL: "postgres://x",
      CLONE_OFFICE_HOME: "/home/a/.clone-office",
      MINIME_GATE_SECRET: "s",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv,
    "/ws",
  );
  assert.equal(env.PATH, "/bin");
  for (const gone of [
    "OPENAI_API_KEY",
    "GITHUB_TOKEN",
    "DATABASE_URL",
    "CLONE_OFFICE_HOME",
    "MINIME_GATE_SECRET",
    "NODE_ENV",
  ])
    assert.equal(env[gone], undefined, gone);
  assert.equal(env.npm_config_cache, "/ws/.cache/npm");
});

test("long output keeps its head and tail and says where the whole is", () => {
  const text = `${"a".repeat(40_000)}${"z".repeat(10_000)}`;
  const folded = fold(text, "/ws/.outputs/1.txt");
  assert.ok(folded.length < text.length);
  assert.ok(folded.startsWith("aaa"));
  assert.ok(folded.endsWith("zzz"));
  assert.match(folded, /\/ws\/\.outputs\/1\.txt/);
  assert.equal(fold("short"), "short");
});

test("write_file stays inside the workspace, and a link cannot lead it out", async () => {
  const workspace = join(root, "workspace");
  mkdirSync(join(workspace, "notes"), { recursive: true });
  mkdirSync(join(root, "outside"), { recursive: true });
  symlinkSync(join(root, "outside"), join(workspace, "door"));
  const ok = await insideWorkspace("notes/a.md", workspace);
  assert.ok("path" in ok);
  assert.ok("error" in (await insideWorkspace("../x.md", workspace)));
  assert.ok("error" in (await insideWorkspace("/etc/passwd", workspace)));
  assert.ok("error" in (await insideWorkspace("door/x.md", workspace)));
  assert.ok("error" in (await insideWorkspace("", workspace)));
});

test("write_file also puts a temporary file in the session's scratch folder, and nowhere else outside the workspace", async () => {
  const home = join(root, "clone");
  const scratch = join(home, "scratch", "session-0001");
  const was = {
    home: process.env.CLONE_OFFICE_HOME,
    scratch: process.env.MINIME_SCRATCH_DIR,
  };
  process.env.CLONE_OFFICE_HOME = home;
  process.env.MINIME_SCRATCH_DIR = scratch;
  try {
    const kept = await callShellTool("write_file", {
      path: join(scratch, "notes", "draft.md"),
      content: "draft",
    });
    assert.equal(kept.isError, false, kept.result);
    assert.match(kept.result, /in the scratch folder/);
    assert.equal(
      readFileSync(join(scratch, "notes", "draft.md"), "utf8"),
      "draft",
    );
    const made = await callShellTool("write_file", {
      path: "plan/index.html",
      content: "<p>plan</p>",
    });
    assert.equal(made.isError, false, made.result);
    assert.equal(
      readFileSync(join(home, "workspace", "plan", "index.html"), "utf8"),
      "<p>plan</p>",
    );
    const away = await callShellTool("write_file", {
      path: join(root, "elsewhere.md"),
      content: "no",
    });
    assert.equal(away.isError, true);
  } finally {
    for (const [name, value] of [
      ["CLONE_OFFICE_HOME", was.home],
      ["MINIME_SCRATCH_DIR", was.scratch],
    ] as const)
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
