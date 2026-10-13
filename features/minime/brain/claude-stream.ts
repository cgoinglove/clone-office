// What a session on the person's own Claude Code says as it works, read from its stream-json
// events (`claude -p --output-format stream-json --verbose`): its words, how much of the model's
// window it used, what it kept, its to-do list (todos.ts), the sub-agents it sent with its own Agent
// tool, a move to the fallback model ("model_fallback", which `--fallback-model` makes), and how it
// ended. What a sub-agent says (its messages name the Agent call they belong to,
// parent_tool_use_id) is its own: only the session's own words reach the person and its context.

import { reportKept, WATCHED } from "./events.ts";
import { modelLabel } from "./providers.ts";
import type { SessionEvent } from "./session.ts";
import { claudeTodos, type Todo } from "./todos.ts";

/** The few fields of Claude Code's stream-json events this reads. */
export interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  usage?: Record<string, number>;
  num_turns?: number;
  duration_ms?: number;
  total_cost_usd?: number;
  /** A "model_fallback" system event: the model it moved to. */
  fallback_model?: string;
  message?: {
    usage?: Record<string, number>;
    content?: {
      type?: string;
      text?: string;
      id?: string;
      name?: string;
      input?: Record<string, unknown>;
      tool_use_id?: string;
      content?: unknown;
      is_error?: boolean;
    }[];
  };
}

/** Claude Code's sub-agent tool, by its name now and before. */
const AGENT_TOOLS = new Set(["Agent", "Task"]);

/** How the session ended, from its result event. */
export interface StreamEnd {
  ok: boolean;
  error?: string;
  structured?: unknown;
  usage?: Record<string, number>;
}

export class ClaudeStream {
  text = "";
  id?: string;
  context?: number;
  turns?: number;
  cost?: number;
  private readonly kept = new Map<string, Record<string, unknown>>();
  private readonly agents = new Map<string, string>();
  private readonly todos: ReturnType<typeof claudeTodos>;
  private readonly onEvent?: (event: SessionEvent) => void;

  constructor(
    options: {
      id?: string;
      /** The conversation's list as it last stood (todos.ts claudeTodos). */
      todos?: readonly Todo[];
      onEvent?: (event: SessionEvent) => void;
    } = {},
  ) {
    this.id = options.id;
    this.onEvent = options.onEvent;
    this.todos = claudeTodos(options.todos);
  }

  /** Reads one event; answers how the session ended once its result came. */
  read(event: StreamEvent): StreamEnd | undefined {
    if (typeof event.session_id === "string") this.id = event.session_id;
    const own = !event.parent_tool_use_id;
    const parts = event.message?.content ?? [];
    if (event.type === "system" && event.subtype === "model_fallback")
      this.onEvent?.({
        type: "fallback",
        model: modelLabel(String(event.fallback_model ?? "")),
      });
    if (event.type === "assistant" && own && event.message?.usage) {
      const usage = event.message.usage;
      this.context =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
    }
    if (event.type === "assistant")
      for (const part of parts) {
        if (own && part.type === "text" && part.text) {
          this.text += part.text;
          this.onEvent?.({ type: "text", text: part.text });
        }
        if (part.type !== "tool_use" || !part.id) continue;
        if (WATCHED.has(part.name ?? ""))
          this.kept.set(part.id, { ...(part.input ?? {}), __tool: part.name });
        if (own && AGENT_TOOLS.has(part.name ?? "")) {
          const description = String(
            part.input?.description ?? part.input?.subagent_type ?? "",
          ).slice(0, 120);
          this.agents.set(part.id, description);
          this.onEvent?.({
            type: "subtask",
            id: part.id,
            description,
            state: "running",
          });
        }
      }
    if (event.type === "user")
      for (const part of parts) {
        if (part.type !== "tool_result" || !part.tool_use_id) continue;
        const description = this.agents.get(part.tool_use_id);
        if (description !== undefined) {
          this.agents.delete(part.tool_use_id);
          this.onEvent?.({
            type: "subtask",
            id: part.tool_use_id,
            description,
            state: part.is_error ? "failed" : "done",
          });
        }
        const input = this.kept.get(part.tool_use_id);
        if (!input) continue;
        this.kept.delete(part.tool_use_id);
        const raw = Array.isArray(part.content)
          ? part.content.map((c: { text?: string }) => c.text ?? "").join("")
          : String(part.content ?? "");
        const { __tool, ...given } = input;
        reportKept(String(__tool), given, raw, this.onEvent);
      }
    const list = this.todos.read(event);
    if (list) this.onEvent?.({ type: "todos", todos: list });
    if (event.type !== "result") return undefined;
    this.turns = event.num_turns;
    this.cost = event.total_cost_usd;
    return {
      ok: !event.is_error,
      error: event.is_error ? String(event.result ?? event.subtype) : undefined,
      structured: event.structured_output,
      usage: event.usage,
    };
  }
}
