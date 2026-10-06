import assert from "node:assert/strict";
import { test } from "node:test";
import { codexRequest, rolloutLineMessage, rolloutTurns } from "./codex";

const line = (
  type: string,
  payload: object,
  timestamp = "2026-09-01T00:00:00Z",
) => JSON.stringify({ type, timestamp, payload });

test("typed messages come from user_message events, after the AI's last message", async () => {
  const turns = await rolloutTurns([
    line("session_meta", { id: "s1", cwd: "/u/app" }),
    line("response_item", {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "<environment_context>x</environment_context>",
        },
      ],
    }),
    line("event_msg", {
      type: "user_message",
      message: "write the tests first",
    }),
    line("event_msg", { type: "agent_message", message: "Tests are written." }),
    line("event_msg", { type: "user_message", message: "good, now the code" }),
  ]);
  assert.deepEqual(
    turns.map((t) => [t.prompt, t.before]),
    [
      ["write the tests first", ""],
      ["good, now the code", "Tests are written."],
    ],
  );
});

test("older sessions fall back to the user messages, without injected context", async () => {
  const turns = await rolloutTurns([
    line("response_item", {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "<user_instructions>rules</user_instructions>",
        },
      ],
    }),
    line("response_item", {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "Done." }],
    }),
    line("response_item", {
      type: "message",
      role: "user",
      content: [{ type: "input_text", text: "thanks" }],
    }),
  ]);
  assert.deepEqual(
    turns.map((t) => [t.prompt, t.before]),
    [["thanks", "Done."]],
  );
});

test("the editor's state is cut from the request", () => {
  const sent =
    "# Context from my IDE setup:\n\n## Active file: a.ts\n\n## My request for Codex:\nrename it\n";
  assert.equal(codexRequest(sent), "rename it");
  assert.equal(
    codexRequest("# Context from my IDE setup:\n\n## Open tabs:\n- a.ts"),
    "",
  );
  assert.equal(codexRequest("plain words"), "plain words");
});

test("the index reads typed messages from older and newer rollout lines", () => {
  const at = "2026-09-07T14:24:39.000Z";
  const older = (type: string, message: string) =>
    JSON.stringify({
      timestamp: at,
      type: "event_msg",
      payload: { type, message },
    });
  const newer = (type: string, parts: { type: string; text: string }[]) =>
    JSON.stringify({
      timestamp: at,
      type: "event_msg",
      payload: {
        type: "item_completed",
        item: { type, id: "i1", content: parts },
      },
    });
  assert.deepEqual(rolloutLineMessage(older("user_message", "rename it")), {
    role: "user",
    at,
    text: "rename it",
  });
  assert.deepEqual(
    rolloutLineMessage(
      newer("UserMessage", [{ type: "text", text: "rename it\n" }]),
    ),
    { role: "user", at, text: "rename it" },
  );
  assert.deepEqual(
    rolloutLineMessage(
      newer("AgentMessage", [{ type: "Text", text: "Renamed." }]),
    ),
    { role: "assistant", at, text: "Renamed." },
  );
  // The context Codex puts in front of the model is a response item, never an event.
  const injected = JSON.stringify({
    timestamp: at,
    type: "response_item",
    payload: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "<environment_context>UserMessage</environment_context>",
        },
      ],
    },
  });
  assert.equal(rolloutLineMessage(injected), undefined);
  assert.equal(
    rolloutLineMessage(
      newer("CommandExecution", [{ type: "text", text: "AgentMessage" }]),
    ),
    undefined,
  );
});
