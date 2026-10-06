// The curator: once a week, when the person has been away for a while, skills the mini-me made
// and nobody has opened for a long time are marked stale, then set aside in the archive. Nothing
// is deleted, pinned skills and the person's own skills are never touched, and no model is
// called. Follows Hermes Agent's automatic transitions (agent/curator.py, MIT, Nous Research):
// the same intervals, and a never-used skill keeps a grace period from its creation.

import { join } from "node:path";
import { atomicWrite, readText } from "./files.ts";
import type { SkillStore, UsageRecord } from "./skills.ts";

export const CURATOR = {
  intervalHours: 24 * 7,
  minIdleHours: 2,
  staleAfterDays: 14,
  archiveAfterDays: 30,
};

const STATE_FILE = ".curator.json";
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

interface CuratorState {
  last_run_at?: string;
  last_activity_at?: string;
}

async function readState(dir: string): Promise<CuratorState> {
  const read = await readText(join(/*turbopackIgnore: true*/ dir, STATE_FILE));
  try {
    return read.raw ? JSON.parse(read.raw) : {};
  } catch {
    return {};
  }
}

const time = (value: string | null | undefined) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(parsed) ? undefined : parsed;
};

/** Record that the mini-me was just used, so the curator waits for a quiet stretch. */
export async function noteActivity(
  dir: string,
  now = new Date(),
): Promise<void> {
  const state = await readState(dir);
  await atomicWrite(
    join(/*turbopackIgnore: true*/ dir, STATE_FILE),
    JSON.stringify({ ...state, last_activity_at: now.toISOString() }, null, 2),
  );
}

/**
 * Whether a pass is due. The first time it looks, it only starts the clock, so a new library gets
 * a full interval before anything is set aside.
 */
export async function curatorDue(
  dir: string,
  now = new Date(),
): Promise<boolean> {
  const state = await readState(dir);
  const lastRun = time(state.last_run_at);
  if (lastRun === undefined) {
    await atomicWrite(
      join(/*turbopackIgnore: true*/ dir, STATE_FILE),
      JSON.stringify({ ...state, last_run_at: now.toISOString() }, null, 2),
    );
    return false;
  }
  const lastActivity = time(state.last_activity_at);
  return (
    now.getTime() - lastRun >= CURATOR.intervalHours * HOUR &&
    (lastActivity === undefined ||
      now.getTime() - lastActivity >= CURATOR.minIdleHours * HOUR)
  );
}

function lastActivity(record: UsageRecord): number | undefined {
  const stamps = [record.last_viewed_at, record.last_patched_at]
    .map(time)
    .filter((stamp): stamp is number => stamp !== undefined);
  return stamps.length ? Math.max(...stamps) : undefined;
}

/** One deterministic pass over the skills the mini-me made. */
export async function runCurator(
  store: SkillStore,
  now = new Date(),
): Promise<{
  checked: number;
  stale: number;
  archived: number;
  reactivated: number;
}> {
  const counts = { checked: 0, stale: 0, archived: 0, reactivated: 0 };
  const staleCutoff = now.getTime() - CURATOR.staleAfterDays * DAY;
  const archiveCutoff = now.getTime() - CURATOR.archiveAfterDays * DAY;
  const active = new Set((await store.list()).map((skill) => skill.name));
  for (const [name, record] of Object.entries(await store.usage())) {
    if (!active.has(name) || record.created_by !== "minime" || record.pinned)
      continue;
    counts.checked += 1;
    const anchor =
      lastActivity(record) ?? time(record.created_at) ?? now.getTime();
    const neverUsed = !record.view_count && !record.patch_count;
    // Never opened is absence of evidence: a young skill may not have met its task yet.
    if (neverUsed && anchor > staleCutoff) {
      if (record.state === "stale") {
        await store.setState(name, "active");
        counts.reactivated += 1;
      }
      continue;
    }
    if (anchor <= archiveCutoff) {
      if ((await store.archive(name)).ok) counts.archived += 1;
    } else if (anchor <= staleCutoff && record.state === "active") {
      await store.setState(name, "stale");
      counts.stale += 1;
    } else if (anchor > staleCutoff && record.state === "stale") {
      await store.setState(name, "active");
      counts.reactivated += 1;
    }
  }
  const state = await readState(store.dir);
  await atomicWrite(
    join(/*turbopackIgnore: true*/ store.dir, STATE_FILE),
    JSON.stringify({ ...state, last_run_at: now.toISOString() }, null, 2),
  );
  return counts;
}

/** Run a pass when one is due; a failure never stops the session that asked. */
export async function maybeRunCurator(store: SkillStore, now = new Date()) {
  try {
    return (await curatorDue(store.dir, now))
      ? await runCurator(store, now)
      : undefined;
  } catch {
    return undefined;
  }
}
