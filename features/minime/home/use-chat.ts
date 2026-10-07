"use client";

// The person's conversations with their clone, as the app keeps them (chat/store.ts): the one open
// on screen, its turns as they stream in (the clone's words, what it kept, the gate's questions),
// the list of past ones, and the calls that go on with them. A conversation outlives the page:
// opening one reads its own record, and an answer still coming after a question is followed.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GateAsk } from "../ask-card";
import { savedText } from "../saved-text";
import { stream } from "../stream";

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

export type Turn =
  | { id: number; kind: "me"; text: string }
  | { id: number; kind: "minime"; text: string; live: boolean }
  | { id: number; kind: "saved"; text: string }
  | { id: number; kind: "note"; text: string }
  | { id: number; kind: "office"; text: string }
  | { id: number; kind: "told"; text: string }
  | { id: number; kind: "meeting"; text: string }
  | { id: number; kind: "flow"; text: string; at: string }
  | {
      id: number;
      kind: "ask";
      gate: string;
      ask: GateAsk;
      state: "open" | "done";
      answer?: string;
    }
  | { id: number; kind: "error"; text: string };

export interface ChatSummary {
  id: string;
  title: string;
  updated: string;
  turns: number;
}

type TurnInput = Turn extends infer T
  ? T extends { id: number }
    ? Omit<T, "id">
    : never
  : never;

