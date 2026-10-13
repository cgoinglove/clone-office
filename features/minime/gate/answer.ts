// The person's answer to a question from the gate, wherever they give it: on their page, or in their
// messenger. "From now on" on a tool becomes a rule in settings.json before the waiting session
// hears the answer.

import { connectorOfTool } from "../connectors/catalog.ts";
import { readRule } from "../connectors/tools.ts";
import { grantTaskEdits } from "../hands/grants.ts";
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
  // Work in a conversation: "always" is this one task changing files in its folder, kept here for
  // the tool server to take when the work starts, never a rule.
  if (
    always &&
    answer === "allow" &&
    waiting.ask.kind === "permission" &&
    waiting.ask.task
  ) {
    grantTaskEdits(
      waiting.chat,
      String(waiting.ask.input.session ?? ""),
      String(waiting.ask.input.task ?? ""),
    );
    answerAsk(id, answer);
    return { ok: true };
  }
  if (always && answer === "allow" && waiting.ask.kind === "permission") {
    // A service's reading tool: reading in that service, every reading tool of it.
    const service = waiting.ask.reads
      ? connectorOfTool(waiting.ask.tool)
      : undefined;
    rule = service
      ? readRule(service.connector.id)
      : ruleFor(waiting.ask.tool, waiting.ask.input);
    if (rule) await addTrust(rule);
  }
  answerAsk(id, answer, Boolean(rule));
  return { ok: true, ...(rule ? { rule } : {}) };
}

/**
 * An answer as a question's button carries it (permission: allow, always, deny; a rule: yes or no;
 * a question: its choice's index), given to the question still waiting; false when it no longer is.
 */
export async function answerChoice(
  id: string,
  value: string,
): Promise<{ ok: boolean; answer: string }> {
  const waiting = pendingAsks().find((ask) => ask.id === id);
  if (!waiting) return { ok: false, answer: value };
  let answer = value;
  let always = false;
  if (waiting.ask.kind === "permission") {
    answer = value === "deny" ? "deny" : "allow";
    always = value === "always";
  } else if (waiting.ask.kind === "question")
    answer = waiting.ask.choices?.[Number(value)] ?? value;
  const done = await answerPerson(id, answer, always);
  return { ok: done.ok, answer };
}
