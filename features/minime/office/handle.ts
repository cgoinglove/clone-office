// A request that came to this mini-me from a colleague's mini-me, answered with its own brain the
// way its person would: from what it knows of them. What only its person can give (a promise, a
// decision they answer for, a relationship, a check in their field) is asked on their screen
// through the trust gate, and the one asking only hears that it is being checked meanwhile.
// The brain says which kind of request on the person's menu it is; code then does what the
// person set for that kind: send it, send it and tell them, or show it to them first.

import { randomUUID } from "node:crypto";
import { runSession, type SessionGate } from "../brain/session.ts";
import { appendMessage, createChat, listChats } from "../chat/store.ts";
import { askPerson, gateSecret, onAsk, waitFor } from "../gate/gate.ts";
import { denyRules, loadTrust } from "../gate/rules.ts";
import { loadExcludes } from "../server/exclude.ts";
import { type CheckOutcome, checkBeforeSending, decideCheck } from "./check.ts";
import {
  type Card,
  loadOffice,
  members,
  type OfficeConfig,
  type Task,
  tasks,
  updateRequest,
} from "./client.ts";
import {
  loadMenu,
  type MenuItem,
  menuLines,
  saveMenu,
  type Trust,
  trustFor,
} from "./menu.ts";
import {
  changeState,
  type Later,
  loadState,
  releaseLease,
  takeLease,
} from "./state.ts";
import { officeClosing } from "./worker.ts";

export const REQUEST_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    needs_input: { type: "boolean" },
    declined: { type: "boolean" },
    menu: { type: "string" },
    note: { type: "string" },
    waiting_on_person: { type: "boolean" },
  },
  required: ["reply"],
};

export function requestPrompt(
  from: Card | undefined,
  text: string,
  menu: MenuItem[] = [],
): string {
  const who = from
    ? `the mini-me of ${from.name}${from.description ? ` (${from.description})` : ""}`
    : "a colleague's mini-me";
  return `A request came to you from ${who}, on their behalf:

${text}

Answer it for your person, the way they would: from what you know of them and their work (your memory, your notes, and their past conversations, which you can search). Say only what your person would say, in the language the request is written in, and keep it short.

Some things only your person can give: a promise (a date, money, scope), a decision they answer for, anything about a relationship (refusing, apologising, negotiating), or a check of work in their own field. For those, ask your person with ask_me, in their language, and answer with what they said. Never promise or decide on their behalf. If they have not answered yet, set waiting_on_person: you will go on when they do.

If you need something from the one asking before you can answer, set needs_input and ask it in reply. If it is not something your person does or would take on, set declined and say so politely in reply.
${
  menu.length
    ? `
The kinds of request your person takes (id: name — what it is):
${menuLines(menu)}
Put in menu the id of the one this request is, or leave it empty if none fits.
`
    : ""
}
In note, write one line for your person, in their language: who asked what, and what you answered.`;
}

/** Waits before trying a failed run again, when the failure looks like it will pass. */
export const RETRY_WAITS = [60_000, 180_000];

/** A failure that usually passes by itself: the AI service busy or rate-limited, or a timeout. */
export function passing(error: string | undefined): boolean {
  return /\b(529|503|429)\b|overloaded|rate.?limit|timed? ?out|did not finish in time|ECONNRESET|ETIMEDOUT/i.test(
    error ?? "",
  );
}

/** The gate's conversation id for a request, so its questions show with the office. */
export function requestChat(task: Task): string {
  return `office-request-${task.id}`;
}

export async function handleRequest(options: {
  office: OfficeConfig;
  task: Task;
  from?: Card;
  gateUrl: string;
  language?: string;
}): Promise<void> {
  const { office, task, from, gateUrl, language } = options;
  const latest = task.history.at(-1);
  if (!latest || latest.role !== "user") return;
  // One process answers a request at a time; another that holds it is left to finish it.
  if (!(await takeLease(task.id))) return;
  try {
    // It may have been answered since this process heard of it: look at the relay again.
    const now = (await tasks(office)).tasks.find((t) => t.id === task.id);
    const open =
      now &&
      (now.status.state === "SUBMITTED" || now.status.state === "WORKING") &&
      now.history.at(-1)?.role === "user";
    if (!open) return;
    await answer({ office, task: now, from, gateUrl, language, latest });
  } finally {
    await releaseLease(task.id);
  }
}

