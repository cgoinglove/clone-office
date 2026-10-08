// How like its person the mini-me is, as the glossary defines the like-me score: of the answers it
// showed them first, the share they sent as they were (not changed, not held back). Each such
// answer is kept in the office state (the last 500) and read over the last 30 days, overall and
// per kind of request.

import { changeState, type OfficeState } from "./state.ts";

export type Outcome = "as-is" | "changed" | "held";

const KEEP = 500;
const DAY = 24 * 60 * 60 * 1000;

export interface LikeMe {
  total: number;
  asIs: number;
  byMenu: Record<string, { total: number; asIs: number }>;
}

export async function recordOutcome(
  menu: string | undefined,
  outcome: Outcome,
  now = new Date(),
): Promise<void> {
  await changeState((state) => {
    state.outcomes = [
      ...state.outcomes,
      { at: now.toISOString(), ...(menu ? { menu } : {}), outcome },
    ].slice(-KEEP);
  });
}

export function likeMe(
  outcomes: OfficeState["outcomes"],
  now = Date.now(),
  days = 30,
): LikeMe {
  const since = now - days * DAY;
  const out: LikeMe = { total: 0, asIs: 0, byMenu: {} };
  for (const entry of outcomes) {
    if (!(Date.parse(entry.at) >= since)) continue;
    const asIs = entry.outcome === "as-is" ? 1 : 0;
    out.total += 1;
    out.asIs += asIs;
    if (entry.menu) {
      const kind = (out.byMenu[entry.menu] ??= { total: 0, asIs: 0 });
      kind.total += 1;
      kind.asIs += asIs;
    }
  }
  return out;
}
