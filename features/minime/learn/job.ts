// The first transplant as background work. It runs in the app's server process, not in the
// request that started it, so closing or reloading the page does not stop it: the screen attaches
// to the running job and is sent everything that happened so far, then what follows. Only one job
// runs at a time; a second start joins the first. The registry lives on globalThis so it survives
// module reloads in development. When a learning is done, the rest of the conversation index is
// read in the background, so the learning itself waits only for what it reads.

import type { SessionEvent } from "../brain/session.ts";
import { catchUpIndex } from "../history/indexer.ts";
import type { Routine } from "../routine.ts";
import { errorCode } from "../server/ndjson.ts";
import type { About } from "../server/profile.ts";
import type { SourceReport } from "./gather.ts";
import {
  type Example,
  freshConversations,
  type LearnProgress,
  lastLearn,
  learn,
  type Task,
} from "./learn.ts";

export type LearnEvent =
  | ({ type: "progress" } & LearnProgress)
  | { type: "material"; sources: SourceReport[]; since: string }
  | { type: "saved"; event: SessionEvent }
  | {
      type: "done";
      kept: string[];
      tasks: Task[];
      /** Things they do at a regular time, offered around that time. */
      routines: Routine[];
      /** What the clone would answer a colleague in their place. */
      example?: Example;
      /** Who they are at work, as the reading saw it, for them to confirm. */
      about?: About;
      at: string;
      /** Conversations with their AI tools since this learning, to offer reading again. */
      fresh?: number;
    }
  | { type: "error"; message: string; code?: string };

interface Job {
  id: string;
  events: LearnEvent[];
  done: boolean;
  listeners: Set<(event: LearnEvent) => void>;
}

const registry = globalThis as typeof globalThis & { __minimeLearnJob?: Job };

function emit(job: Job, event: LearnEvent): void {
  job.events.push(event);
  for (const listener of job.listeners) listener(event);
}

/** Start learning, or return the job already running. */
export function startLearn(options: {
  language?: string;
  model?: string;
}): Job {
  const running = registry.__minimeLearnJob;
  if (running && !running.done) return running;
  const job: Job = {
    id: crypto.randomUUID(),
    events: [],
    done: false,
    listeners: new Set(),
  };
  registry.__minimeLearnJob = job;
  void learn({
    ...options,
    onProgress: (progress) => emit(job, { type: "progress", ...progress }),
    onMaterial: (material) =>
      emit(job, {
        type: "material",
        sources: material.sources,
        since: material.since,
      }),
    onEvent: (event) => {
      if (event.type !== "text") emit(job, { type: "saved", event });
    },
  })
    .then((result) => {
      emit(
        job,
        result.ok
          ? {
              type: "done",
              kept: result.kept,
              tasks: result.tasks,
              routines: result.routines,
              ...(result.example ? { example: result.example } : {}),
              ...(result.about ? { about: result.about } : {}),
              at: new Date().toISOString(),
            }
          : {
              type: "error",
              message: result.error ?? "learn-failed",
              code: errorCode(result.error ?? "learn-failed"),
            },
      );
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      emit(job, { type: "error", message, code: errorCode(message) });
    })
    .finally(() => {
      job.done = true;
      job.listeners.clear();
      void catchUpIndex().catch(() => {});
    });
  return job;
}

/** The running or last job of this server process, if any. */
export function currentLearn(): Job | undefined {
  return registry.__minimeLearnJob;
}

/** Forget a finished job, so the screen starts from the beginning after starting over. */
export function clearLearn(): boolean {
  const job = registry.__minimeLearnJob;
  if (job && !job.done) return false;
  registry.__minimeLearnJob = undefined;
  return true;
}

/** What the last finished transplant left, read from disk when this process ran none. */
export async function savedLearn(): Promise<LearnEvent | undefined> {
  const last = await lastLearn();
  if (!last) return undefined;
  return {
    type: "done",
    kept: last.kept ?? [],
    tasks: last.tasks ?? [],
    routines: last.routines ?? [],
    ...(last.example ? { example: last.example } : {}),
    ...(last.about ? { about: last.about } : {}),
    at: last.at,
    fresh: freshConversations(Date.parse(last.at)),
  };
}

/**
 * Follow a job: every event so far, then each new one, until it is done. Returns a function that
 * stops following (the job keeps running).
 */
export function follow(
  job: Job,
  listener: (event: LearnEvent) => void,
  onEnd: () => void,
): () => void {
  for (const event of job.events) listener(event);
  if (job.done) {
    onEnd();
    return () => {};
  }
  const wrapped = (event: LearnEvent) => {
    listener(event);
    if (event.type === "done" || event.type === "error") {
      job.listeners.delete(wrapped);
      onEnd();
    }
  };
  job.listeners.add(wrapped);
  return () => job.listeners.delete(wrapped);
}
