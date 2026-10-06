"use client";

// The app's main screen: the person's office, drawn as the confirmed design draws it, filling the
// window. Their clone sits at their desk; colleagues' clones carry requests between desks as they
// really travel. Over it: a bar with the name, what waits on them and the way to settings, the box
// to ask their clone at the bottom, and a side panel for the conversation with their clone and the
// office's requests. The lobby opens it once a day, as a person clocks in.

import { History, SquarePen, X } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented } from "@/components/ui/segmented";
import type { Mood } from "@/features/office";
import {
  type OfficeControl,
  OfficeRoom,
} from "@/features/office/room/office-room";
import { typed, useEscape, windowKey } from "@/hooks/use-hotkey";
import { personTag } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { type SectionId, SettingsDialog } from "../settings/settings";
import { usePresence } from "../use-presence";
import { ChatView } from "./chat-view";
import { RequestsView } from "./requests-view";
import { TopBar } from "./top-bar";
import { useChat } from "./use-chat";
import { useLearn } from "./use-learn";
import { HEADERS, type Profile, useOffice } from "./use-office";
import { usePreferences } from "./use-preferences";

type Side = "chat" | "requests";

// The office opens at its lobby once a day, as a person clocks in: the day it was last done is
// kept in this browser only. Without storage the lobby is skipped rather than shown every time.
const CLOCKED_IN = "sub-office.clocked-in";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
function clockedInToday(): boolean {
  try {
    return localStorage.getItem(CLOCKED_IN) === today();
  } catch {
    return true;
  }
}
function rememberClockIn(): void {
  try {
    localStorage.setItem(CLOCKED_IN, today());
  } catch {}
}

/** The side panel's width, and the room it keeps from the window's edges. */
const SIDE_W = 416;
const SIDE_GAP = 12;

export function Home() {
  const t = useTranslations("home");
  // While the person looks at this page, what waits on them is shown here, not sent to their phone.
  usePresence();
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(personTag()), []);

  const [profile, setProfile] = useState<Profile>({});
  useEffect(() => {
    void fetch("/api/me/profile", { headers: HEADERS })
      .then((r) => r.json())
      .then((data: Profile) => setProfile(data ?? {}))
      .catch(() => {});
  }, []);

  const chat = useChat(lang);
  const learn = useLearn(lang);
  const { preferences, change: changePreferences } = usePreferences();
  const office = useOffice(lang, {
    onNews: chat.refresh,
    profile,
    batchHours: preferences?.batchHours,
  });

  const [side, setSide] = useState<Side | null>(null);
  const [settings, setSettings] = useState<SectionId | null>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 900px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const control = useRef<OfficeControl>(null);
  const draft = useRef<HTMLTextAreaElement>(null);

  // Opening the side panel closes the office's own panel about a person, and the other way round.
  const openSide = useCallback((tab: Side | null) => {
    setSide(tab);
    if (tab) control.current?.closePanel();
  }, []);
  useEffect(() => {
    if (side === "chat") draft.current?.focus({ preventScroll: true });
  }, [side]);

  // The lobby, the first time today unless the person turned it off; decided once, when their
  // preferences are in, so the office does not go back to it.
  const [lobby, setLobby] = useState<boolean | null>(null);
  useEffect(() => {
    if (preferences && lobby === null)
      setLobby(preferences.lobby && !clockedInToday());
  }, [preferences, lobby]);

  const chatWaiting = chat.asking ? 1 : 0;
  const waiting = office.due.length + chatWaiting;
  const mood: Mood =
    chat.asking || office.due.length > 0
      ? "asking"
      : chat.talking
        ? "talk"
        : learn.stage === "learning"
          ? "working"
          : "idle";

  // What waits on the person shows in the tab's title too, as Thursday's does, so a tab in the
  // back still says it.
  const title = t("title");
  useEffect(() => {
    document.title = waiting
      ? `(${waiting}) ${title} · sub-office`
      : `${title} · sub-office`;
  }, [waiting, title]);

  // The keys the screen answers: ⌘, opens settings, "/" goes to the box to ask the clone, and Esc
  // closes the side panel (as the last layer that opened, through the window's one Esc).
  useEscape(side !== null && settings === null, () => setSide(null));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettings((was) => was ?? "clone");
        return;
      }
      if (!windowKey(event) || !typed(event, "/")) return;
      event.preventDefault();
      if (side === "chat") draft.current?.focus();
      else
        document
          .querySelector<HTMLInputElement>(".of-wrap .composer input")
          ?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [side]);

  const joined = office.office?.joined;
  const name = joined ? office.office?.me?.card.name : profile.name;

  return (
    <main
      className="group/home relative h-full min-h-0 flex-1 overflow-hidden bg-background"
      data-side={side ? "open" : undefined}
    >
      <h1 className="sr-only">{t("title")}</h1>
      {office.room && lobby !== null ? (
        <OfficeRoom
          ref={control}
          full
          data={office.room}
          lobby={lobby}
          inset={side && wide ? SIDE_W + SIDE_GAP * 2 : 0}
          onClockIn={rememberClockIn}
          onAnswer={() =>
            openSide(chat.asking && !office.due.length ? "chat" : "requests")
          }
          onAsk={(text) => {
            openSide("chat");
            void chat.ask(text);
          }}
          onPanel={(open) => {
            if (open) setSide(null);
          }}
          className="absolute inset-0"
        />
      ) : (
        <div className="absolute inset-0 animate-pulse bg-muted/30" />
      )}

      <TopBar
        waiting={waiting}
        learn={learn}
        mood={mood}
        status={
          joined ? (office.office?.me?.card.status ?? "working") : undefined
        }
        onStatus={
          joined
            ? (status) =>
                void office.post({
                  action: "card",
                  card: { ...office.office?.me?.card, status },
                })
            : undefined
        }
        side={side}
        onSide={openSide}
        onSettings={() => setSettings("clone")}
      />

      {side && (
        <SidePanel
          side={side}
          onSide={openSide}
          waiting={office.due.length}
          chat={chat}
        >
          {side === "chat" ? (
            <ChatView
              chat={chat}
              tasks={learn.tasks}
              routines={learn.routines}
              mood={mood}
              name={name}
              draftRef={draft}
            />
          ) : (
            <RequestsView
              office={office}
              onOpenOffice={() => setSettings("office")}
            />
          )}
        </SidePanel>
      )}

      <SettingsDialog
        section={settings}
        onSection={setSettings}
        lang={lang}
        office={office}
        learn={learn}
        profile={profile}
        onProfile={setProfile}
        preferences={preferences}
        onPreferences={changePreferences}
        onOpenChat={(id) => {
          setSettings(null);
          openSide("chat");
          void chat.openChat(id);
        }}
        onAsk={(text) => {
          setSettings(null);
          openSide("chat");
          void chat.ask(text);
        }}
        onNews={chat.refresh}
      />
    </main>
  );
}

