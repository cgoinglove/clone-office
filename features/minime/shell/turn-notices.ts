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
import type { ChatAsk } from "./app-state";
import { Mark } from "./parts";
import { askLine, type TurnItem, turnHref, yourTurn } from "./your-turn";

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
const LISTS_TURNS = ["/home", "/office"];

export function useTurnNotices(
  office: OfficeState,
  chatAsks: ChatAsk[],
  openChat?: string,
  /** The office and the conversations' questions were each read once: what waits then is not news. */
  ready = true,
) {
  const t = useTranslations("ask");
  const tShell = useTranslations("shell");
  const close = useTranslations("common")("close");
  const router = useRouter();
  const pathname = usePathname();
  const where = useRef({ pathname, openChat });
  where.current = { pathname, openChat };
  const seen = useRef<Set<string> | null>(null);
  const items = yourTurn(office, chatAsks);
  const keys = items.map((item) => item.key).join("|");
  const members = office.office?.members ?? [];
  const me = office.office?.me?.id;

  /** Whether the screen in view already shows this one. */
  const shownHere = (item: TurnItem) => {
    const { pathname, openChat } = where.current;
    if (LISTS_TURNS.includes(pathname)) return true;
    if (item.where.kind === "chat")
      return pathname === "/chat" && openChat === item.where.chat;
    return pathname === turnHref(item);
  };
  const mark = (id?: string) =>
    id
      ? createElement(Mark, {
          id,
          index: Math.max(
            0,
            members.findIndex((member) => member.id === id),
          ),
          size: 22,
        })
      : undefined;

  // Run when the list's keys change (`keys`), not on every new array of the same items.
  useEffect(() => {
    if (!ready) return;
    // What already waited when the page opened is not news.
    if (!seen.current) {
      seen.current = new Set(items.map((item) => item.key));
      return;
    }
    // Everything ever seen stays seen: a question that drops out while the office cannot be
    // reached and comes back after is not news again.
    const known = seen.current;
    const fresh = items.filter((item) => !known.has(item.key));
    for (const item of items) known.add(item.key);
    if (!fresh.length) return;
    const visible = document.visibilityState === "visible";
    for (const item of fresh) {
      const from = members.find((member) => member.id === item.from)?.card.name;
      const line = askLine(t, item.ask);
      if (visible) {
        if (shownHere(item)) continue;
        notify(
          from
            ? tShell("office.fromColleague", { name: from })
            : tShell("office.fromClone"),
          line,
          {
            lead: mark(item.from),
            open: {
              label: tShell("notice.answer"),
              run: () => router.push(turnHref(item)),
            },
            closeLabel: close,
          },
        );
        continue;
      }
      if (!noticesOn()) continue;
      const notice = new Notification(from ?? "Clone Office", {
        body: line,
        tag: item.key,
      });
      notice.onclick = () => {
        window.focus();
        router.push(turnHref(item));
        notice.close();
      };
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
    states.current = now;
    if (!before) return;
    for (const task of sent) {
      const was = before.get(task.id);
      if (!was || was === task.status.state) continue;
      if (task.status.state !== "COMPLETED") continue;
      const href = `/requests/${encodeURIComponent(task.id)}`;
      const to = task.metadata.to;
      const name = members.find((member) => member.id === to)?.card.name ?? "";
      const answer =
        [...task.history]
          .reverse()
          .find((message) => message.role === "agent")
          ?.parts.map((part) => part.text ?? "")
          .join(" ")
          .trim() ?? "";
      const title = tShell("notice.answered", { name });
      if (document.visibilityState === "visible") {
        if (where.current.pathname === href) continue;
        notify(title, answer, {
          lead: mark(to),
          open: { label: tShell("office.open"), run: () => router.push(href) },
          closeLabel: close,
        });
        continue;
      }
      if (!noticesOn()) continue;
      const notice = new Notification(title, { body: answer, tag: task.id });
      notice.onclick = () => {
        window.focus();
        router.push(href);
        notice.close();
      };
    }
  }, [stateKey]);
}
