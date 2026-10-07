// A mini-me session on a model reached directly (brain/choice.ts), for someone who thinks with an
// API key or a model on their computer rather than their Claude Code. It is the same session as on
// Claude Code (session.ts), with this app running the loop itself, as Hermes Agent, OpenClaw and
// Thursday run theirs: the model is called through the Vercel AI SDK, its tool calls run here
// (loop-tools.ts) with the same names and permission rules, and the conversation is kept in
// brain/sessions/<id>.json, so a session can go on later or be copied for the review.

import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  APICallError,
  type JSONValue,
  jsonSchema,
  type LanguageModel,
  type ModelMessage,
  Output,
  stepCountIs,
  streamText,
  type ToolSet,
} from "ai";
import { connectedConnectors } from "../connectors/oauth.ts";
import { sessionRules } from "../connectors/tools.ts";
import { ownModeRules } from "../gate/autonomy.ts";
import { TRUSTED_FROM_START } from "../gate/rules.ts";
import { maybeRunCurator, noteActivity } from "../memory/curator.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { SkillStore } from "../memory/skills.ts";
import { keepAwake } from "../server/awake.ts";
import { cleanEnv } from "../server/brain.ts";
import { minimeHome, toolServerPath } from "../server/paths.ts";
import { chatGptAccessToken, OPENAI } from "./chatgpt.ts";
import { type BrainChoice, providerKey } from "./choice.ts";
import { reportKept, WATCHED } from "./events.ts";
import { connectServers, type Guard, loopTools } from "./loop-tools.ts";
import { provider } from "./providers.ts";
import { logRun } from "./runlog.ts";
import {
  ALLOWED_TOOLS,
  type SessionOptions,
  type SessionResult,
  skillsDir,
  systemPrompt,
  toolServerEnv,
} from "./session.ts";

type ApiChoice = Extract<BrainChoice, { kind: "api" }>;

/**
 * What Claude Code's own prompt tells it and a model reached directly does not know: how this
 * app runs its tools. Prepended to the mini-me's own system prompt.
 */
const LOOP_GUIDE = `You run on your person's computer inside sub-office, through tools. Call a tool whenever it helps rather than guessing; several at once when they do not depend on each other. Some tools ask your person first: if they say no, or nobody is there to ask, do not try another way to do the same thing; say plainly what you could not do. Paths on their computer are full paths ("~/" is their home). Keep answers short and in their language.`;

/** One kept session: the system prompt it started with and the conversation so far. */
interface Kept {
  id: string;
  system: string;
  messages: ModelMessage[];
  provider: string;
  model: string;
  at: string;
}

const sessionsDir = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "brain", "sessions");
const sessionPath = (id: string) => {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(id)) throw new Error("Not a session id.");
  return join(/*turbopackIgnore: true*/ sessionsDir(), `${id}.json`);
};

async function loadSession(id: string): Promise<Kept | undefined> {
  const read = await readText(sessionPath(id));
  if (!read.raw) return undefined;
  try {
    return JSON.parse(read.raw) as Kept;
  } catch {
    return undefined;
  }
}

async function saveSession(kept: Kept): Promise<void> {
  await atomicWrite(sessionPath(kept.id), JSON.stringify(kept), {
    mode: 0o600,
  });
}

/** The model the person chose, with their key. A model on their computer needs none. */
export async function languageModel(choice: ApiChoice): Promise<{
  model: LanguageModel;
  /** The vendor's own web search, run on its side; searching keeps nothing. */
  search?: Record<string, unknown>;
  options: Record<string, Record<string, JSONValue>>;
}> {
  if (choice.provider === "chatgpt") {
    // The person's ChatGPT plan, by the token they signed in with: the public Responses API,
    // which on a plan keeps nothing (store: false) and takes the instructions as a developer
    // message rather than a system one.
    const access = await chatGptAccessToken().catch((error: Error) => {
      throw new LoopError(
        (error as { code?: string }).code ?? "brain-chatgpt-signed-out",
      );
    });
    return {
      model: createOpenAI({ apiKey: access, baseURL: OPENAI.api }).responses(
        choice.model,
      ),
      options: { openai: { store: false, systemMessageMode: "developer" } },
    };
  }
  const key = await providerKey(choice.provider);
  if (!key && choice.provider !== "local")
    throw new LoopError("brain-key-missing");
  const apiKey = key ?? "";
  switch (choice.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey });
      return {
        model: anthropic(choice.model),
        search: { web_search: anthropic.tools.webSearch_20260209() },
        // Anthropic caches only when asked; the marker follows the conversation's end.
        options: { anthropic: { cacheControl: { type: "ephemeral" } } },
      };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey });
      return {
        model: openai(choice.model),
        search: { web_search: openai.tools.webSearch() },
        options: {},
      };
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey });
      return {
        model: google(choice.model),
        search: { google_search: google.tools.googleSearch({}) },
        options: {},
      };
    }
    case "openrouter":
      return {
        model: createOpenRouter({ apiKey })(choice.model),
        options: choice.model.startsWith("anthropic/")
          ? { openrouter: { cacheControl: { type: "ephemeral" } } }
          : {},
      };
    case "local":
      // Ollama and LM Studio answer OpenAI's chat API on this computer.
      return {
        model: createOpenAI({
          apiKey: apiKey || "local",
          baseURL: choice.baseUrl ?? provider("local")?.baseUrl,
        }).chat(choice.model),
        options: {},
      };
    default:
      throw new LoopError("brain-key-missing");
  }
}

