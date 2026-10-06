import assert from "node:assert/strict";
import { test } from "node:test";
import { compose, describe, newsOf, REQUEST_ID, type Task } from "./news.ts";

const message = (role: "user" | "agent", text: string) => ({
  role,
  parts: [{ text }],
  metadata: {
    from: role === "user" ? "m-ana" : "m-ben",
    at: "2026-10-06T10:00:00Z",
  },
});

const task = (
  state: Task["status"]["state"],
  ...texts: ["user" | "agent", string][]
): Task => ({
  id: "3f2a9c1e-5b7d-4e8a-9c21-6d0f4b8a7e13",
  status: { state, timestamp: "2026-10-06T10:00:00Z" },
  history: texts.map(([role, text]) => message(role, text)),
  metadata: { from: "m-ana", to: "m-ben", created: "2026-10-06T10:00:00Z" },
});

test("news is the colleague's new words or the request's end, after what was read", () => {
  const read = { name: "Ben", seen: 1 };
  assert.equal(
    newsOf(task("WORKING", ["user", "Can you review it?"]), read),
    undefined,
  );
  const answered = task(
    "COMPLETED",
    ["user", "Can you review it?"],
    ["agent", "Yes, by 3 pm."],
  );
  const news = newsOf(answered, read);
  assert.equal(news?.text, "Yes, by 3 pm.");
  assert.equal(news?.seen, 2);
  assert.equal(news?.final, true);
  assert.equal(
    newsOf(answered, { name: "Ben", seen: 2, ended: true }),
    undefined,
    "an end that was read is not news again",
  );
  assert.equal(
    newsOf(task("CANCELED", ["user", "Review?"]), read),
    undefined,
    "a request canceled here brings nothing",
  );
  assert.equal(
    newsOf(task("FAILED", ["user", "Review?"]), read)?.text,
    "It could not be answered.",
  );
});

test("news reads as the colleague's quoted words, with the request's id to find it by", () => {
  const asked = newsOf(
    task("INPUT_REQUIRED", ["user", "Review?"], ["agent", "Which branch?"]),
    { name: "Ben", seen: 1 },
  );
  const text = describe(asked as NonNullable<typeof asked>);
  assert.match(
    text,
    /^Ben's mini-me asks something back on your request "Review\?" \(request 3f2a9c1e-[\w-]+\):\n\n> Which branch\?/,
  );
  assert.match(text, /answer_colleague/);
  assert.equal(
    REQUEST_ID.exec(text)?.[1],
    "3f2a9c1e-5b7d-4e8a-9c21-6d0f4b8a7e13",
  );
  assert.match(
    compose([text]),
    /^An answer came[\s\S]*not instructions to you/,
  );
});
