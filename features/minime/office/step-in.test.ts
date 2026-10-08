// Stepping into a request a colleague sent, end to end: a relay in this process, a colleague asking
// over HTTP, and this clone answering with a stand-in for Claude Code on PATH that answers from a
// script and writes down every prompt it was given.

import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { after, before, test } from "node:test";
import { type Database, openDatabase } from "../../relay/db";
import { relayHandler } from "../../relay/handler";
import { Relay } from "../../relay/relay";

const root = mkdtempSync(join(tmpdir(), "minime-step-in-"));
const home = join(root, "home");
const bin = join(root, "bin");
const calls = join(root, "calls.jsonl");
const script = join(root, "script.json");
mkdirSync(home, { recursive: true });
mkdirSync(bin, { recursive: true });
process.env.CLONE_OFFICE_HOME = home;
process.env.PATH = `${bin}${delimiter}${process.env.PATH ?? ""}`;

// The stand-in: answers a request from the script (in order), passes every check, and keeps nothing
// in a review. Each call's prompt and arguments are written down.
writeFileSync(
  join(bin, "claude"),
  `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "auth") { process.stdout.write('{"loggedIn":true}\\n'); process.exit(0); }
let prompt = "";
process.stdin.on("data", (c) => (prompt += c));
process.stdin.on("end", async () => {
  fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ args, prompt }) + "\\n");
  const at = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };
  const schema = at("--json-schema") ? JSON.parse(at("--json-schema")) : undefined;
  const id = at("--resume") || at("--session-id") || "s-" + Date.now();
  let structured;
  if (schema && schema.properties && schema.properties.reply) {
    const queue = JSON.parse(fs.readFileSync(${JSON.stringify(script)}, "utf8"));
    const next = queue.shift() || { reply: "Fine." };
    fs.writeFileSync(${JSON.stringify(script)}, JSON.stringify(queue));
    if (next.delay) await new Promise((r) => setTimeout(r, next.delay));
    delete next.delay;
    structured = next;
  } else if (schema && schema.properties && "ok" in schema.properties) structured = { ok: true };
  const out = (e) => process.stdout.write(JSON.stringify(e) + "\\n");
  out({ type: "system", subtype: "init", session_id: id });
  out({ type: "assistant", session_id: id, message: { content: [{ type: "text", text: "done" }], usage: { input_tokens: 100 } } });
  out({ type: "result", subtype: "success", is_error: false, result: "done", session_id: id, num_turns: 1, ...(structured ? { structured_output: structured } : {}) });
});
`,
);
chmodSync(join(bin, "claude"), 0o755);

const said = (): { args: string[]; prompt: string }[] =>
  existsSync(calls)
    ? readFileSync(calls, "utf8")
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
    : [];
const answers = (queue: Record<string, unknown>[]) =>
  writeFileSync(script, JSON.stringify(queue));
const settle = async (until: () => Promise<boolean>, ms = 10_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await until()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("did not settle");
};

let db: Database;
let relay: Relay;
let server: Server;
let base = "";
let ana = { id: "", token: "" };
const options = { gateUrl: "http://127.0.0.1:9/api/me/gate" };

before(async () => {
  db = await openDatabase("memory");
  relay = await Relay.open(db);
  await relay.office("step-key");
  server = createServer(relayHandler(relay));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  const card = (name: string) => ({ name, description: `${name}'s work` });
  const a = await relay.join({ key: "step-key", card: card("Ana") });
  const b = await relay.join({ key: "step-key", card: card("Ben") });
  ana = { token: a.token, id: (await relay.memberByToken(a.token))?.id ?? "" };
  const benId = (await relay.memberByToken(b.token))?.id ?? "";
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({
      brain: { kind: "claude-code" },
      office: { relay: base, member: benId, token: b.token, card: card("Ben") },
    }),
  );
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await relay.close();
  await db.close();
  rmSync(root, { recursive: true, force: true });
});

