import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { after, before, test } from "node:test";
import { keyCode } from "../../lib/key-code.ts";
import { type Database, openDatabase } from "./db";
import { type Caller, OWN_HOURS, Relay } from "./relay";

// A person talking to their own clone from the team server's page (relay.ts `ownSay`).
let db: Database;
let relay: Relay;
before(async () => {
  db = await openDatabase("memory");
  relay = await Relay.open(db);
  await relay.office("own-key");
});
after(async () => {
  await relay.close();
  await db.close();
});

// A browser the person paired: its key, and what it signs as the page's script signs it.
function browser() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const key = publicKey
    .export({ type: "spki", format: "der" })
    .toString("base64url");
  return {
    key,
    code: keyCode(key),
    proof(what: Record<string, string>) {
      const signed = JSON.stringify({
        v: 1,
        ...what,
        at: Date.now(),
        nonce: randomUUID(),
      });
      return {
        key,
        signed,
        sig: sign("sha256", Buffer.from(signed), {
          key: privateKey,
          dsaEncoding: "ieee-p1363",
        }).toString("base64url"),
      };
    },
  };
}
const page = browser();
const said = (text: string) => page.proof({ kind: "say", text });

async function join(name: string) {
  const { token } = await relay.join({
    key: "own-key",
    card: { name, description: "" },
  });
  return (await relay.memberByToken(token)) as Caller;
}

test("words from the page reach the clone only once its person turned it on, and its answer comes back", async () => {
  const ana = await join("Ana");
  // Off until the clone says its person turned it on.
  await assert.rejects(relay.ownSay(ana.id, "Hello", said("Hello")), {
    code: "web-chat-off",
  });
  assert.equal((await relay.ownThread(ana.id)).on, false);
  await relay.ownAllow(ana, true);
  await assert.rejects(relay.ownSay(ana.id, "   "), { code: "bad-request" });
  // Only a browser its clone trusts: none signed, or one it never paired, is turned away at once.
  await assert.rejects(relay.ownSay(ana.id, "Hello"), {
    code: "web-chat-unpaired",
  });
  await assert.rejects(relay.ownSay(ana.id, "Hello", said("Hello")), {
    code: "web-chat-unpaired",
  });
  await relay.ownAllow(ana, true, [page.code, "not-a-code"]);
  assert.deepEqual((await relay.ownThread(ana.id)).keys, [page.code]);
  const proof = said("What's on today?");
  const words = await relay.ownSay(ana.id, "What's on today?", proof);
  const [news] = await relay.inbox(ana, 0, 0);
  assert.equal(news.type, "own");
  assert.deepEqual(news.type === "own" && news.own, {
    id: words.id,
    kind: "said",
    text: "What's on today?",
    proof,
  });
  // Taken, then answered: the page shows both, in order.
  await relay.ownTake(ana, words.id);
  assert.equal((await relay.ownThread(ana.id)).messages[0].taken, true);
  await relay.ownAnswer(ana, { replyTo: words.id, text: "Two requests." });
  const thread = await relay.ownThread(ana.id);
  assert.deepEqual(
    thread.messages.map((m) => [m.kind, m.text, m.replyTo]),
    [
      ["said", "What's on today?", undefined],
      ["answer", "Two requests.", words.id],
    ],
  );
  // A failure is a code the page words, never the clone's raw text.
  const failed = await relay.ownAnswer(ana, {
    replyTo: words.id,
    code: "brain-limit@1791890400",
  });
  assert.equal(failed.code, "brain-limit@1791890400");
  await assert.rejects(relay.ownAnswer(ana, { code: "<script>" }), {
    code: "bad-request",
  });
});

