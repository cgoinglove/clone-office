import assert from "node:assert/strict";
import { test } from "node:test";
import { ClaudeStream } from "./claude-stream.ts";
import type { SessionEvent } from "./session.ts";

test("a Claude Code session's own words, list, helpers and fallback reach the screen; a sub-agent's words do not", () => {
  const events: SessionEvent[] = [];
  const stream = new ClaudeStream({
    id: "s-1",
    onEvent: (event) => events.push(event),
  });
  const read = (event: Parameters<ClaudeStream["read"]>[0]) =>
    stream.read(event);

  read({ type: "system", subtype: "init", session_id: "s-2" });
  assert.equal(stream.id, "s-2");
  read({
    type: "system",
    subtype: "model_fallback",
    original_model: "claude-opus-5-5",
    fallback_model: "claude-sonnet-5-5",
  } as never);
  read({
    type: "assistant",
    message: {
      usage: { input_tokens: 10, cache_read_input_tokens: 90 },
      content: [
        { type: "text", text: "Looking. " },
        {
          type: "tool_use",
          id: "todo-1",
          name: "TodoWrite",
          input: {
            todos: [
              {
                content: "Search",
                status: "in_progress",
                activeForm: "Searching",
              },
              { content: "Answer", status: "pending", activeForm: "Answering" },
            ],
          },
        },
        {
          type: "tool_use",
          id: "agent-1",
          name: "Agent",
          input: { description: "Find the invoices", prompt: "…" },
        },
      ],
    },
  });
  // What the sub-agent says and how much of its window it uses are its own.
  read({
    type: "assistant",
    parent_tool_use_id: "agent-1",
    message: {
      usage: { input_tokens: 99_999 },
      content: [{ type: "text", text: "sub-agent thinking" }],
    },
  });
  read({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "agent-1",
          content: [{ type: "text", text: "Three invoices." }],
        },
      ],
    },
  });
  read({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: "m-1",
          name: "mcp__minime__memory",
          input: { action: "add", target: "user", content: "Likes lists." },
        },
      ],
    },
  });
  read({
    type: "user",
    message: {
      content: [
        {
          type: "tool_result",
          tool_use_id: "m-1",
          content: [{ type: "text", text: '{"success":true}' }],
        },
      ],
    },
  });
  read({
    type: "assistant",
    message: { content: [{ type: "text", text: "Three." }] },
  });
  const end = read({
    type: "result",
    num_turns: 4,
    total_cost_usd: 0.01,
    usage: { input_tokens: 1 },
  });

  assert.deepEqual(end, {
    ok: true,
    error: undefined,
    structured: undefined,
    usage: { input_tokens: 1 },
  });
  assert.equal(stream.text, "Looking. Three.");
  assert.equal(
    stream.context,
    100,
    "the session's own window, not a sub-agent's",
  );
  assert.equal(stream.turns, 4);
  assert.deepEqual(
    events.map((event) => event.type),
    ["fallback", "text", "subtask", "todos", "subtask", "memory", "text"],
  );
  assert.deepEqual(events[0], { type: "fallback", model: "Claude Sonnet" });
  assert.deepEqual(events[2], {
    type: "subtask",
    id: "agent-1",
    description: "Find the invoices",
    state: "running",
  });
  assert.equal((events[4] as { state?: string }).state, "done");
  assert.equal(
    (events[3] as { todos?: { activeForm?: string }[] }).todos?.[0].activeForm,
    "Searching",
  );
});

test("Claude Code gets its to-do tools where it may read, its sub-agents only in the person's own work, and the other Claude to fall back on", async () => {
  const { claudeFallback, claudeTools, mcpConfig } = await import(
    "./session.ts"
  );
  assert.deepEqual(claudeTools(false, false), [], "a look back has no tools");
  const request = claudeTools(true, false);
  assert.ok(request.includes("TodoWrite") && request.includes("TaskCreate"));
  assert.ok(!request.includes("Agent"), "never while answering a colleague");
  assert.ok(claudeTools(true, true).includes("Agent"));
  assert.equal(claudeFallback("sonnet", "opus"), "sonnet");
  assert.equal(claudeFallback("haiku", "haiku"), undefined);
  assert.equal(claudeFallback(undefined, "opus"), undefined);
  const config = JSON.parse(
    mcpConfig(
      "minime",
      undefined,
      [],
      undefined,
      [],
      undefined,
      undefined,
      "/x/scratch/s-1",
    ),
  );
  assert.equal(
    config.mcpServers.minime.env.MINIME_SCRATCH_DIR,
    "/x/scratch/s-1",
  );
});

test("a session that fails says so in its result", () => {
  const stream = new ClaudeStream();
  assert.deepEqual(
    stream.read({ type: "result", is_error: true, subtype: "error_max_turns" }),
    {
      ok: false,
      error: "error_max_turns",
      structured: undefined,
      usage: undefined,
    },
  );
});
