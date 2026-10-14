// A mini-me session on a model reached directly (brain/choice.ts), for someone who thinks with an
// API key or a model on their computer rather than their Claude Code. It is the same session as on
// Claude Code (session.ts), with this app running the loop itself, as Hermes Agent, OpenClaw and
// Thursday run theirs: the model is called through the Vercel AI SDK, its tool calls run here
// (loop-tools.ts) with the same names and permission rules, and the conversation is kept in
// brain/sessions/<id>.json, so a session can go on later or be copied for the review.

import { createHash, randomUUID } from "node:crypto";
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
import { colleagueRules, colleagueServices } from "../connectors/colleagues.ts";
import { connectedConnectors } from "../connectors/oauth.ts";
import { serviceTools, sessionRules } from "../connectors/tools.ts";
import { ownModeRules } from "../gate/autonomy.ts";
import { TRUSTED_FROM_START } from "../gate/rules.ts";
import { browserServer } from "../hands/browser.ts";
import { maybeRunCurator, noteActivity } from "../memory/curator.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { SkillStore } from "../memory/skills.ts";
import { loadOffice } from "../office/client.ts";
import { keepAwake } from "../server/awake.ts";
import { cleanEnv } from "../server/brain.ts";
import { minimeHome, toolServerPath } from "../server/paths.ts";
import { profileBlock, readProfile } from "../server/profile.ts";
import { chatGptAccessToken, OPENAI } from "./chatgpt.ts";
import {
  type BrainChoice,
  fallbackChoice,
  providerKey,
  sameModel,
} from "./choice.ts";
import { contextWindow } from "./context.ts";
import { reportKept, WATCHED } from "./events.ts";
import { RETRIES, rootError, withFallback } from "./fallback.ts";
import {
  connectServers,
  type Guard,
  loopTools,
  type Servers,
} from "./loop-tools.ts";
import { modelLabel, provider } from "./providers.ts";
import { pruneToolResults, underPressure } from "./prune.ts";
import { logRun } from "./runlog.ts";
import {
  prepareScratch,
  Spill,
  scratchGuidance,
  scratchRule,
  withoutScratch,
} from "./scratch.ts";
import {
  ALLOWED_TOOLS,
  OUTSIDE_GUIDANCE,
  SELF_ASKING_TOOLS,
  type SessionOptions,
  type SessionResult,
  sessionOrigin,
  skillsDir,
  systemPrompt,
  toolServerEnv,
} from "./session.ts";
import {
  readingTools,
  SUBTASK_GUIDE,
  SUBTASK_READ_TOOLS,
  SUBTASK_STEPS,
  SUBTASK_WORK_TOOLS,
  type Subtask,
  subtaskTool,
} from "./subtask.ts";
import { todoTool } from "./todos.ts";
import { awakeSignal } from "./waits.ts";

type ApiChoice = Extract<BrainChoice, { kind: "api" }>;

/**
 * What Claude Code's own prompt tells it and a model reached directly does not know: how this
 * app runs its tools. Prepended to the mini-me's own system prompt.
 */
/**
 * When it is on the person's computer, put before each message: Claude Code tells its model the
 * date, and a model reached by key knows none. Kept out of the system prompt, which a session
 * keeps as it began (and a vendor caches), so "today" and "this week" stay true.
 */
export function nowLine(now = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const when = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `(${when} on their computer${zone ? `, ${zone}` : ""})`;
}

const LOOP_GUIDE = `You run on your person's computer inside Clone Office, through tools. Call a tool whenever it helps rather than guessing; several at once when they do not depend on each other. Some tools ask your person first: if they say no, or nobody is there to ask, do not try another way to do the same thing; say plainly what you could not do. Paths on their computer are full paths ("~/" is their home). Keep answers short and in their language.`;

/**
 * When to keep a to-do list, as Claude Code's own prompt tells it ("use these tools very frequently
 * … mark todos as completed as soon as you are done"), and when to send a helper: for a session
 * with tools, after what every session shares.
 */
const STEPS_GUIDE = `## Work of several steps
For work of three or more steps, or several things asked at once, keep a to-do list with todo_write as you go: write the steps before you start, mark one in progress as you begin it, and mark each completed the moment it is done, never several at the end, so your person sees where you are. A long search or reading that the rest does not depend on can go to a helper with delegate_task, when you have it, keeping this conversation for the answer.`;

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
/**
 * How a session asks the vendor to cache what it sends again, after Hermes Agent's prompt caching:
 * Anthropic keeps the cache five minutes unless asked for an hour, which costs more to write and
 * pays off only where a person types between calls (their conversation), not where calls follow
 * each other (a flow, a request, a look back); OpenAI routes by a key, made from the session's
 * unchanging start, so calls with the same start land where it is already cached.
 */
