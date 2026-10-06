// The check before an answer leaves for a colleague (product 2.8a): the one who wrote an answer
// misses its own slips, so a separate look decides whether it may go as it is. It holds back an
// answer that shares something private the request does not need, promises or decides what only
// the person can, or would hurt a relationship. A held-back answer goes to the person as a card:
// send it, send a fixed one, or do not send. Code, not the model, then does what they chose.

import { runSession } from "../brain/session.ts";
import { askPerson, timeoutFor } from "../gate/gate.ts";
import { personAway } from "./client.ts";

export const CHECK_SCHEMA = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
    problem: { type: "string" },
    revised: { type: "string" },
    ask_person: { type: "string" },
    choices: {
      type: "object",
      properties: {
        send: { type: "string" },
        send_revised: { type: "string" },
        hold: { type: "string" },
      },
      required: ["send", "hold"],
    },
  },
  required: ["ok"],
};

export function checkPrompt(
  request: string,
  reply: string,
  said: { question: string; answer: string }[] = [],
  approve = false,
  from?: string,
  ways: string[] = [],
): string {
  const asked = said.length
    ? `\nWhat your person themselves said while it was answered (theirs to give; a promise or decision in it may go):\n${said.map((s) => `- Asked: ${s.question}\n  They said: ${s.answer}`).join("\n")}\n`
    : "";
  const told = ways.length
    ? `\nHow your person told you to handle requests like this, in their own words (following it is theirs, not a fault):\n${ways.map((way) => `- ${way}`).join("\n")}\n`
    : "";
  return `Before this answer goes to a colleague's mini-me on your person's behalf, look at it once more, as your person would.

The request${from ? ` (from the mini-me of ${from})` : ""}:
${request}
${asked}${told}
The answer about to be sent:
${reply}

Hold it back (ok: false) if it shares something private about your person or anyone else that the request does not need (health, family, money, personal life, things told in confidence, what you keep about how your person works beyond what helps here); promises a date, money or scope your person has not agreed to; decides something only your person can decide; or would hurt a relationship. Otherwise ok: true, and nothing else is needed.

When you hold it back: say what is wrong in problem; give a fixed answer in revised when a small change would do; and write, in your person's language, ask_person (one short question that quotes the answer and says what is wrong) and choices (short labels for send, send_revised when there is a revised answer, and hold).${
    approve
      ? `

Your person wants to see answers to this kind of request before they go, so whatever you find, write ask_person (one short question in their language that says who asked what and quotes the answer, and what is wrong if anything) and choices.`
      : ""
  }`;
}

/** An answer the person was shown but has not decided on yet: kept, and decided when they do. */
export interface CheckLater {
  question: string;
  choices: string[];
  reply: string;
  revised?: string;
  labels: { send: string; revised?: string; hold: string };
  problem?: string;
  /** The question as it was put to the person while it waited. */
  ask?: string;
}

export type CheckOutcome =
  | { send: string }
  | { hold: true; problem?: string }
  | { later: CheckLater };

/** What the person's choice on the card means: send it, send the fixed one, hold it, or their own words. */
export function decideCheck(
  answer: string,
  shown: Pick<CheckLater, "labels" | "reply" | "revised" | "problem">,
): { send: string } | { hold: true; problem?: string } {
  if (answer === shown.labels.send) return { send: shown.reply };
  if (shown.labels.revised && answer === shown.labels.revised)
    return { send: shown.revised ?? shown.reply };
  if (answer === shown.labels.hold)
    return { hold: true, problem: shown.problem };
  return { send: answer };
}

/** Let the answer go, hold it, or ask the person, as the check and then the person decide. */
export async function checkBeforeSending(options: {
  request: string;
  reply: string;
  chat: string;
  language?: string;
  /** What the person said to the mini-me's questions while the answer was made. */
  said?: { question: string; answer: string }[];
  /** The person's own instructions for this kind of request (their flows). */
  ways?: string[];
  /** The person sees the answer before it goes, whatever the check finds ("ask me first"). */
  approve?: boolean;
  /** Who asked, as their card names them. */
  from?: string;
}): Promise<CheckOutcome> {
  const check = await runSession({
    prompt: checkPrompt(
      options.request,
      options.reply,
      options.said,
      options.approve,
      options.from,
      options.ways,
    ),
    jsonSchema: CHECK_SCHEMA,
    language: options.language,
    maxTurns: 2,
    purpose: "check",
  });
  const verdict = (check.structured ?? {}) as {
    ok?: boolean;
    problem?: string;
    revised?: string;
    ask_person?: string;
    choices?: { send?: string; send_revised?: string; hold?: string };
  };
  // A check that could not run holds nothing back by itself: the person is asked instead.
  if (check.ok && verdict.ok && !options.approve)
    return { send: options.reply };
  const choices = {
    send: verdict.choices?.send?.trim() || "Send",
    revised:
      verdict.revised?.trim() && verdict.choices?.send_revised?.trim()
        ? verdict.choices.send_revised.trim()
        : undefined,
    hold: verdict.choices?.hold?.trim() || "Don't send",
  };
  const question =
    verdict.ask_person?.trim() ||
    `About to answer a colleague with: "${options.reply}". ${verdict.problem ?? (check.ok ? "" : "It could not be checked.")} Send it?`
      .replace(/\s+/g, " ")
      .trim();
  const shown: CheckLater = {
    question,
    choices: [
      choices.send,
      ...(choices.revised ? [choices.revised] : []),
      choices.hold,
    ],
    reply: options.reply,
    revised: verdict.revised?.trim() || undefined,
    labels: choices,
    problem: verdict.problem,
  };
  const { id, done } = askPerson(
    options.chat,
    { kind: "question", question, choices: shown.choices },
    timeoutFor(options.chat, await personAway()),
  );
  const answer = await done;
  // Not decided while it waited: kept for the person, and decided when they answer.
  if (!answer.answered) return { later: { ...shown, ask: id } };
  return decideCheck(answer.answer, shown);
}
