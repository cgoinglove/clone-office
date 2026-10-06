// The person's answer to a question from the gate, wherever they give it: on their page, or in their
// messenger. "From now on" on a tool becomes a rule in settings.json before the waiting session
// hears the answer.

import { answerAsk, pendingAsks } from "./gate.ts";
import { addTrust, ruleFor } from "./rules.ts";

/** Answers a question still waiting; false when it no longer is. */
export async function answerPerson(
  id: string,
  answer: string,
  always?: boolean,
): Promise<{ ok: false } | { ok: true; rule?: string }> {
  const waiting = pendingAsks().find((ask) => ask.id === id);
  if (!waiting) return { ok: false };
  let rule: string | undefined;
  if (always && answer === "allow" && waiting.ask.kind === "permission") {
    rule = ruleFor(waiting.ask.tool, waiting.ask.input);
    if (rule) await addTrust(rule);
  }
  answerAsk(id, answer, Boolean(rule));
  return { ok: true, ...(rule ? { rule } : {}) };
}
