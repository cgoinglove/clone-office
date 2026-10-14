// The office's background work in the app's server process: it waits at the relay's inbox, answers
// the requests that come in, and puts the answers to requests this mini-me sent back into the
// conversations they were sent from. One loop per process (on globalThis, so it survives module
// reloads in development); it starts when the person's page asks about the office and stops when
// they leave it.

import { appendMessage } from "../chat/store.ts";
import { announceColleagueReads } from "./announce.ts";
import {
  type Card,
  findTask,
  type InboxEvent,
  inbox,
  loadOffice,
  members,
  type OfficeConfig,
  problemCode,
  tasks,
} from "./client.ts";
import { filesLine, takeFiles } from "./files.ts";
import { forgetLater, handleRequest } from "./handle.ts";
import { onOwn, syncOwnAllow } from "./own-chat.ts";
import { changeState, holdWorker, loadState } from "./state.ts";

interface Worker {
  running: boolean;
  /** The process is shutting down: it answers nothing more, and leaves open requests to the next. */
  closing?: boolean;
  gateUrl: string;
  language?: string;
  /** Requests being answered now, so one is never answered twice at once. */
  busy: Set<string>;
  /** Requests the one asking wrote to again while being answered: looked at once more after. */
  again?: Set<string>;
  abort?: AbortController;
  /** The last problem reaching the relay, for the screen. */
  problem?: string;
}

const holder = globalThis as typeof globalThis & {
  __minimeOffice?: Worker;
  __minimeOfficeSignals?: boolean;
};

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
  // What changed in what a colleague's request may read, said once (announce.ts).
  void announceColleagueReads().catch(() => {});
  // Once per process, however often the office is left and joined again.
  if (!holder.__minimeOfficeSignals) {
    holder.__minimeOfficeSignals = true;
    process.once("SIGTERM", onShutdown);
    process.once("SIGINT", onShutdown);
  }
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
      // Whether the person may talk to it from the team server's page, as they set it here.
      await syncOwnAllow(office).catch(() => {});
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
      // Removed from the office: nothing changes in five seconds, so look again after a minute
      // (the person may join again, or the relay come back with their place).
      await sleep(worker.problem === "office-member-unknown" ? 60_000 : 5000);
    }
  }
}

function onEvent(
  worker: Worker,
  office: OfficeConfig,
  event: InboxEvent,
  cards: Map<string, Card>,
): void {
  if (event.type === "own") {
    // The person, on the team server's page: words to their clone, or a question answered there.
    void onOwn(office, event.own, worker.gateUrl, worker.language).catch(
      (error) => {
        worker.problem = problemCode(error);
      },
    );
    return;
  }
  // A kind of news this version does not know (an older team server's meeting) is passed over.
  if (event.type !== "task" && event.type !== "update") return;
  const { task } = event;
  if (task.metadata.to === office.member) {
    // Canceled by the one asking: questions kept about it no longer wait for the person.
    if (task.status.state === "CANCELED") {
      void forgetLater(task.id);
      return;
    }
    // A request to this mini-me, new or answered by the one asking: answer it (once at a time).
    const latest = task.history.at(-1);
    const fresh =
      event.type === "task" ||
      (task.status.state === "WORKING" && latest?.role === "user");
    if (!fresh) return;
    // Words that come while it is answered are not dropped: the request is looked at again after.
    if (worker.busy.has(task.id)) {
      (worker.again ??= new Set()).add(task.id);
      return;
    }
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
      .finally(async () => {
        worker.busy.delete(task.id);
        if (!worker.again?.delete(task.id) || worker.closing) return;
        const now = await findTask(office, task.id).catch(() => undefined);
        if (now)
          onEvent(worker, office, { seq: 0, type: "task", task: now }, cards);
      });
    return;
  }
  // News of a request this mini-me sent: an answer goes back into its conversation, and so does
  // whatever the colleague wrote themselves, even while their side is still working on it.
  const latest = task.history.at(-1);
  if (!latest || latest.role !== "agent") return;
  const state = task.status.state;
  const byPerson = latest.metadata.by === "person";
  if (
    !byPerson &&
    state !== "COMPLETED" &&
    state !== "INPUT_REQUIRED" &&
    state !== "REJECTED" &&
    state !== "FAILED"
  )
    return;
  void loadState().then(async ({ sent }) => {
    const chat = sent[task.id]?.chat;
    if (!chat) return;
    const name =
      cards.get(task.metadata.to)?.name ??
      task.metadata.guest ??
      task.metadata.to;
    // Files that came with the answer are taken onto this computer, and the line says where.
    const taken = latest.files?.length
      ? await takeFiles(office, task.id, latest.files).catch(() => undefined)
      : [];
    const files = taken?.length
      ? `\n\n${filesLine(taken)}`
      : latest.files?.length
        ? `\n\n${latest.files.map((file) => `- ${file.name}`).join("\n")}`
        : "";
    return appendMessage(
      chat,
      "office",
      `${name}: ${latest.parts.map((p) => p.text).join("\n")}${files}`,
      (taken ?? []).map((one) => one.path),
      byPerson,
    );
  });
}
