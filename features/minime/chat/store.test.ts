import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import {
  appendMessage,
  carryOver,
  chatLineMessage,
  createChat,
  listChats,
  readChat,
  setSession,
} from "./store";
import { recap } from "./turn";

const root = mkdtempSync(join(tmpdir(), "minime-chat-"));
const saved = process.env.SUB_OFFICE_HOME;
before(() => {
  process.env.SUB_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

test("a conversation keeps its messages, its brain session and what it was carried over with", async () => {
  const chat = await createChat(
    "Sum up   what I decided this week",
    new Date("2026-10-06T01:00:00Z"),
  );
  assert.equal(chat.title, "Sum up what I decided this week");
  await appendMessage(chat.id, "me", "Sum up what I decided this week");
  await appendMessage(chat.id, "minime", "Three things.");
  await setSession(chat.id, "session-1", 120_000);
  let read = await readChat(chat.id);
  assert.ok(read);
  assert.equal(read.info.turns, 1);
  assert.equal(read.info.session, "session-1");
  assert.equal(read.info.context, 120_000);
  assert.deepEqual(
    read.messages.map((m) => m.role),
    ["me", "minime"],
  );

  await carryOver(chat.id, "They decided three things.");
  read = await readChat(chat.id);
  assert.ok(read);
  assert.equal(
    read.info.session,
    undefined,
    "a carried conversation starts a fresh session",
  );
  assert.equal(read.info.summary, "They decided three things.");
  assert.equal(
    read.info.carriedFrom,
    2,
    "the summary covers the lines before it",
  );
  assert.deepEqual(
    read.messages.map((m) => m.text),
    ["Sum up what I decided this week", "Three things."],
    "the record stays whole",
  );
});

test("conversations are listed latest first, and ids cannot leave the folder", async () => {
  const older = await createChat("older", new Date("2026-10-01T00:00:00Z"));
  await appendMessage(older.id, "me", "older");
  const newer = await createChat("newer", new Date("2026-10-05T00:00:00Z"));
  await appendMessage(newer.id, "me", "newer");
  const ids = (await listChats()).map((c) => c.id);
  assert.ok(ids.indexOf(newer.id) < ids.indexOf(older.id));
  await assert.rejects(appendMessage("../../etc", "me", "x"));
  assert.equal(await readChat("../x"), undefined);
});

test("the index reads what was said, and a recap keeps the latest within its size", () => {
  assert.deepEqual(
    chatLineMessage(
      '{"type":"message","role":"me","text":"hi","at":"2026-10-06T00:00:00Z"}',
    ),
    { role: "user", at: "2026-10-06T00:00:00Z", text: "hi" },
  );
  assert.equal(
    chatLineMessage('{"type":"message","role":"saved","text":"kept","at":"x"}'),
    undefined,
  );
  const messages = Array.from({ length: 30 }, (_, i) => ({
    role: (i % 2 ? "minime" : "me") as "me" | "minime",
    text: `message ${i} ${"x".repeat(100)}`,
    at: "",
  }));
  const short = recap(messages, 600);
  assert.ok(short.includes("message 29"));
  assert.ok(!short.includes("message 0 "));
  assert.ok(short.length <= 700);
});

test("what colleagues answered since the mini-me last spoke is carried into the next turn", async () => {
  const { newsSince } = await import("./turn");
  const at = "";
  assert.deepEqual(
    newsSince([
      { role: "me", text: "Ask Ben about Friday", at },
      { role: "office", text: "Ben: earlier news", at },
      { role: "minime", text: "Sent.", at },
      { role: "office", text: "Ben: Friday works.", at },
      { role: "saved", text: "kept", at },
    ]),
    ["Ben: Friday works."],
  );
  assert.deepEqual(newsSince([{ role: "me", text: "hi", at }]), []);
  assert.deepEqual(
    newsSince([
      { role: "minime", text: "Done.", at },
      {
        role: "told",
        text: "Ana asked how /orders pages; I said by cursor.",
        at,
      },
    ]),
    [
      "You answered a colleague for them: Ana asked how /orders pages; I said by cursor.",
    ],
    "what the mini-me answered for the person is carried too",
  );
});
