// A request that came to this mini-me from a colleague's mini-me, answered with its own brain the
// way its person would: from what it knows of them. What only its person can give (a promise, a
// decision they answer for, a relationship, a check in their field) is asked on their screen
// through the trust gate, and the one asking only hears that it is being checked meanwhile.
// The brain says which kind of request on the person's menu it is; code then does what the
// person set for that kind: send it, send it and tell them, or show it to them first.

import { randomUUID } from "node:crypto";
import { reviewSession } from "../brain/review.ts";
import {
  runSession,
  type SessionEvent,
  type SessionGate,
} from "../brain/session.ts";
import { appendMessage, createChat, listChats } from "../chat/store.ts";
import { changeFlow, listFlows } from "../flows/store.ts";
import { askPerson, gateSecret, onAsk, waitFor } from "../gate/gate.ts";
import { denyRules, loadTrust, pathRule } from "../gate/rules.ts";
import { savedText } from "../saved-text.ts";
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
  filesDir,
  filesLine,
  putFiles,
  readToSend,
  SEND_FILES,
  takeFiles,
} from "./files.ts";
import { recordOutcome } from "./likeme.ts";
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
    files: { type: "array", items: { type: "string" }, maxItems: 10 },
  },
  required: ["reply"],
};

/** How the person wants requests handled, from their flows: a kind's own, or any request's. */
export interface Way {
  menu?: string;
  what: string;
}

/** The person's own instructions for requests, as the prompt gives them; empty without any. */
export function waysText(menu: MenuItem[], ways: Way[]): string {
  if (!ways.length) return "";
  const kind = (id?: string) =>
    id ? (menu.find((item) => item.id === id)?.name ?? id) : "Any request";
  return `How your person wants these handled, in their own words; follow them as theirs, still asking them first for what only they can give:
${ways.map((way) => `- ${kind(way.menu)}: ${way.what}`).join("\n")}`;
}

export function requestPrompt(
  from: Card | undefined,
  text: string,
  menu: MenuItem[] = [],
  ways: Way[] = [],
): string {
  const who = from
    ? `the clone of ${from.name}${from.description ? ` (${from.description})` : ""}`
    : "a colleague's clone";
  return `A request came to you from ${who}, on their behalf:

${text}

Answer it for your person, the way they would: from what you know of them and their work (your memory, your notes, and their past conversations, which you can search). When it is about their code or a project, their own Claude Code conversations know it better than your memory: see sessions, and ask the one it belongs to with ask_session. When the request is a piece of work in a project one of those conversations knows, and you ask your person whether to take it on, offer as one of the choices that their conversation does it now. If they choose that, do it with work_session (each change it makes is asked of them first) and answer with what was done; otherwise answer with what they said. Say only what your person would say, in the language the request is written in, and keep it short.

Some things only your person can give: a promise (a date, money, scope), a decision they answer for, anything about a relationship (refusing, apologising, negotiating), or a check of work in their own field. For those, ask your person with ask_me, in their language, and answer with what they said. Never promise or decide on their behalf. If they have not answered yet, set waiting_on_person: you will go on when they do.

If you need something from the one asking before you can answer, set needs_input and ask it in reply. If it is not something your person does or would take on, set declined and say so politely in reply.

When the answer is a file of your person's (a document, a sheet, an image they asked for), put its full path on your person's computer in files, up to ten; your person sees the answer and the files before anything goes.
${
  menu.length
    ? `
The kinds of request your person takes (id: name — what it is):
${menuLines(menu)}
Put in menu the id of the one this request is, or leave it empty if none fits.
`
    : ""
}${ways.length ? `\n${waysText(menu, ways)}\n` : ""}
In note, write one line for your person, in their language: who asked what, and what you answered.`;
}

/** Waits before trying a failed run again, when the failure looks like it will pass. */
export const RETRY_WAITS = [60_000, 180_000];

/**
 * A failure that usually passes by itself: the AI service busy or rate-limited, or the connection
 * dropped. A run that used up its whole time is not tried again (it would repeat its tools and its
 * questions to the person for as long again), nor is a refusal that only mentions being busy (a
 * 401, 402 or 403 is about the account), as Hermes Agent learned.
 */
