// The office's background work in the app's server process: it waits at the relay's inbox, answers
// the requests that come in, and puts the answers to requests this mini-me sent back into the
// conversations they were sent from. One loop per process (on globalThis, so it survives module
// reloads in development); it starts when the person's page asks about the office and stops when
// they leave it.

import { appendMessage } from "../chat/store.ts";
import {
  type Card,
  type InboxEvent,
  inbox,
  loadOffice,
  members,
  type OfficeConfig,
  problemCode,
  tasks,
} from "./client.ts";
import { handleRequest } from "./handle.ts";
import { changeState, holdWorker, loadState } from "./state.ts";

interface Worker {
  running: boolean;
  /** The process is shutting down: it answers nothing more, and leaves open requests to the next. */
  closing?: boolean;
  gateUrl: string;
  language?: string;
  /** Requests being answered now, so one is never answered twice at once. */
  busy: Set<string>;
  abort?: AbortController;
  /** The last problem reaching the relay, for the screen. */
  problem?: string;
}

const holder = globalThis as typeof globalThis & { __minimeOffice?: Worker };

/** Start the office's loop if it is not running; the gate URL is where questions to the person go. */
export function startOffice(gateUrl: string, language?: string): void {
  const running = holder.__minimeOffice;
  if (running?.running) {
    running.gateUrl = gateUrl;
    if (language) running.language = language;
    return;
  }
  const worker: Worker = { running: true, gateUrl, language, busy: new Set() };
  holder.__minimeOffice = worker;
  process.once("SIGTERM", onShutdown);
  process.once("SIGINT", onShutdown);
  void loop(worker);
}

/** True once the server process was told to stop; an answer made after that is not sent. */
export function officeClosing(): boolean {
  return Boolean(holder.__minimeOffice?.closing);
}

function onShutdown(): void {
  const worker = holder.__minimeOffice;
  if (!worker) return;
  worker.closing = true;
  worker.running = false;
  worker.abort?.abort();
}

export function stopOffice(): void {
  const worker = holder.__minimeOffice;
  if (!worker) return;
  worker.running = false;
  worker.abort?.abort();
}

export function officeProblem(): string | undefined {
  return holder.__minimeOffice?.problem;
}

/**
 * Requests to this mini-me still open at the relay with the asker's words last: ones a restart cut
 * off (the inbox cursor is already past them), picked up again when the loop starts.
 */
async function resume(worker: Worker, office: OfficeConfig): Promise<void> {
  const [{ tasks: open }, cards] = await Promise.all([
    tasks(office),
    members(office)
      .then((m) => new Map(m.members.map((x) => [x.id, x.card])))
      .catch(() => new Map<string, Card>()),
  ]);
  for (const task of open) {
    const state = task.status.state;
    if (task.metadata.to !== office.member) continue;
    if (state !== "SUBMITTED" && state !== "WORKING") continue;
    if (task.history.at(-1)?.role !== "user") continue;
    onEvent(worker, office, { seq: 0, type: "task", task }, cards);
  }
}

/** A pause that never keeps the server from stopping. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms).unref?.());
}

/** How often open requests are looked at again, for ones another process left. */
const RESUME_EVERY_MS = 5 * 60 * 1000;

async function loop(worker: Worker): Promise<void> {
  // Soon after starting, look again once: a process that was stopping may still have held a
  // request at the first look. Then every five minutes.
  let nextResume = 0;
  let looks = 0;
  while (worker.running) {
    const office = await loadOffice();
    if (!office) {
      worker.running = false;
      return;
    }
    // Another app on this folder does the office work: wait, and take over if it goes away.
    if (!(await holdWorker().catch(() => false))) {
      await sleep(30_000);
      continue;
    }
    try {
      if (Date.now() >= nextResume) {
        looks += 1;
        nextResume = Date.now() + (looks === 1 ? 30_000 : RESUME_EVERY_MS);
        await resume(worker, office);
      }
      const { after } = await loadState();
      worker.abort = new AbortController();
      const { events, next } = await inbox(office, after, worker.abort.signal);
      worker.problem = undefined;
      if (events.length) {
        const cards = await members(office)
          .then((m) => new Map(m.members.map((x) => [x.id, x.card])))
          .catch(() => new Map<string, Card>());
        for (const event of events) onEvent(worker, office, event, cards);
      }
      await changeState((s) => {
        s.after = Math.max(s.after, next);
      });
    } catch (error) {
      if (!worker.running) return;
      worker.problem = problemCode(error);
      await sleep(5000);
    }
  }
}

function onEvent(
  worker: Worker,
  office: OfficeConfig,
  event: InboxEvent,
  cards: Map<string, Card>,
): void {
  const { task } = event;
  if (task.metadata.to === office.member) {
    // A request to this mini-me, new or answered by the one asking: answer it (once at a time).
    const latest = task.history.at(-1);
    const fresh =
      event.type === "task" ||
      (task.status.state === "WORKING" && latest?.role === "user");
    if (!fresh || worker.busy.has(task.id)) return;
    worker.busy.add(task.id);
    void handleRequest({
      office,
      task,
      from: cards.get(task.metadata.from),
      gateUrl: worker.gateUrl,
      language: worker.language,
    })
      .catch((error) => {
        worker.problem = problemCode(error);
      })
      .finally(() => worker.busy.delete(task.id));
    return;
  }
  // News of a request this mini-me sent: an answer goes back into its conversation.
  const latest = task.history.at(-1);
  if (!latest || latest.role !== "agent") return;
  const state = task.status.state;
  if (
    state !== "COMPLETED" &&
    state !== "INPUT_REQUIRED" &&
    state !== "REJECTED" &&
    state !== "FAILED"
  )
    return;
  void loadState().then(({ sent }) => {
    const chat = sent[task.id]?.chat;
    if (!chat) return;
    const name = cards.get(task.metadata.to)?.name ?? task.metadata.to;
    return appendMessage(
      chat,
      "office",
      `${name}: ${latest.parts.map((p) => p.text).join("\n")}`,
    );
  });
}
