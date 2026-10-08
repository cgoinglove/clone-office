"use client";

// The app's frame around every screen: the column on the left, the open screen, and settings over
// them. It holds what the screens share (app-state.tsx) so a conversation keeps streaming while the
// person looks at the office. An invite kept by the launcher opens the office's settings once. Keys: ⌘, opens settings, ⌘N starts a new conversation; the tab's
// title carries what waits on the person, so a tab in the back still says it.

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef } from "react";
import { SettingsDialog } from "../settings/settings";
import { AppProvider, useApp, useAppState } from "./app-state";
import { Sidebar } from "./sidebar";
import { yourTurn } from "./your-turn";

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();
  return (
    <AppProvider value={state}>
      <Frame>{children}</Frame>
    </AppProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const waiting = yourTurn(app.office, app.chatAsks).length;

  const screen = pathname.split("/")[1] || "chat";
  const title = t(
    `screens.${
      (["chat", "requests", "office", "clone"] as const).find(
        (key) => key === screen,
      ) ?? "chat"
    }`,
  );
  useEffect(() => {
    document.title = waiting
      ? `(${waiting}) ${title} · Clone Office`
      : `${title} · Clone Office`;
  }, [waiting, title]);

  const { setSettings, chat } = app;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key === ",") {
        event.preventDefault();
        setSettings((was) => was ?? "brain");
      }
      if (event.key.toLowerCase() === "n" && event.shiftKey) {
        event.preventDefault();
        chat.newChat();
        router.push("/chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSettings, chat, router]);

  // Started again with `clone-office join <link>`: the office's settings open once, ready to join.
  const invite = app.office.office?.invite?.link;
  const offered = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!invite || offered.current === invite) return;
    offered.current = invite;
    setSettings("office");
  }, [invite, setSettings]);

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      <Sidebar />
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {children}
      </main>
      <SettingsDialog
        section={app.settings}
        onSection={app.setSettings}
        lang={app.lang}
        office={app.office}
        profile={app.profile}
        preferences={app.preferences}
        onPreferences={app.changePreferences}
      />
    </div>
  );
}
