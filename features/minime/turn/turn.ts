// What waits on the person, for where they are when no page is open: their messenger and their own
// Claude Code (the plugin). Each question is worded as its card on the page is, with its choices,
// and answered the way the page answers it: a question at the gate through answerPerson, one kept
// for later through answerLater, so the request it belongs to goes on.

import { askDetails, changeOf, describe } from "../ask-text.ts";
import { readChat } from "../chat/store.ts";
import { answerPerson } from "../gate/answer.ts";
import { type Ask, isRequestChat, pendingAsks } from "../gate/gate.ts";
import type { Kept, OfficeSide } from "../messenger/office.ts";
import type { Words } from "../server/words.ts";

/** A choice on a question: what the person reads, and what answers it. */
export interface TurnChoice {
  label: string;
  value: string;
  style?: "primary" | "secondary" | "danger";
}

export interface TurnEntry {
  /** `ask:<id>` at the gate, or `later:<id>` kept for later. */
  id: string;
  /** Whose question it is: who asked what, or the conversation it came from. */
  about: string;
  /** The question as its card says it. */
  text: string;
  choices: TurnChoice[];
  /** Their own words answer it too (a question, rather than a permission). */
  words: boolean;
  at: string;
}

/** How much of the request a question is about is quoted beside it. */
export const ABOUT_CHARS = 300;

export const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};

