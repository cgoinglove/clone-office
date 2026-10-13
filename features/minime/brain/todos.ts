// The to-do list a clone keeps while it works through something of several steps, which its person
// sees beside the answer as it goes, whichever brain thinks.
//
// On the app's own loop it is `todo_write`, after Claude Code's TodoWrite (each call gives the whole
// list, each item its content, its status and the words for it while in progress; one item in
// progress at a time) and Codex's update_plan (the same whole list, "at most one step can be
// in_progress"), with Hermes Agent's caps on items and their length so the list never fills a window.
// On Claude Code the clone's own TodoWrite, or the task tools that took its place (TaskCreate and
// TaskUpdate, one item at a time), are followed in its stream as Claude Code itself follows them to
// rebuild a session's list: the last TodoWrite, or the tasks created and updated since.

import { dynamicTool, jsonSchema, type Tool } from "ai";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface Todo {
  /** What to do, as an instruction ("Read the plan"). */
  content: string;
  status: TodoStatus;
  /** The same while it is being done ("Reading the plan"). */
  activeForm?: string;
  /** Claude Code's own id for a task, to follow its updates. */
  id?: string;
}

/** The most items a list keeps, and the longest an item's words may be (after Hermes Agent's caps). */
export const TODO_MAX = 40;
const TODO_CHARS = 300;
const STATUSES = new Set<TodoStatus>(["pending", "in_progress", "completed"]);

const clip = (text: string) =>
  text.length > TODO_CHARS ? `${text.slice(0, TODO_CHARS - 1)}…` : text;

/**
 * A list as given, made sound: each item with words and a known status, at most TODO_MAX, and one
 * in progress (a later one goes back to waiting). `note` says what was changed, for the model.
 */
export function normalizeTodos(
  raw: unknown,
): { todos: Todo[]; note?: string } | { error: string } {
  if (!Array.isArray(raw))
    return { error: "Give todos: the whole list, as an array of items." };
  const notes: string[] = [];
  const todos: Todo[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const given = item as Record<string, unknown>;
    const content = String(given.content ?? "").trim();
    if (!content)
      return { error: "Each item needs its content: what is to be done." };
    const status = String(given.status ?? "pending") as TodoStatus;
    const activeForm =
      typeof given.activeForm === "string" && given.activeForm.trim()
        ? clip(given.activeForm.trim())
        : undefined;
    todos.push({
      content: clip(content),
      status: STATUSES.has(status) ? status : "pending",
      ...(activeForm ? { activeForm } : {}),
      ...(typeof given.id === "string" && given.id ? { id: given.id } : {}),
    });
  }
  if (todos.length > TODO_MAX) {
    notes.push(`Only the first ${TODO_MAX} items are kept.`);
    todos.length = TODO_MAX;
  }
  const doing = todos.filter((todo) => todo.status === "in_progress");
  if (doing.length > 1) {
    for (const todo of doing.slice(1)) todo.status = "pending";
    notes.push(
      "Only one item is in progress at a time: the others went back to pending.",
    );
  }
  return notes.length ? { todos, note: notes.join(" ") } : { todos };
}

/** Whether something on the list is still to do. */
export const todosOpen = (todos: readonly Todo[] | undefined) =>
  Boolean(todos?.some((todo) => todo.status !== "completed"));

/** The list as plain lines, as Hermes Agent writes it back after its context is compressed. */
export function todoLines(todos: readonly Todo[]): string {
  const mark = { completed: "[x]", in_progress: "[>]", pending: "[ ]" };
  return todos
    .map((todo) => `- ${mark[todo.status]} ${todo.content}`)
    .join("\n");
}

const TODO_DESCRIPTION = `Keep a to-do list for the work in hand; your person sees it beside your answer as you go. Use it for work of three or more steps, or when your person asks for several things at once: write the steps first, mark one in_progress before you begin it (one at a time), and mark it completed as soon as it is done and checked, never before. If a step cannot be done, say so and replace it with what you will do instead. Skip it for a single quick step or a plain question. Each call gives the whole list as it now stands; an item left out is dropped.`;

