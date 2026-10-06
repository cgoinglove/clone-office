// The first transplant: one session in which the mini-me reads what its person's computer says
// about how they work and returns a few durable lines about it, which are saved to its memory
// here (a structured answer, so what is kept never depends on the model choosing to call a tool).
// It keeps no facts that change or can be looked up again (projects, status, plans, files): a
// stale copy is worse than none, and the conversation index and the files are there to search when
// needed (Claude Code's auto memory skips what can be derived; Hermes keeps short-lived facts in
// session history, not memory). Notes and skills are learned later, while working together. The
// session also offers three things to do together right away, so the first experience is doing
// work, not filling in a form; the screen shows the memory itself, as it is saved.
// What was read and when is recorded, so the next learning reads only what is new (f6).

import { join } from "node:path";
import {
  memoryDir,
  runSession,
  type SessionEvent,
  type SessionResult,
} from "../brain/session.ts";
import { openHistoryForRead } from "../history/db.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { MemoryStore } from "../memory/store.ts";
import { cleanRoutines, type Routine } from "../routine.ts";
import { minimeHome } from "../server/paths.ts";
import { gather, type Material } from "./gather.ts";

const LEARN_FILE = "learn.json";

export const LEARN_PROMPT = `This is the first time you meet your person. Below is what their own computer says about how they work. Use it to learn a little about how they work, not to copy what it says.

Keep only a few short memory entries that the material shows clearly and that will still be true in months: how they like to work with an assistant, how they decide and where they want to be asked first, how they talk (their language and phrasing). Put them in \`memory\`, at most five, each one short line in their language; they are saved to your memory of them as written, and shown to them as you write them. Never restate what your memory already holds. Do not call the memory tool now.

Keep nothing that can change or can be found again on their computer: projects and their status, goals, plans, dates, versions, folders and files, tools, who is doing what. A saved copy of those goes stale and misleads you later; you can always look them up when you need them. Make no notes and no skills now — you will learn those while working with them. When unsure, keep nothing.

Then offer, in \`tasks\`, three things you can do for them right now with what you have — their past AI conversations, which you can search and read, your memory, this app's guide, the web, their files when they allow it, and their own Claude Code conversations, which you can ask — chosen from what they are actually doing: pulling together what they decided or left open, finding how they handled something before, drafting something the way they write it. When the material shows little of what they do, offer what you can do from what you know of them, such as drafting a message the way they write. Never suggest changing files, running commands or using another app; you cannot do those on your own. Each is a short label and why; the label is sent to you as their request when they tap it, so write it as that request.

Last, in \`routines\`, at most three things they do at a regular time, read from the times of what they asked (shown in their own time, with the weekday): planning the day on weekday mornings, a report on Friday afternoons. Give each as the request they would send (a label, as for tasks), the days (0 is Sunday, 6 is Saturday), the hour it usually starts, and why. Only when the same kind of request shows up at about the same time at least three times; otherwise give none.`;

export const LEARN_SCHEMA = {
  type: "object",
  properties: {
    memory: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    tasks: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: { label: { type: "string" }, why: { type: "string" } },
        required: ["label", "why"],
      },
    },
    routines: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          days: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
          },
          hour: { type: "integer", minimum: 0, maximum: 23 },
          why: { type: "string" },
        },
        required: ["label", "days", "hour", "why"],
      },
    },
  },
  required: ["memory", "tasks"],
};

export interface Task {
  label: string;
  why: string;
}

export interface LearnResult {
  ok: boolean;
  error?: string;
  material: Pick<Material, "sources" | "since" | "ms">;
  /** The entries this learning added to memory. */
  kept: string[];
  tasks: Task[];
  routines: Routine[];
  sessionId?: string;
}

interface LearnRecord {
  last?: {
    at: string;
    since: string;
    sessionId?: string;
    kept?: string[];
    tasks?: Task[];
    routines?: Routine[];
  };
}

export function learnPath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), LEARN_FILE);
}