export function useChat(lang: string) {
  const t = useTranslations();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  // Something was kept: the clone's face is glad for a moment.
  const [kept, setKept] = useState(0);
  const nextId = useRef(1);

  const push = useCallback((turn: TurnInput) => {
    const id = nextId.current++;
    setTurns((all) => [...all, { ...turn, id } as Turn]);
    if (turn.kind === "saved") setKept((count) => count + 1);
    return id;
  }, []);

  /** Opens one conversation from its own record, with the questions still waiting in it. */
  const openChat = useCallback(async (id: string) => {
    const response = await fetch(`/api/me/chats?id=${encodeURIComponent(id)}`, {
      headers: HEADERS,
    }).catch(() => undefined);
    if (!response?.ok) return;
    const data = (await response.json()) as {
      id: string;
      messages: { role: string; text: string; at: string }[];
    };
    const waiting = (await fetch(
      `/api/me/gate?chat=${encodeURIComponent(id)}`,
      { headers: HEADERS },
    )
      .then((r) => r.json())
      .catch(() => ({ asks: [] }))) as {
      asks: { id: string; ask: GateAsk }[];
    };
    setChatId(data.id);
    setTurns([
      ...data.messages.map((m): Turn => {
        const id = nextId.current++;
        if (m.role === "me") return { id, kind: "me", text: m.text };
        if (m.role === "minime")
          return { id, kind: "minime", text: m.text, live: false };
        if (m.role === "saved") return { id, kind: "saved", text: m.text };
        if (m.role === "office") return { id, kind: "office", text: m.text };
        if (m.role === "told") return { id, kind: "told", text: m.text };
        if (m.role === "meeting") return { id, kind: "meeting", text: m.text };
        if (m.role === "flow")
          return { id, kind: "flow", text: m.text, at: m.at };
        return { id, kind: "error", text: m.text };
      }),
      ...(waiting.asks ?? []).map(
        (pending): Turn => ({
          id: nextId.current++,
          kind: "ask",
          gate: pending.id,
          ask: pending.ask,
          state: "open",
        }),
      ),
    ]);
    return data.messages.length;
  }, []);

  const loadChats = useCallback(
    async (openLatest = false) => {
      const data = (await fetch("/api/me/chats", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => ({ chats: [] }))) as { chats?: ChatSummary[] };
      setChats(data.chats ?? []);
      if (openLatest && data.chats?.[0]) await openChat(data.chats[0].id);
    },
    [openChat],
  );

  useEffect(() => {
    void loadChats(true);
  }, [loadChats]);

  // News from the office or a flow: the open conversation is read again, unless an answer is
  // streaming into it.
  const busyRef = useRef(false);
  busyRef.current = busy;
  const chatRef = useRef(chatId);
  chatRef.current = chatId;
  const refresh = useCallback(() => {
    void loadChats(false);
    if (chatRef.current && !busyRef.current) void openChat(chatRef.current);
  }, [openChat, loadChats]);

  const newChat = useCallback(() => {
    setChatId(undefined);
    setTurns([]);
  }, []);

  /** Asks the clone, and streams its answer, its questions and what it kept into the conversation. */
  const ask = useCallback(
    async (text: string) => {
      if (!text.trim() || busyRef.current) return;
      setBusy(true);
      busyRef.current = true;
      push({ kind: "me", text });
      let reply = push({ kind: "minime", text: "", live: true });
      let note: number | undefined;
      const finishReply = () => {
        const done = reply;
        setTurns((all) =>
          all
            // An answer that had not started when a question came is not shown empty.
            .filter(
              (turn) =>
                !(turn.id === done && turn.kind === "minime" && !turn.text),
            )
            .map((turn) =>
              turn.id === done && turn.kind === "minime"
                ? { ...turn, live: false }
                : turn,
            ),
        );
      };
      try {
        await stream(
          "/api/me/task",
          { text, locale: lang, chat: chatRef.current },
          (event) => {
            if (event.type === "chat") {
              setChatId(String(event.id));
              chatRef.current = String(event.id);
            }
            if (event.type === "ask") {
              // The answer so far stays above the question; what follows goes below it.
              finishReply();
              push({
                kind: "ask",
                gate: String(event.id),
                ask: event.ask as GateAsk,
                state: "open",
              });
              reply = push({ kind: "minime", text: "", live: true });
            }
            if (event.type === "carrying") {
              // Shown above the answer that is still to come.
              note = nextId.current++;
              const id = note;
              const carrying = t("chat.carrying");
              setTurns((all) => {
                const at = all.findIndex((turn) => turn.id === reply);
                const next = [...all];
                next.splice(at < 0 ? next.length : at, 0, {
                  id,
                  kind: "note",
                  text: carrying,
                });
                return next;
              });
            }
            if (event.type === "carried") {
              const carried = t("chat.carried");
              setTurns((all) =>
                all.map((turn) =>
                  turn.id === note ? { ...turn, text: carried } : turn,
                ),
              );
            }
            if (event.type === "text")
              setTurns((all) =>
                all.map((turn) =>
                  turn.id === reply && turn.kind === "minime"
                    ? { ...turn, text: turn.text + String(event.text) }
                    : turn,
                ),
              );
            if (event.type === "done") {
              finishReply();
              setBusy(false);
              busyRef.current = false;
              void loadChats(false);
            }
            if (event.type === "saved") {
              const saved = savedText(event.event as Record<string, unknown>);
              if (saved) push({ kind: "saved", text: saved });
            }
            if (event.type === "error")
              push({
                kind: "error",
                text: String(event.code ?? event.message),
              });
          },
        );
      } catch (error) {
        push({ kind: "error", text: (error as Error).message });
      } finally {
        finishReply();
        setBusy(false);
        busyRef.current = false;
      }
    },
    [lang, push, t, loadChats],
  );

  /** Answers a question from the gate; a conversation opened mid-way is followed until it goes on. */
  const answer = useCallback(
    async (turnId: number, gate: string, reply: string, always: boolean) => {
      const response = await fetch("/api/me/gate/answer", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ id: gate, answer: reply, always }),
      }).catch(() => undefined);
      const gone = t("errors.no-longer-waiting");
      let known = 0;
      setTurns((all) => {
        known = all.filter((turn) => turn.kind !== "ask").length;
        return all.map((turn) =>
          turn.id === turnId && turn.kind === "ask"
            ? { ...turn, state: "done", answer: response?.ok ? reply : gone }
            : turn,
        );
      });
      const chat = chatRef.current;
      if (!response?.ok || busyRef.current || !chat) return;
      // No answer is streaming to this page (it was opened after the question came): look at the
      // conversation's record until the clone's next words are there.
      for (let i = 0; i < 60; i++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        if (chatRef.current !== chat) return;
        const count = await openChat(chat);
        if (count !== undefined && count > known) return;
      }
    },
    [openChat, t],
  );

  const asking = turns.some(
    (turn) => turn.kind === "ask" && turn.state === "open",
  );
  const talking = turns.some((turn) => turn.kind === "minime" && turn.live);
  const title = chats.find((chat) => chat.id === chatId)?.title;

  return {
    turns,
    busy,
    chatId,
    chats,
    title,
    asking,
    talking,
    kept,
    ask,
    answer,
    openChat,
    newChat,
    refresh,
    loadChats,
  };
}

export type Chat = ReturnType<typeof useChat>;