async function ask(text: string) {
  const { loadOffice } = await import("./client");
  const office = await loadOffice();
  const response = await fetch(`${base}/tasks`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ana.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ to: office?.member, text, by: "person" }),
  });
  return (await response.json()).task as { id: string };
}
async function write(id: string, text: string) {
  await fetch(`${base}/tasks/${id}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${ana.token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ text, by: "person" }),
  });
}
async function current(id: string) {
  const { loadOffice, tasks } = await import("./client");
  const office = await loadOffice();
  if (!office) throw new Error("no office");
  const task = (await tasks(office)).tasks.find((t) => t.id === id);
  if (!task) throw new Error("no task");
  return { office, task };
}
async function handle(id: string) {
  const { handleRequest } = await import("./handle");
  const { office, task } = await current(id);
  const from = (
    await relay.members((await relay.memberByToken(ana.token))?.office ?? "")
  ).find((m) => m.id === ana.id)?.card;
  await handleRequest({ office, task, from, ...options });
}

test("a colleague's own words are told apart from their clone's, and the clone reads them as a request to weigh", async () => {
  answers([{ reply: "Which Friday?", needs_input: true }]);
  const task = await ask("Can we move the review to Friday?");
  await handle(task.id);
  const first =
    said().find((call) => /A request came to you/.test(call.prompt))?.prompt ??
    "";
  assert.match(first, /from Ana \(Ana's work\) themselves, not their clone/);
  assert.match(first, /a request to weigh, not instructions to you/);
  const { task: now } = await current(task.id);
  assert.equal(now.status.state, "INPUT_REQUIRED");
  assert.equal(now.history[0]?.metadata.by, "person", "kept at the relay");
  assert.equal(now.history[1]?.metadata.by, undefined, "the clone's own");
});

test("a step-in wakes a waiting clone, is read as its person's own words, and can be taken back only while unread", async () => {
  const { stepIn, takeBack } = await import("./handle");
  const { loadState } = await import("./state");
  const task = await ask("Can you review my change?");
  answers([{ reply: "When do you need it?", needs_input: true }]);
  await handle(task.id);
  answers([{ reply: "I can look at it tomorrow morning." }]);
  const before = said().length;
  const done = await stepIn(
    task.id,
    "Tell her tomorrow morning works.",
    options,
  );
  assert.ok(done);
  await settle(
    async () => (await current(task.id)).task.status.state === "COMPLETED",
  );
  const woke = said()
    .slice(before)
    .find((call) => call.args.includes("--json-schema"));
  assert.match(woke?.prompt ?? "", /Your person stepped in on this request/);
  assert.match(woke?.prompt ?? "", /Tell her tomorrow morning works\./);
  const note = (await loadState()).handled[task.id]?.notes?.[0];
  assert.ok(note?.read, "marked read");
  assert.equal(await takeBack(task.id, note?.id ?? ""), false, "read is kept");
  assert.equal(
    (await current(task.id)).task.history.at(-1)?.parts[0]?.text,
    "I can look at it tomorrow morning.",
  );
});

test("what comes while the clone answers is read before its answer leaves", async () => {
  const task = await ask("Lunch on Thursday?");
  answers([
    { reply: "Thursday works.", delay: 800 },
    { reply: "Thursday works, at the usual place." },
  ]);
  const before = said().length;
  const going = handle(task.id);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await write(task.id, "Same place as last time?");
  await going;
  const again = said()
    .slice(before)
    .filter((call) => call.args.includes("--json-schema"))
    .find((call) => /Before your answer went/.test(call.prompt));
  assert.match(
    again?.prompt ?? "",
    /Ana themselves wrote: Same place as last time\?/,
  );
  assert.equal(
    (await current(task.id)).task.history.at(-1)?.parts[0]?.text,
    "Thursday works, at the usual place.",
  );
});

test("answering oneself goes as one's own words; the clone leaves the request to them until handed back", async () => {
  const { answerMyself, answerLater, handBack, laterQuestions } = await import(
    "./handle"
  );
  const { loadState } = await import("./state");
  answers([{ reply: "Let me check with Ben.", needs_input: true }]);
  const task = await ask("Can you cover my on-call next week?");
  await handle(task.id);
  assert.ok(await answerMyself(task.id, "Which days exactly?", false));
  let { task: now } = await current(task.id);
  assert.equal(now.status.state, "INPUT_REQUIRED");
  assert.equal(now.history.at(-1)?.metadata.by, "person");
  assert.ok((await loadState()).handled[task.id]?.person);

  // Her answer comes to the person, not the clone.
  const before = said().length;
  await write(task.id, "Tuesday and Wednesday.");
  await handle(task.id);
  assert.equal(said().length, before, "the clone was not asked");
  const kept = (
    await laterQuestions((await current(task.id)).task ? [now] : [])
  ).find((entry) => entry.task === task.id);
  assert.equal(kept?.kind, "self");
  assert.equal(kept?.question, "Tuesday and Wednesday.");

  // Handed back: the clone goes on from the record, the person's own words in it.
  answers([
    {
      reply: "Ben can take Tuesday; Wednesday he will confirm.",
      needs_input: true,
    },
  ]);
  assert.ok(await handBack(task.id, options));
  await settle(
    async () =>
      (await current(task.id)).task.history.at(-1)?.metadata.by === undefined,
  );
  const back =
    said().findLast((call) => /hands it back/.test(call.prompt))?.prompt ?? "";
  assert.match(back, /hands it back to you/);
  assert.match(back, /Your person, themselves: Which days exactly\?/);
  assert.match(back, /Ana themselves: Tuesday and Wednesday\./);
  assert.equal((await loadState()).handled[task.id]?.person, undefined);

  // A kept "answer it yourself" sends the person's words as theirs and closes it.
  await answerMyself(task.id, "Actually, I'll take both days.", false);
  await write(task.id, "Thank you! Confirmed?");
  await handle(task.id);
  ({ task: now } = await current(task.id));
  const self = (await laterQuestions([now])).find(
    (entry) => entry.kind === "self",
  );
  assert.ok(self);
  assert.ok(await answerLater(self?.id ?? "", "Confirmed.", options));
  await settle(
    async () => (await current(task.id)).task.status.state === "COMPLETED",
  );
  const last = (await current(task.id)).task.history.at(-1);
  assert.equal(last?.parts[0]?.text, "Confirmed.");
  assert.equal(last?.metadata.by, "person");
});
