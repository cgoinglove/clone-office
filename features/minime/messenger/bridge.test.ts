import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import type { runTurn } from "../chat/turn";
import { isSealed, open } from "../server/secret";
import type { watching } from "../server/presence";
import type { Bot } from "./bridge";
import type { Choice, Listener, Person, Press } from "./discord";
import type { Kept, OfficeSide } from "./office";

const root = mkdtempSync(join(tmpdir(), "minime-messenger-"));
const saved = process.env.CLONE_OFFICE_HOME;
let bridgeModule: typeof import("./bridge");
let store: typeof import("../chat/store");
let gate: typeof import("../gate/gate");

before(async () => {
  process.env.CLONE_OFFICE_HOME = root;
  bridgeModule = await import("./bridge");
  store = await import("../chat/store");
  gate = await import("../gate/gate");
});
after(() => {
  if (saved === undefined) delete process.env.CLONE_OFFICE_HOME;
  else process.env.CLONE_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

/** The person's bot on Discord, played by the test. */
class FakeBot implements Bot {
  me: Person = { id: "b1", name: "Mini" };
  sent: { channel: string; text: string; choices: Choice[] }[] = [];
  settled: { press: Press; text: string }[] = [];
  files: { channel: string; name: string; bytes: string }[] = [];
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
  // The direct-message channel with the person, the one they write in.
  async dm() {
    return "dm1";
  }
  async sendFile(
    channel: string,
    file: { name: string; type: string; bytes: Uint8Array },
  ) {
    this.files.push({
      channel,
      name: file.name,
      bytes: new TextDecoder().decode(file.bytes),
    });
  }
  write(author: Person, text: string, replyTo?: string) {
    this.listener.message?.({
      id: "x",
      channel: "dm1",
      author,
      text,
      ...(replyTo ? { replyTo } : {}),
    });
  }
}

// Generous: the whole suite runs at once, and a busy machine is slow, not wrong.
const until = async (
  check: () => boolean,
  what = String(check),
  ms = 10_000,
) => {
  const end = Date.now() + ms;
  while (!check()) {
    // Which wait it was, so a slow run says where it stood.
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
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
    makeBot: ({ token }, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push(bot);
      return bot;
    },
    turn,
  });

  await assert.rejects(
    bridge.connect("discord", "wrong-token-wrong-token"),
    /messenger-token-wrong/,
  );
  await bridge.connect("discord", "right-token-right-token");
  const bot = bots.at(-1) as FakeBot;
  assert.equal((await bridge.status()).state, "on");
  assert.equal((await bridge.status()).bot, "Mini");
  const kept = JSON.parse(readFileSync(join(root, "settings.json"), "utf8"));
  assert.ok(isSealed(kept.messenger.token), "the token is kept sealed");
  assert.equal(await open(kept.messenger.token), "right-token-right-token");
  assert.equal(kept.messenger.service, "discord");
  if (process.platform !== "win32")
    assert.equal(
      statSync(join(root, "settings.json")).mode & 0o777,
      0o600,
      "the token is for its person's eyes only",
    );

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
      .chat,
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

test("while no page is in view, what waits on the person goes to their phone; news in the phone's conversation always does", async () => {
  const home = join(root, "push");
  process.env.CLONE_OFFICE_HOME = home;
  const bots: FakeBot[] = [];
  let seen: ReturnType<typeof watching> = { state: "watching" };
  let away = false;
  const kept: Kept[] = [];
  const answered: { id: string; given: string }[] = [];
  const office: OfficeSide = {
    kept: async () =>
      kept.filter((one) => !answered.some((a) => a.id === one.id)),
    phoned: async (id) => {
      const one = kept.find((k) => k.id === id);
      if (one) one.phoned = new Date().toISOString();
    },
    about: async (task) => ({
      from: "Ben",
      text:
        task === "t1"
          ? "Can you review my pull request?"
          : "Which plan do we pick?",
      open: true,
    }),
    answer: async (id, given) => {
      answered.push({ id, given });
      return true;
    },
    away: async () => away,
  };
  const bridge = new bridgeModule.Bridge({
    makeBot: ({ token }, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push(bot);
      return bot;
    },
    turn: async () => {},
    office,
    presence: () => seen,
    lookMs: 30,
  });
  await bridge.connect("discord", "right-token-right-token");
  const bot = bots.at(-1) as FakeBot;
  bot.write(ana, "hi");
  await until(() => bot.sent.length === 1);
  await bridge.allow((await bridge.status()).asking?.code ?? "");
  await until(() => bot.sent.length === 2);
  const phone = () => bot.sent.slice(2);

  // A question from a conversation on the page waits there while the page is in view.
  const chat = await store.createChat("Plan the week");
  const asked = gate.askPerson(chat.id, {
    kind: "question",
    question: "Which day?",
    choices: ["Mon", "Tue"],
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(phone().length, 0, "nothing goes while the page is in view");

  // The page left: the question it was holding goes to the phone, once, and a press answers it.
  seen = { state: "away" };
  await until(() => phone().length === 1);
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(phone().length, 1, "once");
  const question = phone()[0];
  assert.match(
    question.text,
    /^From your conversation “Plan the week”:\n\nWhich day\?/,
  );
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
    message: { id: "m3", text: question.text },
  });
  assert.deepEqual(await asked.done, { answered: true, answer: "Tue" });
  await until(() => bot.settled.length === 1);
  assert.equal(bot.settled[0].text, "Answer: Tue");

  // A question about a colleague's request says who asked what; their words answer it.
  const live = gate.askPerson("office-request-t1", {
    kind: "question",
    question: "Can you do it by Friday?",
  });
  await until(() => phone().length === 2);
  assert.equal(
    phone()[1].text,
    "Ben asked: “Can you review my pull request?”\n\nCan you do it by Friday?\n\nReply here with your answer.",
  );
  bot.write(ana, "Yes, Friday");
  assert.deepEqual(await live.done, { answered: true, answer: "Yes, Friday" });
  await until(() => phone().length === 3);
  assert.equal(phone()[2].text, "Answer: Yes, Friday");

  // Said they are away: a colleague's question waits for the day's moment.
  away = true;
  const later = gate.askPerson("office-request-t2", {
    kind: "question",
    question: "Plan A or B?",
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(phone().length, 3, "not while they are away");

  // Kept for later, they come together at the day's moment: one already sent live is not sent again.
  const long = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  kept.push(
    {
      id: "k0",
      task: "t1",
      from: "Ben",
      question: "Can you do it by Friday?",
      ask: live.id,
      at: long,
    },
    {
      id: "k1",
      task: "t2",
      from: "Ben",
      question: "Send “Plan A”?",
      choices: ["Send", "Don't send"],
      at: long,
    },
    { id: "k2", task: "t2", question: "Plan A or B?", ask: later.id, at: long },
  );
  await until(() => phone().length === 6);
  assert.equal(phone()[3].text, "2 questions have waited for you.");
  assert.match(
    phone()[4].text,
    /^Ben asked: “Which plan do we pick\?”\n\nSend “Plan A”\?/,
  );
  assert.deepEqual(
    phone()[4].choices.map((c) => c.value),
    ["later:k1:0", "later:k1:1"],
  );
  assert.match(
    phone()[5].text,
    /Plan A or B\?\n\nReply here with your answer\.$/,
  );
  assert.ok(
    kept.find((k) => k.id === "k1")?.phoned,
    "marked, so a restart does not send it again",
  );
  bot.listener.press?.({
    id: "i2",
    token: "t2",
    channel: "dm1",
    user: ana,
    value: "later:k1:0",
    message: { id: "m5", text: phone()[4].text },
  });
  await until(() => answered.length === 1);
  assert.deepEqual(answered[0], { id: "k1", given: "Send" });
  // A reply to the other one answers that one.
  bot.write(ana, "B, please", `m${bot.sent.indexOf(phone()[5]) + 1}`);
  await until(() => answered.length === 2);
  assert.deepEqual(answered[1], { id: "k2", given: "B, please" });
  away = false;

  // A flow's answer goes while nobody looks; one that came while the page was in view was seen there.
  const flowChat = await store.createChat("Morning brief");
  await store.appendMessage(flowChat.id, "flow", "Morning brief");
  await store.appendMessage(flowChat.id, "minime", "Three things today.");
  await until(() =>
    phone().some((m) => m.text.includes("Three things today.")),
  );
  assert.match(
    phone().at(-1)?.text ?? "",
    /^Morning brief ran on its own \(.+\)\n\nThree things today\.$/,
  );
  seen = { state: "watching" };
  await store.appendMessage(flowChat.id, "flow", "Morning brief");
  await store.appendMessage(flowChat.id, "minime", "Seen on the page.");
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.ok(!phone().some((m) => m.text.includes("Seen on the page.")));

  // An answer to a request sent from the phone comes back to it, whoever is watching.
  const phoneChat = await store.createChat("From the phone");
  await bridge.disconnect();
  await bridge.connect("discord", "right-token-right-token");
  const again = bots.at(-1) as FakeBot;
  again.write(ana, "hi");
  await until(() => again.sent.length === 1);
  await bridge.allow((await bridge.status()).asking?.code ?? "");
  const settings = JSON.parse(
    readFileSync(join(home, "settings.json"), "utf8"),
  );
  settings.messenger.chat = phoneChat.id;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(join(home, "settings.json"), JSON.stringify(settings));
  await store.appendMessage(phoneChat.id, "office", "Ben: Merged it.");
  await until(() => again.sent.some((m) => m.text.includes("Merged it.")));
  assert.equal(
    again.sent.find((m) => m.text.includes("Merged it."))?.text,
    "An answer to your request\nBen: Merged it.",
  );
  await bridge.disconnect();
  process.env.CLONE_OFFICE_HOME = root;
});

test("Telegram's Start is only a hello; another messenger starts afresh, a new token for the same one keeps the person", async () => {
  const home = join(root, "telegram");
  process.env.CLONE_OFFICE_HOME = home;
  const bots: { service: string; bot: FakeBot }[] = [];
  const turns: string[] = [];
  const bridge = new bridgeModule.Bridge({
    makeBot: ({ service, token }, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push({ service, bot });
      return bot;
    },
    turn: async ({ text }) => {
      turns.push(text);
    },
    presence: () => ({ state: "watching" }),
  });
  await bridge.connect("telegram", "123456:telegram-token-abc");
  const bot = bots.at(-1)?.bot as FakeBot;
  assert.equal(bots.at(-1)?.service, "telegram");
  assert.equal((await bridge.status()).service, "telegram");
  bot.write(ana, "/start");
  await until(() => bot.sent.length === 1);
  assert.match(bot.sent[0].text, /\b\d{4}\b/);
  await bridge.allow((await bridge.status()).asking?.code ?? "");
  await until(() => bot.sent.length === 2);
  assert.match(bot.sent[1].text, /^You are in\. Write here/);
  bot.write(ana, "/start");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(turns, [], "nothing for the mini-me in a hello");

  // A new token for the same bot keeps the person; Discord starts afresh.
  await bridge.connect("telegram", "123456:telegram-token-new");
  assert.equal((await bridge.status()).owner, "Ana");
  await bridge.connect("discord", "right-token-right-token");
  assert.equal((await bridge.status()).service, "discord");
  assert.equal((await bridge.status()).owner, undefined);
  await bridge.disconnect();
  process.env.CLONE_OFFICE_HOME = root;
});

test("Slack's two tokens are told apart by how they start, and both are needed", async () => {
  const home = join(root, "slack");
  process.env.CLONE_OFFICE_HOME = home;
  const made: { service: string; token: string; appToken?: string }[] = [];
  const bridge = new bridgeModule.Bridge({
    makeBot: (account, listener) => {
      made.push(account);
      return new FakeBot(account.token, listener);
    },
    turn: async () => {},
    presence: () => ({ state: "watching" }),
  });
  await assert.rejects(
    bridge.connect("slack", "xoxb-1234567890-only-the-bot-token"),
    /messenger-slack-token-wrong/,
  );
  // Pasted in each other's boxes.
  await bridge.connect(
    "slack",
    "xapp-1-A1-1234567890-app-level",
    "xoxb-1234567890-bot-token",
  );
  const kept = JSON.parse(readFileSync(join(home, "settings.json"), "utf8"));
  assert.deepEqual(
    [
      kept.messenger.service,
      await open(kept.messenger.token),
      await open(kept.messenger.appToken),
    ],
    ["slack", "xoxb-1234567890-bot-token", "xapp-1-A1-1234567890-app-level"],
  );
  assert.deepEqual(made.at(-1), {
    service: "slack",
    token: "xoxb-1234567890-bot-token",
    appToken: "xapp-1-A1-1234567890-app-level",
    on: true,
  });
  await bridge.disconnect();
  process.env.CLONE_OFFICE_HOME = root;
});

test("files from the person's phone are kept for the mini-me to read; a stranger's are never taken; a colleague's come to the phone", async () => {
  const home = join(root, "phone-files");
  process.env.CLONE_OFFICE_HOME = home;
  const bots: FakeBot[] = [];
  const turns: { text: string; allow?: string[] }[] = [];
  const bridge = new bridgeModule.Bridge({
    makeBot: ({ token }, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push(bot);
      return bot;
    },
    turn: async ({ text, allow, send }) => {
      turns.push({ text, allow });
      const chat = await store.createChat(text);
      send({ type: "chat", id: chat.id, title: text });
      await store.appendMessage(chat.id, "minime", "Got it.");
      send({ type: "done", chat: chat.id });
    },
    presence: () => ({ state: "watching" }),
  });
  await bridge.connect("telegram", "123456:telegram-token-abc");
  const bot = bots.at(-1) as FakeBot;
  const fetched: string[] = [];
  const photo = (name: string) => ({
    name,
    size: 5,
    fetch: async () => {
      fetched.push(name);
      return new TextEncoder().encode("bytes");
    },
  });
  // Someone knocking with a file: asked about, the file never taken.
  bot.listener.message?.({
    id: "1",
    channel: "dm1",
    author: ana,
    text: "hi",
    files: [photo("knock.jpg")],
  });
  await until(() => bot.sent.length === 1);
  assert.deepEqual(fetched, []);
  await bridge.allow((await bridge.status()).asking?.code ?? "");
  await until(() => turns.length === 1);

  // The person sends a photo with a line: kept in today's folder, and the mini-me told where.
  bot.listener.message?.({
    id: "2",
    channel: "dm1",
    author: ana,
    text: "What is on this receipt?",
    files: [photo("receipt.jpg")],
  });
  await until(() => turns.length === 2);
  const day = new Date().toISOString().slice(0, 10);
  const kept = join(home, "messenger", "files", day, "receipt.jpg");
  assert.equal(
    turns[1].text,
    `What is on this receipt?\n\n[Sent from their phone, now on this computer:\n- receipt.jpg (5 B): ${kept}]`,
  );
  assert.equal(readFileSync(kept, "utf8"), "bytes");
  assert.ok(
    turns[1].allow?.some(
      (rule) => rule.startsWith("Read(") && rule.includes("messenger/files"),
    ),
    "read without asking",
  );
  // A file alone is a message too; the same name again gets a number.
  bot.listener.message?.({
    id: "3",
    channel: "dm1",
    author: ana,
    text: "",
    files: [photo("receipt.jpg")],
  });
  await until(() => turns.length === 3);
  assert.match(turns[2].text, /receipt \(2\)\.jpg/);

  // A colleague's answer with a file, in the phone's conversation, brings the file along.
  const settings = JSON.parse(
    readFileSync(join(home, "settings.json"), "utf8"),
  );
  const attached = join(home, "quote-fixed.csv");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(attached, "item,price");
  await store.appendMessage(
    settings.messenger.chat,
    "office",
    "Ben: Fixed it.",
    [attached],
  );
  await until(() => bot.files.length === 1);
  assert.deepEqual(bot.files[0], {
    channel: "dm1",
    name: "quote-fixed.csv",
    bytes: "item,price",
  });
  await bridge.disconnect();
  process.env.CLONE_OFFICE_HOME = root;
});

test("a flow the mini-me would make shows itself on the phone, as its card does on the page", async () => {
  const home = join(root, "flow-card");
  process.env.CLONE_OFFICE_HOME = home;
  const bots: FakeBot[] = [];
  const bridge = new bridgeModule.Bridge({
    makeBot: ({ token }, listener) => {
      const bot = new FakeBot(token, listener);
      bots.push(bot);
      return bot;
    },
    turn: async ({ text, send }) => {
      const chat = await store.createChat(text);
      send({ type: "chat", id: chat.id, title: text });
      if (text === "remind me") {
        // As the gate route makes it (enrich.ts): a flow may be allowed from now on.
        const ask = {
          kind: "permission" as const,
          tool: "mcp__minime__flow_manage",
          input: {
            action: "create",
            name: "Water",
            when: { kind: "once", in_minutes: 2 },
            what: "Remind me to drink a glass of water.",
          },
          always: true,
        };
        const asked = gate.askPerson(chat.id, ask);
        send({ type: "ask", id: asked.id, ask });
        await asked.done;
      }
      if (text === "run it") {
        const ask = {
          kind: "permission" as const,
          tool: "Bash",
          input: { command: "ls" },
          always: false,
        };
        const asked = gate.askPerson(chat.id, ask);
        send({ type: "ask", id: asked.id, ask });
        await asked.done;
      }
      send({ type: "done", chat: chat.id });
    },
    presence: () => ({ state: "watching" }),
  });
  await bridge.connect("discord", "right-token-right-token");
  const bot = bots.at(-1) as FakeBot;
  bot.write(ana, "hi");
  await until(() => bot.sent.length === 1);
  await bridge.allow((await bridge.status()).asking?.code ?? "");
  await until(() => bot.sent.length === 2);
  bot.write(ana, "remind me");
  await until(() => bot.sent.some((m) => m.text.includes("Water")));
  const card = bot.sent.find((m) => m.text.includes("Water"));
  assert.match(
    card?.text ?? "",
    /^May I do this\?\nMake a flow\nWater\nOnce, in 2 minutes\nRemind me to drink a glass of water\.$/,
  );
  assert.deepEqual(
    card?.choices.map((c) => c.label),
    ["Allow", "Don't ask again for this", "Don't allow"],
  );
  for (const pending of gate.pendingAsks()) gate.answerAsk(pending.id, "deny");
  // A command is asked every time: no "from now on" on the phone either.
  bot.write(ana, "run it");
  await until(() => bot.sent.some((m) => m.text.includes("$ ls")));
  assert.deepEqual(
    bot.sent.find((m) => m.text.includes("$ ls"))?.choices.map((c) => c.label),
    ["Allow", "Don't allow"],
  );
  for (const pending of gate.pendingAsks()) gate.answerAsk(pending.id, "deny");
  await bridge.disconnect();
  process.env.CLONE_OFFICE_HOME = root;
});
