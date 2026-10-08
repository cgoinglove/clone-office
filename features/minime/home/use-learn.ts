"use client";

// The clone's reading of the person's records, as the server runs it (learn/job.ts): whether one is
// under way and how far it has come, what it kept, and, once done, the things it offers to do
// right away. A reading started anywhere (the first steps, settings) is followed here, so a page
// opened mid-way shows it too.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Routine } from "../routine";
import { savedText } from "../saved-text";
import { stream } from "../stream";

const HEADERS = { "content-type": "application/json", "x-clone-office": "1" };

export interface Progress {
  phase: "index" | "read" | "learn";
  percent: number;
  source?: string;
}

export interface Source {
  id: string;
  label: string;
  items: number;
}

export interface LearnState {
  stage: "boot" | "idle" | "learning" | "done";
  progress: Progress | null;
  sources: Source[];
  /** Lines kept during this reading, as they were said. */
  kept: string[];
  /** Things to try right away, from the last reading. */
  tasks: { label: string; why: string }[];
  routines: Routine[];
  /** What the clone would answer a colleague in the person's place, from the last reading. */
  example?: { question: string; answer: string };
  /** Who they are at work, as the last reading saw it, for them to confirm. */
  about?: { role: string; owns: string[]; tools: string[] };
  /** How many new conversations are worth reading again, when it has been a while. */
  fresh: number;
  problem: string | null;
}

const EMPTY: LearnState = {
  stage: "boot",
  progress: null,
  sources: [],
  kept: [],
  tasks: [],
  routines: [],
  fresh: 0,
  problem: null,
};

export function useLearn(lang: string, onDone?: () => void) {
  const [state, setState] = useState<LearnState>(EMPTY);
  const done = useRef(onDone);
  done.current = onDone;

  const onEvent = useCallback((event: Record<string, unknown>) => {
    switch (event.type) {
      case "idle":
        setState((s) => ({
          ...s,
          stage: s.stage === "boot" ? "idle" : s.stage,
        }));
        break;
      case "progress":
        setState((s) => ({
          ...s,
          stage: "learning",
          progress: event as unknown as Progress,
        }));
        break;
      case "material":
        setState((s) => ({ ...s, sources: event.sources as Source[] }));
        break;
      case "saved": {
        const text = savedText(event.event as Record<string, unknown>);
        if (text) setState((s) => ({ ...s, kept: [...s.kept, text] }));
        break;
      }
      case "done": {
        // Offer to read again when the last reading is half a day old and enough is new.
        const fresh = Number(event.fresh ?? 0);
        const age = Date.now() - Date.parse(String(event.at));
        setState((s) => ({
          ...s,
          stage: "done",
          fresh: fresh >= 3 && age > 12 * 60 * 60 * 1000 ? fresh : 0,
          tasks: (event.tasks as LearnState["tasks"]) ?? [],
          routines: (event.routines as Routine[] | undefined) ?? [],
          example: event.example as LearnState["example"],
          about: event.about as LearnState["about"],
        }));
        done.current?.();
        break;
      }
      case "error":
        setState((s) => ({
          ...s,
          stage: "idle",
          problem: String(event.code ?? event.message),
        }));
        break;
    }
  }, []);

  const follow = useCallback(
    (signal?: AbortSignal) =>
      stream("/api/me/learn", undefined, onEvent, signal).catch(
        (error: Error) => {
          if (error.name !== "AbortError")
            setState((s) => ({ ...s, problem: error.message }));
        },
      ),
    [onEvent],
  );

  useEffect(() => {
    const controller = new AbortController();
    void follow(controller.signal);
    return () => controller.abort();
  }, [follow]);

  /** Starts a reading (the first, or again for what is new) and follows it. */
  const start = useCallback(async () => {
    setState((s) => ({
      ...s,
      stage: "learning",
      problem: null,
      kept: [],
      sources: [],
      fresh: 0,
      progress: { phase: "index", percent: 1 },
    }));
    const response = await fetch("/api/me/learn", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ locale: lang }),
    }).catch(() => undefined);
    if (!response?.ok) {
      const data = await response?.json().catch(() => ({}));
      setState((s) => ({
        ...s,
        stage: "idle",
        problem: String(data?.error ?? response?.status ?? "learn-failed"),
      }));
      return false;
    }
    void follow();
    return true;
  }, [lang, follow]);

  return { ...state, start };
}

export type Learn = ReturnType<typeof useLearn>;
