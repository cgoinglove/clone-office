"use client";

// A notice from the browser for each new thing that waits on the person while the app's tab is not
// in view, for people without the phone bot (after Orca's notifications). Off until they turn it on
// in Settings › Notifications & phone, which asks the browser's leave; kept in this browser alone.

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { OfficeState } from "../home/use-office";
import type { ChatAsk } from "./app-state";
import { askLine, turnHref, yourTurn } from "./your-turn";

export const NOTIFY_KEY = "clone-office:notify";

/** Whether the person turned the browser's notices on, and the browser lets the page show them. */
export function noticesOn(): boolean {
  try {
    return (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted" &&
      localStorage.getItem(NOTIFY_KEY) === "1"
    );
  } catch {
    return false;
  }
}

export function useTurnNotices(office: OfficeState, chatAsks: ChatAsk[]) {
  const t = useTranslations("ask");
  const router = useRouter();
  const seen = useRef<Set<string> | null>(null);
  const items = yourTurn(office, chatAsks);
  const keys = items.map((item) => item.key).join("|");
  // Run when the list's keys change (`keys`), not on every new array of the same items.
  useEffect(() => {
    // What already waited when the page opened is not news.
    if (!seen.current) {
      seen.current = new Set(items.map((item) => item.key));
      return;
    }
    const known = seen.current;
    const fresh = items.filter((item) => !known.has(item.key));
    seen.current = new Set(items.map((item) => item.key));
    if (!fresh.length || document.visibilityState === "visible" || !noticesOn())
      return;
    const members = office.office?.members ?? [];
    for (const item of fresh) {
      const from = members.find((member) => member.id === item.from)?.card.name;
      const notice = new Notification(from ?? "Clone Office", {
        body: askLine(t, item.ask),
        tag: item.key,
      });
      notice.onclick = () => {
        window.focus();
        router.push(turnHref(item));
        notice.close();
      };
    }
  }, [keys]);
}
