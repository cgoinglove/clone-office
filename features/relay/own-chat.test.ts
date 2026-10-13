import assert from "node:assert/strict";
import { after, before, test } from "node:test";
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
  await assert.rejects(relay.ownSay(ana.id, "Hello"), {
    code: "web-chat-off",
  });
  assert.equal((await relay.ownThread(ana.id)).on, false);
  await relay.ownAllow(ana, true);
  await assert.rejects(relay.ownSay(ana.id, "   "), { code: "bad-request" });
  const said = await relay.ownSay(ana.id, "What's on today?");
  const [news] = await relay.inbox(ana, 0, 0);
  assert.equal(news.type, "own");
  assert.deepEqual(news.type === "own" && news.own, {
    id: said.id,
    kind: "said",
    text: "What's on today?",
  });
  // Taken, then answered: the page shows both, in order.
  await relay.ownTake(ana, said.id);
  assert.equal((await relay.ownThread(ana.id)).messages[0].taken, true);
  await relay.ownAnswer(ana, { replyTo: said.id, text: "Two requests." });
  const thread = await relay.ownThread(ana.id);
  assert.deepEqual(
    thread.messages.map((m) => [m.kind, m.text, m.replyTo]),
    [
      ["said", "What's on today?", undefined],
      ["answer", "Two requests.", said.id],
    ],
  );
  // A failure is a code the page words, never the clone's raw text.
  const failed = await relay.ownAnswer(ana, {
    replyTo: said.id,
    code: "brain-limit@1791890400",
  });
  assert.equal(failed.code, "brain-limit@1791890400");
  await assert.rejects(relay.ownAnswer(ana, { code: "<script>" }), {
    code: "bad-request",
  });
});

test("the clone's question is answered once from the page, with one of its own choices", async () => {
  const ben = await join("Ben");
  await relay.ownAllow(ben, true);
  const asked = await relay.ownAsk(ben, {
    text: "May I read the plan in Notion?",
    choices: [
      { label: "Allow", value: "ask:g1:allow" },
      { label: "Deny", value: "ask:g1:deny" },
    ],
  });
  const before = (await relay.inbox(ben, 0, 0)).at(-1)?.seq ?? 0;
  await assert.rejects(relay.ownChoose(ben.id, asked.id, "ask:g1:always"), {
    code: "bad-request",
  });
  await relay.ownChoose(ben.id, asked.id, "ask:g1:allow");
  const [news] = await relay.inbox(ben, before, 0);
  assert.deepEqual(news.type === "own" && news.own, {
    id: asked.id,
    kind: "chosen",
    value: "ask:g1:allow",
  });
  await assert.rejects(relay.ownChoose(ben.id, asked.id, "ask:g1:deny"), {
    code: "no-longer-waiting",
  });
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
  await assert.rejects(relay.ownChoose(cy.id, other.id, "ask:g2:0"), {
    code: "no-longer-waiting",
  });
});

test("the page keeps the conversation a day, and someone on the web has no clone to talk to", async () => {
  const dee = await join("Dee");
  await relay.ownAllow(dee, true);
  await relay.ownSay(dee.id, "Old words");
  const later = new Date(Date.now() + (OWN_HOURS + 1) * 3_600_000);
  assert.equal((await relay.ownThread(dee.id, later)).messages.length, 0);
  await relay.tidy(later);
  const [left] = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM own_messages WHERE member_id = $1",
    [dee.id],
  );
  assert.equal(left.n, 0);
  await db.query("UPDATE members SET on_web = true WHERE id = $1", [dee.id]);
  await assert.rejects(relay.ownSay(dee.id, "Hi"), { code: "no-clone" });
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
