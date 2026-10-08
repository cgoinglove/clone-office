"use client";

// The person's office as their clone sees it at the relay (app/api/me/office): who is in, the
// requests they are part of, the questions about requests that wait for them, and the calls that
// change any of it. Looked at again every few seconds; a request whose state moved since the last
// look may have put news in a conversation, which `onNews` hears.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RoomData } from "@/features/office/room/office.mjs";
import { describe, type GateAsk } from "../ask-card";
import { dueAt } from "../batch";
import type { LikeMe } from "../office/likeme";
import { roomData, statusCode } from "../office/room-data";

export const HEADERS = {
  "content-type": "application/json",
  "x-clone-office": "1",
};

export type State =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

export interface Card {
  name: string;
  description: string;
  status?: string;
  /** What they look after, that colleagues come to them for. */
  owns?: string[];
  /** The kinds of request they take (A2A skills), from their menu. */
  skills?: { id: string; name: string; description?: string }[];
  /** How to work with them (their ME.md), the lines they added one by one. */
  howToWork?: string[];
}

export type Trust = "auto" | "tell" | "ask";

export interface MenuItem {
  id?: string;
  name: string;
  description: string;
  examples?: string[];
  trust: Trust;
}

export interface Task {
  id: string;
  status: { state: State; timestamp: string };
  history: {
    role: "user" | "agent";
    parts: { text: string }[];
    /** Files that went with it. */
    files?: { id: string; name: string; size: number }[];
    /** by "person": the member's person wrote it themselves, not their clone. */
    metadata?: { from: string; at: string; by?: "person" };
  }[];
  metadata: {
    from: string;
    to: string;
    created: string;
    /** Asked by a link: the one asked, who has no clone. */
    guest?: string;
    /** To the one who made it: the link's path on the relay. */
    link?: string;
  };
}

export interface Member {
  id: string;
  card: Card;
  seen: string;
}

/** A meeting of the office's clones: the standup, or one clone's question to everyone. */
export interface Meeting {
  id: string;
  kind: "standup" | "question";
  topic: string;
  language: string;
  openedBy: string;
  members: string[];
  round: number;
  rounds: number;
  state: "open" | "closed";
  created: string;
  roundEnds: string;
  closed?: string;
  /** What each clone said in each round; an empty text is a pass. Round 0 is the question asked. */
  posts: {
    id: string;
    from: string;
    round: number;
    replyTo?: string;
    text: string;
    at: string;
  }[];
}

/** When the office's clones hold their standup, in the time zone of who set it. */
export interface StandupTime {
  days: number[];
  time: string;
  zone: string;
}

export interface Office {
  joined: boolean;
  /** An invite the launcher kept for joining, while the person is in no office. */
  invite?: { link: string; from?: string };
  /** The relay's address as others reach it, for the links it makes. */
  relay?: string;
  /** The office is open on this computer: where teammates reach it, and what keeps it from opening. */
  here?: { relay: string; network: boolean; problem?: string };
  me?: { id: string; card: Card };
  /** The person's own menu, with how much their clone does alone for each kind. */
  menu?: MenuItem[];
  /** Of the answers the person saw first lately, how many they sent as they were. */
  likeMe?: LikeMe;
  members?: Member[];
  tasks?: Task[];
  asks?: { id: string; chat?: string; ask: GateAsk }[];
  /** The office's latest meetings of the clones, newest first. */
  meetings?: Meeting[];
  /** The standup's time, if the office set one. */
  standup?: StandupTime | null;
  /** The person lets their clone take part in meetings. */
  meetingsOn?: boolean;
  /** The conversation each meeting was brought back into, by meeting. */
  meetingChats?: Record<string, string>;
  /** Questions about requests kept for the person: answering one lets the request go on. */
  later?: {
    id: string;
    task: string;
    from?: string;
    at: string;
    ask: GateAsk;
    /** The person's to answer themselves: what they write goes as their own words. */
    self?: boolean;
  }[];
  /** Requests colleagues sent that the person stepped into, by request. */
  steps?: Record<string, Steps>;
  problem?: string;
}

