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
