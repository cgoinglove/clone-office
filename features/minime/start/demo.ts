"use client";

// The office on the first screen, playing the app's one loop with nobody real in it, as Thursday's
// first screen plays its own: a colleague's clone brings a request to your desk, yours does it and
// takes the answer back, then a request only you can decide comes to you, and goes once you have.
// It is only data: the office draws it as it draws any day (office.mjs), so what a newcomer sees
// is exactly what the app does.

import { useEffect, useMemo, useState } from "react";
import type { RoomData } from "@/features/office/room/office.mjs";

export interface DemoWords {
  you: string;
  people: { id: string; name: string; role: string }[];
  ask: string;
  answer: string;
  decide: string;
  question: string;
  decided: string;
}

/** One pass of the loop, and when each beat of it begins. */
const LOOP_MS = 22_000;
const BEATS = [0, 1500, 5000, 9500, 11_000, 14_500, 19_500] as const;

/** The beat the loop is on, 0 to 6, and how many loops have gone. */
function useBeat(playing: boolean) {
  const [state, setState] = useState({ beat: 0, round: 0 });
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - start;
      const at = elapsed % LOOP_MS;
      let beat = 0;
      for (let i = 0; i < BEATS.length; i++) if (at >= BEATS[i]) beat = i;
      const round = Math.floor(elapsed / LOOP_MS);
      setState((was) =>
        was.beat === beat && was.round === round ? was : { beat, round },
      );
    }, 200);
    return () => clearInterval(timer);
  }, [playing]);
  return state;
}

export function useDemoRoom(words: DemoWords, playing: boolean) {
  const { beat, round } = useBeat(playing);
  const room = useMemo<RoomData>(() => {
    const [first, second, third] = words.people;
    const now = Date.now();
    const asked = `demo-${round}-ask`;
    const decide = `demo-${round}-decide`;
    const requests: RoomData["requests"] = [];
    // A colleague's request the clone answers alone.
    if (beat >= 1)
      requests.push({
        id: asked,
        from: second.id,
        to: "you",
        state: beat === 1 ? "SUBMITTED" : beat === 2 ? "WORKING" : "COMPLETED",
        text: words.ask,
        ...(beat >= 3 ? { answer: words.answer } : {}),
        at: now,
      });
    // One that is the person's to decide.
    if (beat >= 4)
      requests.push({
        id: decide,
        from: third.id,
        to: "you",
        state: beat === 4 ? "SUBMITTED" : beat === 5 ? "WORKING" : "COMPLETED",
        held: beat === 5,
        text: words.decide,
        ...(beat >= 6 ? { answer: words.decided } : {}),
        at: now,
      });
    return {
      people: [
        { id: "you", name: words.you, mine: true, status: "active" },
        ...[first, second, third].map((person) => ({
          id: person.id,
          name: person.name,
          role: person.role,
          status: "active" as const,
        })),
      ],
      requests,
      waiting: beat === 5 ? { count: 1, text: words.question } : { count: 0 },
    };
  }, [words, beat, round]);
  return { room, beat };
}
