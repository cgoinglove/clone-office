"use client";

// The first time with a mini-me, as a conversation (layout A, chosen 10/5). It says what it will
// read, keep and not keep, lets the person leave folders out, and learns in the background while
// saying what it is doing and roughly how far along it is. The person can also bring what their
// usual AI remembers about them, the way Claude's memory import works (copy a prompt there, paste
// the answer here). It then shows its memory exactly as saved, each entry correctable or
// removable, and offers three things to do together right away. The learning runs on the server,
// so a reload attaches to it instead of starting over.

import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/ui/markdown";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { Bot, type Mood } from "@/features/office";
import { personTag, useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { AskCard, type GateAsk } from "./ask-card";
import { BrainPanel } from "./brain-panel";
import { ConnectorsPanel } from "./connectors-panel";
import { whenText } from "./flows/when-text";
import { FlowsPanel } from "./flows-panel";
import { LanguageSwitch } from "./language-switch";
import { EXPORT_PROMPT } from "./learn/export-prompt";
import { MessengerPanel } from "./messenger-panel";
import { OfficePanel } from "./office-panel";
import { type Routine, routineNow } from "./routine";
import { savedText } from "./saved-text";
import { TrustPanel } from "./trust-panel";
import { usePresence } from "./use-presence";

const PLAN = ["read", "keep", "skip", "time"] as const;

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

/** Read a route's one-JSON-per-line answer as it arrives. */
async function stream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at = buffer.indexOf("\n");
    while (at !== -1) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {
          // A partial or foreign line; skip it.
        }
      }
      at = buffer.indexOf("\n");
    }
  }
}

interface Folder {
  path: string;
  name: string;
  sessions: number;
  excluded: boolean;
}

/** Something kept out that is not one of the recent folders: a folder, or a name pattern. */
interface LeftOut {
  pattern: string;
  name: string;
}

interface Source {
  id: string;
  label: string;
  items: number;
}

interface Progress {
  phase: "index" | "read" | "learn";
  percent: number;
  source?: string;
}

interface Memory {
  user: string[];
  memory: string[];
  skills: number;
  notes: number;
  dir: string;
}

type Entry = { target: "user" | "memory"; text: string };

type Turn =
  | { id: number; kind: "me"; text: string }
  | { id: number; kind: "minime"; text: string; live: boolean }
  | { id: number; kind: "saved"; text: string }
  | { id: number; kind: "note"; text: string }
  | { id: number; kind: "office"; text: string }
  | { id: number; kind: "told"; text: string }
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