/** The tool for the app's own loop; `onChange` hears each list as it is kept. */
export function todoTool(onChange: (todos: Todo[]) => void): Tool {
  return dynamicTool({
    description: TODO_DESCRIPTION,
    inputSchema: jsonSchema({
      type: "object",
      properties: {
        todos: {
          type: "array",
          description: "The whole list, in the order it is to be done.",
          items: {
            type: "object",
            properties: {
              content: {
                type: "string",
                description: 'What to do, as an instruction ("Read the plan").',
              },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
              },
              activeForm: {
                type: "string",
                description:
                  'The same while it is being done ("Reading the plan").',
              },
            },
            required: ["content", "status", "activeForm"],
          },
        },
      },
      required: ["todos"],
    } as never),
    execute: async (raw) => {
      const kept = normalizeTodos((raw as { todos?: unknown } | null)?.todos);
      if ("error" in kept) return `Not kept: ${kept.error}`;
      onChange(kept.todos);
      const done = kept.todos.filter(
        (todo) => todo.status === "completed",
      ).length;
      return `List kept (${done} of ${kept.todos.length} done).${kept.note ? ` ${kept.note}` : ""} Keep it current as you work: an item in_progress before you begin it, completed as soon as it is done.`;
    },
  });
}

// ---- Claude Code's own list, from its stream ----

/** One content part of a Claude Code stream message, as far as the list needs it. */
interface StreamPart {
  type?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

const CREATED = /^Task #(\S+) created successfully/;

const textOf = (content: unknown) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part: { text?: string }) => part.text ?? "").join("")
      : "";

/**
 * Follows a Claude Code session's list as Claude Code rebuilds one from a transcript: TodoWrite
 * gives the whole list; TaskCreate adds an item once its result names its id, TaskUpdate changes
 * one by id (or removes it, "deleted"). Messages from a sub-agent (they name the tool call they
 * belong to) are not the session's own list. `known` is the list as it last stood, so tasks made
 * in an earlier turn are followed too.
 */
export function claudeTodos(known: readonly Todo[] = []) {
  const tasks = new Map<string, Todo>(
    known.flatMap((todo) => (todo.id ? [[todo.id, { ...todo }]] : [])),
  );
  const creating = new Map<string, Todo>();
  let whole: Todo[] | undefined = known.some((todo) => todo.id)
    ? undefined
    : [...known];
  const list = (): Todo[] =>
    tasks.size || creating.size
      ? [...tasks.entries()].map(([id, todo]) => ({ ...todo, id }))
      : (whole ?? []);
  return {
    /** Reads one event; answers the list when it changed. */
    read(event: {
      type?: string;
      parent_tool_use_id?: string | null;
      message?: { content?: unknown };
    }): Todo[] | undefined {
      if (event.parent_tool_use_id) return undefined;
      const parts = Array.isArray(event.message?.content)
        ? (event.message.content as StreamPart[])
        : [];
      let changed = false;
      if (event.type === "assistant")
        for (const part of parts) {
          if (part.type !== "tool_use") continue;
          const input = part.input ?? {};
          if (part.name === "TodoWrite") {
            const kept = normalizeTodos(input.todos);
            if ("error" in kept) continue;
            whole = kept.todos;
            tasks.clear();
            changed = true;
          } else if (part.name === "TaskCreate" && part.id) {
            const content = String(input.subject ?? "").trim();
            if (!content) continue;
            creating.set(part.id, {
              content,
              status: "pending",
              ...(typeof input.activeForm === "string"
                ? { activeForm: input.activeForm }
                : {}),
            });
          } else if (part.name === "TaskUpdate") {
            const id = String(input.taskId ?? "");
            if (!id) continue;
            if (input.status === "deleted") {
              changed = tasks.delete(id) || changed;
              continue;
            }
            const was = tasks.get(id);
            const status = STATUSES.has(input.status as TodoStatus)
              ? (input.status as TodoStatus)
              : (was?.status ?? "pending");
            const content =
              typeof input.subject === "string" && input.subject
                ? input.subject
                : (was?.content ?? id);
            const activeForm =
              typeof input.activeForm === "string"
                ? input.activeForm
                : was?.activeForm;
            tasks.set(id, {
              content,
              status,
              ...(activeForm ? { activeForm } : {}),
            });
            changed = true;
          }
        }
      if (event.type === "user")
        for (const part of parts) {
          if (part.type !== "tool_result" || !part.tool_use_id) continue;
          const made = creating.get(part.tool_use_id);
          if (!made) continue;
          creating.delete(part.tool_use_id);
          const id = part.is_error
            ? undefined
            : CREATED.exec(textOf(part.content))?.[1];
          if (id && !tasks.has(id)) {
            tasks.set(id, made);
            changed = true;
          }
        }
      if (!changed) return undefined;
      const kept = normalizeTodos(list());
      return "error" in kept ? undefined : kept.todos;
    },
  };
}