/** A question at the gate as its card words it, with its choices (values `ask:<id>:<choice>`). */
export function wordAsk(
  w: Words,
  id: string,
  ask: Ask,
): { text: string; choices: TurnChoice[] } {
  const { ask: tAsk } = w;
  if (ask.kind === "permission") {
    const change = changeOf(ask.tool, ask.input);
    // The same lines its card shows on the page (a flow: its name, when, and what).
    const details = askDetails(w, ask.tool, ask.input, ask)
      .map((line) => `\n${line}`)
      .join("");
    return {
      text: `${tAsk("mayI")}\n${describe(tAsk, ask.tool, ask.input)}${details}${change ? `\n\`\`\`\n${change.replace(/```/g, "ˋˋˋ")}\n\`\`\`` : ""}`,
      choices: [
        { label: tAsk("allow"), value: `ask:${id}:allow`, style: "primary" },
        // "From now on" only where code can keep it as a rule: never a command, never files.
        ...(ask.always
          ? [
              {
                label: ask.reads
                  ? tAsk("alwaysReads", { service: ask.reads })
                  : tAsk("always"),
                value: `ask:${id}:always`,
              },
            ]
          : []),
        { label: tAsk("deny"), value: `ask:${id}:deny` },
      ],
    };
  }
  if (ask.kind === "rule")
    return {
      text: tAsk("rule", { menu: ask.menu }),
      choices: [
        { label: tAsk("ruleYes"), value: `ask:${id}:yes`, style: "primary" },
        { label: tAsk("ruleNo"), value: `ask:${id}:no` },
      ],
    };
  return {
    text: ask.question,
    choices: (ask.choices ?? []).map((choice, index) => ({
      label: choice,
      value: `ask:${id}:${index}`,
    })),
  };
}

/** Whose question it is: who asked what, or the conversation on the page it came from. */
export async function aboutAsk(
  side: OfficeSide,
  chat: string | undefined,
  w: Words,
): Promise<string> {
  if (isRequestChat(chat)) {
    const task = (chat ?? "").slice("office-request-".length);
    const request = await side.about(task).catch(() => undefined);
    return w.t("fromRequest", {
      name: request?.from ?? w.t("colleague"),
      request: clip(request?.text ?? "", ABOUT_CHARS),
    });
  }
  const title = chat
    ? (await readChat(chat).catch(() => undefined))?.info.title
    : undefined;
  return title ? w.t("inChat", { title }) : w.t("fromPage");
}

/** A question kept for later, with its choices (values `later:<id>:<index>`). */
export async function wordKept(
  side: OfficeSide,
  kept: Kept,
  w: Words,
): Promise<{ about: string; open: boolean; choices: TurnChoice[] }> {
  const request = await side.about(kept.task).catch(() => undefined);
  return {
    about: w.t("fromRequest", {
      name: kept.from ?? request?.from ?? w.t("colleague"),
      request: clip(request?.text ?? "", ABOUT_CHARS),
    }),
    // Closed meanwhile: nothing to answer.
    open: !request || request.open,
    choices: (kept.choices ?? []).map((choice, index) => ({
      label: choice,
      value: `later:${kept.id}:${index}`,
    })),
  };
}

/**
 * Everything waiting on the person now, oldest first: questions at the gate (an offer to make a
 * rule waits for the page) and questions kept for later about requests still open.
 */
export async function turnEntries(
  side: OfficeSide,
  w: Words,
): Promise<TurnEntry[]> {
  const entries: TurnEntry[] = [];
  for (const pending of pendingAsks()) {
    if (pending.ask.kind === "rule") continue;
    const about = await aboutAsk(side, pending.chat, w);
    const worded = wordAsk(w, pending.id, pending.ask);
    entries.push({
      id: `ask:${pending.id}`,
      about,
      text: worded.text,
      choices: worded.choices,
      words: pending.ask.kind === "question",
      at: pending.at,
    });
  }
  for (const kept of await side.kept().catch(() => [])) {
    // A question still live at the gate is listed there.
    if (kept.ask && pendingAsks().some((pending) => pending.id === kept.ask))
      continue;
    const worded = await wordKept(side, kept, w);
    if (!worded.open) continue;
    entries.push({
      id: `later:${kept.id}`,
      about: worded.about,
      text: kept.question,
      choices: worded.choices,
      words: true,
      at: kept.at,
    });
  }
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * The person's answer to one entry: a choice's value, or their own words. Says what was done in
 * their language, or that it no longer waits.
 */
export async function answerTurn(
  side: OfficeSide,
  w: Words,
  answer: { value?: string; words?: string },
): Promise<{ ok: boolean; outcome: string }> {
  const { t, ask: tAsk } = w;
  const gone = { ok: false, outcome: t("gone") };
  const [kind, id = "", value = ""] = (answer.value ?? "").split(":");
  const typed = answer.words?.trim();
  if (kind === "later") {
    const kept = (await side.kept().catch(() => [])).find(
      (one) => one.id === id,
    );
    const given = typed || kept?.choices?.[Number(value)];
    if (!kept || !given || !(await side.answer(kept.id, given))) return gone;
    return { ok: true, outcome: tAsk("answered", { answer: given }) };
  }
  if (kind !== "ask") return gone;
  const waiting = pendingAsks().find((pending) => pending.id === id);
  if (!waiting) {
    // Not answered while it waited, it was kept for later: the same question waits there.
    const kept = (await side.kept().catch(() => [])).find(
      (one) => one.ask === id,
    );
    const given = typed || kept?.choices?.[Number(value)];
    if (!kept || !given || !(await side.answer(kept.id, given))) return gone;
    return { ok: true, outcome: tAsk("answered", { answer: given }) };
  }
  let given = value;
  let always = false;
  let outcome: string;
  if (waiting.ask.kind === "permission") {
    // Words do not answer a permission: only its choices do.
    if (!value) return gone;
    given = value === "deny" ? "deny" : "allow";
    always = value === "always";
    outcome = given === "allow" ? tAsk("allowed") : tAsk("denied");
  } else if (waiting.ask.kind === "rule") {
    outcome = value === "yes" ? tAsk("ruleDone") : tAsk("ruleKept");
  } else {
    given = typed || waiting.ask.choices?.[Number(value)] || "";
    if (!given) return gone;
    outcome = tAsk("answered", { answer: given });
  }
  if (!(await answerPerson(id, given, always)).ok) return gone;
  return { ok: true, outcome };
}