interface ChatSummary {
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

export function FirstRun() {
  // The screen's words come from messages/<language>.json (i18n/); the mini-me is told the
  // language the person picked, else their browser's own, whatever it is, and keeps what it
  // learns in it.
  const t = useTranslations();
  const problemText = useProblem();
  const format = useFormatter();
  const tFlows = useTranslations("flows");
  const locale = useLocale();
  // While the person looks at this page, what waits on them is shown here, not sent to their phone.
  usePresence();
  const [lang, setLang] = useState("en");
  // The mini-me's language follows the one picked for the screen, as soon as it is picked.
  useEffect(() => {
    if (locale) setLang(personTag());
  }, [locale]);
  const [stage, setStage] = useState<"boot" | "intro" | "learning" | "known">(
    "boot",
  );
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [adding, setAdding] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [tasks, setTasks] = useState<{ label: string; why: string }[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  // A routine set aside for today, so "Not now" is not asked again until tomorrow.
  const [setAside, setSetAside] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [importing, setImporting] = useState(false);
  // Starting over, once asked: it moves what is kept into a backup, or clears it when it only came
  // from a reading (nothing of theirs to keep).
  const [sureOver, setSureOver] = useState<false | "backup" | "clear">(false);
  const [listening, setListening] = useState(false);
  const [officeWaiting, setOfficeWaiting] = useState(0);
  const [cheer, setCheer] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>(undefined);
  const [freshOffer, setFreshOffer] = useState(0);
  // The memory is open on its own until a conversation is on screen; the person can open or fold it.
  const [memoryOpen, setMemoryOpen] = useState<boolean | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const nextId = useRef(1);
  const bottom = useRef<HTMLDivElement>(null);

  const push = useCallback((turn: TurnInput) => {
    const id = nextId.current++;
    setTurns((all) => [...all, { ...turn, id } as Turn]);
    return id;
  }, []);

  /** Open one conversation from its own record. */
  const openChat = useCallback(async (id: string) => {
    const response = await fetch(`/api/me/chats?id=${encodeURIComponent(id)}`, {
      headers: HEADERS,
    });
    if (!response.ok) return;
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
        if (m.role === "flow")
          return { id, kind: "flow", text: m.text, at: m.at };
        return { id, kind: "error", text: m.text };
      }),
      ...waiting.asks.map(
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
    async (openLatest: boolean) => {
      const data = (await fetch("/api/me/chats", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => ({ chats: [] }))) as { chats: ChatSummary[] };
      setChats(data.chats ?? []);
      if (openLatest && data.chats?.[0]) await openChat(data.chats[0].id);
    },
    [openChat],
  );

  // News from the office: the open conversation is read again, unless an answer is coming in.
  const busyRef = useRef(false);
  busyRef.current = busy;
  const chatRef = useRef(chatId);
  chatRef.current = chatId;
  const refreshChat = useCallback(() => {
    if (chatRef.current && !busyRef.current) void openChat(chatRef.current);
  }, [openChat]);

  const newChat = () => {
    setChatId(undefined);
    setTurns([]);
  };

  const loadMemory = useCallback(
    () =>
      fetch("/api/me/memory", { headers: HEADERS })
        .then((r) => r.json())
        .then((data: Memory) => setMemory(data))
        .catch(() => {}),
    [],
  );

  // The first time, no folders at all means there are no AI records here: bringing what another
  // AI knows is then the way to start.
  const loadFolders = useCallback(
    (first = false) =>
      fetch("/api/me/sources", { headers: HEADERS })
        .then((r) => r.json())
        .then(
          (data: {
            folders: Folder[];
            exclude: string[];
            others?: LeftOut[];
          }) => {
            setFolders(data.folders);
            setExcludes(data.exclude);
            setOthers(data.others ?? []);
            if (first && data.folders.length === 0) setImporting(true);
          },
        )
        .catch(() => setFolders([])),
    [],
  );

  const onLearnEvent = useCallback(
    (event: Record<string, unknown>) => {
      switch (event.type) {
        case "idle":
          setStage("intro");
          break;
        case "progress":
          setStage("learning");
          setProgress(event as unknown as Progress);
          break;
        case "material":
          setSources(event.sources as Source[]);
          break;
        case "saved": {
          const text = savedText(event.event as Record<string, unknown>);
          if (text) setLearned((all) => [...all, text]);
          break;
        }
        case "done": {
          // Offer to read again when the last reading is half a day old and enough is new.
          const fresh = Number(event.fresh ?? 0);
          const age = Date.now() - Date.parse(String(event.at));
          setFreshOffer(fresh >= 3 && age > 12 * 60 * 60 * 1000 ? fresh : 0);
          setFresh((all) => [...all, ...((event.kept as string[]) ?? [])]);
          setTasks(event.tasks as { label: string; why: string }[]);
          setRoutines((event.routines as Routine[] | undefined) ?? []);
          void loadMemory();
          setStage("known");
          break;
        }
        case "error":
          setProblem(String(event.code ?? event.message));
          setStage("intro");
          break;
      }
    },
    [loadMemory],
  );

  const followLearn = useCallback(
    (signal?: AbortSignal) =>
      stream("/api/me/learn", undefined, onLearnEvent, signal).catch(
        (error: Error) => {
          if (error.name !== "AbortError") setProblem(error.message);
        },
      ),
    [onLearnEvent],
  );

  useEffect(() => {
    const controller = new AbortController();
    void followLearn(controller.signal);
    void loadFolders(true);
    void loadMemory();
    void loadChats(true);
    return () => controller.abort();
  }, [followLearn, loadFolders, loadMemory, loadChats]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [turns, stage, learned.length]);

  // The bot hops for a moment whenever something is kept.
  const keptCount =
    learned.length + turns.filter((t) => t.kind === "saved").length;
  useEffect(() => {
    if (!keptCount) return;
    setCheer(true);
    const timer = setTimeout(() => setCheer(false), 2400);
    return () => clearTimeout(timer);
  }, [keptCount]);

  // A pattern can keep several folders out at once, so the list is read again after each change.
  const saveExcludes = async (next: string[]) => {
    setExcludes(next);
    await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    }).catch(() => {});
    await loadFolders();
  };

  const toggle = async (folder: Folder) => {
    setFolders(
      (all) =>
        all?.map((f) =>
          f.path === folder.path ? { ...f, excluded: !f.excluded } : f,
        ) ?? null,
    );
    await saveExcludes(
      folder.excluded
        ? excludes.filter((p) => p !== folder.path)
        : [...excludes, folder.path],
    );
  };

