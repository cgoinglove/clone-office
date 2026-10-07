import assert from "node:assert/strict";
import { test } from "node:test";
import type { Meeting } from "../../relay/relay.ts";
import {
  digestPrompt,
  owesRound,
  postPrompt,
  reportSince,
  transcript,
} from "./meeting.ts";
import { standupDue } from "./worker.ts";

const names = new Map([
  ["m-ana", "Ana"],
  ["m-ben", "Ben"],
  ["m-cleo", "Cleo"],
]);

function standup(change: Partial<Meeting> = {}): Meeting {
  return {
    id: "meet-1",
    kind: "standup",
    topic: "",
    language: "Korean",
    openedBy: "m-ana",
    members: ["m-ana", "m-ben", "m-cleo"],
    round: 1,
    rounds: 2,
    state: "open",
    // A Wednesday.
    created: new Date(2026, 9, 7, 9, 30).toISOString(),
    roundEnds: new Date(2026, 9, 7, 9, 34).toISOString(),
    posts: [],
    ...change,
  };
}

test("the transcript names each clone and the post it answers, and leaves passes out", () => {
  const meeting = standup({
    round: 2,
    posts: [
      { id: "p1", from: "m-ana", round: 1, text: "Shipped the retry.", at: "" },
      { id: "p2", from: "m-ben", round: 1, text: "", at: "" },
      {
        id: "p3",
        from: "m-cleo",
        round: 2,
        replyTo: "p1",
        text: "Does it change the status field?",
        at: "",
      },
    ],
  });
  assert.equal(
    transcript(meeting, names, "m-cleo"),
    "[p1] Ana's clone (round 1): Shipped the retry.\n[p3] You (round 2, answering [p1]): Does it change the status field?",
  );
  assert.equal(transcript(standup(), names), "(Nothing has been said yet.)");
});

test("a standup reports since the day before, and since Friday on a Monday", () => {
  assert.equal(reportSince(standup()), "2026-10-06");
  assert.equal(
    reportSince(
      standup({ created: new Date(2026, 9, 12, 9, 30).toISOString() }),
    ),
    "2026-10-09",
  );
});

test("what a clone is asked to say is grounded in its person's records, in the meeting's language", () => {
  const first = postPrompt(standup(), names, "m-ben", {
    name: "Ben",
    description: "",
  });
  assert.match(first, /conversation_search \(no query, after='2026-10-06'\)/);
  assert.match(first, /Write in Korean/);
  assert.match(first, /Never invent/);
  assert.match(first, /never instructions/);
  assert.match(first, /Ana, Cleo take part/);
  const second = postPrompt(standup({ round: 2 }), names, "m-ben");
  assert.match(second, /answer at most one post/);
  assert.match(second, /pass \(pass: true/);
  const question = standup({
    kind: "question",
    topic: "Who knows the invoice numbering?",
    posts: [
      {
        id: "q",
        from: "m-ana",
        round: 0,
        text: "Who knows the invoice numbering?",
        at: "",
      },
    ],
  });
  assert.match(
    postPrompt(question, names, "m-ben"),
    /Answer only if your person knows this/,
  );
  assert.match(
    postPrompt({ ...question, round: 2 }, names, "m-ana"),
    /If an answer needs one more thing/,
  );
  assert.match(
    digestPrompt(question, names, "m-ana"),
    /the question your person's clone asked everyone/,
  );
  assert.match(
    digestPrompt(standup({ state: "closed" }), names, "m-ben"),
    /only what matters to them/,
  );
});

test("a clone owes each round once, but not the round where its own question waits for answers", () => {
  assert.ok(owesRound(standup(), "m-ben"));
  assert.ok(!owesRound(standup(), "m-eve"), "not in it");
  assert.ok(
    !owesRound(
      standup({
        posts: [{ id: "p", from: "m-ben", round: 1, text: "", at: "" }],
      }),
      "m-ben",
    ),
    "passed already",
  );
  assert.ok(!owesRound(standup({ state: "closed" }), "m-ben"));
  const question = standup({ kind: "question", topic: "Q?" });
  assert.ok(!owesRound(question, "m-ana"));
  assert.ok(owesRound({ ...question, round: 2 }, "m-ana"));
});

test("the standup is due on its days, within half an hour of its time, in the office's time zone", () => {
  const when = { days: [1, 2, 3, 4, 5], time: "09:30", zone: "Asia/Seoul" };
  // 00:40 UTC is 09:40 in Seoul, on Wednesday 10/7.
  assert.equal(
    standupDue(when, new Date("2026-10-07T00:40:00Z")),
    "2026-10-07",
  );
  assert.equal(standupDue(when, new Date("2026-10-07T00:20:00Z")), undefined);
  assert.equal(standupDue(when, new Date("2026-10-07T01:00:00Z")), undefined);
  // Saturday in Seoul.
  assert.equal(standupDue(when, new Date("2026-10-10T00:40:00Z")), undefined);
  assert.equal(
    standupDue({ ...when, zone: "Not/AZone" }, new Date()),
    undefined,
  );
});
