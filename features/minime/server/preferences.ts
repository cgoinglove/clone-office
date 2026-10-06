// How the person wants their clone to behave, kept in settings.json under `preferences` and set in
// Settings › Preferences. Each has a default that keeps the app as careful as it was before the
// setting existed, so nothing loosens unless the person says so.

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "./exclude.ts";
import { minimeHome } from "./paths.ts";

/**
 * How much the clone does in the person's own work without asking first, after Claude Code's
 * permission modes: `ask` asks before anything not allowed one by one; `reads` reads files (never
 * in folders left out), web pages and the services it is connected to on its own; `auto` also
 * acts in connected services and asks colleagues on its own. Files leaving the computer, flows,
 * and work in Claude Code conversations are asked every time, in every mode.
 */
export type Autonomy = "ask" | "reads" | "auto";
export type Trust = "auto" | "tell" | "ask";

export interface Preferences {
  autonomy: Autonomy;
  /** The trust level a new kind of request starts at. */
  defaultTrust: Trust;
  /** When questions kept for later come to the person, as hours of the day. */
  batchHours: number[];
  /** After each conversation, look back and keep what it taught. */
  review: boolean;
  /** Open the office at its lobby the first time each day. */
  lobby: boolean;
  /**
   * Background work (looking back, summaries, drafts) on the brain's lighter model, which uses
   * less of a plan or a key; the work done for the person, and every answer that leaves, stay on
   * the one they picked.
   */
  lightBackground: boolean;
}

/** The work that may go to the lighter model when the person wants it. */
export const BACKGROUND_PURPOSES = new Set([
  "review",
  "summary",
  "card",
  "fix",
]);

export const DEFAULT_PREFERENCES: Preferences = {
  autonomy: "ask",
  defaultTrust: "tell",
  batchHours: [10, 14, 17],
  review: true,
  lobby: true,
  lightBackground: false,
};

const AUTONOMIES: Autonomy[] = ["ask", "reads", "auto"];
const TRUSTS: Trust[] = ["auto", "tell", "ask"];

/** Takes what was kept or sent, keeping only values that make sense and filling in defaults. */
export function cleanPreferences(input: unknown): Preferences {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const hours = Array.isArray(raw.batchHours)
    ? [
        ...new Set(
          raw.batchHours.filter(
            (hour): hour is number =>
              Number.isInteger(hour) && hour >= 0 && hour <= 23,
          ),
        ),
      ]
        .sort((a, b) => a - b)
        .slice(0, 6)
    : DEFAULT_PREFERENCES.batchHours;
  return {
    autonomy: AUTONOMIES.includes(raw.autonomy as Autonomy)
      ? (raw.autonomy as Autonomy)
      : DEFAULT_PREFERENCES.autonomy,
    defaultTrust: TRUSTS.includes(raw.defaultTrust as Trust)
      ? (raw.defaultTrust as Trust)
      : DEFAULT_PREFERENCES.defaultTrust,
    batchHours: hours.length ? hours : DEFAULT_PREFERENCES.batchHours,
    review:
      typeof raw.review === "boolean" ? raw.review : DEFAULT_PREFERENCES.review,
    lobby:
      typeof raw.lobby === "boolean" ? raw.lobby : DEFAULT_PREFERENCES.lobby,
    lightBackground:
      typeof raw.lightBackground === "boolean"
        ? raw.lightBackground
        : DEFAULT_PREFERENCES.lightBackground,
  };
}

export async function readPreferences(): Promise<Preferences> {
  try {
    const settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    return cleanPreferences(settings?.preferences);
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

/** Changes the preferences named in `change`, keeping the rest. */
export async function writePreferences(
  change: Partial<Preferences>,
): Promise<Preferences> {
  return withLock(minimeHome(), async () => {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    } catch {
      settings = {};
    }
    const next = cleanPreferences({
      ...cleanPreferences(settings.preferences),
      ...change,
    });
    await writeSettings(
      `${JSON.stringify({ ...settings, preferences: next }, null, 2)}\n`,
    );
    return next;
  });
}