export function passing(error: string | undefined): boolean {
  const text = error ?? "";
  if (/\b(401|402|403)\b/.test(text)) return false;
  return /\b(529|503|429)\b|overloaded|rate.?limit|ECONNRESET|ETIMEDOUT|socket hang up|^ai-busy$/i.test(
    text,
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
  /** The kind the first run took the request for, when the going on does not say. */
  menu?: string;
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
  // The person's flows for requests: how they want them handled, read while answering.
  const ways = (await listFlows()).filter(
    (flow) => flow.when.kind === "request" && !flow.paused,
  );
  const gate: SessionGate = {
    url: gateUrl,
    secret: gateSecret(),
    chat: requestChat(task),
    // The files colleagues sent with this request are there to be read.
    allow: [...(await loadTrust()), `Read(${pathRule(filesDir(task.id))}/**)`],
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
    const words = latest?.parts.map((p) => p.text).join("\n") ?? "";
    // Files the one asking sent with these words: taken onto this computer for the mini-me to read.
    const came = latest?.files ?? [];
    let attached = "";
    if (came.length)
      attached = await takeFiles(office, task.id, came)
        .then(
          (taken) =>
            `\n\nThey sent ${taken.length === 1 ? "a file" : "files"} with it, now on your person's computer:\n${filesLine(taken)}\nRead what matters to the answer.`,
        )
        .catch(
          () =>
            `\n\nThey sent files that could not be taken from the office: ${came.map((file) => file.name).join(", ")}. Say so if the answer needs them.`,
        );
    const text = `${words}${attached}`;
    const howTo = waysText(
      menu,
      ways.map((flow) => ({
        menu: flow.when.kind === "request" ? flow.when.menu : undefined,
        what: flow.what,
      })),
    );
    // Going on in the same session: the person's own ways are said again, as a reminder.
    const prompt =
      resume?.session || (!resume && previous?.session)
        ? `${
            resume?.prompt ??
            `They answered: ${text}\n\nGo on with the request.`
          }${howTo ? `\n\n${howTo}` : ""}`
        : `${requestPrompt(
            from,
            resume ? userText(task) : text,
            menu,
            ways.map((flow) => ({
              menu: flow.when.kind === "request" ? flow.when.menu : undefined,
              what: flow.what,
            })),
          )}${
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
      files?: unknown;
    };
    // The person was asked and has not answered: the question waits for them, and the colleague
    // hears that they will get back to them.
    const open = [...asked].filter(([, a]) => !a.answered);
    if (result.ok && (answer.waiting_on_person || open.length)) {
      const [ask, last] = open.at(-1) ?? [];
      await park(office, task, {
        kind: "question",
        question: last?.question ?? answer.note?.trim() ?? userText(task),
        ...(last?.choices?.length ? { choices: last.choices } : {}),
        ...(ask ? { ask } : {}),
        session: result.sessionId,
        from: from?.name,
        ...(answer.menu ? { menu: answer.menu } : {}),
      });
      return;
    }
    // What the person set for this kind of request; code decides, the brain only named the kind.
    const { item, trust } = trustFor(menu, answer.menu || resume?.menu);
    // The flows that applied to it: the check hears them as the person's own words, and the page
    // shows when each was last followed.
    const applied = ways.filter(
      (flow) =>
        flow.when.kind === "request" &&
        (!flow.when.menu || flow.when.menu === item?.id),
    );
    for (const flow of applied)
      await changeFlow(flow.id, (f) => ({
        ...f,
        last: { at: new Date().toISOString(), ok: true },
      }));
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
    // Files of the person's to go with it: only ones that can go (there, not kept out, not too
    // large); the person sees them with the answer before anything is sent.
    const files: string[] = [];
    for (const path of Array.isArray(answer.files) ? answer.files : [])
      if (
        typeof path === "string" &&
        files.length < SEND_FILES &&
        (await readToSend([path]).then(
          () => true,
          () => false,
        ))
      )
        files.push(path);
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
      ways: applied.map((flow) => flow.what),
      // "Ask me first": the person sees the answer before it goes, whatever the check finds,
      // unless they already gave it themselves while it was made. Files always.
      approve: approving || files.length > 0,
      from: from?.name,
      files,
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
      ...(files.length ? { files } : {}),
    } as const;
    if ("later" in outcome) {
      await park(office, task, {
        kind: "check",
        question: outcome.later.question,
        choices: outcome.later.choices,
        ...(outcome.later.revised ? { revised: outcome.later.revised } : {}),
        labels: outcome.later.labels,
        ...(outcome.later.ask ? { ask: outcome.later.ask } : {}),
        ...sending,
      });
      return;
    }
    await finish(office, task, outcome, sending);
    // The person answered while it was handled: their own words teach the mini-me most.
    if (said.length)
      await learnFromRequest(result.sessionId, result.systemPrompt);
  } finally {
    stop();
  }
}

/**
 * Look back on a request the person spoke in, as a conversation is looked back on (Hermes'
 * learning loop), and keep only what stays true: how they decide, what they take on, where they
 * stop. What is kept is shown in their latest conversation, as everything kept is.
 */
async function learnFromRequest(
  sessionId: string | undefined,
  prompt?: string,
): Promise<void> {
  if (!sessionId) return;
  const kept: string[] = [];
  await reviewSession(
    sessionId,
    (event: SessionEvent) => {
      const line = savedText(event as unknown as Record<string, unknown>);
      if (line) kept.push(line);
    },
    prompt,
  );
  if (!kept.length) return;
  const chat =
    (await latestConversation()) ?? (await createChat(kept[0] ?? ""));
  for (const line of kept) await appendMessage(chat.id, "saved", line);
}

/** The person's latest conversation with their mini-me; a flow's own conversation is not one. */
async function latestConversation() {
  const flows = new Set((await listFlows()).map((flow) => flow.chat));
  return (await listChats(30)).find((chat) => !flows.has(chat.id));
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
    /** Files of the person's that go with the answer. */
    files?: string[];
  },
): Promise<void> {
  const item = sending.menu
    ? (await loadMenu()).find((m) => m.id === sending.menu)
    : undefined;
  if ("hold" in outcome) {
    if (sending.approving) await recordOutcome(sending.menu, "held");
    if (sending.approving && item) await countApproval(item, false);
    await updateRequest(office, task.id, {
      state: "REJECTED",
      text: "Their person will answer this directly.",
    });
    return;
  }
  // The files go as they are now; one that can no longer go does not stop the answer.
  const files = sending.files?.length
    ? await putFiles(office, sending.files).catch(() => [])
    : [];
  await updateRequest(office, task.id, {
    state: sending.state,
    text: outcome.send,
    ...(files.length ? { files: files.map((file) => file.id) } : {}),
  });
  // The person sent it as it was: three in a row, and the mini-me offers to do these alone.
  if (sending.approving)
    await recordOutcome(
      sending.menu,
      outcome.send === sending.reply ? "as-is" : "changed",
    );
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
            ...(kept.files?.length ? { files: kept.files } : {}),
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
          menu: kept.menu,
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
  const chat = (await latestConversation()) ?? (await createChat(note));
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
