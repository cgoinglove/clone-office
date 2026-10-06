import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type Database, openDatabase } from "./db";
import { type Caller, Relay } from "./relay";

// The same Postgres a relay keeps on one computer (PGlite), in memory; or a Postgres server of
// one's own, for the same tests against the real thing (RELAY_TEST_DATABASE_URL, a database kept
// for tests: they add members and offices to it).
let db: Database;
let relay: Relay;
before(async () => {
  db = await openDatabase(process.env.RELAY_TEST_DATABASE_URL ?? "memory");
  relay = await Relay.open(db);
  await relay.office("office-key");
});
after(async () => {
  await relay.close();
  await db.close();
});

async function join(name: string, key = "office-key") {
  const { token } = await relay.join({
    key,
    card: { name, description: "" },
  });
  return { token, ...(await relay.memberByToken(token)) } as Caller & {
    token: string;
  };
}

test("members join with the office's key and are known by their own token, kept only as a hash", async () => {
  await assert.rejects(
    relay.join({ key: "wrong", card: { name: "Ana", description: "" } }),
    /not this office's key/,
  );
  const ana = await join("Ana");
  assert.equal(ana.card.name, "Ana");
  await relay.join({
    token: ana.token,
    card: { name: "Ana", description: "Payments", status: "In a meeting" },
  });
  const listed = await relay.members(ana.office);
  assert.equal(
    listed.find((m) => m.id === ana.id)?.card.status,
    "In a meeting",
  );
  await assert.rejects(relay.memberByToken("nope"), /Unknown member/);
  const kept = await db.query<{ token_hash: string }>(
    "SELECT token_hash FROM members WHERE id = $1",
    [ana.id],
  );
  assert.notEqual(kept[0].token_hash, ana.token);
  assert.equal(kept[0].token_hash.length, 64);
});

test("the office keeps its key: started again without one, the relay opens the same office", async () => {
  const first = await relay.office();
  assert.equal(first.key, "office-key");
  assert.deepEqual(await relay.office("office-key"), first);
});

test("a request goes to the one asked, who answers it; then it is closed", async () => {
  const ana = await join("Ana2");
  const ben = await join("Ben");
  const waiting = relay.inbox(ben, 0, 2000);
  const task = await relay.send(ana, ben.id, "Is Friday's release still on?");
  const [event] = await waiting;
  assert.equal(event.type, "task");
  assert.equal(event.task.id, task.id);
  assert.equal(event.task.status.state, "SUBMITTED");
  assert.equal(event.task.history[0].role, "user");

  await relay.update(ben, task.id, {
    state: "WORKING",
    text: "Checking with Ben.",
  });
  const asked = await relay.update(ben, task.id, {
    state: "INPUT_REQUIRED",
    text: "Which Friday?",
  });
  assert.equal(asked.status.state, "INPUT_REQUIRED");
  const answered = await relay.update(ana, task.id, { text: "This Friday." });
  assert.equal(
    answered.status.state,
    "WORKING",
    "an answer to a question moves it on",
  );
  const done = await relay.update(ben, task.id, {
    state: "COMPLETED",
    text: "Yes, 3 pm.",
  });
  assert.equal(done.status.state, "COMPLETED");
  assert.deepEqual(
    done.history.map((m) => [m.role, m.parts[0].text]),
    [
      ["user", "Is Friday's release still on?"],
      ["agent", "Checking with Ben."],
      ["agent", "Which Friday?"],
      ["user", "This Friday."],
      ["agent", "Yes, 3 pm."],
    ],
  );
  await assert.rejects(relay.update(ben, task.id, { text: "more" }), /closed/);
  const news = await relay.inbox(ana, 0, 0);
  assert.equal(
    news.length,
    3,
    "the one asking hears each step of the one asked",
  );
  assert.ok((await relay.tasks(ben)).some((t) => t.id === task.id));
  const stranger = await join("Cy");
  await assert.rejects(
    relay.update(stranger, task.id, { text: "hi" }),
    /No such request/,
  );
});

