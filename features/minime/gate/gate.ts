// The trust gate's questions. Code decides what must go to the person (the mini-me only proposes):
// a question the mini-me asks them (ask_me), or a tool it wants to use that they have not let it
// use alone. The question waits here, in the app's server process, until the person answers on
// their screen or it runs out of time, and the answer goes back to the waiting session. It lives on
// globalThis so it survives module reloads in development.

import { randomUUID } from "node:crypto";

export type Ask =
  | { kind: "question"; question: string; choices?: string[] }
  | { kind: "permission"; tool: string; input: Record<string, unknown> }
  /** Make it a rule: answers of this kind were sent as they were; shall it do them alone now? */
  | { kind: "rule"; menu: string; trust: "tell" | "auto" };

export interface Pending {
  id: string;
  chat?: string;
  ask: Ask;
  at: string;
}

export type Answer =
  | { answered: true; answer: string; always?: boolean }
  | { answered: false };

interface Item extends Pending {
  done: Promise<Answer>;
  resolve: (answer: Answer) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Registry {
  secret: string;
  pending: Map<string, Item>;
  listeners: Set<(pending: Pending) => void>;
}

/** How long a question waits for the person before the session goes on without an answer. */
export const ASK_TIMEOUT_MS = 10 * 60 * 1000;

const holder = globalThis as typeof globalThis & { __minimeGate?: Registry };

function registry(): Registry {
  holder.__minimeGate ??= {
    secret: randomUUID(),
    pending: new Map(),
    listeners: new Set(),
  };
  return holder.__minimeGate;
}

/** Known only to the tool servers this app starts, so nothing else can put a question to the person. */
export function gateSecret(): string {
  return registry().secret;
}

function plain({ id, chat, ask, at }: Pending): Pending {
  return { id, chat, ask, at };
}

/** Put a question to the person; returns its id at once and the answer when it comes. */
export function askPerson(
  chat: string | undefined,
  ask: Ask,
  timeoutMs = ASK_TIMEOUT_MS,
): { id: string; done: Promise<Answer> } {
  const r = registry();
  const id = randomUUID();
  let resolve: (answer: Answer) => void = () => {};
  const done = new Promise<Answer>((settle) => {
    resolve = settle;
  });
  const timer = setTimeout(() => {
    r.pending.delete(id);
    resolve({ answered: false });
  }, timeoutMs);
  // A waiting question never keeps the server from stopping.
  timer.unref?.();
  const item: Item = {
    id,
    chat,
    ask,
    at: new Date().toISOString(),
    done,
    resolve,
    timer,
  };
  r.pending.set(id, item);
  for (const listener of r.listeners) listener(plain(item));
  return { id, done };
}

/** The answer to a question still waiting, if it is still waiting. */
export function waitFor(id: string): Promise<Answer> | undefined {
  return registry().pending.get(id)?.done;
}

export function answerAsk(
  id: string,
  answer: string,
  always?: boolean,
): Pending | undefined {
  const r = registry();
  const item = r.pending.get(id);
  if (!item) return undefined;
  r.pending.delete(id);
  clearTimeout(item.timer);
  item.resolve({ answered: true, answer, ...(always ? { always } : {}) });
  return plain(item);
}

export function pendingAsks(chat?: string): Pending[] {
  return [...registry().pending.values()]
    .filter((item) => !chat || item.chat === chat)
    .map(plain);
}

/** Hear each new question; returns a function that stops hearing. */
export function onAsk(listener: (pending: Pending) => void): () => void {
  const r = registry();
  r.listeners.add(listener);
  return () => {
    r.listeners.delete(listener);
  };
}
