import assert from "node:assert/strict";
import { test } from "node:test";
import { roomData, statusCode } from "./room-data";

const now = Date.parse("2026-10-06T12:00:00Z");
const seen = (ago: number) => new Date(now - ago).toISOString();
const card = (name: string, status?: string) => ({
  name,
  description: `${name}'s work`,
  ...(status ? { status } : {}),
});
const say = (role: "user" | "agent", text: string) => ({
  role,
  parts: [{ text }],
});

test("a card's status reads as a code, and the words cards kept before codes still read", () => {
  assert.equal(statusCode("meeting"), "meeting");
  assert.equal(statusCode("퇴근"), "off");
  assert.equal(statusCode("In a meeting"), "meeting");
  assert.equal(statusCode("napping"), undefined);
  assert.equal(statusCode(undefined), undefined);
});

test("members sit as their cards say, and a computer not heard from for two minutes is off", () => {
  const room = roomData(
    {
      me: { id: "me" },
      members: [
        // the viewer is in whatever the relay last heard
        { id: "me", seen: seen(60 * 60 * 1000), card: card("Ada") },
        { id: "b", seen: seen(5000), card: card("Ben", "working") },
        { id: "c", seen: seen(5000), card: card("Chloe", "meeting") },
        { id: "d", seen: seen(5000), card: card("Dev", "off") },
        { id: "e", seen: seen(3 * 60 * 1000), card: card("Eun", "working") },
      ],
    },
    0,
    undefined,
    now,
  );
  assert.deepEqual(
    room.people.map((p) => [p.name, p.status, !!p.mine]),
    [
      ["Ada", "active", true],
      ["Ben", "active", false],
      ["Chloe", "away", false],
      ["Dev", "offline", false],
      ["Eun", "offline", false],
    ],
  );
});

test("requests between members carry their words, their answer, and whether the asked one decides", () => {
  const task = (
    id: string,
    to: string,
    state: "SUBMITTED" | "WORKING" | "COMPLETED",
    history: ReturnType<typeof say>[],
  ) => ({
    id,
    status: { state, timestamp: new Date(now).toISOString() },
    history,
    metadata: { from: "me", to },
  });
  const room = roomData(
    {
      me: { id: "me" },
      members: [
        { id: "me", seen: seen(0), card: card("Ada") },
        { id: "b", seen: seen(0), card: card("Ben") },
      ],
      tasks: [
        task("t1", "b", "WORKING", [
          say("user", "The release notes, please."),
          say("agent", "Ben will get back to you on this."),
        ]),
        task("t2", "b", "WORKING", [
          say("user", "And the date?"),
          say("agent", "Which release?"),
          say("user", "2.4"),
        ]),
        task("t3", "b", "COMPLETED", [
          say("user", "The export fix?"),
          say("agent", "It shipped at 10:40."),
        ]),
        // asked by a link: the one asked has no desk here
        task("t4", "link-guest", "SUBMITTED", [say("user", "Lunch?")]),
      ],
    },
    2,
    "Share the invoices with Ben?",
    now,
  );
  assert.deepEqual(
    room.requests.map((r) => [r.id, r.state, r.held, r.text, r.answer]),
    [
      [
        "t1",
        "WORKING",
        true,
        "The release notes, please.",
        "Ben will get back to you on this.",
      ],
      ["t2", "WORKING", false, "And the date?", "Which release?"],
      ["t3", "COMPLETED", false, "The export fix?", "It shipped at 10:40."],
    ],
  );
  assert.deepEqual(room.waiting, {
    count: 2,
    text: "Share the invoices with Ben?",
  });
});
