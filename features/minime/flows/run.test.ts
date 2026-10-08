// A flow's run with a stand-in for Claude Code on PATH that answers from a script and writes down
// every prompt: a run with news is told, one with nothing new is kept quietly, and each run is shown
// what the last one said.

import assert from "node:assert/strict";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-flow-run-"));
const home = join(root, "home");
const bin = join(root, "bin");
const calls = join(root, "calls.jsonl");
const script = join(root, "script.json");
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });
process.env.CLONE_OFFICE_HOME = home;
process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;
after(() => rmSync(root, { recursive: true, force: true }));

writeFileSync(
  join(bin, "claude"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "auth") { process.stdout.write('{"loggedIn":true}\\n'); process.exit(0); }
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", () => {
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, prompt }) + "\\n");
  const queue = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, "utf8"));
  const structured = queue.shift();
  fs.writeFileSync(${JSON.stringify(script)}, JSON.stringify(queue));
  const id = "s-" + Date.now();
  const out = (e) => process.stdout.write(JSON.stringify(e) + "\\n");
  out({ type: "system", subtype: "init", session_id: id });
  out({ type: "result", subtype: "success", is_error: false, result: "done", session_id: id, num_turns: 1, structured_output: structured });
});
`,
);
chmodSync(join(bin, "claude"), 0o755);

const prompts = (): string[] =>
  readFileSync(calls, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).prompt);

test("a run with news is told; one with nothing new is kept quietly, having seen the last one", async () => {
  const { addFlow } = await import("./store.ts");
  const { runFlow } = await import("./run.ts");
  const { onChatMessage, readChat, listChats } = await import(
    "../chat/store.ts"
  );
  const flow = {
    id: "watch-the-release",
    name: "Watch the release",
    what: "Tell me when the release notes change.",
    when: { kind: "every" as const, minutes: 30 },
    created: new Date().toISOString(),
  };
  await addFlow(flow);
  const heard: { role: string; quiet?: boolean }[] = [];
  const stop = onChatMessage((news) =>
    heard.push({ role: news.role, quiet: news.quiet }),
  );

  writeFileSync(
    script,
    JSON.stringify([
      { notify: true, text: "The notes now list the Windows fix." },
      { notify: false, text: "Nothing new since the Windows fix." },
    ]),
  );
  const first = await runFlow(flow.id);
  assert.ok(first.ok && first.chat);
  const chat = first.chat as string;
  const updated = (await listChats()).find((c) => c.id === chat)?.updated;

  const second = await runFlow(flow.id);
  assert.ok(second.ok);
  stop();

  const lines = (await readChat(chat))?.messages ?? [];
  assert.deepEqual(
    lines.map((line) => [line.role, line.text, Boolean(line.quiet)]),
    [
      ["flow", "Watch the release", false],
      ["minime", "The notes now list the Windows fix.", false],
      ["flow", "Watch the release", false],
      ["minime", "Nothing new since the Windows fix.", true],
    ],
  );
  assert.deepEqual(
    heard.filter((news) => news.role === "minime"),
    [
      { role: "minime", quiet: undefined },
      { role: "minime", quiet: true },
    ],
  );
  assert.equal(
    (await listChats()).find((c) => c.id === chat)?.updated,
    updated,
    "a quiet run does not bring the conversation up the list",
  );
  const [one, two] = prompts();
  assert.doesNotMatch(one, /What the last run told them/);
  assert.match(
    two,
    /What the last run told them[^\n]*:\nThe notes now list the Windows fix\./,
  );
});
