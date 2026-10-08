// Whether a newer Clone Office is on npm, after Thursday's features/settings/update.ts. A copy
// started from npm never changes by itself, so Settings › General asks npm's registry which version
// is newest, at most once in six hours, and says what to type to move to it. It is the one request
// the app makes that nobody asked for by name (SECURITY.md says so): no data goes with it.

/** The package on npm. */
export const PACKAGE = "clone-office";

/** npm's registry, asked for the manifest its `latest` tag names (GET /{package}/{tag}). */
const REGISTRY = `https://registry.npmjs.org/${PACKAGE}/latest`;

/** A plain release: the only kind offered, and the only text that reaches the screen's command. */
const PLAIN = /^\d+\.\d+\.\d+$/;

const EVERY = 6 * 60 * 60_000;

/** Whether `a` is a later plain release than `b`. Anything else (a canary, a build) is not. */
export function isNewer(a: string, b: string): boolean {
  if (!PLAIN.test(a) || !PLAIN.test(b)) return false;
  const [x, y] = [a, b].map((version) => version.split(".").map(Number));
  for (let at = 0; at < 3; at++) if (x[at] !== y[at]) return x[at] > y[at];
  return false;
}

/** Pinned: routes can load separate copies of this module, and one answer serves them all. */
const pinned = globalThis as typeof globalThis & {
  __cloneOfficeLatest?: { at: number; latest: string | null };
};

/** npm's newest release, or null when npm could not be asked. */
export async function latestVersion(
  ask: typeof fetch = fetch,
  now = Date.now(),
): Promise<string | null> {
  const kept = pinned.__cloneOfficeLatest;
  if (kept && now - kept.at < EVERY) return kept.latest;
  let latest: string | null = null;
  try {
    const response = await ask(REGISTRY, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const version = String(
        ((await response.json()) as { version?: unknown }).version ?? "",
      );
      latest = PLAIN.test(version) ? version : null;
    }
  } catch {
    // Offline, or npm is slow: nothing is said either way.
  }
  pinned.__cloneOfficeLatest = { at: now, latest };
  return latest;
}

export interface UpdateStatus {
  /** The version that runs. */
  current: string;
  /** npm's newest release when it is newer; null when it is not, or not known. */
  newer: string | null;
  /** The line that starts the newest one, once this one is closed. */
  command: string | null;
}

/**
 * What Settings says. Only a copy started from the package asks: run from source, moving on is
 * `git pull`, theirs to decide.
 */
export async function updateStatus(
  current = process.env.NEXT_PUBLIC_APP_VERSION ?? "",
  fromPackage = Boolean(process.env.CLONE_OFFICE_APP_DIR),
  ask: typeof fetch = fetch,
): Promise<UpdateStatus> {
  if (!fromPackage || !current) return { current, newer: null, command: null };
  const latest = await latestVersion(ask);
  const newer = latest && isNewer(latest, current) ? latest : null;
  return {
    current,
    newer,
    // @latest, so npx does not start the copy it already keeps.
    command: newer ? `npx -y ${PACKAGE}@latest` : null,
  };
}