/** One thing the person told their clone about a request; until it is read, it can be taken back. */
export interface StepIn {
  id: string;
  text: string;
  at: string;
  read?: string;
}

/** The person's part in a request a colleague sent: their notes to the clone, or answering it. */
export interface Steps {
  /** Since when they answer it themselves. */
  person?: string;
  notes: StepIn[];
}

/** A question about a request, live at the gate or kept for later. */
export type Waiting = {
  id: string;
  ask: GateAsk;
  chat?: string;
  /** Kept for later: answering it lets its request go on. */
  later?: boolean;
  /** When it was kept, for a kept one. */
  at?: string;
  from?: string;
  /** The request a kept one belongs to. */
  task?: string;
  /** The person's to answer themselves: what they write goes as their own words. */
  self?: boolean;
};

/** What the person told the app about themselves; their clone starts every session with it. */
export interface Profile {
  name?: string;
  role?: string;
  /** What they look after, that colleagues come to them for. */
  owns?: string[];
  /** The tools they work in every day. */
  tools?: string[];
}

/** A list typed on one line, split on commas in any script. */
export function splitList(text: string): string[] {
  return text
    .split(/[,，、;；\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const sizeText = (bytes: number) =>
  bytes < 1024
    ? `${bytes} B`
    : bytes < 1024 * 1024
      ? `${Math.round(bytes / 1024)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** The largest file that goes with a request, as the relay keeps by default. */
export const FILE_BYTES = 25 * 1024 * 1024;

/** Puts a picked file at the relay; its id, or the problem in a code. */
export async function upload(file: File): Promise<string | { error: string }> {
  const response = await fetch("/api/me/office/upload", {
    method: "POST",
    headers: {
      "x-clone-office": "1",
      "content-type": file.type || "application/octet-stream",
      "x-file-name": encodeURIComponent(file.name),
    },
    body: file,
  }).catch(() => undefined);
  const data = (await response?.json().catch(() => ({}))) as {
    file?: { id: string };
    error?: string;
  };
  return data?.file?.id ?? { error: data?.error ?? "relay-unreachable" };
}

/** Saves a file that went with a request, as the browser saves a download. */
export async function saveFile(
  task: string,
  file: { id: string; name: string },
) {
  const response = await fetch(
    `/api/me/office/file?task=${encodeURIComponent(task)}&id=${encodeURIComponent(file.id)}`,
    { headers: HEADERS },
  ).catch(() => undefined);
  if (!response?.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

type OfficeWords = ReturnType<typeof useTranslations<"office">>;

export function statusText(t: OfficeWords, status: string | undefined): string {
  const code = statusCode(status);
  return code ? t(`status.${code}`) : (status ?? "");
}

/** The id the viewer's own desk takes while they are in no office. */
export const SOLO_ID = "me";

export function useOffice(
  lang: string,
  {
    onNews,
    profile,
    batchHours,
    meetingsOn,
  }: {
    onNews?: () => void;
    profile?: Profile;
    /** The day's moments questions kept for later come at (Settings › Preferences). */
    batchHours?: number[];
    /** The person lets their clone take part in meetings (unknown until read). */
    meetingsOn?: boolean;
  } = {},
) {
  const tAsk = useTranslations("ask");
  const tHome = useTranslations("home");
  const [office, setOffice] = useState<Office | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const news = useRef(onNews);
  news.current = onNews;

  const seen = useRef(new Map<string, string>());
  const looked = useRef(false);
  const load = useCallback(async () => {
    const data = (await fetch(
      `/api/me/office?locale=${encodeURIComponent(lang)}`,
      { headers: HEADERS },
    )
      .then((r) => r.json())
      .catch(() => null)) as Office | null;
    if (!data) return;
    setOffice(data);
    // A request whose state moved since the last look, or one first seen already answered (sent
    // and answered between two looks): its answer may be in a conversation.
    let fresh = false;
    for (const task of data.tasks ?? []) {
      const before = seen.current.get(task.id);
      if (before !== undefined && before !== task.status.state) fresh = true;
      if (
        before === undefined &&
        looked.current &&
        task.status.state !== "SUBMITTED" &&
        task.status.state !== "WORKING"
      )
        fresh = true;
      seen.current.set(task.id, task.status.state);
    }
    looked.current = true;
    if (fresh) news.current?.();
  }, [lang]);

  useEffect(() => {
    void load();
  }, [load]);

  // Looked at every few seconds while the page is in view, less often while it is hidden.
  useEffect(() => {
    if (!office?.joined) return;
    // A look still on its way when the screen goes is not followed by another.
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (!live) return;
      timer = setTimeout(
        () => void load().finally(tick),
        document.visibilityState === "visible" ? 5000 : 20_000,
      );
    };
    tick();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [office?.joined, load]);

  const post = useCallback(
    async (body: unknown) => {
      setBusy(true);
      setError(null);
      try {
        const response = await fetch("/api/me/office", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify(body),
        }).catch(() => undefined);
        const data = await response?.json().catch(() => ({}));
        if (!response?.ok)
          setError(
            String(data?.error ?? response?.status ?? "relay-unreachable"),
          );
        await load();
        return Boolean(response?.ok);
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const waiting: Waiting[] = useMemo(
    () =>
      [
        ...(office?.asks ?? []),
        ...(office?.later ?? []).map((entry) => ({ ...entry, later: true })),
      ].filter((a) => !answered[a.id]),
    [office, answered],
  );
  // Questions kept for later call the person only at the day's batch moments; the list shows
  // them all the same.
  const due = waiting.filter(
    (a) =>
      !a.later ||
      !a.at ||
      Date.now() >= dueAt(new Date(a.at), batchHours).getTime(),
  );

  /** Answers a question about a request: a kept one lets its request go on, a live one the gate. */
  const answer = useCallback(
    async (pending: Waiting, reply: string, always: boolean) => {
      setAnswered((all) => ({ ...all, [pending.id]: reply }));
      if (pending.later)
        await post({ action: "later", id: pending.id, answer: reply });
      else
        await fetch("/api/me/gate/answer", {
          method: "POST",
          headers: HEADERS,
          body: JSON.stringify({ id: pending.id, answer: reply, always }),
        }).catch(() => undefined);
      await load();
    },
    [post, load],
  );

  const first = due[0]?.ask;
  const line = !first
    ? undefined
    : first.kind === "question"
      ? first.question
      : first.kind === "permission"
        ? `${tAsk("mayI")} ${describe(tAsk, first.tool, first.input)}`
        : tAsk("rule", { menu: first.menu });

  const you = tHome("you");
  const room: RoomData | null = useMemo(() => {
    if (!office) return null;
    if (office.joined)
      return roomData(
        office,
        due.length,
        line,
        Date.now(),
        meetingsOn === false,
      );
    // In no office yet: the person's own desk, and their clone at it.
    return {
      people: [
        {
          id: SOLO_ID,
          name: profile?.name?.trim() || you,
          role: profile?.role?.trim() || undefined,
          mine: true,
          status: "active",
        },
      ],
      requests: [],
      waiting: { count: due.length, ...(line ? { text: line } : {}) },
    };
  }, [office, due.length, line, profile?.name, profile?.role, you, meetingsOn]);

  const members = office?.members ?? [];
  const names = useMemo(
    () => new Map(members.map((m) => [m.id, m.card.name])),
    [members],
  );
  const others = members.filter((m) => m.id !== office?.me?.id);

  return {
    office,
    error,
    setError,
    busy,
    load,
    post,
    waiting,
    due,
    answer,
    answered,
    room,
    names,
    others,
  };
}

export type OfficeState = ReturnType<typeof useOffice>;
