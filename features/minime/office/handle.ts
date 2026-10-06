// A request that came to this mini-me from a colleague's mini-me, answered with its own brain the
// way its person would: from what it knows of them. What only its person can give (a promise, a
// decision they answer for, a relationship, a check in their field) is asked on their screen
// through the trust gate, and the one asking only hears that it is being checked meanwhile.

import { runSession, type SessionGate } from "../brain/session.ts";
import { gateSecret, onAsk, waitFor } from "../gate/gate.ts";
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
import { changeState, loadState, releaseLease, takeLease } from "./state.ts";
import { officeClosing } from "./worker.ts";

export const REQUEST_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    needs_input: { type: "boolean" },
    declined: { type: "boolean" },
  },
  required: ["reply"],
};

export function requestPrompt(from: Card | undefined, text: string): string {
  const who = from
    ? `the mini-me of ${from.name}${from.description ? ` (${from.description})` : ""}`
    : "a colleague's mini-me";
  return `A request came to you from ${who}, on their behalf:

${text}

Answer it for your person, the way they would: from what you know of them and their work (your memory, your notes, and their past conversations, which you can search). Say only what your person would say, in the language the request is written in, and keep it short.

Some things only your person can give: a promise (a date, money, scope), a decision they answer for, anything about a relationship (refusing, apologising, negotiating), or a check of work in their own field. For those, ask your person with ask_me, in their language, and answer with what they said. Never promise or decide on their behalf.

If you need something from the one asking before you can answer, set needs_input and ask it in reply. If it is not something your person does or would take on, set declined and say so politely in reply.`;
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
      pending.ask.kind === "question" ? pending.ask.question : pending.ask.tool;
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
          : requestPrompt(from, latest.parts.map((p) => p.text).join("\n")),
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
    };
    if (!result.ok || !answer.reply?.trim()) {
      await updateRequest(office, task.id, {
        state: "FAILED",
        text: passing(result.error)
          ? "Could not answer now: the AI service was busy. Please send it again a little later."
          : "Could not answer this request.",
      });
      return;
    }
    // A second look before it leaves; what it holds back goes to the person (product 2.8a).
    const outcome = await checkBeforeSending({
      request: task.history
        .filter((m) => m.role === "user")
        .map((m) => m.parts.map((p) => p.text).join("\n"))
        .join("\n\n"),
      reply: answer.reply.trim(),
      chat: gate.chat ?? requestChat(task),
      language,
      said,
    });
    if (officeClosing()) return;
    if ("hold" in outcome) {
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
  } finally {
    stop();
  }
}
