// The check before an answer leaves for a colleague (product 2.8a): the one who wrote an answer
// misses its own slips, so a separate look decides whether it may go as it is. It holds back an
// answer that shares something private the request does not need, promises or decides what only
// the person can, or would hurt a relationship. A held-back answer goes to the person as a card:
// send it, send a fixed one, or do not send. Code, not the model, then does what they chose.

import { runSession } from "../brain/session.ts";
import { askPerson } from "../gate/gate.ts";

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
): string {
  const asked = said.length
    ? `\nWhat your person themselves said while it was answered (theirs to give; a promise or decision in it may go):\n${said.map((s) => `- Asked: ${s.question}\n  They said: ${s.answer}`).join("\n")}\n`
    : "";
  return `Before this answer goes to a colleague's mini-me on your person's behalf, look at it once more, as your person would.

The request${from ? ` (from the mini-me of ${from})` : ""}:
${request}
${asked}
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

export type CheckOutcome = { send: string } | { hold: true; problem?: string };

/** Let the answer go, hold it, or ask the person, as the check and then the person decide. */
export async function checkBeforeSending(options: {
  request: string;
  reply: string;
  chat: string;
  language?: string;
  /** What the person said to the mini-me's questions while the answer was made. */
  said?: { question: string; answer: string }[];
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
  const { done } = askPerson(options.chat, {
    kind: "question",
    question,
    choices: [
      choices.send,
      ...(choices.revised ? [choices.revised] : []),
      choices.hold,
    ],
  });
  const answer = await done;
  if (!answer.answered) return { hold: true, problem: verdict.problem };
  if (answer.answer === choices.send) return { send: options.reply };
  if (choices.revised && answer.answer === choices.revised)
    return { send: verdict.revised?.trim() ?? options.reply };
  if (answer.answer === choices.hold)
    return { hold: true, problem: verdict.problem };
  // Their own words: sent as they wrote them.
  return { send: answer.answer };
}
