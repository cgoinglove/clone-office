import assert from "node:assert/strict";
import { test } from "node:test";
import { chatTurns, folderOf } from "./cursor";

test("a chat is read in the order it lists its bubbles", () => {
  const bubbles = [
    { id: "b", type: 2, text: "I used a map.", at: "2026-01-01T00:00:01Z" },
    {
      id: "a",
      type: 1,
      text: "group these by day",
      at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c",
      type: 1,
      text: "use a plain loop instead",
      at: "2026-01-01T00:00:02Z",
    },
  ];
  assert.deepEqual(
    chatTurns(["a", "b", "c"], bubbles).map((t) => [t.prompt, t.before]),
    [
      ["group these by day", ""],
      ["use a plain loop instead", "I used a map."],
    ],
  );
  // Without an order, the bubbles' times decide.
  assert.equal(chatTurns([], bubbles)[1].before, "I used a map.");
});

test("folders come from paths or file addresses; remote ones are left out", () => {
  assert.equal(folderOf("file:///u/project/app"), "/u/project/app");
  assert.equal(folderOf("file:///u/my%20app"), "/u/my app");
  assert.equal(folderOf("vscode-remote://ssh-remote+box/srv/app"), undefined);
  assert.equal(folderOf(null), undefined);
});
