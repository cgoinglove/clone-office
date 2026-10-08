"use client";

// The page tells the app while the person is looking at it: in view and in focus, every little
// while. Looking elsewhere it falls silent, and after a short while nobody is taken to be here, so
// what waits on the person goes to their phone (server/presence.ts); closing it says so at once.

import { useEffect } from "react";
import { BEAT_MS } from "./server/presence";

const HEADERS = { "content-type": "application/json", "x-clone-office": "1" };

export function usePresence(): void {
  useEffect(() => {
    const page = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const say = (here: boolean) =>
      void fetch("/api/me/presence", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ page, here }),
        keepalive: true,
      }).catch(() => {});
    const looking = () =>
      document.visibilityState === "visible" && document.hasFocus();
    const beat = () => {
      if (looking()) say(true);
    };
    const leave = () => say(false);
    beat();
    const timer = setInterval(beat, BEAT_MS);
    window.addEventListener("focus", beat);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("pagehide", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", beat);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, []);
}