type Said = { question: string; answer: string };

/** Going on with a request after the person answered a question kept for later. */
interface Resume {
  prompt: string;
  session?: string;
  said: Said[];
}

const FINAL_STATES = ["COMPLETED", "FAILED", "CANCELED", "REJECTED"];

const userText = (task: Task) =>
  task.history
    .filter((m) => m.role === "user")
    .map((m) => m.parts.map((p) => p.text).join("\n"))
    .join("\n\n");

async function answer(options: {
  office: OfficeConfig;
  task: Task;
  from?: Card;
  gateUrl: string;
  language?: string;
  /** The asker's latest words, for a request just in; absent when going on after the person answered. */
  latest?: Task["history"][number];
  resume?: Resume;
}): Promise<void> {
  const { office, task, from, gateUrl, language, latest, resume } = options;
  const previous = (await loadState()).handled[task.id];
  const menu = await loadMenu();
  const gate: SessionGate = {
    url: gateUrl,
    secret: gateSecret(),
    chat: requestChat(task),
    allow: await loadTrust(),
    deny: denyRules(loadExcludes()),
  };
  // The one asking hears only that it is being checked while the person is asked; what the
  // person says is kept for the check before sending, so it does not ask them again. A question
  // they leave unanswered is kept for later.
  let told = false;
  const said: Said[] = [...(resume?.said ?? [])];
  const asked = new Map<
    string,
    { question: string; choices?: string[]; answered: boolean }
  >();
  const stop = onAsk((pending) => {
    if (pending.chat !== gate.chat) return;
    const question =
      pending.ask.kind === "question"
        ? pending.ask.question
        : pending.ask.kind === "permission"
          ? pending.ask.tool
          : pending.ask.menu;
    if (pending.ask.kind === "question")
      asked.set(pending.id, {
        question,
        choices: pending.ask.choices,
        answered: false,
      });
    void waitFor(pending.id)?.then((answer) => {
      if (!answer.answered) return;
      said.push({ question, answer: answer.answer });
      const entry = asked.get(pending.id);
      if (entry) entry.answered = true;
    });
    if (told) return;
    told = true;
    updateRequest(office, task.id, { state: "WORKING" }).catch(() => {});
  });
  try {
    await updateRequest(office, task.id, { state: "WORKING" }).catch(() => {});
    const text = latest?.parts.map((p) => p.text).join("\n") ?? "";
    const prompt =
      resume?.session || (!resume && previous?.session)
        ? (resume?.prompt ??
          `They answered: ${text}\n\nGo on with the request.`)
        : `${requestPrompt(from, resume ? userText(task) : text, menu)}${
            resume
              ? `\n\nYou already asked your person; they answered: ${resume.said.map((x) => `"${x.question}" → ${x.answer}`).join("; ")}`
              : ""
          }`;
    // Nobody watches this run: a busy or unreachable AI service is waited out a little (a minute,
    // then three) before the request is reported as failed, as Hermes retries a failed turn.
    const run = () =>
      runSession({
        prompt,
        resume: resume ? resume.session : previous?.session,
        jsonSchema: REQUEST_SCHEMA,
        language,
        maxTurns: 16,
        purpose: "request",
        gate,
      });
    let result = await run();
    for (const wait of RETRY_WAITS) {
      if (result.ok || !passing(result.error)) break;
      await new Promise((resolve) => setTimeout(resolve, wait).unref?.());
      result = await run();
    }
    await changeState((s) => {
      s.handled[task.id] = {
        ...s.handled[task.id],
        session: result.sessionId,
        at: new Date().toISOString(),
      };
    });
    // A process told to stop sends nothing: the request stays open for the next one to answer.
    if (officeClosing()) return;
    const answer = (result.structured ?? {}) as {
      reply?: string;
      needs_input?: boolean;
      declined?: boolean;
      menu?: string;
      note?: string;
      waiting_on_person?: boolean;
    };
    // The person was asked and has not answered: the question waits for them, and the colleague
    // hears that they will get back to them.
    const open = [...asked.values()].filter((a) => !a.answered);
    if (result.ok && (answer.waiting_on_person || open.length)) {
      const last = open.at(-1);
      await park(office, task, {
        kind: "question",
        question: last?.question ?? answer.note?.trim() ?? userText(task),
        ...(last?.choices?.length ? { choices: last.choices } : {}),
        session: result.sessionId,
        from: from?.name,
      });
      return;
    }
    // What the person set for this kind of request; code decides, the brain only named the kind.
    const { item, trust } = trustFor(menu, answer.menu);
    const approving = trust === "ask" && said.length === 0;
    if (!result.ok || !answer.reply?.trim()) {
      await updateRequest(office, task.id, {
        state: "FAILED",
        text: passing(result.error)
          ? "Could not answer now: the AI service was busy. Please send it again a little later."
          : "Could not answer this request.",
      });
      return;
    }
    const reply = answer.reply.trim();
    const state = answer.declined
      ? "REJECTED"
      : answer.needs_input
        ? "INPUT_REQUIRED"
        : "COMPLETED";
    // A second look before it leaves; what it holds back goes to the person (product 2.8a).
    const outcome = await checkBeforeSending({
      request: userText(task),
      reply,
      chat: gate.chat ?? requestChat(task),
      language,
      said,
      // "Ask me first": the person sees the answer before it goes, whatever the check finds,
      // unless they already gave it themselves while it was made.
      approve: approving,
      from: from?.name,
    });
    if (officeClosing()) return;
    const sending = {
      state,
      reply,
      approving,
      menu: item?.id,
      trust,
      note: answer.note?.trim(),
      from: from?.name,
    } as const;
    if ("later" in outcome) {
      await park(office, task, {
        kind: "check",
        question: outcome.later.question,
        choices: outcome.later.choices,
        ...(outcome.later.revised ? { revised: outcome.later.revised } : {}),
        labels: outcome.later.labels,
        ...sending,
      });
      return;
    }
    await finish(office, task, outcome, sending);
  } finally {
    stop();
  }
}

