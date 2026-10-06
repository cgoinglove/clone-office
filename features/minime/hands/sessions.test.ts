import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-sessions-"));
const claude = join(root, "claude");
const home = join(root, "minime");
process.env.CLAUDE_CONFIG_DIR = claude;
process.env.SUB_OFFICE_HOME = home;
after(() => rmSync(root, { recursive: true, force: true }));

function session(
  folder: string,
  cwd: string,
  id: string,
  lines: object[],
  ageDays = 0,
) {
  const dir = join(claude, "projects", folder);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${id}.jsonl`);
  writeFileSync(
    file,
    [{ type: "user", cwd, message: { content: "hi" } }, ...lines]
      .map((l) => `${JSON.stringify(l)}\n`)
      .join(""),
  );
  const when = (Date.now() - ageDays * 86_400_000) / 1000;
  utimesSync(file, when, when);
}

test("the person's recent conversations, by the name they gave, without what they left out", async () => {
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({ exclude: ["/work/client-a"] }),
  );
  session("-work-payments", "/work/payments", "a1", [
    { type: "ai-title", aiTitle: "Fix pagination", sessionId: "a1" },
    { type: "custom-title", customTitle: "old name", sessionId: "a1" },
    { type: "custom-title", customTitle: "payments-api", sessionId: "a1" },
  ]);
  session(
    "-work-web",
    "/work/web",
    "b2",
    [{ type: "ai-title", aiTitle: "Checkout page", sessionId: "b2" }],
    1,
  );
  session("-work-client-a", "/work/client-a", "c3", [
    { type: "custom-title", customTitle: "secret", sessionId: "c3" },
  ]);
  session("-minime", home, "d4", [
    { type: "custom-title", customTitle: "mine", sessionId: "d4" },
  ]);
  session("-work-old", "/work/old", "e5", [], 60);

  const { findSession, listSessions } = await import("./sessions");
  const sessions = await listSessions();
  assert.deepEqual(
    sessions.map((s) => [s.id, s.name, s.named, s.cwd]),
    [
      ["a1", "payments-api", true, "/work/payments"],
      ["b2", "Checkout page", false, "/work/web"],
    ],
  );
  assert.equal(findSession(sessions, "Payments-API")?.id, "a1");
  assert.equal(findSession(sessions, "b2")?.name, "Checkout page");
  assert.equal(
    findSession(sessions, "secret"),
    undefined,
    "a folder left out is never found",
  );
});

test("a conversation is asked to read only", async () => {
  const { askPrompt } = await import("./sessions");
  assert.match(
    askPrompt("How does /orders page?"),
    /How does \/orders page\?[\s\S]*Read only: change nothing/,
  );
});

test("a conversation given work is told every change is asked, and to claim only what it checked", async () => {
  const { workPrompt } = await import("./sessions");
  assert.match(
    workPrompt("Add total to /orders"),
    /Add total to \/orders[\s\S]*asked of your person first[\s\S]*only if you ran them/,
  );
});
