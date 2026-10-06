// One mini-me session on the person's own Claude Code: the memory snapshot and guidance go into
// the system prompt (frozen for the session, so the prompt cache holds, as in Hermes), and the
// memory MCP server is the one tool it may use. Sessions are kept by Claude Code, so a finished
// one can be forked for the background review without touching it.
//
// Only documented options are used; the person's login is never touched, and API keys in the
// environment are dropped so their subscription is what runs (see server/brain.ts).

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Connector } from "../connectors/catalog.ts";
import { connectedConnectors } from "../connectors/oauth.ts";
import { sessionRules } from "../connectors/tools.ts";
import { ASKABLE_TOOLS, TRUSTED_FROM_START } from "../gate/rules.ts";
import { maybeRunCurator, noteActivity } from "../memory/curator.ts";
import { NoteStore } from "../memory/notes.ts";
import { SkillStore } from "../memory/skills.ts";
import { MemoryStore, type Target } from "../memory/store.ts";
import { MEMORY_GUIDANCE } from "../memory/tool.ts";
import { keepAwake } from "../server/awake.ts";
import { claudeCommand, cleanEnv, defaultModel } from "../server/brain.ts";
import {
  appDir,
  connectorHeadersPath,
  minimeHome,
  toolServerPath,
} from "../server/paths.ts";
import { brainChoice } from "./choice.ts";
import { reportKept, WATCHED } from "./events.ts";
import { logRun } from "./runlog.ts";

export function memoryDir(): string {
  return join(minimeHome(), "memories");
}

export function skillsDir(): string {
  return join(minimeHome(), "skills");
}

export function notesDir(): string {
  return join(minimeHome(), "notes");
}

const SKILLS_GUIDANCE = `## Skills
A skill is how to do a class of task the way your person wants it. Before you do a task, scan the skills below; if one matches or is even partly relevant, load it with skill_view and follow it — it holds their preferences and standards for that work. A skill's references/ files load with skill_view(name, file_path) when a step needs them. When you work out how your person wants a kind of task done, or they correct you, record it with skill_manage: patch the skill that covers it before making a new one.`;

const NOTES_GUIDANCE = `## Notes
Notes are pages about the people your person works with (people/), their ongoing work — projects, clients, cases, products (projects/) — and recurring subjects (topics/). When a person or piece of work comes up, look for its page with note_search or note_view before asking or guessing. Keep what you learn about one of them in that page with note_write.

## Past conversations
Your person's own conversations with their AI tools on this computer can be searched with conversation_search and read with conversation_read. Look there before asking them what they did, decided or left unfinished.

## This app
How sub-office works for your person — what you can do for them now, what you keep and never keep, what you read from their computer, how they leave something out — is written in its guide. Read it with guide_read (index.md first) whenever an answer depends on how the app works, and answer from it rather than from what you assume.

## When memory and the computer disagree
What your memory, skills and notes say about things that change may be out of date. When it matters, check the source (their files, conversation_search) and trust it over what you kept; then correct or remove what you kept.`;

/** The skill index a session starts with: category, name and one-line description, as in Hermes. */
async function skillIndex(): Promise<string> {
  const index = await new SkillStore(skillsDir()).index();
  return `${SKILLS_GUIDANCE}\n${index || "(none yet)"}`;
}

/** The notes a session starts with: counts and the latest pages, never the pages themselves. */
async function notesOverview(): Promise<string> {
  const overview = await new NoteStore(notesDir()).overview();
  return `${NOTES_GUIDANCE}\n${overview || "(no pages yet)"}`;
}

const IDENTITY = `You are your person's mini-me: an AI that works the way they work. You do their everyday tasks the way they would, in their voice, and you learn how they work as you go. Their own words and corrections outrank anything you infer. Say so when you are unsure, and never invent facts about them. Everything you keep — memory entries, skills, notes — is written in the language your person uses with you, keeping their own words for things rather than translating them.`;

/** The system prompt a session starts with: who the mini-me is, memory guidance, both stores. */
export async function systemPrompt(
  store = new MemoryStore(memoryDir()),
  language?: string,
): Promise<string> {
  const blocks = await Promise.all(
    (["user", "memory"] as Target[]).map((target) => store.render(target)),
  );
  return [
    language
      ? `${IDENTITY} Your person's language is ${language}: write what you keep in ${language}.`
      : IDENTITY,
    MEMORY_GUIDANCE,
    await skillIndex(),
    await notesOverview(),
    ...blocks.filter(Boolean),
  ].join("\n\n");
}

