import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { runTurn } from "../chat/turn";
import type { Bot } from "./bridge";
import type { Choice, Listener, Person, Press } from "./discord";

const root = mkdtempSync(join(tmpdir(), "minime-messenger-"));
const saved = process.env.SUB_OFFICE_HOME;
let bridgeModule: typeof import("./bridge");
let store: typeof import("../chat/store");
let gate: typeof import("../gate/gate");

before(async () => {
  process.env.SUB_OFFICE_HOME = root;
  bridgeModule = await import("./bridge");
  store = await import("../chat/store");
  gate = await import("../gate/gate");
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

/** The person's bot on Discord, played by the test. */
class FakeBot implements Bot {
  me: Person = { id: "b1", name: "Mini" };
  sent: { channel: string; text: string; choices: Choice[] }[] = [];
  settled: { press: Press; text: string }[] = [];
  listener: Listener;
  token: string;

  constructor(token: string, listener: Listener) {
    this.token = token;
    this.listener = listener;
  }
  start() {
    this.listener.ready?.(this.me);
  }
  stop() {}
  async whoAmI() {
    if (this.token === "wrong-token-wrong-token") throw new Error("401");
    return this.me;
  }
  async send(channel: string, text: string, choices: Choice[] = []) {
    this.sent.push({ channel, text, choices });
    return `m${this.sent.length}`;
  }
  async typing() {}
  async settle(press: Press, text: string) {
    this.settled.push({ press, text });
  }
  write(author: Person, text: string) {
    this.listener.message?.({ id: "x", channel: "dm1", author, text });
  }
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

const ana = { id: "u1", name: "Ana" };
const stranger = { id: "u9", name: "Zed" };

test("the person's own bot: the first to write is let in by the code their phone shows, and only they are answered", async () => {
  const bots: FakeBot[] = [];
  const turns: { text: string; chat?: string }[] = [];
  // The mini-me, played by the test: it keeps the conversation as the real one does.
  const turn: typeof runTurn = async ({ text, chat, send }) => {
    turns.push({ text, chat });
    const id = chat ?? (await store.createChat(text)).id;
    send({ type: "chat", id, title: text });
    await store.appendMessage(id, "me", text);
    let reply = `About “${text}”.`;
    if (text === "ask me") {
      const ask = {
        kind: "question" as const,
        question: "Which day?",
        choices: ["Mon", "Tue"],
      };
      const asked = gate.askPerson(id, ask);
      send({ type: "ask", id: asked.id, ask });
      const answer = await asked.done;
      reply = answer.answered ? `Then ${answer.answer}.` : "No answer.";
    }
    await store.appendMessage(id, "minime", reply);
    send({ type: "done", chat: id });
  };
  const bridge = new bridgeModule.Bridge({
    makeBot: (token, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push(bot);
      return bot;
    },
    turn,
  });

  await assert.rejects(
    bridge.connect("wrong-token-wrong-token"),
    /messenger-token-wrong/,
  );
  await bridge.connect("right-token-right-token");
  const bot = bots.at(-1) as FakeBot;
  assert.equal((await bridge.status()).state, "on");
  assert.equal((await bridge.status()).bot, "Mini");
  const kept = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
  assert.equal(kept.messenger.discord.token, "right-token-right-token");

  // Whoever writes first is asked about on the computer, with a code sent to their phone; what
  // they write meanwhile waits, and anyone else is told someone is waiting.
  bot.write(ana, "hello?");
  await until(() => bot.sent.length === 1);
  const code = /\b(\d{4})\b/.exec(bot.sent[0].text)?.[1] ?? "";
  assert.ok(code, bot.sent[0].text);
  assert.deepEqual((await bridge.status()).asking, { code, name: "Ana" });
  bot.write(ana, "What's on today?");
  bot.write(stranger, "let me in");
  await until(() => bot.sent.length === 2);
  assert.match(bot.sent[1].text, /Someone else is already waiting/);
  assert.equal(await bridge.allow(code === "0000" ? "1111" : "0000"), false);
  assert.equal(turns.length, 0, "nothing reached the mini-me before");
  assert.equal(await bridge.allow(code), true);
  assert.equal((await bridge.status()).owner, "Ana");
  assert.equal((await bridge.status()).asking, undefined);
  // Let in: what they wrote while they waited is answered, as one turn.
  await until(() => bot.sent.length === 4);
  assert.match(bot.sent[2].text, /You are in/);
  assert.equal(bot.sent[3].text, "About “hello?\nWhat's on today?”.");

  // Someone else is told the mini-me talks with someone already; the person goes on, in one conversation.
  bot.write(stranger, "let me in");
  await until(() => bot.sent.length === 5);
  assert.match(bot.sent[4].text, /already talks with someone else/);
  bot.write(ana, "And tomorrow?");
  await until(() => bot.sent.length === 6);
  assert.equal(turns.length, 2);
  assert.ok(turns[1].chat, "the same conversation goes on");
  assert.equal(
    turns[1].chat,
    JSON.parse(readFileSync(join(root, "settings.json"), "utf8")).messenger
      .discord.chat,
  );

  // Its question comes with buttons, and a press answers it.
  bot.write(ana, "ask me");
  await until(() => bot.sent.length === 7);
  const question = bot.sent[6];
  assert.match(question.text, /Which day\?/);
  assert.deepEqual(
    question.choices.map((c) => c.label),
    ["Mon", "Tue"],
  );
  bot.listener.press?.({
    id: "i1",
    token: "t1",
    channel: "dm1",
    user: ana,
    value: question.choices[1].value,
    message: { id: "m7", text: question.text },
  });
  await until(() => bot.sent.length === 8);
  assert.equal(bot.settled[0].text, "Answer: Tue");
  assert.equal(bot.sent[7].text, "Then Tue.");

  // Or their own words answer it.
  bot.write(ana, "ask me");
  await until(() => bot.sent.length === 9);
  bot.write(ana, "Wednesday works");
  await until(() => bot.sent.length === 10);
  assert.equal(bot.sent[9].text, "Then Wednesday works.");

  // "/new" starts another conversation.
  bot.write(ana, "/new");
  await until(() => bot.sent.length === 11);
  bot.write(ana, "Fresh start");
  await until(() => bot.sent.length === 12);
  assert.equal(turns.at(-1)?.chat, undefined);

  await bridge.disconnect();
  assert.equal((await bridge.status()).configured, false);
  const left = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
  assert.equal(left.messenger, undefined, "the token is forgotten");
});
