// A request that came to this mini-me from a colleague's mini-me, answered with its own brain the
// way its person would: from what it knows of them. What only its person can give (a promise, a
// decision they answer for, a relationship, a check in their field) is asked on their screen
// through the trust gate, and the one asking only hears that it is being checked meanwhile.
// The brain says which kind of request on the person's menu it is; code then does what the
// person set for that kind: send it, send it and tell them, or show it to them first.

import { runSession, type SessionGate } from "../brain/session.ts";
import { appendMessage, createChat, listChats } from "../chat/store.ts";
import { askPerson, gateSecret, onAsk, waitFor } from "../gate/gate.ts";
import { denyRules, loadTrust } from "../gate/rules.ts";
import { loadExcludes } from "../server/exclude.ts";
import { checkBeforeSending } from "./check.ts";
import {
  type Card,
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
  trustFor,
} from "./menu.ts";
import { changeState, loadState, releaseLease, takeLease } from "./state.ts";
import { officeClosing } from "./worker.ts";

export const REQUEST_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    needs_input: { type: "boolean" },
    declined: { type: "boolean" },
    menu: { type: "string" },
    note: { type: "string" },
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

Some things only your person can give: a promise (a date, money, scope), a decision they answer for, anything about a relationship (refusing, apologising, negotiating), or a check of work in their own field. For those, ask your person with ask_me, in their language, and answer with what they said. Never promise or decide on their behalf.

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
  return `office-${task.id}`;
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

async function answer(options: {
  office: OfficeConfig;
  task: Task;
  from?: Card;
  gateUrl: string;
  language?: string;
  latest: Task["history"][number];
}): Promise<void> {
  const { office, task, from, gateUrl, language, latest } = options;
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
  // person says is kept for the check before sending, so it does not ask them again.
  let told = false;
  const said: { question: string; answer: string }[] = [];
  const stop = onAsk((pending) => {
    if (pending.chat !== gate.chat) return;
    const question =
      pending.ask.kind === "question"
        ? pending.ask.question
        : pending.ask.kind === "permission"
          ? pending.ask.tool
          : pending.ask.menu;
    void waitFor(pending.id)?.then((answer) => {
      if (answer.answered) said.push({ question, answer: answer.answer });
    });
    if (told) return;
    told = true;
    updateRequest(office, task.id, { state: "WORKING" }).catch(() => {});
  });
  try {
    await updateRequest(office, task.id, { state: "WORKING" }).catch(() => {});
    // Nobody watches this run: a busy or unreachable AI service is waited out a little (a minute,
    // then three) before the request is reported as failed, as Hermes retries a failed turn.
    const run = () =>
      runSession({
        prompt: previous?.session
          ? `They answered: ${latest.parts.map((p) => p.text).join("\n")}\n\nGo on with the request.`
          : requestPrompt(
              from,
              latest.parts.map((p) => p.text).join("\n"),
              menu,
            ),
        resume: previous?.session,
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
    };
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
    // A second look before it leaves; what it holds back goes to the person (product 2.8a).
    const outcome = await checkBeforeSending({
      request: task.history
        .filter((m) => m.role === "user")
        .map((m) => m.parts.map((p) => p.text).join("\n"))
        .join("\n\n"),
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
    if ("hold" in outcome) {
      if (approving && item) await countApproval(item, false);
      await updateRequest(office, task.id, {
        state: "REJECTED",
        text: "Their person will answer this directly.",
      });
      return;
    }
    await updateRequest(office, task.id, {
      state: answer.declined
        ? "REJECTED"
        : answer.needs_input
          ? "INPUT_REQUIRED"
          : "COMPLETED",
      text: outcome.send,
    });
    // The person sent it as it was: three in a row, and the mini-me offers to do these alone.
    if (approving && item)
      await countApproval(item, "send" in outcome && outcome.send === reply);
    // "Do it and tell me": the person hears what was answered for them, in their conversation.
    if (trust === "tell")
      await tellPerson(
        answer.note?.trim() ||
          `${from?.name ?? "A colleague"}: ${latest.parts.map((p) => p.text).join(" ")}\n→ ${outcome.send}`,
      );
  } finally {
    stop();
  }
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
