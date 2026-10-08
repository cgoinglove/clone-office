// Running flows. A run at its time is the mini-me doing the flow's request in a fresh session with
// nobody to ask: it may use only what the person has already allowed, and their folders stay kept
// out. Run from their page ("Run now"), the person is there: what it may not do alone yet is asked
// on cards in the flow's conversation, and "from now on" there holds for the runs at its times. Its
// answer goes into the flow's own conversation, which the person can go on with. Nothing is learned
// from a run (Hermes Agent runs its scheduled jobs without its memory providers): it was not the
// person talking. While the app runs, the flows are looked at every minute; a lock makes sure two
// app processes never run the same one.

import { join } from "node:path";
import { runSession } from "../brain/session.ts";
import {
  appendMessage,
  createChat,
  readChat,
  setSession,
} from "../chat/store.ts";
import { gateSecret } from "../gate/gate.ts";
import { denyRules, loadTrust } from "../gate/rules.ts";
import { tryLock } from "../memory/files.ts";
import { loadExcludes } from "../server/exclude.ts";
import { personLanguage } from "../server/language.ts";
import { errorCode } from "../server/ndjson.ts";
import { type Decision, decide } from "./schedule.ts";
import {
  changeFlow,
  type Flow,
  flowsDir,
  getFlow,
  listFlows,
} from "./store.ts";

/** A run's answer: what the person reads, and whether it is worth telling them about now. */
export const FLOW_SCHEMA = {
  type: "object",
  properties: {
    notify: { type: "boolean" },
    text: { type: "string" },
  },
  required: ["notify", "text"],
};

/** What the last run told the person, so a run says only what is new. */
export interface LastAnswer {
  at: string;
  text: string;
}

