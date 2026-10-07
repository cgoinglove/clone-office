import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { type Database, openDatabase } from "./db";
import { type Caller, Relay, ROUND_MS } from "./relay";

let db: Database;
let relay: Relay;
before(async () => {
  db = await openDatabase(process.env.RELAY_TEST_DATABASE_URL ?? "memory");
  relay = await Relay.open(db);
});
after(async () => {
  await relay.close();
  await db.close();
});

let offices = 0;
/** A new office with members whose clones are at their inbox now. */
async function office(...names: string[]) {
  const key = `meeting-office-${++offices}`;
  await relay.office(key);
  const out: Caller[] = [];
  for (const name of names) {
    const { token } = await relay.join({
      key,
      card: { name, description: "" },
    });
    out.push(await relay.memberByToken(token));
  }
  return out;
}

test("a standup takes in the members present, one post each a round, and closes after the last", async () => {
  const [ana, ben, cleo] = await office("Ana", "Ben", "Cleo");
  // Cleo's clone has not come to its inbox for a while: not present.
  await db.query("UPDATE members SET seen = $1 WHERE id = $2", [
    new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    cleo.id,
  ]);
  const opened = await relay.openMeeting(ana, {
    kind: "standup",
    language: "Korean",
  });
  assert.deepEqual(opened.members.sort(), [ana.id, ben.id].sort());
  assert.equal(opened.round, 1);
  assert.equal(opened.language, "Korean");
  // Everyone in it hears; Cleo, outside it, does not.
  const benNews = await relay.inbox(ben, 0, 0);
  assert.ok(
    benNews.some((e) => e.type === "meeting" && e.meeting.id === opened.id),
  );
  assert.ok(!(await relay.inbox(cleo, 0, 0)).some((e) => e.type === "meeting"));
  await assert.rejects(
    relay.postToMeeting(cleo, opened.id, { round: 1, text: "Me too" }),
    /Not in this meeting/,
  );
  // Opening it again while it goes on joins it.
  assert.equal(
    (await relay.openMeeting(ben, { kind: "standup" })).id,
    opened.id,
  );

  const first = await relay.postToMeeting(ana, opened.id, {
    round: 1,
    text: "Ana shipped the payments retry.",
  });
  assert.equal(first.round, 1, "still waiting for Ben");
  await assert.rejects(
    relay.postToMeeting(ana, opened.id, { round: 1, text: "Again" }),
    /Already said/,
  );
  await assert.rejects(
    relay.postToMeeting(ana, opened.id, { round: 2, text: "Too soon" }),
    /Not a round/,
  );
  const second = await relay.postToMeeting(ben, opened.id, {
    round: 1,
    text: "Ben is on the web checkout.",
  });
  assert.equal(second.round, 2, "everyone spoke: the next round");
  const anaPost = second.posts.find((p) => p.from === ana.id);
  assert.ok(anaPost);
  await relay.postToMeeting(ben, opened.id, {
    round: 2,
    text: "Does the retry change the status field?",
    replyTo: anaPost.id,
  });
  const done = await relay.postToMeeting(ana, opened.id, { round: 2 });
  assert.equal(done.state, "closed");
  assert.ok(done.closed);
  assert.equal(
    done.posts.filter((p) => p.round === 2 && !p.text).length,
    1,
    "Ana passed",
  );
  assert.equal(done.posts.find((p) => p.replyTo === anaPost.id)?.from, ben.id);
  await assert.rejects(
    relay.postToMeeting(ben, opened.id, { round: 2, text: "Late" }),
    /over/,
  );
  // Everyone in the office reads it, Cleo too.
  assert.equal((await relay.meeting(cleo, opened.id)).posts.length, 4);
  assert.equal((await relay.meetings(cleo))[0].id, opened.id);
  // At the set time, a clone opening it the same day gets the one held; asked again, a new one.
  assert.equal(
    (await relay.openMeeting(ben, { kind: "standup", scheduled: true })).id,
    opened.id,
  );
  assert.notEqual(
    (await relay.openMeeting(ben, { kind: "standup" })).id,
    opened.id,
  );
});

test("a round whose time is up ends without the clones that did not speak", async () => {
  const [ana, ben] = await office("Ana", "Ben");
  const opened = await relay.openMeeting(ana, { kind: "standup" });
  await relay.postToMeeting(ana, opened.id, { round: 1, text: "Report" });
  await relay.advanceMeetings(new Date(Date.now() + ROUND_MS - 1000));
  assert.equal((await relay.meeting(ana, opened.id)).round, 1);
  await relay.advanceMeetings(new Date(Date.now() + ROUND_MS + 1000));
  const next = await relay.meeting(ana, opened.id);
  assert.equal(next.round, 2);
  // A post for the round that passed still counts while the meeting is open.
  await relay.postToMeeting(ben, opened.id, { round: 1, text: "Late report" });
  await relay.advanceMeetings(new Date(Date.now() + 3 * ROUND_MS));
  assert.equal((await relay.meeting(ben, opened.id)).state, "closed");
});

test("a question is the asker's first post, and its first round waits only for the others", async () => {
  const [ana, ben, cleo] = await office("Ana", "Ben", "Cleo");
  await assert.rejects(
    relay.openMeeting(ana, { kind: "question" }),
    /needs its words/,
  );
  const asked = await relay.openMeeting(ana, {
    kind: "question",
    topic: "Who knows how the invoices are numbered?",
  });
  assert.equal(asked.posts[0].round, 0);
  assert.equal(asked.posts[0].from, ana.id);
  await relay.postToMeeting(ben, asked.id, { round: 1, text: "Cleo does." });
  const after = await relay.postToMeeting(cleo, asked.id, {
    round: 1,
    text: "Year, then a counter.",
  });
  assert.equal(after.round, 2);
  // Questions are not one a day: another opens.
  const again = await relay.openMeeting(ben, {
    kind: "question",
    topic: "And refunds?",
  });
  assert.notEqual(again.id, asked.id);
});

test("a meeting needs someone else in the office", async () => {
  const [solo] = await office("Solo");
  await assert.rejects(
    relay.openMeeting(solo, { kind: "standup" }),
    /Nobody else/,
  );
  const [ana] = await office("Ana", "Ben");
  await assert.rejects(relay.meeting(solo, "nope"), /No such meeting/);
  const opened = await relay.openMeeting(ana, { kind: "standup" });
  // Another office does not see it.
  await assert.rejects(relay.meeting(solo, opened.id), /No such meeting/);
});