export interface CacheHint {
  /** A person types between calls: Anthropic keeps the cache an hour. */
  human: boolean;
  /** The same for every call that starts the same: OpenAI's prompt_cache_key, 64 characters at most. */
  key: string;
}

/** The cache hint for a session: from what it is for, and the start every call repeats. */
export function cacheHint(
  purpose: string | undefined,
  system: string,
): CacheHint {
  return {
    human: purpose === undefined || purpose === "task",
    key: `clone-office-${createHash("sha256")
      .update(`${purpose ?? "task"}\n${system}`)
      .digest("hex")
      .slice(0, 40)}`,
  };
}

export async function languageModel(
  choice: ApiChoice,
  cache: CacheHint = { human: false, key: "" },
): Promise<{
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
      options: {
        openai: {
          store: false,
          systemMessageMode: "developer",
          ...(cache.key ? { promptCacheKey: cache.key } : {}),
        },
      },
    };
  }
  // The office's key, through its relay: the member's own token rides where the vendor's key goes,
  // and the relay puts the key on (features/relay/team-ai.ts). The key never comes here.
  const office = choice.team ? await loadOffice() : undefined;
  if (choice.team && !office) throw new LoopError("brain-team-no-office");
  const through = office
    ? {
        baseURL: new URL(`/ai/${choice.provider}`, office.relay).href,
      }
    : {};
  const key = office ? office.token : await providerKey(choice.provider);
  if (!key && choice.provider !== "local")
    throw new LoopError("brain-key-missing");
  const apiKey = key ?? "";
  switch (choice.provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey, ...through });
      return {
        model: anthropic(choice.model),
        search: { web_search: anthropic.tools.webSearch_20260209() },
        // Anthropic caches only when asked; the marker follows the conversation's end.
        options: {
          anthropic: {
            cacheControl: {
              type: "ephemeral",
              ...(cache.human ? { ttl: "1h" } : {}),
            },
          },
        },
      };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey, ...through });
      return {
        model: openai(choice.model),
        search: { web_search: openai.tools.webSearch() },
        // OpenAI keeps each response unless told not to (store defaults to true): with a team key that
        // would be in the key owner's account for anyone to read in its logs.
        options: {
          openai: {
            store: false,
            ...(cache.key ? { promptCacheKey: cache.key } : {}),
          },
        },
      };
    }
    case "google": {
      const google = createGoogleGenerativeAI({ apiKey, ...through });
      return {
        model: google(choice.model),
        search: { google_search: google.tools.googleSearch({}) },
        options: {},
      };
    }
    case "openrouter":
      return {
        model: createOpenRouter({ apiKey, ...through })(choice.model),
        options: choice.model.startsWith("anthropic/")
          ? {
              openrouter: {
                cacheControl: {
                  type: "ephemeral",
                  ...(cache.human ? { ttl: "1h" } : {}),
                },
              },
            }
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
/** What the office's server says when it refuses a team key's call (features/relay/team-ai.ts). */
const TEAM_CODES = new Set([
  "team-key-limit",
  "no-team-key",
  "team-key-unsealed",
  "office-member-unknown",
]);

/** For the AI SDK's onError: what failed is answered by `failure`, never printed. */
const quiet = () => {};

function failure(thrown: unknown, local = false): string {
  if (thrown instanceof LoopError) return thrown.code;
  // What the AI SDK gave up on after its retries is told by the last failure it saw.
  const error = rootError(thrown);
  if (APICallError.isInstance(error)) {
    // The office's server refused (a team key): its own reason, in the person's language.
    try {
      const code = (JSON.parse(error.responseBody ?? "") as { code?: unknown })
        .code;
      if (typeof code === "string" && TEAM_CODES.has(code)) return code;
    } catch {
      // A vendor's own answer.
    }
    if (error.statusCode === 401 || error.statusCode === 403)
      // A model on this computer is reached with no key of the person's: its server refused.
      return local ? "brain-local-refused" : "brain-key-wrong";
    // The same codes as a busy or slow Claude Code, so a request is retried alike (office/handle.ts).
    if ([429, 503, 529].includes(error.statusCode ?? 0)) return "ai-busy";
  }
  const message = (error as Error)?.message ?? String(error);
  if (/aborted|timeout/i.test(message)) return "timeout";
  return message.slice(0, 500);
}

/** What a session is reached through: the model (with its fallback), the vendor's search, options. */
interface Reached {
  model: LanguageModel;
  search?: Record<string, unknown>;
  options: Record<string, Record<string, JSONValue>>;
  /** The fallback model, by its id, when there is one (fallback.ts). */
  fallback?: string;
}

/**
 * The model the person chose and, when they picked one, the fallback it moves to when that one is
 * busy or failing: a fallback that cannot be reached now (signed out, its key gone) is left out
 * rather than failing the session. `onMove` hears the move.
 */
async function reach(
  choice: ApiChoice,
  cache: CacheHint,
  onMove: (label: string, model: string) => void,
  deps: {
    model?: LanguageModel;
    fallbackModel?: LanguageModel;
    retries?: number;
  },
): Promise<Reached> {
  const main: Reached = deps.model
    ? { model: deps.model, options: {} }
    : await languageModel(choice, cache);
  const picked =
    choice.fallback && !sameModel(choice.fallback, choice)
      ? choice.fallback
      : undefined;
  if (!picked) return main;
  const other = deps.fallbackModel
    ? { model: deps.fallbackModel, options: {} }
    : await languageModel(fallbackChoice(picked), cache).catch(() => undefined);
  if (!other) return main;
  return {
    ...main,
    fallback: picked.model,
    model: withFallback(
      main.model,
      { model: other.model, options: other.options },
      () => onMove(modelLabel(picked.model, picked.provider), picked.model),
      deps.retries ?? RETRIES,
    ),
  };
}

/** What a helper's session takes from the session that sent it (subtask.ts). */
interface Helping {
  servers: Servers;
  guard: Guard;
  search?: Record<string, unknown>;
  scratch?: string;
  signal: AbortSignal;
  tools: Subtask["tools"];
}

/**
 * Runs one session on the chosen model: the same options and result as on Claude Code. `model`
 * (and `fallbackModel`, `subtaskModel`) stand in for the vendor in tests, `retries` for the AI SDK's
 * own; `helping` is set for a helper's session, which uses the connections of the one that sent it.
 */
export async function runLoop(
  options: SessionOptions,
  choice: ApiChoice,
  deps: {
    model?: LanguageModel;
    fallbackModel?: LanguageModel;
    subtaskModel?: LanguageModel;
    retries?: number;
    toolServer?: {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
    helping?: Helping;
  } = {},
): Promise<SessionResult> {
  const actor = options.actor ?? "minime";
  const helping = deps.helping;
  if (actor === "minime" && !options.resume && !helping)
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
  const gate = options.gate;
  const standing = gate ? undefined : options.standing;
  const reads = Boolean(gate || standing || helping);
  // A session that may read has a scratch folder (scratch.ts): its own, the one it was copied
  // from, or for a helper the one of the session that sent it.
  const scratch = reads
    ? (helping?.scratch ??
      (await prepareScratch(options.resume ?? id).catch(() => undefined)))
    : undefined;
  // What every session shares comes first, so a vendor's cache holds across them; what differs by
  // the session's tools and folder comes last.
  const system =
    options.systemPrompt ??
    previous?.system ??
    [
      LOOP_GUIDE,
      helping
        ? [SUBTASK_GUIDE, OUTSIDE_GUIDANCE, profileBlock(await readProfile())]
            .filter(Boolean)
            .join("\n\n")
        : await systemPrompt(undefined, options.language),
      ...(helping && options.language
        ? [`Write your report in ${options.language}.`]
        : []),
      ...(reads && !helping ? [STEPS_GUIDE] : []),
      ...(scratch ? [scratchGuidance(scratch)] : []),
    ].join("\n\n");
  let text = "";
  let context: number | undefined;
  let moved: string | undefined;
  let servers: Servers | undefined;
  let stopDeadline = () => {};
  const finish = async (
    result: Omit<SessionResult, "text" | "sessionId" | "systemPrompt">,
    turns?: number,
  ): Promise<SessionResult> => {
    stopDeadline();
    release();
    // A helper's connections are the session's that sent it, which closes them.
    if (!helping) await servers?.close();
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
      ...(moved ? { fallback: moved } : {}),
      ...(options.within
        ? { parent: options.within.session, within: options.within.purpose }
        : {}),
    }).catch(() => {});
    return { text, sessionId: id, systemPrompt: system, context, ...result };
  };
  try {
    const reached = await reach(
      choice,
      cacheHint(options.purpose, withoutScratch(system)),
      (label, model) => {
        moved = model;
        options.onEvent?.({ type: "fallback", model: label });
      },
      deps,
    );
    const { model, search, options: providerOptions } = reached;
    // The same lines as a Claude Code session: its own tools always; with the gate, asking and
    // reading too; with standing rules, what the person already allowed and nothing more. A helper
    // goes by the rules of the session that sent it.
    const guard: Guard = helping?.guard ?? {
      allow: [
        ...ALLOWED_TOOLS,
        ...(gate
          ? [
              "mcp__minime__ask_me",
              "mcp__minime__sessions",
              ...(gate.colleagues ? ["mcp__minime__colleagues"] : []),
              ...SELF_ASKING_TOOLS,
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
        // Its own scratch folder it reads without asking.
        ...(scratch ? [scratchRule(scratch)] : []),
      ],
      deny: (gate ?? standing)?.deny ?? [],
      ...(gate
        ? { gate: { url: gate.url, secret: gate.secret, chat: gate.chat } }
        : {}),
    };
    // A colleague's request reads in the services let for it, and changes nothing there.
    const colleague =
      options.colleagueReads &&
      actor === "minime" &&
      !helping &&
      !options.noServices
        ? await colleagueServices()
        : [];
    const colleagueRule = await colleagueRules(colleague);
    if (!helping) guard.allow.push(...colleagueRule.allow);
    // Answering a colleague, files that hold keys and passwords are never read, wherever they are.
    if (options.colleagueReads) guard.secretsOut = true;
    // The person's own work: their conversation (watched) or one of their flows.
    const own =
      options.connectors &&
      actor === "minime" &&
      options.audience !== "colleagues" &&
      !helping;
    servers =
      helping?.servers ??
      (await connectServers({
        toolServer: deps.toolServer ?? {
          command: process.execPath,
          args: ["--no-warnings", toolServerPath()],
          env: {
            ...(cleanEnv() as Record<string, string>),
            CLONE_OFFICE_HOME: minimeHome(),
            ...toolServerEnv(
              actor,
              gate,
              options.audience,
              [],
              sessionOrigin(options),
              own,
              scratch,
            ),
          },
        },
        connectors:
          options.connectors && actor === "minime"
            ? await connectedConnectors().catch(() => [])
            : colleague,
        ...(own && !deps.toolServer
          ? { browser: browserServer({ watched: Boolean(gate) }) }
          : {}),
      }));
    // Counted while the computer is awake: a laptop closed mid-work goes on when it opens.
    const deadline = awakeSignal(
      options.timeoutMs ?? (gate ? 15 * 60_000 : 180_000),
    );
    stopDeadline = deadline.stop;
    const timeout = AbortSignal.any([
      deadline.signal,
      ...(helping ? [helping.signal] : []),
    ]);
    // When the window fills, earlier tool results are cut before the next step (prune.ts), and a
    // result too long for it goes to the scratch folder whole (scratch.ts).
    const window = contextWindow(choice);
    const spill = new Spill({ dir: scratch, window });
    const tools: ToolSet = {
      ...(await loopTools({
        servers,
        guard,
        reads,
        ...(helping
          ? {
              // A helper reads what the clone keeps, and for work uses its shell; the services it
              // reaches only read unless it was sent to work (subtask.ts).
              only: new Set([
                ...SUBTASK_READ_TOOLS,
                ...(helping.tools === "work" ? SUBTASK_WORK_TOOLS : []),
              ]),
              services: true,
              readsOnly: await readingTools(
                helping.servers.clients.map(({ name }) => name),
                (service) => serviceTools(service),
              ).then((map) =>
                helping.tools === "work"
                  ? new Map([...map].filter(([name]) => name === "browser"))
                  : map,
              ),
            }
          : reads
            ? { readsOnly: colleagueRule.reads }
            : { only: new Set(ALLOWED_TOOLS), readsOnly: colleagueRule.reads }),
        spill,
        onResult: (tool, input, raw) => {
          if (WATCHED.has(tool)) reportKept(tool, input, raw, options.onEvent);
        },
      })),
      // Searching the web keeps nothing and is the person's from the start, where the vendor has it.
      ...(reads && (helping?.search ?? search)
        ? ((helping?.search ?? search) as ToolSet)
        : {}),
      // The to-do list, which the person sees as it goes (todos.ts); not a helper's own.
      ...(reads && !helping
        ? {
            todo_write: todoTool((todos) =>
              options.onEvent?.({ type: "todos", todos }),
            ),
          }
        : {}),
    };
    // Helpers, in the person's own work only, never from a helper (subtask.ts).
    const connected = servers;
    if (own)
      tools.delegate_task = subtaskTool({
        // Its shell and workspace are the clone's in the person's own work (hands/shell.ts).
        work: true,
        onState: (call, description, state) =>
          options.onEvent?.({
            type: "subtask",
            id: call,
            description,
            state,
          }),
        run: (task) =>
          runLoop(
            {
              prompt: task.prompt,
              purpose: "subtask",
              language: options.language,
              maxTurns: SUBTASK_STEPS,
              persist: false,
              timeoutMs: Math.max(
                30_000,
                (options.timeoutMs ?? (gate ? 15 * 60_000 : 180_000)) -
                  (Date.now() - started),
              ),
              within: { session: id, purpose: options.purpose ?? "task" },
            },
            choice,
            {
              ...(deps.subtaskModel ? { model: deps.subtaskModel } : {}),
              retries: deps.retries,
              helping: {
                servers: connected,
                guard,
                search,
                scratch,
                signal: timeout,
                tools: task.tools,
              },
            },
          ),
      });
    const messages: ModelMessage[] = [
      ...(previous?.messages ?? []),
      { role: "user", content: `${nowLine()}\n\n${options.prompt}` },
    ];
    // Words read between steps, and where among the answer's messages each came, to keep them.
    const heard: { at: number; note: ModelMessage }[] = [];
    const withSteps = (answer: ModelMessage[]) => {
      const out = [...answer];
      heard.forEach((one, index) => {
        out.splice(one.at + index, 0, one.note);
      });
      return out;
    };
    const maxRetries = deps.retries ?? RETRIES;
    const run = streamText({
      // A failure ends the run and is said in the person's words (failure), not printed to the
      // terminal the person may keep open, as the AI SDK does by default.
      onError: quiet,
      model,
      instructions: system,
      messages,
      tools,
      stopWhen: stepCountIs(options.maxTurns ?? 6),
      abortSignal: timeout,
      maxRetries,
      providerOptions,
      prepareStep: async ({ messages: going, steps }) => {
        spill.nextStep();
        const pressed = underPressure(
          going,
          window,
          steps.at(-1)?.usage.inputTokens,
        )
          ? pruneToolResults(going)
          : undefined;
        // What the person wrote meanwhile, read before this step (after Thursday's step-in).
        const added = steps.length ? await options.steer?.() : undefined;
        if (!added) return pressed ? { messages: pressed } : undefined;
        const note: ModelMessage = { role: "user", content: added };
        heard.push({
          at: going.length - messages.length - heard.length,
          note,
        });
        return { messages: [...(pressed ?? going), note] };
      },
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
        content: helping
          ? "Without calling any more tools, give your report now: what you found and did, and what is left."
          : "Without calling any more tools, give your person your answer now: what you found and did, and what is left.",
      };
      const closing = streamText({
        // A failure ends the run and is said in the person's words (failure), not printed to the
        // terminal the person may keep open, as the AI SDK does by default.
        onError: quiet,
        model,
        instructions: system,
        messages: [...messages, ...withSteps(answered), nudge],
        abortSignal: timeout,
        maxRetries,
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
    let kept: ModelMessage[] = [...messages, ...withSteps(answered)];
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
        // A failure ends the run and is said in the person's words (failure), not printed to the
        // terminal the person may keep open, as the AI SDK does by default.
        onError: quiet,
        model,
        instructions: system,
        messages: [...kept, ask],
        output: Output.object({
          schema: jsonSchema(options.jsonSchema as never),
        }),
        abortSignal: timeout,
        maxRetries,
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
        // Kept as small as it went: a session that filled its window goes on cut, not whole.
        messages: underPressure(kept, contextWindow(choice))
          ? pruneToolResults(kept)
          : kept,
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
          cache_creation_input_tokens:
            usage.inputTokenDetails?.cacheWriteTokens ?? 0,
        },
      },
      turns,
    );
  } catch (error) {
    return finish({
      ok: false,
      error: failure(error, choice.provider === "local"),
    });
  }
}
