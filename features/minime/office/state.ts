// What this mini-me keeps about its office work, under office/ in its folder: how far it has read
// its relay inbox (so a restart does not answer a request twice), the brain session that answers
// each request it received, and the conversation each request it sent came from (so the answer is
// put back there).

import { join } from "node:path";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { minimeHome } from "../server/paths.ts";

export interface OfficeState {
  /** The last inbox event read. */
  after: number;
  /** Requests received: the brain session answering it. */
  handled: Record<
    string,
    {
      session?: string;
      at: string;
      /** The process answering it now, so no other process answers it at the same time. */
      lease?: { pid: number; at: string };
      /** How full the session's context was after its last run, in tokens. */
      context?: number;
      /**
       * The person answers this one themselves (they held the clone's answer, or wrote their own):
       * the clone leaves it to them until they hand it back.
       */
      person?: { since: string };
      /**
       * What the person told the clone about this request while it works (a step-in, as Thursday's):
       * read before its next answer leaves; taken back while still unread.
       */
      notes?: StepIn[];
    }
  >;
  /** Requests sent from a conversation: which one. */
  sent: Record<string, { chat: string }>;
  /** Per menu kind the person sees first: answers they sent as they were, in a row. */
  approvals: Record<string, number>;
  /** Each answer the person saw first and what they did with it: the like-me score (likeme.ts). */
  outcomes: {
    at: string;
    menu?: string;
    outcome: "as-is" | "changed" | "held";
  }[];
  /** Questions about requests that wait for the person, by id; the request goes on when answered. */
  later: Record<string, Later>;
  /** Meetings of the clones brought back to the person: when, and the conversation it went into. */
  meetings: Record<string, { at: string; chat?: string }>;
  /** The day (YYYY-MM-DD, the person's own) this clone last opened the scheduled standup. */
  standup?: string;
}

/**
 * A question about a colleague's request that the person did not answer at once, kept until they
 * do. "question" is the mini-me's own question: their answer goes into the session that asked
 * it, which then answers the colleague. "check" is an answer about to be sent that they see
 * first: they send it, send the fixed one, or hold it.
 */
/** One thing the person told their clone about a request while it works. */
export interface StepIn {
  id: string;
  text: string;
  at: string;
  /** When the clone read it; until then the person can take it back. */
  read?: string;
}

export interface Later {
  task: string;
  /** Who asked, as their card names them. */
  from?: string;
  /**
   * question: the clone asked the person; check: an answer the person sees before it goes; self:
   * the request is the person's to answer themselves, and what they say goes as their own words.
   */
  kind: "question" | "check" | "self";
  question: string;
  choices?: string[];
  /** The question as it was first put to the person, live: an answer to that one still counts. */
  ask?: string;
  /** When it went to the person's phone, so it goes once. */
  phoned?: string;
  /** check: files from the person's computer that go with the answer when they send it. */
  files?: string[];
  /** question: the brain session to go on with. */
  session?: string;
  /** check: the answer about to be sent, a fixed one, what the choices mean, and the state it goes with. */
  reply?: string;
  revised?: string;
  labels?: { send: string; revised?: string; hold: string };
  state?: "COMPLETED" | "INPUT_REQUIRED" | "REJECTED";
  /** check: the menu kind it is, how much is done alone for it, and the line to tell the person. */
  menu?: string;
  trust?: "auto" | "tell" | "ask";
  approving?: boolean;
  note?: string;
  at: string;
}

function officeDir(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "office");
}

function statePath(): string {
  return join(/*turbopackIgnore: true*/ officeDir(), "state.json");
}

export async function loadState(): Promise<OfficeState> {
  const read = await readText(statePath());
  try {
    const parsed = read.raw ? JSON.parse(read.raw) : {};
    return {
      after: Number(parsed.after) || 0,
      handled: parsed.handled ?? {},
      sent: parsed.sent ?? {},
      approvals: parsed.approvals ?? {},
      outcomes: Array.isArray(parsed.outcomes) ? parsed.outcomes : [],
      later: parsed.later ?? {},
      meetings: parsed.meetings ?? {},
      ...(typeof parsed.standup === "string"
        ? { standup: parsed.standup }
        : {}),
    };
  } catch {
    return {
      after: 0,
      handled: {},
      sent: {},
      approvals: {},
      outcomes: [],
      later: {},
      meetings: {},
    };
  }
}

export async function changeState(
  change: (state: OfficeState) => void,
): Promise<OfficeState> {
  return withLock(officeDir(), async () => {
    const state = await loadState();
    change(state);
    await atomicWrite(statePath(), `${JSON.stringify(state, null, 2)}\n`);
    return state;
  });
}

/** How long a process may hold a request before another takes it over, even if it still runs. */
export const LEASE_MS = 15 * 60 * 1000;

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the request for this process, unless another live process holds it. Returns whether it was
 * taken.
 */
export async function takeLease(id: string): Promise<boolean> {
  let taken = false;
  await changeState((s) => {
    const lease = s.handled[id]?.lease;
    if (
      lease &&
      lease.pid !== process.pid &&
      alive(lease.pid) &&
      Date.now() - Date.parse(lease.at) < LEASE_MS
    )
      return;
    s.handled[id] = {
      ...(s.handled[id] ?? { at: new Date().toISOString() }),
      lease: { pid: process.pid, at: new Date().toISOString() },
    };
    taken = true;
  });
  return taken;
}

export async function releaseLease(id: string): Promise<void> {
  await changeState((s) => {
    if (s.handled[id]?.lease?.pid === process.pid) delete s.handled[id].lease;
  });
}

/**
 * The one process that does this mini-me's office work, so two apps running on the same folder
 * never both answer the same request. Holding it is renewed on every pass of the loop; a holder
 * that died, or has not renewed it for two minutes, is replaced.
 */
export async function holdWorker(): Promise<boolean> {
  const path = join(/*turbopackIgnore: true*/ officeDir(), "worker.json");
  return withLock(officeDir(), async () => {
    const read = await readText(path);
    let holder: { pid: number; at: string } | undefined;
    try {
      holder = read.raw ? JSON.parse(read.raw) : undefined;
    } catch {
      holder = undefined;
    }
    if (
      holder &&
      holder.pid !== process.pid &&
      alive(holder.pid) &&
      Date.now() - Date.parse(holder.at) < 2 * 60 * 1000
    )
      return false;
    await atomicWrite(
      path,
      JSON.stringify({ pid: process.pid, at: new Date().toISOString() }),
    );
    return true;
  });
}