export function flowPrompt(
  flow: Flow,
  now = new Date(),
  present = false,
  last?: LastAnswer,
): string {
  const time = now.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `This is "${flow.name}", one of your person's flows, running on its own (${time} on their computer). Their request:

${flow.what}

${
  present
    ? "They started this run themselves from their page: what you may not do alone yet is asked on a card, and what they allow from now on holds for this flow's runs at its times too. This conversation has no earlier part."
    : "Nobody is there to ask, and this conversation has no earlier part. If something you need is refused because they have not let you do it alone yet, name it, and say that running this flow once from Flows on their page lets them allow it."
} Use what you may (your memory, their past AI conversations, your notes, the guide, the web, the services they connected) and say plainly what you could not do. Keep nothing in your memory from this run.

Answer with text and notify. text is what they will read, in the conversation named after this flow: what they asked for and no more, as short as it allows. notify says whether this run has something for them now: when they asked to hear every time (a brief, a summary, a report), or something new or needing them came up, it is true, and they are told (on their phone when they are away). When they asked you to watch for something and nothing new came up since the last run, it is false and text says so in one line; it is kept without telling them. Never repeat as news what the last run already told them.${
    last
      ? `

What the last run told them (${new Date(last.at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}):
${last.text}`
      : ""
  }`;
}

/** The last answer a run left in the flow's conversation, cut to a readable length. */
async function lastAnswer(chat: string): Promise<LastAnswer | undefined> {
  const found = (await readChat(chat))?.messages.findLast(
    (message) => message.role === "minime",
  );
  if (!found) return undefined;
  const text =
    found.text.length > 2000 ? `${found.text.slice(0, 2000)}…` : found.text;
  return { at: found.at, text };
}

/** The flow's own conversation, made the first time it is needed. */
export async function flowChat(flow: Flow): Promise<string> {
  if (flow.chat && (await readChat(flow.chat))) return flow.chat;
  const chat = (await createChat(flow.name)).id;
  await changeFlow(flow.id, (f) => ({ ...f, chat }));
  return chat;
}

/**
 * Run one flow now; its answer, or what went wrong, goes into its conversation. With `gateUrl` the
 * person started it and is asked, on cards in that conversation, for what it may not do alone yet.
 */
export async function runFlow(
  id: string,
  options: { now?: Date; gateUrl?: string } = {},
): Promise<{ ok: boolean; chat?: string }> {
  const flow = await getFlow(id);
  if (!flow) return { ok: false };
  const now = options.now ?? new Date();
  const chat = await flowChat(flow);
  const last = await lastAnswer(chat);
  await appendMessage(chat, "flow", flow.name);
  const allow = await loadTrust();
  const deny = denyRules(loadExcludes());
  const result = await runSession({
    prompt: flowPrompt(flow, now, Boolean(options.gateUrl), last),
    jsonSchema: FLOW_SCHEMA,
    language: await personLanguage(),
    maxTurns: 12,
    // Someone may take a while to answer a card; nobody does at its time.
    timeoutMs: (options.gateUrl ? 15 : 5) * 60 * 1000,
    purpose: "flow",
    connectors: true,
    ...(options.gateUrl
      ? {
          gate: {
            url: options.gateUrl,
            secret: gateSecret(),
            chat,
            allow,
            deny,
          },
        }
      : { standing: { allow, deny } }),
  });
  const shaped = (result.structured ?? {}) as {
    notify?: boolean;
    text?: string;
  };
  const text = (shaped.text ?? result.text).trim();
  const ok = result.ok && Boolean(text);
  const error = ok ? undefined : (result.error ?? "flow-failed");
  if (ok) {
    // Run by the person, it is theirs to read whatever it says; at its time, only news is told.
    const quiet = shaped.notify === false && !options.gateUrl;
    await appendMessage(chat, "minime", text, [], false, quiet);
    if (result.sessionId)
      await setSession(chat, result.sessionId, result.context);
  } else
    await appendMessage(chat, "error", errorCode(error ?? "") ?? error ?? "");
  await changeFlow(id, (f) => ({
    ...f,
    last: { at: now.toISOString(), ok, ...(error ? { error } : {}) },
  }));
  return { ok, chat };
}

/**
 * Look at every flow once: run the ones whose time has come, note the ones missed. `run` is
 * replaced in tests. Returns the ids run.
 */
export async function tick(
  now = new Date(),
  run: (id: string, options: { now: Date }) => Promise<unknown> = runFlow,
): Promise<string[]> {
  const release = await tryLock(join(flowsDir(), "tick"), 15 * 60 * 1000);
  if (!release) return [];
  const ran: string[] = [];
  try {
    for (const { id } of await listFlows()) {
      // Decided and claimed on the flow as it is now, under its lock: another look that took the
      // same time already (after a sleep outlived this one's lock, say) leaves nothing to run.
      let decision: Decision = { run: false };
      await changeFlow(id, (f) => {
        if (f.paused) return f;
        decision = decide(
          f.when,
          new Date(f.created),
          f.seen ? new Date(f.seen) : undefined,
          now,
        );
        const slot = decision.run
          ? decision.slot
          : "missed" in decision
            ? decision.missed
            : undefined;
        if (!slot) return f;
        return {
          ...f,
          seen: slot.toISOString(),
          ...(decision.run
            ? {}
            : { last: { at: slot.toISOString(), ok: false, missed: true } }),
        };
      });
      const flow = { id };
      if (!decision.run) continue;
      // One run failing never holds up the others due now.
      try {
        await run(flow.id, { now });
        ran.push(flow.id);
      } catch {
        await changeFlow(flow.id, (f) => ({
          ...f,
          last: { at: now.toISOString(), ok: false, error: "flow-failed" },
        })).catch(() => {});
      }
    }
  } finally {
    await release();
  }
  return ran;
}

const holder = globalThis as typeof globalThis & {
  __minimeFlows?: ReturnType<typeof setInterval>;
};

/** Look at the flows every minute while the app runs; started once per server process. */
export function keepFlowsRunning(everyMs = 60_000): void {
  if (holder.__minimeFlows) return;
  holder.__minimeFlows = setInterval(() => {
    void tick().catch(() => {});
  }, everyMs);
  holder.__minimeFlows.unref?.();
  setTimeout(() => void tick().catch(() => {}), 5_000).unref?.();
}