function SidePanel({
  side,
  onSide,
  waiting,
  chat,
  children,
}: {
  side: Side;
  onSide: (tab: Side | null) => void;
  waiting: number;
  chat: ReturnType<typeof useChat>;
  children: React.ReactNode;
}) {
  const t = useTranslations("home");
  const tChat = useTranslations("chat");
  const format = useFormatter();
  const tabs = useMemo(
    () => [
      { value: "chat" as const, label: t("chatTab") },
      {
        value: "requests" as const,
        label: (
          <span className="flex items-center gap-1.5">
            {t("requestsTab")}
            {waiting > 0 && (
              <span className="rounded-full bg-waiting px-1.5 text-[10px] leading-4 font-semibold text-background tabular-nums">
                {waiting}
              </span>
            )}
          </span>
        ),
      },
    ],
    [t, waiting],
  );
  return (
    <aside
      aria-label={side === "chat" ? t("chatTab") : t("requestsTab")}
      className={cn(
        "absolute top-16 right-3 bottom-3 z-20 flex w-[min(26rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[14px] bg-background",
        "shadow-[0_0_0_1px_var(--alpha-10),0_18px_48px_-12px_var(--alpha-20)]",
        "animate-in fade-in slide-in-from-right-3 duration-200",
      )}
    >
      <header className="flex shrink-0 items-center gap-1 border-b border-border/70 px-2.5 py-2">
        <Segmented
          view
          size="sm"
          aria-label={t("panel")}
          options={tabs}
          value={side}
          onChange={(tab) => onSide(tab)}
        />
        <div className="ml-auto flex items-center">
          {side === "chat" && (
            <>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={tChat("newChat")}
                title={tChat("newChat")}
                disabled={chat.busy || chat.turns.length === 0}
                onClick={chat.newChat}
              >
                <SquarePen />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={tChat("pastChats")}
                      title={tChat("pastChats")}
                      disabled={chat.busy}
                    />
                  }
                >
                  <History />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{tChat("pastChats")}</DropdownMenuLabel>
                    {chat.chats.length === 0 && (
                      <DropdownMenuLabel className="font-normal text-muted-foreground">
                        {tChat("noChats")}
                      </DropdownMenuLabel>
                    )}
                    {chat.chats.slice(0, 30).map((item) => (
                      <DropdownMenuItem
                        key={item.id}
                        onClick={() => void chat.openChat(item.id)}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{item.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {format.dateTime(new Date(item.updated), {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            · {tChat("turns", { count: item.turns })}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t("closePanel")}
            title={t("closePanel")}
            onClick={() => onSide(null)}
          >
            <X />
          </Button>
        </div>
      </header>
      {side === "chat" && chat.title && chat.turns.length > 0 && (
        <p className="shrink-0 truncate border-b border-border/50 px-4 py-1.5 text-xs text-muted-foreground">
          {chat.title}
        </p>
      )}
      {children}
    </aside>
  );
}