export type SessionEvent =
  | { type: "text"; text: string }
  | { type: "skill"; changes: string[] }
  | { type: "note"; changes: string[] }
  | {
      type: "memory";
      target: string;
      action: string;
      content?: string;
      oldText?: string;
      operations?: { action: string; content?: string; old_text?: string }[];
    }
  | { type: "memory-refused"; error: string };

export interface SessionOptions {
  prompt: string;
  /** When set, the session ends with JSON matching this schema (`structured`). */
  jsonSchema?: Record<string, unknown>;
  /** Continue this session (with `fork`, a copy of it, leaving it unchanged). */
  resume?: string;
  fork?: boolean;
  /** "review" for the background review, which may change only what the mini-me made. */
  actor?: "minime" | "review";
  /**
   * The system prompt to use. A review passes the one its session started with, so the copy
   * reuses that session's prompt cache instead of a prompt rebuilt from newer memory.
   */
  systemPrompt?: string;
  /** The person's language as the app's screen shows it (e.g. "Korean"), pinned for what is kept. */
  language?: string;
  model?: string;
  maxTurns?: number;
  timeoutMs?: number;
  /** false: Claude Code keeps no transcript of the session (for text the person asked not to keep). */
  persist?: boolean;
  /** What the session is for, as the run log records it. */
  purpose?: SessionPurpose;
  /**
   * In a conversation with the person, the trust gate: the mini-me may then also read (their files,
   * the web), and whatever they have not let it do alone is asked on their screen.
   */
  gate?: SessionGate;
  /**
   * Work with nobody to ask (a flow): the session may also do what the person has already let it
   * do alone, and everything else is refused rather than asked.
   */
  standing?: { allow: string[]; deny: string[] };
  /**
   * The person's own work (their conversation, a flow): the services they connected are reached
   * too (connectors/), each tool asked first unless they allowed it. Never for a colleague's
   * request, so what is in their mail or documents does not go out to colleagues by itself.
   */
  connectors?: boolean;
  onEvent?: (event: SessionEvent) => void;
}

export interface SessionGate {
  /** Where the tool server puts questions to the person (the app's gate route). */
  url: string;
  secret: string;
  chat?: string;
  /** Rules the person agreed to ("from now on"), in Claude Code's permission syntax. */
  allow: string[];
  /** The folders kept out, as rules no answer overrides. */
  deny: string[];
  /** In a conversation with the person: the office's tools (asking a colleague is asked first). */
  colleagues?: boolean;
}

export type SessionPurpose =
  | "learn"
  | "import"
  | "task"
  | "review"
  | "fix"
  | "summary"
  | "request"
  | "check"
  | "card"
  | "flow";

export interface SessionResult {
  ok: boolean;
  sessionId?: string;
  /** The system prompt the session ran with (frozen, as in Hermes). */
  systemPrompt?: string;
  text: string;
  structured?: unknown;
  error?: string;
  usage?: Record<string, number>;
  /**
   * How much of the model's context the session's last request used (input, cache read and cache
   * written), so a long conversation can be carried into a fresh session before it fills up.
   */
  context?: number;
}

/** The mini-me's own tools it uses alone in every session, whichever brain thinks. */
export const ALLOWED_TOOLS = [
  "memory",
  "skills_list",
  "skill_view",
  "skill_manage",
  "note_search",
  "note_view",
  "note_write",
  "conversation_search",
  "conversation_read",
  "guide_read",
  "flows",
  "office_inbox",
].map((tool) => `mcp__minime__${tool}`);

/** The few fields of Claude Code's stream-json events this reads. */
interface StreamEvent {
  type?: string;
  subtype?: string;
  session_id?: string;
  is_error?: boolean;
  result?: unknown;
  structured_output?: unknown;
  usage?: Record<string, number>;
  num_turns?: number;
  duration_ms?: number;
  total_cost_usd?: number;
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
    }[];
  };
}

/** A command as a shell reads it, its paths quoted (POSIX shells and Windows' alike). */
const quoted = (path: string) => `"${path.replace(/"/g, '\\"')}"`;