/** Send the answer as the person's choices say, then count it toward a rule and tell them. */
async function finish(
  office: OfficeConfig,
  task: Task,
  outcome: Exclude<CheckOutcome, { later: unknown }>,
  sending: {
    state: "COMPLETED" | "INPUT_REQUIRED" | "REJECTED";
    reply: string;
    approving?: boolean;
    menu?: string;
    trust?: Trust;
    note?: string;
    from?: string;
  },
): Promise<void> {
  const item = sending.menu
    ? (await loadMenu()).find((m) => m.id === sending.menu)
    : undefined;
  if ("hold" in outcome) {
    if (sending.approving && item) await countApproval(item, false);
    await updateRequest(office, task.id, {
      state: "REJECTED",
      text: "Their person will answer this directly.",
    });
    return;
  }
  await updateRequest(office, task.id, {
    state: sending.state,
    text: outcome.send,
  });
  // The person sent it as it was: three in a row, and the mini-me offers to do these alone.
  if (sending.approving && item)
    await countApproval(item, outcome.send === sending.reply);
  // "Do it and tell me": the person hears what was answered for them, in their conversation.
  if (sending.trust === "tell")
    await tellPerson(
      sending.note ||
        `${sending.from ?? "A colleague"}: ${userText(task)}\n→ ${outcome.send}`,
    );
}

/** Keep a question for the person, and tell the one asking that they will get back to them. */
async function park(
  office: OfficeConfig,
  task: Task,
  later: Omit<Later, "task" | "at">,
): Promise<void> {
  await changeState((s) => {
    s.later[randomUUID()] = {
      ...later,
      task: task.id,
      at: new Date().toISOString(),
    };
  });
  await updateRequest(office, task.id, {
    state: "WORKING",
    text: `${office.card.name} will get back to you on this.`,
  });
}