test("the clone's question is answered once from the page, with one of its own choices", async () => {
  const ben = await join("Ben");
  await relay.ownAllow(ben, true, [page.code]);
  const choose = (ask: string, value: string) =>
    page.proof({ kind: "choose", ask, value });
  const asked = await relay.ownAsk(ben, {
    text: "May I read the plan in Notion?",
    choices: [
      { label: "Allow", value: "ask:g1:allow" },
      { label: "Deny", value: "ask:g1:deny" },
    ],
  });
  const before = (await relay.inbox(ben, 0, 0)).at(-1)?.seq ?? 0;
  await assert.rejects(
    relay.ownChoose(
      ben.id,
      asked.id,
      "ask:g1:always",
      choose(asked.id, "ask:g1:always"),
    ),
    { code: "bad-request" },
  );
  // unsigned, the question stays waiting
  await assert.rejects(relay.ownChoose(ben.id, asked.id, "ask:g1:allow"), {
    code: "web-chat-unpaired",
  });
  const proof = choose(asked.id, "ask:g1:allow");
  await relay.ownChoose(ben.id, asked.id, "ask:g1:allow", proof);
  const [news] = await relay.inbox(ben, before, 0);
  assert.deepEqual(news.type === "own" && news.own, {
    id: asked.id,
    kind: "chosen",
    value: "ask:g1:allow",
    proof,
  });
  await assert.rejects(
    relay.ownChoose(
      ben.id,
      asked.id,
      "ask:g1:deny",
      choose(asked.id, "ask:g1:deny"),
    ),
    { code: "no-longer-waiting" },
  );
  // One answered on the computer stops waiting on the page.
  const other = await relay.ownAsk(ben, {
    text: "Which one?",
    choices: [{ label: "A", value: "ask:g2:0" }],
  });
  await relay.ownSettle(ben, other.id);
  const shown = (await relay.ownThread(ben.id)).messages.find(
    (m) => m.id === other.id,
  );
  assert.equal(shown?.chosen, "settled");
  // Someone else's clone cannot answer or settle another's question.
  const cy = await join("Cy");
  await assert.rejects(
    relay.ownChoose(cy.id, other.id, "ask:g2:0", choose(other.id, "ask:g2:0")),
    { code: "no-longer-waiting" },
  );
});

test("the page keeps the conversation a day, and someone on the web has no clone to talk to", async () => {
  const dee = await join("Dee");
  await relay.ownAllow(dee, true, [page.code]);
  await relay.ownSay(dee.id, "Old words", said("Old words"));
  const later = new Date(Date.now() + (OWN_HOURS + 1) * 3_600_000);
  assert.equal((await relay.ownThread(dee.id, later)).messages.length, 0);
  await relay.tidy(later);
  const [left] = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM own_messages WHERE member_id = $1",
    [dee.id],
  );
  assert.equal(left.n, 0);
  await db.query("UPDATE members SET on_web = true WHERE id = $1", [dee.id]);
  await assert.rejects(relay.ownSay(dee.id, "Hi", said("Hi")), {
    code: "no-clone",
  });
});

test("a browser asks to be paired, its clone hears its key, and a page asking again replaces its ask", async () => {
  const eve = await join("Eve");
  await assert.rejects(relay.ownPair(eve.id, page.key), {
    code: "web-chat-off",
  });
  await relay.ownAllow(eve, true);
  await assert.rejects(relay.ownPair(eve.id, "short"), {
    code: "bad-request",
  });
  await relay.ownPair(eve.id, page.key);
  await relay.ownPair(eve.id, page.key);
  const news = (await relay.inbox(eve, 0, 0)).filter(
    (one) => one.type === "own",
  );
  // the first ask went with its row: the clone hears the page once
  assert.equal(news.length, 1);
  const last = news.at(-1);
  assert.deepEqual(
    last?.type === "own" && last.own.kind === "pair" && last.own.key,
    page.key,
  );
  const [left] = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM own_messages WHERE member_id = $1 AND kind = 'pair'",
    [eve.id],
  );
  assert.equal(left.n, 1);
  // the page never shows a pairing as a line of the conversation
  assert.equal((await relay.ownThread(eve.id)).messages.length, 0);
});

test("a clone's answer is drawn from its Markdown with nothing of it running", async () => {
  const { answerHtml } = await import("./people-pages.ts");
  const html = answerHtml(
    [
      "## Today",
      "The version is **0.2.0**, see `package.json`.",
      "- one <b>item</b>",
      "- two",
      "",
      "[docs](https://example.com/a?b=1&c=2) and [bad](javascript:alert(1))",
      "```",
      "<script>alert(1)</script>",
      "```",
    ].join("\n"),
  );
  assert.match(html, /<p><strong>Today<\/strong><\/p>/);
  assert.match(html, /<strong>0\.2\.0<\/strong>.*<code>package\.json<\/code>/);
  assert.match(
    html,
    /<ul><li>one &lt;b&gt;item&lt;\/b&gt;<\/li><li>two<\/li><\/ul>/,
  );
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/a\?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs<\/a>/,
  );
  assert.doesNotMatch(html, /href="javascript/);
  assert.match(
    html,
    /<pre><code>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/code><\/pre>/,
  );
  assert.doesNotMatch(html, /<script/);
});