/** What the mini-me's own tool server is told: where its stores are, who it serves, the gate. */
export function toolServerEnv(
  actor: "minime" | "review",
  gate?: SessionGate,
): Record<string, string> {
  return {
    MINIME_MEMORY_DIR: memoryDir(),
    MINIME_SKILLS_DIR: skillsDir(),
    MINIME_NOTES_DIR: notesDir(),
    MINIME_GUIDE_DIR: join(/*turbopackIgnore: true*/ appDir(), "guide"),
    MINIME_ACTOR: actor,
    ...(gate
      ? {
          MINIME_GATE_URL: gate.url,
          MINIME_GATE_SECRET: gate.secret,
          ...(gate.chat ? { MINIME_CHAT_ID: gate.chat } : {}),
          ...(gate.colleagues ? { MINIME_COLLEAGUES: "1" } : {}),
        }
      : {}),
  };
}

/** The session's MCP servers: its own tools, and the services the person connected. */
export function mcpConfig(
  actor: "minime" | "review",
  gate?: SessionGate,
  connectors: Connector[] = [],
): string {
  return JSON.stringify({
    mcpServers: {
      // Each service the person connected, its token handed over fresh at every connection
      // (connectors/headers.ts), never written into the session's arguments.
      ...Object.fromEntries(
        connectors.map((entry) => [
          entry.id,
          {
            type: "http",
            url: entry.url,
            headersHelper: `${quoted(process.execPath)} --no-warnings ${quoted(connectorHeadersPath())} ${entry.id}`,
          },
        ]),
      ),
      minime: {
        command: process.execPath,
        // Node runs the TypeScript server as is (bundled in the package); warnings would only
        // clutter its stderr.
        args: ["--no-warnings", toolServerPath()],
        env: toolServerEnv(actor, gate),
      },
    },
  });
}

