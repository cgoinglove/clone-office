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

/**
 * One pass of the loop, and when each beat of it begins, timed to what the office draws (filmed a
 * second at a time): the colleague's clone walks over and hands it in (about 4s), yours takes it and
 * works (about 4s), walks the answer over, stamps it done and comes back (about 8s); then the
 * request only you can decide comes the same way, waits on you a while, and its answer goes back.
 */
const LOOP = {
  ms: 37_500,
  beats: [0, 800, 4500, 9000, 17_500, 22_500, 28_500],
};
/** Only the first request, the question a colleague would ask them, its answer taken back. */
const ASK = { ms: 19_000, beats: [0, 800, 4500, 9000] };

/**
 * How the example plays: the whole loop, only one colleague's question and its answer (what the
 * reading understood, put to work), or nothing between the desks at all.
 */
export type DemoMode = "loop" | "ask" | "still";

/** The beat the loop is on, and how many loops have gone. */
function useBeat(playing: boolean, { ms, beats }: typeof LOOP) {
  const [state, setState] = useState({ beat: 0, round: 0 });
  useEffect(() => {
    if (!playing) return;
    const start = performance.now();
    const timer = setInterval(() => {
      const elapsed = performance.now() - start;
      const at = elapsed % ms;
      let beat = 0;
      for (let i = 0; i < beats.length; i++) if (at >= beats[i]) beat = i;
      const round = Math.floor(elapsed / ms);
      setState((was) =>
        was.beat === beat && was.round === round ? was : { beat, round },
      );
    }, 200);
    return () => clearInterval(timer);
  }, [playing, ms, beats]);
  return state;
}

/**
 * The office as the example shows it at this beat. Calm, nothing goes between the desks: the
 * office stands still behind what the person is writing (their card), their own clone named after
 * them.
 */
export function useDemoRoom(
  words: DemoWords,
  playing: boolean,
  mode: DemoMode = "loop",
) {
  const calm = mode === "still";
  const { beat, round } = useBeat(
    playing && !calm,
    mode === "ask" ? ASK : LOOP,
  );
  const room = useMemo<RoomData>(() => {
    const [first, second, third] = words.people;
    const now = Date.now();
    const asked = `demo-${round}-ask`;
    const decide = `demo-${round}-decide`;
    const requests: RoomData["requests"] = [];
    if (calm)
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
        waiting: { count: 0 },
      };
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
  }, [words, beat, round, calm]);
  return { room, beat };
}
