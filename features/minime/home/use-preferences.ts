"use client";

// The person's preferences (server/preferences.ts) on the page: read once, changed in place, and
// shared by whatever reads them (the office's lobby and batch hours, Settings).

import { useCallback, useEffect, useState } from "react";
import { HEADERS } from "./use-office";

export type Autonomy = "ask" | "reads" | "auto";
export type Trust = "auto" | "tell" | "ask";

export interface Preferences {
  autonomy: Autonomy;
  defaultTrust: Trust;
  batchHours: number[];
  review: boolean;
  lobby: boolean;
  lightBackground: boolean;
  quiet: { on: boolean; from: number; to: number };
  /** Take part in the office's meetings of the clones. */
  meetings: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  autonomy: "ask",
  defaultTrust: "tell",
  batchHours: [10, 14, 17],
  review: true,
  lobby: true,
  lightBackground: false,
  quiet: { on: false, from: 22, to: 7 },
  meetings: false,
};

export function usePreferences() {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  useEffect(() => {
    let live = true;
    void fetch("/api/me/preferences", { headers: HEADERS })
      .then((r) => r.json())
      .then((data: Preferences) => live && setPreferences(data))
      .catch(() => live && setPreferences(DEFAULT_PREFERENCES));
    return () => {
      live = false;
    };
  }, []);

  /** Changes some preferences: shown at once, kept by the server, and put back if it refuses. */
  const change = useCallback(
    async (next: Partial<Preferences>) => {
      const before = preferences;
      setPreferences((was) => (was ? { ...was, ...next } : was));
      const response = await fetch("/api/me/preferences", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(next),
      }).catch(() => undefined);
      if (response?.ok) setPreferences(await response.json());
      else setPreferences(before);
      return Boolean(response?.ok);
    },
    [preferences],
  );

  return { preferences, change };
}