export async function runSession(
  options: SessionOptions,
): Promise<SessionResult> {
  // A person who picked another brain thinks with it through the app's own loop (loop.ts).
  const choice = await brainChoice();
  if (choice.kind === "api") {
    const { runLoop } = await import("./loop.ts");
    return runLoop(options, choice);
  }
  const command = claudeCommand();
  if (!command) return { ok: false, text: "", error: "claude-missing" };
  const home = minimeHome();
  mkdirSync(home, { recursive: true });
  const actor = options.actor ?? "minime";
  // The weekly tidy-up runs before a fresh session builds its prompt, never inside a review.
  if (actor === "minime" && !options.resume)
    await maybeRunCurator(new SkillStore(skillsDir()));
  const prompt =
    options.systemPrompt ?? (await systemPrompt(undefined, options.language));
  const sessionId =
    options.resume && !options.fork ? options.resume : undefined;
  const newId = options.resume ? undefined : randomUUID();
  const gate = options.gate;
  const standing = gate ? undefined : options.standing;
  // Without the gate a session keeps its memory and nothing else; with it, it may also read, and
  // anything not let through by the person's rules is asked through the gate's prompt tool. Work
  // with nobody to ask has the person's rules and nothing more.
  const allowed = [
    ...ALLOWED_TOOLS,
    ...(gate
      ? [
          "mcp__minime__ask_me",
          // Seeing which conversations there are is free; asking one is the person's to allow.
          "mcp__minime__sessions",
          ...(gate.colleagues ? ["mcp__minime__colleagues"] : []),
          ...TRUSTED_FROM_START,
          ...(await sessionRules(gate.allow)),
        ]
      : standing
        ? [...TRUSTED_FROM_START, ...(await sessionRules(standing.allow))]
        : []),
  ];
  const deny = (gate ?? standing)?.deny ?? [];
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--model",
    options.model ?? defaultModel(),
    "--setting-sources",
    "project",
    "--mcp-config",
    mcpConfig(
      actor,
      gate,
      options.connectors && actor === "minime"
        ? await connectedConnectors().catch(() => [])
        : [],
    ),
    "--strict-mcp-config",
    "--tools",
    gate || standing ? ASKABLE_TOOLS.join(",") : "",
    "--allowedTools",
    allowed.join(","),
    ...(deny.length ? ["--disallowedTools", deny.join(",")] : []),
    "--permission-mode",
    gate ? "manual" : "dontAsk",
    ...(gate
      ? ["--permission-prompt-tool", "mcp__minime__permission_prompt"]
      : []),
    "--append-system-prompt",
    prompt,
    "--max-turns",
    String(options.maxTurns ?? 6),
    ...(newId ? ["--session-id", newId] : []),
    ...(options.persist === false ? ["--no-session-persistence"] : []),
    ...(options.resume ? ["--resume", options.resume] : []),
    ...(options.fork ? ["--fork-session"] : []),
    ...(options.jsonSchema
      ? ["--json-schema", JSON.stringify(options.jsonSchema)]
      : []),
  ];
  return new Promise((resolve) => {
    const env = cleanEnv();
    // The helpers it starts (a service's token) find the same mini-me.
    env.SUB_OFFICE_HOME = home;
    // A question to the person may wait up to ten minutes inside one tool call.
    if (gate) env.MCP_TOOL_TIMEOUT = String(11 * 60 * 1000);
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd: home,
      env: env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let text = "";
    let stderr = "";
    let id = newId ?? sessionId;
    let settled = false;
    let context: number | undefined;
    let turns: number | undefined;
    let cost: number | undefined;
    const started = Date.now();
    const pending = new Map<string, Record<string, unknown>>();
    // The computer does not sleep in the middle of the mini-me's work.
    const release = keepAwake();
    const finish = (result: Omit<SessionResult, "text">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      release();
      // The curator waits for a quiet stretch after the person last used their mini-me.
      if (actor === "minime") noteActivity(skillsDir()).catch(() => {});
      logRun({
        at: new Date(started).toISOString(),
        purpose: options.purpose ?? "task",
        brain: "claude-code",
        model: options.model ?? defaultModel(),
        session: id,
        ok: result.ok,
        error: result.error,
        ms: Date.now() - started,
        turns,
        context,
        usage: result.usage,
        cost_usd: cost,
      }).catch(() => {});
      resolve({
        text,
        sessionId: id,
        systemPrompt: prompt,
        context,
        ...result,
      });
    };
    const timer = setTimeout(
      () => {
        child.kill("SIGTERM");
        finish({ ok: false, error: "Claude Code did not finish in time." });
      },
      options.timeoutMs ?? (gate ? 15 * 60_000 : 180_000),
    );
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      finish({
        ok: false,
        error: `Could not start Claude Code: ${error.message}`,
      }),
    );
    const lines = createInterface({
      input: child.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });
    lines.on("line", (line) => {
      let event: StreamEvent;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (typeof event.session_id === "string") id = event.session_id;
      if (event.type === "assistant" && event.message?.usage) {
        const usage = event.message.usage;
        context =
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
      }
      if (event.type === "assistant")
        for (const part of event.message?.content ?? []) {
          if (part.type === "text" && part.text) {
            text += part.text;
            options.onEvent?.({ type: "text", text: part.text });
          }
          if (
            part.type === "tool_use" &&
            part.id &&
            WATCHED.has(part.name ?? "")
          )
            pending.set(part.id, { ...(part.input ?? {}), __tool: part.name });
        }
      if (event.type === "user")
        for (const part of event.message?.content ?? []) {
          if (part.type !== "tool_result" || !part.tool_use_id) continue;
          const input = pending.get(part.tool_use_id);
          if (!input) continue;
          pending.delete(part.tool_use_id);
          const raw = Array.isArray(part.content)
            ? part.content.map((c: { text?: string }) => c.text ?? "").join("")
            : String(part.content ?? "");
          const { __tool, ...given } = input;
          reportKept(String(__tool), given, raw, options.onEvent);
        }
      if (event.type === "result") {
        turns = event.num_turns;
        cost = event.total_cost_usd;
      }
      if (event.type === "result")
        finish({
          ok: !event.is_error,
          error: event.is_error
            ? String(event.result ?? event.subtype)
            : undefined,
          structured: event.structured_output,
          usage: event.usage,
        });
    });
    child.on("close", (code) => {
      if (!settled)
        finish({
          ok: false,
          error: `Claude Code exited (${code}): ${stderr.trim().slice(-300) || "no output"}`,
        });
    });
    child.stdin.end(options.prompt);
  });
}