export async function lastLearn(): Promise<LearnRecord["last"]> {
  const read = await readText(learnPath());
  try {
    return read.raw ? (JSON.parse(read.raw) as LearnRecord).last : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save what a session chose to keep about the person, through the same store and limits as the
 * memory tool, and report each saved entry as the tool's calls are reported. Returns the entries
 * that were added (an entry already kept is not added again).
 */
export async function keep(
  entries: unknown[],
  onEvent?: (event: SessionEvent) => void,
): Promise<string[]> {
  const store = new MemoryStore(memoryDir());
  const added: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const before = await store.entries("user");
    const saved = await store.add("user", entry);
    if (!saved.success)
      onEvent?.({ type: "memory-refused", error: saved.error });
    else if (saved.entry_count > before.length) {
      added.push(entry.trim());
      onEvent?.({
        type: "memory",
        target: "user",
        action: "add",
        content: entry.trim(),
      });
    }
  }
  return added;
}

export type LearnPhase = "index" | "read" | "learn";

export interface LearnProgress {
  phase: LearnPhase;
  /** A rough estimate for the screen, 0–100: right in order of magnitude, not to the percent. */
  percent: number;
  /** For "read", the source being read. */
  source?: string;
}

/** Read, learn, and record what was read. `language` is the screen's, e.g. "Korean". */
export async function learn(options: {
  language?: string;
  model?: string;
  onEvent?: (event: SessionEvent) => void;
  onMaterial?: (material: Pick<Material, "sources" | "since" | "ms">) => void;
  onProgress?: (progress: LearnProgress) => void;
  since?: number;
}): Promise<LearnResult> {
  const report = options.onProgress ?? (() => {});
  const previous = await lastLearn();
  const since =
    options.since ?? (previous ? Date.parse(previous.at) : undefined);
  report({ phase: "index", percent: 2 });
  // Indexing is most of the waiting when the records are large; reading the rest is quick.
  const order = ["notes", "inputs", "commits", "work"];
  const material = await gather({
    since,
    onIndexProgress: (done, total) =>
      report({
        phase: "index",
        percent: 2 + Math.round(38 * (total ? Math.min(1, done / total) : 1)),
      }),
    onSource: (source) =>
      report({
        phase: "read",
        percent: 40 + 3 * (order.indexOf(source) + 1),
        source,
      }),
  });
  const meta = {
    sources: material.sources,
    since: material.since,
    ms: material.ms,
  };
  options.onMaterial?.(meta);
  if (!material.text.trim())
    return {
      ok: false,
      error: "nothing-to-read",
      material: meta,
      kept: [],
      tasks: [],
      routines: [],
    };
  // The model's time cannot be known in advance: the estimate rises towards 95% over about a
  // minute and jumps to 100% when it answers.
  const started = Date.now();
  report({ phase: "learn", percent: 52 });
  const ticker = setInterval(() => {
    const seconds = (Date.now() - started) / 1000;
    report({
      phase: "learn",
      percent: Math.min(
        95,
        Math.round(52 + 43 * (1 - Math.exp(-seconds / 25))),
      ),
    });
  }, 1000);
  let result: SessionResult;
  try {
    result = await runSession({
      prompt: `${LEARN_PROMPT}\n\n---\n\n${material.text}`,
      jsonSchema: LEARN_SCHEMA,
      language: options.language,
      model: options.model,
      maxTurns: 30,
      timeoutMs: 6 * 60 * 1000,
      purpose: "learn",
      onEvent: options.onEvent,
    });
  } finally {
    clearInterval(ticker);
  }
  const structured = (result.structured ?? {}) as {
    memory?: unknown[];
    tasks?: Task[];
    routines?: unknown;
  };
  const tasks = Array.isArray(structured.tasks) ? structured.tasks : [];
  const routines = cleanRoutines(structured.routines);
  const kept =
    result.ok && Array.isArray(structured.memory)
      ? await keep(structured.memory, options.onEvent)
      : [];
  if (result.ok)
    await atomicWrite(
      learnPath(),
      JSON.stringify(
        {
          last: {
            at: new Date().toISOString(),
            since: material.since,
            sessionId: result.sessionId,
            kept,
            tasks,
            routines,
          },
        },
        null,
        2,
      ),
    );
  return {
    ok: result.ok,
    error: result.error,
    material: meta,
    kept,
    tasks,
    routines,
    sessionId: result.sessionId,
  };
}

/**
 * How many of the person's conversations with their AI tools went on after `since`, by the search
 * index (their conversations with the mini-me itself are not counted: each is looked back on when
 * it ends). It is what the screen offers to read again.
 */
export function freshConversations(since: number): number {
  const db = openHistoryForRead();
  if (!db) return 0;
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM files WHERE last > ? AND tool != 'mini-me'",
      )
      .get(since) as { n: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  } finally {
    db.close();
  }
}
