import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { indexHistory } from "../history/indexer";
import { Budget, inputsSection } from "./gather";

const root = mkdtempSync(join(tmpdir(), "minime-gather-"));
const saved = {
  CLAUDE_CONFIG_DIR: process.env.CLAUDE_CONFIG_DIR,
  CODEX_HOME: process.env.CODEX_HOME,
  SUB_OFFICE_HOME: process.env.SUB_OFFICE_HOME,
  HERMES_HOME: process.env.HERMES_HOME,
  VSCODE_APPDATA: process.env.VSCODE_APPDATA,
};

before(() => {
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  process.env.CODEX_HOME = join(root, "codex");
  process.env.SUB_OFFICE_HOME = join(root, "home");
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

function session(project: string, id: string, prompts: string[], at: string) {
  const dir = join(root, "claude", "projects", project.replaceAll("/", "-"));
  mkdirSync(dir, { recursive: true });
  const rows = [
    JSON.stringify({ type: "summary", cwd: project }),
    ...prompts.map((text) =>
      JSON.stringify({
        type: "user",
        timestamp: at,
        message: { role: "user", content: text },
      }),
    ),
  ];
  writeFileSync(join(dir, `${id}.jsonl`), `${rows.join("\n")}\n`);
}

test("a share a source leaves unused flows to the next source", () => {
  const budget = new Budget(
    1000,
    new Map([
      ["a", 0.5],
      ["b", 0.3],
      ["c", 0.2],
    ]),
  );
  assert.equal(budget.open("a"), 500);
  budget.spend(100);
  assert.equal(budget.open("b"), 700, "400 left over plus b's 300");
  budget.spend(700);
  assert.equal(budget.open("c"), 200);
});

test("recent prompts come by the folders used most, newest first, and never from excluded folders", async () => {
  const at = new Date(Date.now() - 60_000).toISOString();
  session(
    "/work/app",
    "s1",
    ["앱 배포 순서 정리", "로그인 버그 고쳐", "릴리스 노트 써 줘"],
    at,
  );
  session("/work/site", "s2", ["랜딩 문구 다듬기"], at);
  session("/work/acme/client-api", "s3", ["회사 API 수정"], at);
  await indexHistory({ excludes: ["client-*"], budgetMs: 5000 });
  const inputs = inputsSection(Date.now() - 86_400_000, 5000);
  assert.deepEqual(inputs.projects, ["/work/app", "/work/site"]);
  assert.match(inputs.text, /### app \(3 prompts; 3 newest shown\)/);
  assert.doesNotMatch(inputs.text, /회사 API/);
  assert.equal(inputs.report.items, 4);
});