  const start = async () => {
    setFreshOffer(0);
    setProblem(null);
    setLearned([]);
    setSources([]);
    setStage("learning");
    setProgress({ phase: "index", percent: 1 });
    const response = await fetch("/api/me/learn", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ locale: lang }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setProblem(String(data.error ?? response.status));
      setStage("intro");
      return;
    }
    void followLearn();
  };

  const startOver = async () => {
    setSureOver(false);
    const response = await fetch("/api/me/reset", {
      method: "POST",
      headers: HEADERS,
    });
    if (!response.ok) {
      setProblem(String(response.status));
      return;
    }
    setChatId(undefined);
    setChats([]);
    setTurns([]);
    setTasks([]);
    setLearned([]);
    setSources([]);
    setFresh([]);
    setProgress(null);
    setProblem(null);
    setImporting(false);
    setStage("intro");
    void loadMemory();
    void loadFolders(true);
  };

  const onImported = (kept: string[], saved: string[]) => {
    setFresh((all) => [...all, ...kept]);
    setLearned((all) => [...all, ...saved]);
    void loadMemory();
  };

  const fixEntry = async (entry: Entry, fix: string) => {
    const reply = push({ kind: "minime", text: "", live: true });
    try {
      await stream(
        "/api/me/fix",
        { line: entry.text, fix, locale: lang },
        (event) => {
          if (event.type === "text")
            setTurns((all) =>
              all.map((t) =>
                t.id === reply && t.kind === "minime"
                  ? { ...t, text: t.text + String(event.text) }
                  : t,
              ),
            );
          if (event.type === "saved") {
            const text = savedText(event.event as Record<string, unknown>);
            if (text) push({ kind: "saved", text });
          }
        },
      );
    } catch (error) {
      push({ kind: "error", text: (error as Error).message });
    } finally {
      setTurns((all) =>
        all.map((t) =>
          t.id === reply && t.kind === "minime" ? { ...t, live: false } : t,
        ),
      );
      await loadMemory();
    }
  };

  const removeEntry = async (entry: Entry) => {
    const response = await fetch("/api/me/memory", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({
        remove: { target: entry.target, entry: entry.text },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setMemory(data as Memory);
    else setProblem(String(data.error ?? response.status));
  };

  const ask = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setDraft("");
    push({ kind: "me", text });
    let reply = push({ kind: "minime", text: "", live: true });
    let note: number | undefined;
    const finishReply = () => {
      const done = reply;
      setTurns((all) =>
        all
          // An answer that had not started when a question came is not shown empty.
          .filter((t) => !(t.id === done && t.kind === "minime" && !t.text))
          .map((t) =>
            t.id === done && t.kind === "minime" ? { ...t, live: false } : t,
          ),
      );
    };
    try {
      await stream(
        "/api/me/task",
        { text, locale: lang, chat: chatId },
        (event) => {
          if (event.type === "chat") setChatId(String(event.id));
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
            setTurns((all) => {
              const at = all.findIndex((t) => t.id === reply);
              const next = [...all];
              next.splice(at, 0, {
                id,
                kind: "note",
                text: t("chat.carrying"),
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
              all.map((t) =>
                t.id === reply && t.kind === "minime"
                  ? { ...t, text: t.text + String(event.text) }
                  : t,
              ),
            );
          if (event.type === "done") {
            finishReply();
            setBusy(false);
            void loadChats(false);
          }
          if (event.type === "saved") {
            const saved = savedText(event.event as Record<string, unknown>);
            if (saved) push({ kind: "saved", text: saved });
          }
          if (event.type === "reviewed") void loadMemory();
          if (event.type === "error")
            push({ kind: "error", text: String(event.code ?? event.message) });
        },
      );
    } catch (error) {
      push({ kind: "error", text: (error as Error).message });
    } finally {
      finishReply();
      setBusy(false);
    }
  };

  /** Answer a question from the gate; a conversation opened mid-way is followed until it goes on. */
  const answerGate = async (
    turnId: number,
    gate: string,
    answer: string,
    always: boolean,
  ) => {
    const response = await fetch("/api/me/gate/answer", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ id: gate, answer, always }),
    });
    const gone = t("errors.no-longer-waiting");
    setTurns((all) =>
      all.map((turn) =>
        turn.id === turnId && turn.kind === "ask"
          ? { ...turn, state: "done", answer: response.ok ? answer : gone }
          : turn,
      ),
    );
    if (!response.ok || busy || !chatId) return;
    // No answer is streaming to this page (it was opened after the question came): look at the
    // conversation's record until the mini-me's next words are there.
    const known = turns.filter((t) => t.kind !== "ask").length;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const count = await openChat(chatId);
      if (count !== undefined && count > known) return;
    }
  };

  const today = new Date().toDateString();
  useEffect(() => {
    try {
      setSetAside(localStorage.getItem("minime-routine-set-aside"));
    } catch {
      // No storage here: a routine is offered every time.
    }
  }, []);
  const routine = routineNow(routines);
  const routineKey = routine ? `${routine.label}|${today}` : "";
  const putAside = () => {
    setSetAside(routineKey);
    try {
      localStorage.setItem("minime-routine-set-aside", routineKey);
    } catch {
      // Kept for this page only.
    }
  };

  const asking =
    officeWaiting > 0 ||
    turns.some((t) => t.kind === "ask" && t.state === "open");
  const talking = turns.some((t) => t.kind === "minime" && t.live);
  const mood: Mood = problem
    ? "surprised"
    : asking
      ? "asking"
      : cheer
        ? "happy"
        : stage === "learning"
          ? "working"
          : listening
            ? "listening"
            : talking
              ? "talk"
              : sureOver
                ? "asking"
                : "idle";

  const source = `firstRun.source.${progress?.source}` as const;
  const label = progress
    ? progress.phase === "read" && progress.source && t.has(source as never)
      ? t(source as never)
      : t(`firstRun.phase.${progress.phase}`)
    : "";

  const entries: Entry[] = memory
    ? [
        ...memory.user.map((text) => ({ target: "user" as const, text })),
        ...memory.memory.map((text) => ({ target: "memory" as const, text })),
      ]
    : [];
  // After learning, or as soon as there is something kept (brought from another AI before any
  // reading), the memory is shown and the person can talk to their mini-me.
  const showMemory =
    stage === "known" || (stage === "intro" && entries.length > 0);

  return (
    <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-1 flex-col gap-4 px-4 py-8">
      <header className="flex items-end gap-3">
        <Bot
          size={56}
          mood={mood}
          mine={asking}
          label={t("firstRun.title")}
          className="shrink-0"
        />
        <Bubble variant="secondary">
          <BubbleContent className="text-[15px]">
            {t("firstRun.hello")}
          </BubbleContent>
        </Bubble>
      </header>

      {stage === "intro" && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            {PLAN.map((part) => (
              <div key={part} className="contents">
                <dt className="font-medium">
                  {t(`firstRun.plan.${part}.title`)}
                </dt>
                <dd className="mb-1 text-muted-foreground sm:mb-0">
                  {t(`firstRun.plan.${part}.body`)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {folders?.length === 0
              ? t("firstRun.noFolders")
              : t("firstRun.folders")}
          </p>
          {folders && (folders.length > 0 || others.length > 0) && (
            <FolderList
              folders={folders}
              others={others}
              excludes={excludes}
              onToggle={(folder) => void toggle(folder)}
              onBringBack={(pattern) =>
                void saveExcludes(excludes.filter((p) => p !== pattern))
              }
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void start()}>{t("firstRun.start")}</Button>
            {!importing && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                {t("import.open")}
              </Button>
            )}
          </div>
        </div>
      )}

      {problem && (
        <Bubble variant="destructive">
          <BubbleContent className="text-[15px]">
            {problemText(problem)}
          </BubbleContent>
        </Bubble>
      )}

      {stage === "learning" && progress && (
        <Bubble variant="secondary">
          <BubbleContent className="flex flex-col gap-2 text-[15px]">
            <span>
              <ShinyText text={label} />
              <span className="ml-2 text-muted-foreground tabular-nums">
                {progress.percent}%
              </span>
            </span>
            <span className="block h-1 w-48 overflow-hidden rounded bg-muted">
              <span
                className="block h-full bg-brand transition-[width] duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </span>
          </BubbleContent>
        </Bubble>
      )}

      {(stage === "learning" || stage === "known") &&
        sources.some((s) => s.items > 0) && (
          <div className="rounded-lg border border-border px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {t("firstRun.read")}:{" "}
            </span>
            {sources
              .filter((s) => s.items > 0)
              .map((s) => {
                const key = `firstRun.sourceLabel.${s.id}`;
                return `${t.has(key as never) ? t(key as never) : s.label} ${s.items}`;
              })
              .join(" · ")}
          </div>
        )}

      {stage === "learning" &&
        learned.map((text, i) => (
          <span
            key={`${i}-${text}`}
            className="self-start rounded-md bg-muted px-2 py-1 text-xs"
          >
            💾 {t("firstRun.saved")}: {text}
          </span>
        ))}

      {showMemory && (
        <Bubble variant="secondary" className="max-w-full">
          <BubbleContent className="flex flex-col gap-3 text-[15px]">
            <button
              type="button"
              className="flex items-center justify-between gap-2 text-left"
              aria-expanded={memoryOpen ?? turns.length === 0}
              onClick={() => setMemoryOpen(!(memoryOpen ?? turns.length === 0))}
            >
              <b>{t("memory.title")}</b>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t("memory.lines", { count: entries.length })}{" "}
                {(memoryOpen ?? turns.length === 0) ? "▴" : "▾"}
              </span>
            </button>
            {(memoryOpen ?? turns.length === 0) &&
              memory &&
              entries.length === 0 && <p>{t("memory.none")}</p>}
            {(memoryOpen ?? turns.length === 0) && entries.length > 0 && (
              <ol className="flex flex-col gap-2">
                {entries.map((entry, i) => (
                  <MemoryRow
                    key={`${entry.target}-${entry.text}`}
                    index={i}
                    entry={entry}
                    isNew={fresh.includes(entry.text)}
                    onFix={(fix) => fixEntry(entry, fix)}
                    onRemove={() => removeEntry(entry)}
                  />
                ))}
              </ol>
            )}
            {(memoryOpen ?? turns.length === 0) && memory && (
              <p className="text-xs text-muted-foreground">
                {t("memory.where", { dir: memory.dir })}
              </p>
            )}
          </BubbleContent>
        </Bubble>
      )}

      {/* One place for the import in every stage, so what it did stays on screen when the stage changes. */}
      {stage !== "boot" &&
        (importing ? (
          <ImportCard
            onWorking={setListening}
            lang={lang}
            onClose={() => setImporting(false)}
            onImported={onImported}
          />
        ) : (
          stage === "learning" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0">{t("import.while")}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImporting(true)}
              >
                {t("import.open")}
              </Button>
            </div>
          )
        ))}

      {stage === "known" && freshOffer > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
          <span className="min-w-0">
            {t("firstRun.freshOffer", { count: freshOffer })}
          </span>
          <Button size="sm" variant="outline" onClick={() => void start()}>
            {t("firstRun.freshRead")}
          </Button>
        </div>
      )}

      {showMemory && (
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {chats.find((c) => c.id === chatId)?.title ?? t("chat.newChat")}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || turns.length === 0}
              onClick={newChat}
            >
              {t("chat.newChat")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="ghost" disabled={busy}>
                    {t("chat.pastChats")}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  {chats.length === 0 && (
                    <DropdownMenuLabel>{t("chat.noChats")}</DropdownMenuLabel>
                  )}
                  {chats.map((chat) => (
                    <DropdownMenuItem
                      key={chat.id}
                      onClick={() => void openChat(chat.id)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{chat.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {format.dateTime(new Date(chat.updated), {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {t("chat.turns", { count: chat.turns })}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {showMemory && tasks.length > 0 && turns.length === 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            {t("firstRun.tryNow")}
          </p>
          <div className="flex flex-col gap-2">
            {tasks.map((task) => (
              <Button
                key={task.label}
                variant="outline"
                className="h-auto justify-start py-2 text-left whitespace-normal"
                disabled={busy}
                onClick={() => void ask(task.label)}
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span>{task.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {task.why}
                  </span>
                </span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {turns.map((turn) => {
        if (turn.kind === "me")
          return (
            <Bubble key={turn.id} align="end">
              <BubbleContent className="text-[15px]">{turn.text}</BubbleContent>
            </Bubble>
          );
        // While a question waits for the person, the mini-me is not thinking: no empty bubble.
        if (turn.kind === "minime" && turn.live && !turn.text && asking)
          return null;
        if (turn.kind === "minime")
          return (
            <Bubble key={turn.id} variant="secondary" className="max-w-full">
              <BubbleContent className="text-[15px]">
                {turn.text ? (
                  <Markdown>{turn.text}</Markdown>
                ) : (
                  <ShinyText text="…" />
                )}
              </BubbleContent>
            </Bubble>
          );
        if (turn.kind === "ask")
          return (
            <AskCard
              key={turn.id}
              turn={turn}
              onAnswer={(answer, always) =>
                void answerGate(turn.id, turn.gate, answer, always)
              }
            />
          );
        if (turn.kind === "office")
          return (
            <Bubble key={turn.id} variant="outline" className="max-w-full">
              <BubbleContent className="text-[15px]">
                <span className="block text-xs text-muted-foreground">
                  {t("chat.fromColleague")}
                </span>
                <span className="whitespace-pre-wrap">{turn.text}</span>
              </BubbleContent>
            </Bubble>
          );
        // What the mini-me answered a colleague for the person ("do it and tell me").
        if (turn.kind === "told")
          return (
            <Bubble key={turn.id} variant="secondary" className="max-w-full">
              <BubbleContent className="text-[15px]">
                <span className="block text-xs text-muted-foreground">
                  {t("chat.told")}
                </span>
                <span className="whitespace-pre-wrap">{turn.text}</span>
              </BubbleContent>
            </Bubble>
          );
        // One of the person's flows ran here on its own; its answer follows.
        if (turn.kind === "flow")
          return (
            <p
              key={turn.id}
              className="self-center text-center text-xs text-muted-foreground"
            >
              ⏰{" "}
              {t("chat.flowRan", {
                name: turn.text,
                at: format.dateTime(new Date(turn.at), {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }),
              })}
            </p>
          );
        if (turn.kind === "note")
          return (
            <p
              key={turn.id}
              className="self-center text-center text-xs text-muted-foreground"
            >
              {turn.text}
            </p>
          );
        if (turn.kind === "saved")
          return (
            <span
              key={turn.id}
              className="self-start rounded-md bg-muted px-2 py-1 text-xs"
            >
              💾 {t("firstRun.saved")}: {turn.text}
            </span>
          );
        // Errors are kept as their codes and read in the screen's language.
        return (
          <Bubble key={turn.id} variant="destructive">
            <BubbleContent className="text-[15px]">
              {problemText(turn.text)}
            </BubbleContent>
          </Bubble>
        );
      })}

      {stage === "known" && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => void start()}
            >
              {t("firstRun.again")}
            </Button>
            {!importing && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setImporting(true)}
              >
                {t("import.open")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              aria-expanded={foldersOpen}
              onClick={() => {
                if (!foldersOpen) void loadFolders();
                setFoldersOpen(!foldersOpen);
              }}
            >
              {t("firstRun.foldersOpen")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() =>
                void fetch("/api/me/reset", { headers: HEADERS })
                  .then((r) => r.json())
                  .then((data) =>
                    setSureOver(data?.onlyRead ? "clear" : "backup"),
                  )
                  .catch(() => setSureOver("backup"))
              }
            >
              {t("firstRun.startOver")}
            </Button>
          </div>
          {foldersOpen && (
            <div className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                {t("firstRun.foldersNote")}
              </p>
              {folders && (folders.length > 0 || others.length > 0) && (
                <FolderList
                  folders={folders}
                  others={others}
                  excludes={excludes}
                  onToggle={(folder) => void toggle(folder)}
                  onBringBack={(pattern) =>
                    void saveExcludes(excludes.filter((p) => p !== pattern))
                  }
                />
              )}
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = adding.trim();
                  if (!value) return;
                  setAdding("");
                  // A folder from the list is kept out by its path, so its own row switches.
                  const listed = folders?.find(
                    (f) => f.name === value || f.path === value,
                  );
                  void saveExcludes([
                    ...excludes,
                    listed ? listed.path : value,
                  ]);
                }}
              >
                <Input
                  value={adding}
                  onChange={(event) => setAdding(event.target.value)}
                  placeholder={t("firstRun.folderPlaceholder")}
                  aria-label={t("firstRun.folderPlaceholder")}
                />
                <Button
                  size="sm"
                  type="submit"
                  variant="outline"
                  disabled={!adding.trim()}
                >
                  {t("firstRun.leaveOut")}
                </Button>
              </form>
            </div>
          )}
          {sureOver && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                {sureOver === "clear"
                  ? t("firstRun.startOverClear")
                  : t("firstRun.startOverSure")}
              </span>
              <Button size="sm" onClick={() => void startOver()}>
                {t("firstRun.startOverYes")}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSureOver(false)}
              >
                {t("common.cancel")}
              </Button>
            </div>
          )}
        </div>
      )}

      {showMemory && routine && setAside !== routineKey && !busy && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
          <span className="min-w-0">
            <span className="text-muted-foreground">
              {t("firstRun.routineNow")}
            </span>{" "}
            <b>{routine.label}</b>
          </span>
          <div className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => void ask(routine.label)}>
              {t("firstRun.routineDo")}
            </Button>
            {/* Every time: the mini-me makes it a flow, after a card. */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                putAside();
                void ask(
                  t("firstRun.routineFlowAsk", {
                    label: routine.label,
                    when: whenText(tFlows, format, {
                      kind: "weekly",
                      days: routine.days,
                      time: `${routine.hour}:00`,
                    }),
                  }),
                );
              }}
            >
              {t("firstRun.routineFlow")}
            </Button>
            <Button size="sm" variant="ghost" onClick={putAside}>
              {t("firstRun.routineLater")}
            </Button>
          </div>
        </div>
      )}

      {showMemory && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <Textarea
            id="minime-ask"
            value={draft}
            placeholder={t("chat.placeholder")}
            className="min-h-11 flex-1"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void ask(draft);
              }
            }}
          />
          <Button type="submit" disabled={busy || !draft.trim()} loading={busy}>
            {t("common.send")}
          </Button>
        </form>
      )}
      {stage !== "boot" && (
        <OfficePanel
          lang={lang}
          onWaiting={setOfficeWaiting}
          onNews={refreshChat}
        />
      )}
      {stage !== "boot" && (
        <FlowsPanel
          onOpenChat={(id) => void openChat(id)}
          onNews={refreshChat}
          onAsk={(text) => void ask(text)}
        />
      )}
      {stage !== "boot" && <BrainPanel />}
      {stage !== "boot" && <MessengerPanel />}
      {stage !== "boot" && <ConnectorsPanel />}
      {stage !== "boot" && <TrustPanel />}
      {stage !== "boot" && <StoredFiles />}
      {stage !== "boot" && <LanguageSwitch />}
      <div ref={bottom} />
    </div>
  );
}

/**
 * Bringing what another AI remembers, in Claude's two steps: copy the prompt into a chat with that
 * AI, paste its answer back. Only what lasts is kept; the pasted text is not stored.
 */
function ImportCard({
  onWorking,
  lang,
  onClose,
  onImported,
}: {
  onWorking: (working: boolean) => void;
  lang: string;
  onClose: () => void;
  onImported: (kept: string[], saved: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const t = useTranslations();
  const problemText = useProblem();
  // Claude's own export text, the same in every language, as Claude's memory import shows it.
  const prompt = EXPORT_PROMPT;

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submit = async () => {
    setWorking(true);
    onWorking(true);
    setResult(null);
    const saved: string[] = [];
    try {
      await stream("/api/me/import", { text, locale: lang }, (event) => {
        if (event.type === "saved") {
          const line = savedText(event.event as Record<string, unknown>);
          if (line) saved.push(line);
        }
        if (event.type === "done") {
          const kept = (event.kept as string[]) ?? [];
          onImported(kept, saved);
          setResult(t("import.done", { count: kept.length }));
          setText("");
        }
        if (event.type === "error")
          setResult(problemText(String(event.code ?? event.message)));
      });
    } catch (error) {
      setResult(problemText((error as Error).message));
    } finally {
      setWorking(false);
      onWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <b>{t("import.open")}</b>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex flex-col gap-2">
          <span className="flex items-start gap-2">
            <Step n={1} />
            <span className="min-w-0 flex-1">{t("import.step1")}</span>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void copyPrompt()}
            >
              {copied ? t("common.copied") : t("common.copy")}
            </Button>
          </span>
          <pre className="max-h-36 overflow-auto rounded-lg bg-muted p-3 font-sans text-xs whitespace-pre-wrap text-muted-foreground">
            {prompt}
          </pre>
        </li>
        <li className="flex flex-col gap-2">
          <span className="flex gap-2">
            <Step n={2} />
            <span className="min-w-0">{t("import.step2")}</span>
          </span>
          <Textarea
            id="minime-import"
            value={text}
            placeholder={t("import.placeholder")}
            className="min-h-30"
            disabled={working}
            onChange={(event) => setText(event.target.value)}
          />
        </li>
      </ol>
      {working && <ShinyText className="text-sm" text={t("import.working")} />}
      {!working && result && <p className="text-sm">{result}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {result ? t("common.close") : t("common.cancel")}
        </Button>
        <Button
          size="sm"
          disabled={!text.trim() || working}
          loading={working}
          onClick={() => void submit()}
        >
          {t("import.add")}
        </Button>
      </div>
    </div>
  );
}

interface StoredFile {
  path: string;
  group: string;
  size: number;
  text?: string;
}

const FILE_GROUPS = [
  "memory",
  "skills",
  "notes",
  "chats",
  "logs",
  "reading",
  "settings",
  "office",
  "connectors",
  "index",
  "backup",
  "other",
] as const;

function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Every file the mini-me keeps, grouped by kind, each text file openable in place. */
/** The folders the person worked in lately and what else they keep out, each with its switch. */
function FolderList({
  folders,
  others,
  excludes,
  onToggle,
  onBringBack,
}: {
  folders: Folder[];
  others: LeftOut[];
  excludes: string[];
  onToggle: (folder: Folder) => void;
  onBringBack: (pattern: string) => void;
}) {
  const t = useTranslations();
  return (
    <ul className="flex flex-col">
      {folders.map((folder) => {
        // Kept out by a name pattern rather than by itself: the pattern's own row brings it back.
        const byPattern = folder.excluded && !excludes.includes(folder.path);
        return (
          <li
            key={folder.path}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
          >
            <span
              className={cn(
                "min-w-0 truncate text-sm",
                folder.excluded && "text-muted-foreground line-through",
              )}
              title={folder.path}
            >
              {folder.name}
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {t("firstRun.sessions", { count: folder.sessions })}
              </span>
            </span>
            <Button
              size="sm"
              variant={folder.excluded ? "secondary" : "outline"}
              disabled={byPattern}
              onClick={() => onToggle(folder)}
            >
              {folder.excluded ? t("firstRun.leftOut") : t("firstRun.leaveOut")}
            </Button>
          </li>
        );
      })}
      {others.map((other) => (
        <li
          key={other.pattern}
          className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
        >
          <span
            className="min-w-0 truncate text-sm text-muted-foreground line-through"
            title={other.pattern}
          >
            {other.name}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBringBack(other.pattern)}
          >
            {t("firstRun.leftOut")}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function StoredFiles() {
  const t = useTranslations("files");
  const [data, setData] = useState<{
    home: string;
    files: StoredFile[];
  } | null>(null);
  const load = () =>
    fetch("/api/me/files", { headers: HEADERS })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  return (
    <details
      className="rounded-xl border border-border p-4 text-sm"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {data && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {data.files.length}
          </span>
        )}
      </summary>
      {data && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-muted-foreground">
            {t("where", { home: data.home })}
          </p>
          {FILE_GROUPS.map((group) => {
            const files = data.files.filter((f) => f.group === group);
            if (files.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="font-medium">{t(`group.${group}`)}</h3>
                <ul className="flex flex-col">
                  {files.map((file) => (
                    <li
                      key={file.path}
                      className="min-w-0 border-b border-border py-2 last:border-b-0"
                    >
                      {file.text === undefined ? (
                        <span className="break-all">
                          <code>{file.path}</code>
                          <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                            {bytes(file.size)}
                          </span>
                        </span>
                      ) : (
                        <details>
                          <summary className="cursor-pointer break-all">
                            <code>{file.path}</code>
                            <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                              {bytes(file.size)}
                            </span>
                          </summary>
                          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                            {file.text || t("empty")}
                          </pre>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </details>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-muted text-xs tabular-nums">
      {n}
    </span>
  );
}

function MemoryRow({
  index,
  entry,
  isNew,
  onFix,
  onRemove,
}: {
  index: number;
  entry: Entry;
  isNew: boolean;
  onFix: (fix: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [state, setState] = useState<
    "open" | "fixing" | "saving" | "removing" | "sure"
  >("open");
  const [text, setText] = useState(entry.text);
  const t = useTranslations();
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="text-muted-foreground tabular-nums">{index + 1}</span>
        <span className="min-w-0 flex-1 basis-56">
          {entry.text}
          {isNew && (
            <span className="ml-2 inline-block rounded-sm border border-border px-1.5 py-0.5 align-middle text-xs whitespace-nowrap text-muted-foreground">
              {t("memory.isNew")}
            </span>
          )}
        </span>
        {state === "open" && (
          <span className="ml-auto flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setState("fixing")}
            >
              {t("memory.fix")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setState("sure")}
            >
              {t("memory.remove")}
            </Button>
          </span>
        )}
        {(state === "saving" || state === "removing") && (
          <span className="ml-auto shrink-0 text-sm">
            <ShinyText
              text={state === "saving" ? t("memory.fix") : t("memory.remove")}
            />
          </span>
        )}
      </div>
      {state === "sure" && (
        <span className="flex flex-wrap items-center gap-2 pl-5 text-sm">
          <span>{t("memory.removeSure")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setState("removing");
              void onRemove().finally(() => setState("open"));
            }}
          >
            {t("memory.remove")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("open")}>
            {t("common.cancel")}
          </Button>
        </span>
      )}
      {state === "fixing" && (
        <span className="flex flex-col gap-2 pl-5">
          <Textarea
            id={`memory-fix-${index}`}
            value={text}
            aria-label={t("memory.fixHint")}
            onChange={(event) => setText(event.target.value)}
          />
          <span className="flex gap-2">
            <Button
              size="sm"
              disabled={!text.trim() || text === entry.text}
              onClick={() => {
                setState("saving");
                void onFix(text.trim()).finally(() => setState("open"));
              }}
            >
              {t("memory.fix")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("open")}>
              {t("common.cancel")}
            </Button>
          </span>
        </span>
      )}
    </li>
  );
}
