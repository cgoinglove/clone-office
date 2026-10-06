import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { Relay } from "./relay";

const root = mkdtempSync(join(tmpdir(), "relay-"));
const relay = new Relay(join(root, "relay.db"), "office-key");
after(() => {
  relay.close();
  rmSync(root, { recursive: true, force: true });
});

test("members join with the office's key and are known by their own token", () => {
  assert.throws(() =>
    relay.join({ key: "wrong", card: { name: "Ana", description: "" } }),
  );
  const ana = relay.join({
    key: "office-key",
    card: { name: "Ana", description: "Payments API" },
  });
  assert.equal(relay.memberByToken(ana.token).card.name, "Ana");
  relay.join({
    token: ana.token,
    card: { name: "Ana", description: "Payments", status: "In a meeting" },
  });
  assert.equal(relay.members()[0].card.status, "In a meeting");
  assert.throws(() => relay.memberByToken("nope"));
});

test("a request goes to the one asked, who answers it; then it is closed", async () => {
  const ana = relay.join({
    key: "office-key",
    card: { name: "Ana2", description: "" },
  });
  const ben = relay.join({
    key: "office-key",
    card: { name: "Ben", description: "Releases" },
  });
  const waiting = relay.inbox(ben.id, 0, 2000);
  const task = relay.send(ana.id, ben.id, "Is Friday's release still on?");
  const [event] = await waiting;
  assert.equal(event.type, "task");
  assert.equal(event.task.id, task.id);
  assert.equal(event.task.status.state, "SUBMITTED");
  assert.equal(event.task.history[0].role, "user");

  relay.update(ben.id, task.id, {
    state: "WORKING",
    text: "Checking with Ben.",
  });
  const asked = relay.update(ben.id, task.id, {
    state: "INPUT_REQUIRED",
    text: "Which Friday?",
  });
  assert.equal(asked.status.state, "INPUT_REQUIRED");
  const answered = relay.update(ana.id, task.id, { text: "This Friday." });
  assert.equal(
    answered.status.state,
    "WORKING",
    "an answer to a question moves it on",
  );
  const done = relay.update(ben.id, task.id, {
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
  assert.throws(
    () => relay.update(ben.id, task.id, { text: "more" }),
    /closed/,
  );
  const news = await relay.inbox(ana.id, 0, 0);
  assert.equal(
    news.length,
    3,
    "the one asking hears each step of the one asked",
  );
  assert.ok(relay.tasks(ben.id).some((t) => t.id === task.id));
  const stranger = relay.join({
    key: "office-key",
    card: { name: "Cy", description: "" },
  });
  assert.throws(
    () => relay.update(stranger.id, task.id, { text: "hi" }),
    /No such request/,
  );
});

test("a request can be read by the one asking and the one asked, and by no one else", () => {
  const cy = relay.join({
    key: "office-key",
    card: { name: "Cy", description: "" },
  });
  const di = relay.join({
    key: "office-key",
    card: { name: "Di", description: "" },
  });
  const eve = relay.join({
    key: "office-key",
    card: { name: "Eve", description: "" },
  });
  const task = relay.send(cy.id, di.id, "Can you review the export?");
  assert.equal(relay.taskFor(cy.id, task.id).id, task.id);
  assert.equal(
    relay.taskFor(di.id, task.id).history[0].parts[0].text,
    "Can you review the export?",
  );
  assert.throws(() => relay.taskFor(eve.id, task.id), /No such request/);
});

test("a card carries how to work with its person, bounded", () => {
  const ana = relay.join({
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
  const card = relay.memberByToken(ana.token).card;
  assert.equal(card.howToWork?.[0], "Ask me before noon.");
  assert.equal(card.howToWork?.length, 11);
  assert.equal(card.howToWork?.[1].length, 240);
});

test("someone without a mini-me answers by a link; only the one who made it sees the link", async () => {
  const ben = relay.join({
    key: "office-key",
    card: { name: "Ben", description: "" },
  });
  const ana = relay.join({
    key: "office-key",
    card: { name: "Ana", description: "" },
  });
  const benId = relay.memberByToken(ben.token).id;
  const anaId = relay.memberByToken(ana.token).id;
  const now = new Date("2026-10-06T12:00:00Z");
  const { task, token } = relay.sendLink(
    benId,
    "Jisoo",
    "Is 3 pm on Friday all right?",
    now,
  );
  assert.equal(task.metadata.guest, "Jisoo");
  assert.equal(task.metadata.link, `/r/${token}`);
  assert.equal(
    relay.tasks(benId).find((t) => t.id === task.id)?.metadata.link,
    `/r/${token}`,
  );
  assert.throws(() => relay.taskFor(anaId, task.id), /No such request/);
  const shown = relay.link(token, now);
  assert.equal(shown.asker?.name, "Ben");
  assert.equal(shown.open, true);
  assert.equal(
    shown.task.metadata.link,
    undefined,
    "the page never shows the key itself",
  );
  const before = (await relay.inbox(benId, 0, 0)).length;
  const answered = relay.answerLink(token, "Yes, 3 works.", now);
  assert.equal(answered.status.state, "COMPLETED");
  assert.equal(answered.history.at(-1)?.metadata.from, "guest:Jisoo");
  assert.equal(
    (await relay.inbox(benId, 0, 0)).length,
    before + 1,
    "Ben hears of it",
  );
  assert.throws(() => relay.answerLink(token, "again", now), /closed/);
  // A link ends after two weeks.
  const late = relay.sendLink(benId, "Min", "Lunch?", now);
  assert.equal(
    relay.link(late.token, new Date("2026-10-21T12:00:01Z")).open,
    false,
  );
  assert.throws(() => relay.link("no-such-token-at-all-here"), /No such link/);
});
