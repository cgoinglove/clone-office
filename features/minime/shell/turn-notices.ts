"use client";

// News for the person as it comes: a new thing to decide (a colleague's clone asking, or their own
// clone in a conversation), and an answer to a request they sent. While the page is in view it is
// a card at the bottom right (`notify`), unless the screen they are on already shows it (Home and
// the office list what to decide; a request's or conversation's own page shows its own); while the
// app's tab is in the back, a notice from the browser instead, for people without the phone bot
// (after Orca's notifications), off until they turn it on in Settings › Notifications & phone,
// which asks the browser's leave, and kept in this browser alone.

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createElement, useEffect, useRef } from "react";
import { notify } from "@/components/ui/toast";
import type { OfficeState } from "../home/use-office";
import { Mark } from "./parts";
import { askLine, type TurnItem, turnHref } from "./your-turn";

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

/** Screens that list what there is to decide, so a card there would say it twice. */
const LISTS_TURNS = ["/home", "/office", "/requests"];

export function useTurnNotices(
  office: OfficeState,
  items: TurnItem[],
  openChat: string | undefined,
  /** The office and the conversations' questions were each read once: what waits then is not news. */
  ready: boolean,
) {
  const t = useTranslations("ask");
  const tShell = useTranslations("shell");
  const close = useTranslations("common")("close");
  const router = useRouter();
  const pathname = usePathname();
  const where = useRef({ pathname, openChat });
  where.current = { pathname, openChat };
  const seen = useRef<Set<string> | null>(null);
  // When the page began watching: a question kept before then is not news when it first shows
  // (it waited while the office could not be reached).
  const watching = useRef(0);
  const keys = items.map((item) => item.key).join("|");
  const me = office.office?.me?.id;

  /** Whether the screen in view already shows this one. */
  const shownHere = (item: TurnItem) => {
    const { pathname, openChat } = where.current;
    if (LISTS_TURNS.includes(pathname)) return true;
    if (item.where.kind === "chat")
      return pathname === "/chat" && openChat === item.where.chat;
    return pathname === turnHref(item);
  };

  /** One piece of news: a card while the page is in view and its screen does not show it already, else the browser's notice. */
  const tell = (news: {
    title: string;
    body: string;
    /** Whose clone it is about, for the card's mark. */
    from?: string;
    href: string;
    /** The card's button. */
    action: string;
    tag: string;
    shown: () => boolean;
  }) => {
    const go = () => router.push(news.href);
    if (document.visibilityState === "visible") {
      if (news.shown()) return;
      notify(news.title, news.body, {
        lead: news.from
          ? createElement(Mark, {
              id: news.from,
              index: office.indexOf(news.from),
              size: 22,
            })
          : undefined,
        open: { label: news.action, run: go },
        closeLabel: close,
      });
      return;
    }
    if (!noticesOn()) return;
    const notice = new Notification(news.title, {
      body: news.body,
      tag: news.tag,
    });
    notice.onclick = () => {
      window.focus();
      go();
      notice.close();
    };
  };

  // Run when the list's keys change (`keys`), not on every new array of the same items.
  useEffect(() => {
    if (!ready) return;
    // What already waited when the page opened is not news.
    if (!seen.current) {
      seen.current = new Set(items.map((item) => item.key));
      watching.current = Date.now();
      return;
    }
    // Everything ever seen stays seen: a question that drops out while the office cannot be
    // reached and comes back after is not news again.
    const known = seen.current;
    const kept = (item: TurnItem) =>
      Boolean(
        item.waiting?.later &&
          item.since &&
          Date.parse(item.since) < watching.current,
      );
    const fresh = items.filter((item) => !known.has(item.key) && !kept(item));
    for (const item of items) known.add(item.key);
    for (const item of fresh) {
      const from = item.from && office.names.get(item.from);
      tell({
        title: from
          ? tShell("office.fromColleague", { name: from })
          : tShell("office.fromClone"),
        body: askLine(t, item.ask),
        from: item.from,
        href: turnHref(item),
        action: tShell("notice.answer"),
        tag: item.key,
        shown: () => shownHere(item),
      });
    }
  }, [keys, ready]);

  // A request the person sent that a colleague's clone has just answered.
  const states = useRef<Map<string, string> | null>(null);
  const sent = (office.office?.tasks ?? []).filter(
    (task) => task.metadata.from === me,
  );
  const stateKey = sent
    .map((task) => `${task.id}:${task.status.state}`)
    .join("|");
  useEffect(() => {
    const now = new Map(sent.map((task) => [task.id, task.status.state]));
    const before = states.current;
    // A look that could not reach the office knows nothing of the requests: what was known stays,
    // so an answer that came meanwhile is still news on the next look.
    states.current = new Map([...(before ?? []), ...now]);
    if (!before) return;
    for (const task of sent) {
      const was = before.get(task.id);
      if (!was || was === task.status.state) continue;
      if (task.status.state !== "COMPLETED") continue;
      const href = `/requests/${encodeURIComponent(task.id)}`;
      const to = task.metadata.to;
      // someone asked by a link has no clone: their name is the guest's
      const member = office.names.get(to);
      tell({
        title: tShell("notice.answered", {
          name: member ?? task.metadata.guest ?? "",
        }),
        body:
          [...task.history]
            .reverse()
            .find((message) => message.role === "agent")
            ?.parts.map((part) => part.text ?? "")
            .join(" ")
            .trim() ?? "",
        from: member ? to : undefined,
        href,
        action: tShell("office.open"),
        tag: task.id,
        shown: () => where.current.pathname === href,
      });
    }
  }, [stateKey]);
}