/** Questions about requests that wait for the person, for their screen; closed requests drop out. */
export async function laterQuestions(
  open: Task[],
): Promise<(Later & { id: string })[]> {
  const openIds = new Set(
    open.filter((t) => !FINAL_STATES.includes(t.status.state)).map((t) => t.id),
  );
  const { later } = await loadState();
  const gone = Object.entries(later)
    .filter(([, entry]) => !openIds.has(entry.task))
    .map(([id]) => id);
  if (gone.length)
    await changeState((s) => {
      for (const id of gone) delete s.later[id];
    });
  return Object.entries(later)
    .filter(([id]) => !gone.includes(id))
    .map(([id, entry]) => ({ id, ...entry }));
}

/**
 * The person answered a question kept for later: the request goes on in the background. A
 * question goes back into the session that asked it; an answer they were shown is sent, fixed or
 * held as they chose.
 */
export async function answerLater(
  id: string,
  given: string,
  options: { gateUrl: string; language?: string },
): Promise<boolean> {
  let entry: Later | undefined;
  await changeState((s) => {
    entry = s.later[id];
    delete s.later[id];
  });
  const office = await loadOffice();
  const kept = entry;
  if (!kept || !office) return false;
  void (async () => {
    if (!(await takeLease(kept.task))) return;
    try {
      const task = (await tasks(office)).tasks.find((t) => t.id === kept.task);
      if (!task || FINAL_STATES.includes(task.status.state)) return;
      if (kept.kind === "check" && kept.labels && kept.reply) {
        await finish(
          office,
          task,
          decideCheck(given, {
            labels: kept.labels,
            reply: kept.reply,
            revised: kept.revised,
          }),
          {
            state: kept.state ?? "COMPLETED",
            reply: kept.reply,
            approving: kept.approving,
            menu: kept.menu,
            trust: kept.trust,
            note: kept.note,
            from: kept.from,
          },
        );
        return;
      }
      const from = (await members(office)).members.find(
        (m) => m.id === task.metadata.from,
      )?.card;
      await answer({
        office,
        task,
        from,
        gateUrl: options.gateUrl,
        language: options.language,
        resume: {
          prompt: `Your person answered your question ("${kept.question}"): ${given}\n\nGo on with the request and answer the one asking.`,
          session: kept.session,
          said: [{ question: kept.question, answer: given }],
        },
      });
    } finally {
      await releaseLease(kept.task);
    }
  })();
  return true;
}

/** A request closed by the one asking: its questions no longer wait. */
export async function forgetLater(task: string): Promise<void> {
  await changeState((s) => {
    for (const [id, entry] of Object.entries(s.later))
      if (entry.task === task) delete s.later[id];
  });
}

/** A line in the person's latest conversation with their mini-me (a new one if there is none). */
export async function tellPerson(note: string): Promise<void> {
  const [latest] = await listChats(1);
  const chat = latest ?? (await createChat(note));
  await appendMessage(chat.id, "told", note);
}

/** Answers of one kind the person sends as they were, in a row, before the mini-me offers a rule. */
export const RULE_AFTER = 3;

/** Where the offer waits: with the office's questions on the person's screen. */
export const RULE_CHAT = "office-rules";

const DAY = 24 * 60 * 60 * 1000;

/**
 * Make it a rule (product 2.4): when the person has sent the last three answers of a kind they see
 * first as they were, the mini-me asks whether to answer that kind itself and tell them. Code
 * changes the menu only on their yes.
 */
export async function countApproval(
  item: MenuItem,
  sentAsItWas: boolean,
): Promise<void> {
  let offer = false;
  await changeState((state) => {
    const count = sentAsItWas ? (state.approvals[item.id] ?? 0) + 1 : 0;
    offer = count >= RULE_AFTER;
    state.approvals[item.id] = offer ? 0 : count;
  });
  if (!offer) return;
  const { done } = askPerson(
    RULE_CHAT,
    { kind: "rule", menu: item.name, trust: "tell" },
    DAY,
  );
  void done.then(async (answer) => {
    if (!answer.answered || answer.answer !== "yes") return;
    const menu = await loadMenu();
    await saveMenu(
      menu.map((m) => (m.id === item.id ? { ...m, trust: "tell" } : m)),
    );
  });
}
