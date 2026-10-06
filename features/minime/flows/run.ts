// Running flows. A run is the mini-me doing the flow's request in a fresh session with nobody to
// ask: it may use only what the person has already allowed, and their folders stay kept out. Its
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
import { denyRules, loadTrust } from "../gate/rules.ts";
import { tryLock } from "../memory/files.ts";
import { loadExcludes } from "../server/exclude.ts";
import { personLanguage } from "../server/language.ts";
import { errorCode } from "../server/ndjson.ts";
import { decide } from "./schedule.ts";
import {
  changeFlow,
  type Flow,
  flowsDir,
  getFlow,
  listFlows,
} from "./store.ts";

export function flowPrompt(flow: Flow, now = new Date()): string {
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

Nobody is there to ask, and this conversation has no earlier part: use what you may (your memory, their past AI conversations, your notes, the guide, the web) and say plainly what you could not do. Your answer is what they will read, in the conversation named after this flow, so give what they asked for and no more, as short as it allows. Keep nothing in your memory from this run.`;
}

/** Run one flow now; its answer, or what went wrong, goes into its conversation. */
export async function runFlow(
  id: string,
  options: { now?: Date } = {},
): Promise<{ ok: boolean; chat?: string }> {
  const flow = await getFlow(id);
  if (!flow) return { ok: false };
  const now = options.now ?? new Date();
  let chat = flow.chat && (await readChat(flow.chat)) ? flow.chat : undefined;
  if (!chat) {
    chat = (await createChat(flow.name)).id;
    await changeFlow(id, (f) => ({ ...f, chat }));
  }
  await appendMessage(chat, "flow", flow.name);
  const result = await runSession({
    prompt: flowPrompt(flow, now),
    language: await personLanguage(),
    maxTurns: 12,
    timeoutMs: 5 * 60 * 1000,
    purpose: "flow",
    standing: {
      allow: await loadTrust(),
      deny: denyRules(loadExcludes()),
    },
  });
  const ok = result.ok && Boolean(result.text.trim());
  const error = ok ? undefined : (result.error ?? "flow-failed");
  if (ok) {
    await appendMessage(chat, "minime", result.text);
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
    for (const flow of await listFlows()) {
      if (flow.paused) continue;
      const decision = decide(
        flow.when,
        new Date(flow.created),
        flow.seen ? new Date(flow.seen) : undefined,
        now,
      );
      const slot = decision.run
        ? decision.slot
        : "missed" in decision
          ? decision.missed
          : undefined;
      if (!slot) continue;
      await changeFlow(flow.id, (f) => ({
        ...f,
        seen: slot.toISOString(),
        ...(decision.run
          ? {}
          : { last: { at: slot.toISOString(), ok: false, missed: true } }),
      }));
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
