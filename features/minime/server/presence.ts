// Whether the person is looking at their mini-me's page now: each page in view says so every
// little while, and says it is leaving when it is hidden or closed. What waits on the person goes to
// their phone only while no page is in view (as Thursday's reach decides, and as Slack sends to the
// phone only while the desktop is idle). Right after the app starts nobody is known yet: a page
// that was open comes back within the grace, so until then "nobody" is only "nobody yet".

/** A page in view says so this often (first-run.tsx). */
export const BEAT_MS = 20_000;
/** Silent this long, a page is taken as gone: a missed beat or two is not leaving. */
export const GONE_MS = 50_000;

interface Presence {
  /** When the app's server process began. */
  since: number;
  /** Each page in view, by the id it made for itself: when it last said so. */
  pages: Map<string, number>;
  /** A page has said either since the app started. */
  heard: boolean;
}

const holder = globalThis as typeof globalThis & {
  __minimePresence?: Presence;
};

function presence(): Presence {
  holder.__minimePresence ??= {
    since: Date.now(),
    pages: new Map(),
    heard: false,
  };
  return holder.__minimePresence;
}

/** A page says it is in view (`here`), or that it was hidden or closed. */
export function notePresence(
  page: string,
  here: boolean,
  now = Date.now(),
): void {
  const p = presence();
  p.heard = true;
  if (here) p.pages.set(page, now);
  else p.pages.delete(page);
  for (const [id, seen] of p.pages)
    if (now - seen >= GONE_MS) p.pages.delete(id);
}

/**
 * "watching": a page is in view. "away": none is. "unknown": the app started too recently to
 * tell; `wait` is how long until it can.
 */
export function watching(
  now = Date.now(),
): { state: "watching" | "away" } | { state: "unknown"; wait: number } {
  const p = presence();
  for (const seen of p.pages.values())
    if (now - seen < GONE_MS) return { state: "watching" };
  const wait = p.since + GONE_MS - now;
  if (!p.heard && wait > 0) return { state: "unknown", wait };
  return { state: "away" };
}