test("a request can be read by the one asking and the one asked, and by no one else", async () => {
  const cy = await join("Cy");
  const di = await join("Di");
  const eve = await join("Eve");
  const task = await relay.send(cy, di.id, "Can you review the export?");
  assert.equal((await relay.taskFor(cy, task.id)).id, task.id);
  assert.equal(
    (await relay.taskFor(di, task.id)).history[0].parts[0].text,
    "Can you review the export?",
  );
  await assert.rejects(relay.taskFor(eve, task.id), /No such request/);
});

test("offices on one relay do not see each other", async () => {
  await relay.office("other-key");
  const ana = await join("Ana");
  const zed = await join("Zed", "other-key");
  assert.notEqual(zed.office, ana.office);
  assert.ok(
    (await relay.members(zed.office)).every((m) => m.id !== ana.id),
    "the other office's people are not listed",
  );
  await assert.rejects(relay.send(zed, ana.id, "hi"), /No such member/);
  assert.equal(await relay.officeKey(zed.office), "other-key");
});

test("a card carries how to work with its person, bounded", async () => {
  const { token } = await relay.join({
    key: "office-key",
    card: {
      name: "Ana",
      description: "",
      howToWork: [
        " Ask me before noon. ",
        "",
        ...Array(20).fill("x".repeat(500)),
      ],
    },
  });
  const card = (await relay.memberByToken(token)).card;
  assert.equal(card.howToWork?.[0], "Ask me before noon.");
  assert.equal(card.howToWork?.length, 11);
  assert.equal(card.howToWork?.[1].length, 240);
});

test("someone without a mini-me answers by a link; only the one who made it sees the link", async () => {
  const ben = await join("Ben");
  const ana = await join("Ana");
  const now = new Date("2026-10-06T12:00:00Z");
  const { task, token } = await relay.sendLink(
    ben,
    "Jisoo",
    "Is 3 pm on Friday all right?",
    now,
  );
  assert.equal(task.metadata.guest, "Jisoo");
  assert.equal(task.metadata.link, `/r/${token}`);
  assert.equal(
    (await relay.tasks(ben)).find((t) => t.id === task.id)?.metadata.link,
    `/r/${token}`,
  );
  await assert.rejects(relay.taskFor(ana, task.id), /No such request/);
  const shown = await relay.link(token, now);
  assert.equal(shown.asker?.name, "Ben");
  assert.equal(shown.open, true);
  assert.equal(
    shown.task.metadata.link,
    undefined,
    "the page never shows the key itself",
  );
  const before = (await relay.inbox(ben, 0, 0)).length;
  const answered = await relay.answerLink(token, "Yes, 3 works.", now);
  assert.equal(answered.status.state, "COMPLETED");
  assert.equal(answered.history.at(-1)?.metadata.from, "guest:Jisoo");
  assert.equal(
    (await relay.inbox(ben, 0, 0)).length,
    before + 1,
    "Ben hears of it",
  );
  await assert.rejects(relay.answerLink(token, "again", now), /closed/);
  // A link ends after two weeks.
  const late = await relay.sendLink(ben, "Min", "Lunch?", now);
  assert.equal(
    (await relay.link(late.token, new Date("2026-10-21T12:00:01Z"))).open,
    false,
  );
  await assert.rejects(relay.link("no-such-token-at-all-here"), /No such link/);
});

test("news reaches a waiting inbox in another relay process, and without a notification too", async () => {
  // A second relay over the same database stands for another process of a deployed relay.
  const other = await Relay.open(db);
  try {
    const ana = await join("Ana");
    const ben = await join("Ben");
    const waiting = other.inbox(
      ben,
      (await relay.inbox(ben, 0, 0)).at(-1)?.seq ?? 0,
      5000,
    );
    const started = Date.now();
    await relay.send(ana, ben.id, "Heard over there?");
    const [event] = await waiting;
    assert.equal(event.task.history[0].parts[0].text, "Heard over there?");
    assert.ok(Date.now() - started < 1500, "woken by the notification");

    // News written where no notification is sent (a pooler that drops them): found on a second look.
    const last = (await other.inbox(ben, 0, 0)).at(-1)?.seq ?? 0;
    const quiet = other.inbox(ben, last, 5000);
    await db.query(
      "INSERT INTO events (member, type, task_id, at) VALUES ($1, 'update', $2, now())",
      [ben.id, event.task.id],
    );
    const [late] = await quiet;
    assert.equal(late.task.id, event.task.id);
  } finally {
    await other.close();
  }
});
