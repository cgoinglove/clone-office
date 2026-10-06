import assert from "node:assert/strict";
import { test } from "node:test";
import { chatMessages, folderOf } from "./cursor";

test("a chat is read in the order it lists its bubbles, both sides", () => {
  const bubbles = [
    { id: "b", type: 2, text: "I used a map.", at: "2026-01-01T00:00:01Z" },
    {
      id: "a",
      type: 1,
      text: "group these by day",
      at: "2026-01-01T00:00:00Z",
    },
    { id: "t", type: 2, text: "  ", at: "2026-01-01T00:00:01Z" },
    {
      id: "c",
      type: 1,
      text: "use a plain loop instead",
      at: "2026-01-01T00:00:02Z",
    },
  ];
  assert.deepEqual(
    chatMessages(["a", "b", "t", "c"], bubbles).map((m) => [m.role, m.text]),
    [
      ["user", "group these by day"],
      ["assistant", "I used a map."],
      ["user", "use a plain loop instead"],
    ],
  );
  // Without an order, the bubbles' times decide.
  assert.equal(chatMessages([], bubbles)[0].text, "group these by day");
});

test("folders come from paths or file addresses; remote ones are left out", () => {
  assert.equal(folderOf("file:///u/project/app"), "/u/project/app");
  assert.equal(folderOf("file:///u/my%20app"), "/u/my app");
  assert.equal(folderOf("vscode-remote://ssh-remote+box/srv/app"), undefined);
  assert.equal(folderOf(null), undefined);
});
