import assert from "node:assert/strict";
import { test } from "node:test";
import {
  claudeTodos,
  normalizeTodos,
  TODO_MAX,
  type Todo,
  todoLines,
  todosOpen,
  todoTool,
} from "./todos.ts";

const run = (tool: ReturnType<typeof todoTool>, input: unknown) =>
  (
    tool as unknown as {
      execute: (input: unknown, options: unknown) => Promise<string>;
    }
  ).execute(input, { toolCallId: "t", messages: [] });

test("a list is made sound: words for each item, a known status, one in progress, and a cap", () => {
  const kept = normalizeTodos([
    { content: " Read the plan ", status: "completed" },
    {
      content: "Write the reply",
      status: "in_progress",
      activeForm: "Writing the reply",
    },
    { content: "Send it", status: "in_progress" },
    { content: "Tell Ben", status: "someday" },
  ]);
  assert.ok(!("error" in kept));
  assert.deepEqual(kept.todos, [
    { content: "Read the plan", status: "completed" },
    {
      content: "Write the reply",
      status: "in_progress",
      activeForm: "Writing the reply",
    },
    { content: "Send it", status: "pending" },
    { content: "Tell Ben", status: "pending" },
  ]);
  assert.match(kept.note ?? "", /one item is in progress at a time/);
  assert.deepEqual(normalizeTodos([{ content: " ", status: "pending" }]), {
    error: "Each item needs its content: what is to be done.",
  });
  assert.ok("error" in normalizeTodos("no"));
  const many = normalizeTodos(
    Array.from({ length: TODO_MAX + 5 }, (_, at) => ({
      content: `Step ${at}`,
      status: "pending",
    })),
  );
  assert.ok(!("error" in many));
  assert.equal(many.todos.length, TODO_MAX);
  assert.match(many.note ?? "", /first 40/);
});

test("todo_write keeps the whole list and tells the screen; a list read back holds what is still open", async () => {
  const heard: Todo[][] = [];
  const tool = todoTool((todos) => heard.push(todos));
  const said = await run(tool, {
    todos: [
      { content: "Read", status: "completed", activeForm: "Reading" },
      { content: "Write", status: "in_progress", activeForm: "Writing" },
    ],
  });
  assert.match(said, /^List kept \(1 of 2 done\)/);
  assert.equal(heard.length, 1);
  assert.equal(heard[0][1].activeForm, "Writing");
  assert.match(await run(tool, { todos: "x" }), /^Not kept/);
  assert.equal(heard.length, 1, "a list not kept is not shown");
  assert.equal(todosOpen([{ content: "New", status: "completed" }]), false);
  assert.equal(
    todoLines([
      { content: "A", status: "completed" },
      { content: "B", status: "in_progress" },
      { content: "C", status: "pending" },
    ]),
    "- [x] A\n- [>] B\n- [ ] C",
  );
});

test("Claude Code's own list is followed in its stream: TodoWrite whole, its tasks one at a time, a sub-agent's not", () => {
  const list = claudeTodos();
  assert.deepEqual(
    list.read({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "w1",
            name: "TodoWrite",
            input: {
              todos: [
                {
                  content: "Look",
                  status: "in_progress",
                  activeForm: "Looking",
                },
              ],
            },
          },
        ],
      },
    }),
    [{ content: "Look", status: "in_progress", activeForm: "Looking" }],
  );

  // The task tools: an item exists once its result names its id, then changes by that id.
  const tasks = claudeTodos();
  assert.equal(
    tasks.read({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "c1",
            name: "TaskCreate",
            input: {
              subject: "Read the notes",
              activeForm: "Reading the notes",
            },
          },
        ],
      },
    }),
    undefined,
  );
  assert.deepEqual(
    tasks.read({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "c1",
            content: [
              {
                type: "text",
                text: "Task #4 created successfully: Read the notes",
              },
            ],
          },
        ],
      },
    }),
    [
      {
        content: "Read the notes",
        status: "pending",
        activeForm: "Reading the notes",
        id: "4",
      },
    ],
  );
  const updated = tasks.read({
    type: "assistant",
    message: {
      content: [
        {
          type: "tool_use",
          id: "u1",
          name: "TaskUpdate",
          input: { taskId: "4", status: "completed" },
        },
      ],
    },
  });
  assert.equal(updated?.[0].status, "completed");
  // What a sub-agent keeps is its own.
  assert.equal(
    tasks.read({
      type: "assistant",
      parent_tool_use_id: "agent-1",
      message: {
        content: [
          {
            type: "tool_use",
            id: "u2",
            name: "TaskUpdate",
            input: { taskId: "4", status: "deleted" },
          },
        ],
      },
    }),
    undefined,
  );

  // A task made in an earlier turn is followed from the list as it last stood.
  const later = claudeTodos([
    { content: "Read the notes", status: "pending", id: "4" },
  ]);
  assert.deepEqual(
    later.read({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            id: "u3",
            name: "TaskUpdate",
            input: { taskId: "4", status: "in_progress" },
          },
        ],
      },
    }),
    [{ content: "Read the notes", status: "in_progress", id: "4" }],
  );
});
