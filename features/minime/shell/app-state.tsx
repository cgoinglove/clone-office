"use client";

// What every screen of the app shares, held once by the app's frame (app-shell.tsx) so moving
// between screens keeps a conversation streaming and the office in view: the person, their
// conversations with their clone, the office, the questions that wait on them wherever they were
// asked, their preferences, and the settings dialog.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Mood } from "@/features/office";
import { personTag } from "@/i18n/client";
import type { GateAsk } from "../ask-card";
import { useChat } from "../home/use-chat";
import { useLearn } from "../home/use-learn";
import { HEADERS, type Profile, useOffice } from "../home/use-office";
import { usePreferences } from "../home/use-preferences";
import type { SectionId } from "../settings/settings";
import { usePresence } from "../use-presence";

/** A question the gate holds in one of the person's own conversations. */
export interface ChatAsk {
  id: string;
  chat: string;
  ask: GateAsk;
}

export function useAppState() {
  // While the person looks at a page, what waits on them is shown here, not sent to their phone.
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
  const [settings, setSettings] = useState<SectionId | null>(null);

  // Questions waiting in the person's own conversations, whichever is open: the sidebar lists them
  // with the office's, so one asked in a conversation left behind is not lost.
  const [chatAsks, setChatAsks] = useState<ChatAsk[]>([]);
  const loadAsks = useCallback(async () => {
    const data = (await fetch("/api/me/gate", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as {
      asks?: { id: string; chat?: string; ask: GateAsk }[];
    } | null;
    if (!data) return;
    setChatAsks(
      (data.asks ?? []).flatMap((entry) =>
        entry.chat && !entry.chat.startsWith("office-")
          ? [{ id: entry.id, chat: entry.chat, ask: entry.ask }]
          : [],
      ),
    );
  }, []);
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!live) return;
      void loadAsks().finally(() => {
        if (!live) return;
        timer = setTimeout(
          tick,
          document.visibilityState === "visible" ? 4000 : 20_000,
        );
      });
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [loadAsks]);
  // A question answered or asked in the open conversation changes the list at once.
  const openTurns = chat.turns.filter(
    (turn) => turn.kind === "ask" && turn.state === "open",
  ).length;
  useEffect(() => {
    void openTurns;
    void loadAsks();
  }, [openTurns, loadAsks]);

  /** Answers a question in one of the person's conversations from outside it (the sidebar). */
  const answerChatAsk = useCallback(
    async (id: string, answer: string, always = false) => {
      setChatAsks((all) => all.filter((entry) => entry.id !== id));
      await fetch("/api/me/gate/answer", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ id, answer, always }),
      }).catch(() => undefined);
      chat.refresh();
      void loadAsks();
    },
    [chat, loadAsks],
  );

  const mood: Mood =
    chatAsks.length > 0 || office.due.length > 0
      ? "asking"
      : chat.talking
        ? "talk"
        : learn.stage === "learning"
          ? "working"
          : "idle";

  const joined = Boolean(office.office?.joined);
  const name =
    (joined ? office.office?.me?.card.name : undefined) ??
    (profile.name?.trim() || undefined);

  return useMemo(
    () => ({
      lang,
      profile,
      setProfile,
      chat,
      learn,
      office,
      preferences,
      changePreferences,
      settings,
      setSettings,
      chatAsks,
      answerChatAsk,
      mood,
      joined,
      name,
    }),
    [
      lang,
      profile,
      chat,
      learn,
      office,
      preferences,
      changePreferences,
      settings,
      chatAsks,
      answerChatAsk,
      mood,
      joined,
      name,
    ],
  );
}

export type AppState = ReturnType<typeof useAppState>;

const AppContext = createContext<AppState | null>(null);

export const AppProvider = AppContext.Provider;

/** The app's shared state, for any screen inside the frame. */
export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp outside the app's frame");
  return state;
}