export class LoopError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

/** What went wrong, as the code the screen says it with when there is one. */
function failure(error: unknown): string {
  if (error instanceof LoopError) return error.code;
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "brain-key-wrong";
    // The same codes as a busy or slow Claude Code, so a request is retried alike (office/handle.ts).
    if ([429, 503, 529].includes(error.statusCode ?? 0)) return "ai-busy";
  }
  const message = (error as Error)?.message ?? String(error);
  if (/aborted|timeout/i.test(message)) return "timeout";
  return message.slice(0, 500);
}

/**
 * Runs one session on the chosen model: the same options and result as on Claude Code. `model`
 * stands in for the vendor in tests.
 */
export async function runLoop(
  options: SessionOptions,
  choice: ApiChoice,
  deps: {
    model?: LanguageModel;
    toolServer?: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
  } = {},
): Promise<SessionResult> {
  const actor = options.actor ?? "minime";
  if (actor === "minime" && !options.resume)
    await maybeRunCurator(new SkillStore(skillsDir()));
  const started = Date.now();
  const release = keepAwake();
  const previous = options.resume
    ? await loadSession(options.resume).catch(() => undefined)
    : undefined;
  // A session this loop never kept (Claude Code's, before the person changed brains) cannot go
  // on here: the caller goes on from the conversation's own record instead.
  if (options.resume && !previous) {
    release();
    return {
      ok: false,
      text: "",
      error: "session-missing",
    };
  }
  const id = options.resume && !options.fork ? options.resume : randomUUID();
  const system =
    options.systemPrompt ??
    previous?.system ??
    `${LOOP_GUIDE}\n\n${await systemPrompt(undefined, options.language)}`;
  const gate = options.gate;
  const standing = gate ? undefined : options.standing;
  let text = "";
  let context: number | undefined;
  let servers: Awaited<ReturnType<typeof connectServers>> | undefined;
  const finish = async (
    result: Omit<SessionResult, "text" | "sessionId" | "systemPrompt">,
    turns?: number,
  ): Promise<SessionResult> => {
    release();
    await servers?.close();
    if (actor === "minime") noteActivity(skillsDir()).catch(() => {});
    logRun({
      at: new Date(started).toISOString(),
      purpose: options.purpose ?? "task",
      brain: `api:${choice.provider}`,
      model: choice.model,
      session: id,
      ok: result.ok,
      error: result.error,
      ms: Date.now() - started,
      turns,
      context,
      usage: result.usage,
    }).catch(() => {});
    return { text, sessionId: id, systemPrompt: system, context, ...result };
  };
  try {
    const {
      model,
      search,
      options: providerOptions,
    } = deps.model
      ? { model: deps.model, search: undefined, options: {} }
      : await languageModel(choice);
    // The same lines as a Claude Code session: its own tools always; with the gate, asking and
    // reading too; with standing rules, what the person already allowed and nothing more.
    const guard: Guard = {
      allow: [
        ...ALLOWED_TOOLS,
        ...(gate
          ? [
              "mcp__minime__ask_me",
              "mcp__minime__sessions",
              ...(gate.colleagues ? ["mcp__minime__colleagues"] : []),
              ...TRUSTED_FROM_START,
              ...(await sessionRules([
                ...gate.allow,
                ...(await ownModeRules(options.purpose)),
              ])),
            ]
          : standing
            ? [
                ...TRUSTED_FROM_START,
                ...(await sessionRules([
                  ...standing.allow,
                  ...(await ownModeRules(options.purpose)),
                ])),
              ]
            : []),
      ],
      deny: (gate ?? standing)?.deny ?? [],
      ...(gate
        ? { gate: { url: gate.url, secret: gate.secret, chat: gate.chat } }
        : {}),
    };
    const reads = Boolean(gate || standing);
    servers = await connectServers({
      toolServer: deps.toolServer ?? {
        command: process.execPath,
        args: ["--no-warnings", toolServerPath()],
        env: {
          ...(cleanEnv() as Record<string, string>),
          SUB_OFFICE_HOME: minimeHome(),
          ...toolServerEnv(actor, gate, options.audience),
        },
      },
      connectors:
        options.connectors && actor === "minime"
          ? await connectedConnectors().catch(() => [])
          : [],
    });
    const tools = {
      ...(await loopTools({
        servers,
        guard,
        reads,
        ...(reads ? {} : { only: new Set(ALLOWED_TOOLS) }),
        onResult: (tool, input, raw) => {
          if (WATCHED.has(tool)) reportKept(tool, input, raw, options.onEvent);
        },
      })),
      // Searching the web keeps nothing and is the person's from the start, where the vendor has it.
      ...(reads && search ? (search as ToolSet) : {}),
    };
    const messages: ModelMessage[] = [
      ...(previous?.messages ?? []),
      { role: "user", content: options.prompt },
    ];
    const timeout = AbortSignal.timeout(
      options.timeoutMs ?? (gate ? 15 * 60_000 : 180_000),
    );
    const run = streamText({
      model,
      instructions: system,
      messages,
      tools,
      stopWhen: stepCountIs(options.maxTurns ?? 6),
      abortSignal: timeout,
      providerOptions,
    });
    let error: unknown;
    let turns = 0;
    let stepped = false;
    for await (const part of run.fullStream) {
      if (part.type === "text-delta") {
        // What one step said and what the next says after its tools are paragraphs, not one run-on.
        const gap = stepped && text && !text.endsWith("\n") ? "\n\n" : "";
        stepped = false;
        text += gap + part.text;
        options.onEvent?.({ type: "text", text: gap + part.text });
      } else if (part.type === "start-step") {
        stepped = true;
      } else if (part.type === "finish-step") {
        turns++;
        context = part.usage.inputTokens;
      } else if (part.type === "error") error = part.error;
    }
    if (error) throw error;
    let answered = (await run.responseMessages) as ModelMessage[];
    let usage = await run.totalUsage;
    // The steps ran out on a tool call, or the model said nothing: ask once more, without tools, for
    // the answer the person reads (Hermes Agent asks the same when its iterations run out).
    if (!options.jsonSchema && !text.trim()) {
      const nudge: ModelMessage = {
        role: "user",
        content:
          "Without calling any more tools, give your person your answer now: what you found and did, and what is left.",
      };
      const closing = streamText({
        model,
        instructions: system,
        messages: [...messages, ...answered, nudge],
        abortSignal: timeout,
        providerOptions,
      });
      for await (const part of closing.fullStream) {
        if (part.type === "text-delta") {
          text += part.text;
          options.onEvent?.({ type: "text", text: part.text });
        } else if (part.type === "error") throw part.error;
      }
      answered = [
        ...answered,
        nudge,
        ...((await closing.responseMessages) as ModelMessage[]),
      ];
      const more = await closing.totalUsage;
      usage = {
        ...usage,
        inputTokens: (usage.inputTokens ?? 0) + (more.inputTokens ?? 0),
        outputTokens: (usage.outputTokens ?? 0) + (more.outputTokens ?? 0),
        totalTokens: (usage.totalTokens ?? 0) + (more.totalTokens ?? 0),
      };
    }
    let structured: unknown;
    let kept: ModelMessage[] = [...messages, ...answered];
    // A session that ends in a shape (a request's answer, what a reading kept) is asked for it last,
    // without tools: not every vendor takes tools and a shape in one call.
    if (options.jsonSchema) {
      const ask: ModelMessage = {
        role: "user",
        content:
          "Now give your final answer as JSON in the shape asked for, from everything above, and nothing else.",
      };
      // Streamed, as a ChatGPT plan takes nothing else.
      const shaped = streamText({
        model,
        instructions: system,
        messages: [...kept, ask],
        output: Output.object({
          schema: jsonSchema(options.jsonSchema as never),
        }),
        abortSignal: timeout,
        providerOptions,
      });
      for await (const part of shaped.fullStream)
        if (part.type === "error") throw part.error;
      structured = await shaped.output;
      kept = [
        ...kept,
        ask,
        ...((await shaped.responseMessages) as ModelMessage[]),
      ];
      const more = await shaped.totalUsage;
      usage = {
        ...usage,
        inputTokens: (usage.inputTokens ?? 0) + (more.inputTokens ?? 0),
        outputTokens: (usage.outputTokens ?? 0) + (more.outputTokens ?? 0),
      };
    }
    if (options.persist !== false)
      await saveSession({
        id,
        system,
        messages: kept,
        provider: choice.provider,
        model: choice.model,
        at: new Date().toISOString(),
      });
    return await finish(
      {
        ok: true,
        ...(structured === undefined ? {} : { structured }),
        usage: {
          input_tokens: usage.inputTokens ?? 0,
          output_tokens: usage.outputTokens ?? 0,
          cache_read_input_tokens:
            usage.inputTokenDetails?.cacheReadTokens ?? 0,
        },
      },
      turns,
    );
  } catch (error) {
    return finish({ ok: false, error: failure(error) });
  }
}
