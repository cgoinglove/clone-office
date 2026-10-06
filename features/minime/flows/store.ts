// The person's flows: each a saved "when this happens, do this", one file each under flows/ in the
// mini-me's folder. They are made and changed by talking to the mini-me (with a card first) and
// paused, run or removed on the page.

import { readdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, withLock } from "../memory/files.ts";
import { minimeHome } from "../server/paths.ts";
import type { When } from "./schedule.ts";

export interface Flow {
  id: string;
  name: string;
  when: When;
  /** The request the mini-me gets at that time, complete on its own. */
  what: string;
  paused?: boolean;
  created: string;
  /** The last scheduled time already handled, run or missed. */
  seen?: string;
  last?: {
    at: string;
    ok: boolean;
    /** Too late to make up when the app came back (the computer slept, or it was closed). */
    missed?: boolean;
    error?: string;
  };
  /** The conversation its runs go to. */
  chat?: string;
}

const ID = /^[a-z0-9][a-z0-9-]{2,63}$/;

export function flowsDir(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "flows");
}

function flowPath(id: string): string {
  if (!ID.test(id)) throw new Error("Not a flow id.");
  return join(/*turbopackIgnore: true*/ flowsDir(), `${id}.json`);
}

/** An id from the name where it has letters for one, and a few random ones so two never meet. */
export function newFlowId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const random = Math.random().toString(36).slice(2, 8).padEnd(6, "0");
  return slug ? `${slug}-${random}` : `flow-${random}`;
}

async function read(id: string): Promise<Flow | undefined> {
  try {
    return JSON.parse(await readFile(flowPath(id), "utf8")) as Flow;
  } catch {
    return undefined;
  }
}

/** Every flow, oldest first. */
export async function listFlows(): Promise<Flow[]> {
  let files: string[] = [];
  try {
    files = await readdir(flowsDir());
  } catch {
    return [];
  }
  const flows: Flow[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const flow = await read(file.slice(0, -".json".length));
    if (flow?.id && flow.when && flow.what) flows.push(flow);
  }
  return flows.sort((a, b) => a.created.localeCompare(b.created));
}

export async function getFlow(id: string): Promise<Flow | undefined> {
  return ID.test(id) ? read(id) : undefined;
}

export async function addFlow(flow: Flow): Promise<void> {
  await withLock(flowsDir(), () =>
    atomicWrite(flowPath(flow.id), `${JSON.stringify(flow, null, 2)}\n`),
  );
}

/** Change one flow under the lock; returning undefined removes it. */
export async function changeFlow(
  id: string,
  change: (flow: Flow) => Flow | undefined,
): Promise<Flow | undefined> {
  if (!ID.test(id)) return undefined;
  return withLock(flowsDir(), async () => {
    const flow = await read(id);
    if (!flow) return undefined;
    const next = change(flow);
    if (next)
      await atomicWrite(flowPath(id), `${JSON.stringify(next, null, 2)}\n`);
    else await unlink(flowPath(id)).catch(() => {});
    return next;
  });
}
