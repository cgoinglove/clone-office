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
import { type Turn, useChat } from "../home/use-chat";
import { useLearn } from "../home/use-learn";
import { HEADERS, type Profile, useOffice } from "../home/use-office";
import { usePreferences } from "../home/use-preferences";
import type { SectionId } from "../settings/settings";
import { usePresence } from "../use-presence";
import { yourTurn } from "./your-turn";

/** A question the gate holds in one of the person's own conversations. */
export interface ChatAsk {
  id: string;
  chat: string;
  ask: GateAsk;
}

/** No questions yet, one array so that nothing reading it is drawn again for a new empty one. */
const NO_ASKS: ChatAsk[] = [];

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

  // The conversation's turns change with every streamed word, so they travel apart from the rest
  // (`useConversation`): only the conversation's own view is drawn again for each word.
  const { chat, turns: conversation } = useChat(lang);
  const learn = useLearn(lang);
  const { preferences, change: changePreferences } = usePreferences();
  const office = useOffice(lang, {
    onNews: chat.refresh,
    profile,
    batchHours: preferences?.batchHours,
    meetingsOn: preferences?.meetings,
  });
  const [settings, setSettings] = useState<SectionId | null>(null);

  // Questions waiting in the person's own conversations, whichever is open: the sidebar lists them
  // with the office's, so one asked in a conversation left behind is not lost. Null until read
  // once, so what already waited is never taken for news.
  const [asks, setAsks] = useState<ChatAsk[] | null>(null);
  const chatAsks = asks ?? NO_ASKS;
  const asksLoaded = asks !== null;
  const loadAsks = useCallback(async () => {
    const data = (await fetch("/api/me/gate", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as {
      asks?: { id: string; chat?: string; ask: GateAsk }[];
    } | null;
    if (!data) return;
    const next = (data.asks ?? []).flatMap((entry) =>
      entry.chat && !entry.chat.startsWith("office-")
        ? [{ id: entry.id, chat: entry.chat, ask: entry.ask }]
        : [],
    );
    // The same questions keep the same list, so a look every few seconds draws nothing again.
    setAsks((was) =>
      was &&
      was.length === next.length &&
      was.every((entry, index) => entry.id === next[index]?.id)
        ? was
        : next,
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
  const openAsks = chat.openAsks;
  useEffect(() => {
    void openAsks;
    void loadAsks();
  }, [openAsks, loadAsks]);

  /** Answers a question in one of the person's conversations from outside it (the sidebar). */
  const answerChatAsk = useCallback(
    async (id: string, answer: string, always = false) => {
      setAsks((all) => all?.filter((entry) => entry.id !== id) ?? null);
      await fetch("/api/me/gate/answer", {
        method: "POST",
        headers: HEADERS,
        // an answer given as the page goes still arrives
        keepalive: true,
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

  // What waits on the person, worked out once when it changes and read by every screen.
  const turns = useMemo(
    () => yourTurn(office, chatAsks),
    [office.waiting, office.office?.tasks, chatAsks],
  );
  // Answers on their way (their Undo still open): the row answered stays where it was, but what is
  // counted as waiting (the column, the tab's title, the counts) no longer holds it.
  const [answering, setAnswering] = useState<ReadonlySet<string>>(new Set());
  const markAnswering = useCallback(
    (key: string, on: boolean) =>
      setAnswering((all) => {
        if (all.has(key) === on) return all;
        const next = new Set(all);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      }),
    [],
  );
  const toDecide = useMemo(
    () => turns.filter((item) => !answering.has(item.key)),
    [turns, answering],
  );
  /** The requests with a question still waiting on the person, as every list marks them. */
  const tasksToDecide = useMemo(
    () =>
      new Set(
        toDecide.flatMap((item) =>
          item.where.kind === "request" && item.where.task
            ? [item.where.task]
            : [],
        ),
      ),
    [toDecide],
  );

  const joined = Boolean(office.office?.joined);
  const name =
    (joined ? office.office?.me?.card.name : undefined) ??
    (profile.name?.trim() || undefined);

  const app = useMemo(
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
      asksLoaded,
      turns,
      toDecide,
      tasksToDecide,
      answering,
      markAnswering,
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
      asksLoaded,
      turns,
      toDecide,
      tasksToDecide,
      answering,
      markAnswering,
      answerChatAsk,
      mood,
      joined,
      name,
    ],
  );
  return { app, conversation };
}

export type AppState = ReturnType<typeof useAppState>["app"];

const AppContext = createContext<AppState | null>(null);
const ConversationContext = createContext<Turn[]>([]);

export const AppProvider = AppContext.Provider;
export const ConversationProvider = ConversationContext.Provider;

/** The open conversation's turns as they stream in, for its own view alone. */
export function useConversation(): Turn[] {
  return useContext(ConversationContext);
}

/** The app's shared state, for any screen inside the frame. */
export function useApp(): AppState {
  const state = useContext(AppContext);
  if (!state) throw new Error("useApp outside the app's frame");
  return state;
}
