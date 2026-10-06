"use client";

// The first time with a mini-me, as a conversation (layout A, chosen 10/5). It says what it will
// read, keep and not keep, lets the person leave folders out, and learns in the background while
// saying what it is doing and roughly how far along it is. The person can also bring what their
// usual AI remembers about them, the way Claude's memory import works (copy a prompt there, paste
// the answer here). It then shows its memory exactly as saved, each entry correctable or
// removable, and offers three things to do together right away. The learning runs on the server,
// so a reload attaches to it instead of starting over.

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
import { Markdown } from "@/components/ui/markdown";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { Bot, type Mood } from "@/features/office";
import { cn } from "@/lib/utils";
import { AskCard, type GateAsk } from "./ask-card";
import { EXPORT_PROMPT } from "./learn/export-prompt";
import { OfficePanel } from "./office-panel";
import { savedText } from "./saved-text";

type Locale = "en" | "ko";

const COPY = {
  ko: {
    hello:
      "안녕하세요, 미니미예요. 당신처럼 일하려면 먼저 당신이 일하는 방식을 알아야 해요. 이렇게 배울게요.",
    me: "내 미니미",
    plan: [
      [
        "읽는 것",
        "최근 14일 동안 AI에게 한 말, AI 지침·메모 파일, 자주 쓰는 문서 종류와 앱, 코드를 쓴다면 커밋도. 문서는 종류만 보고 내용과 이름은 읽지 않아요.",
      ],
      [
        "기억하는 것",
        "일하는 방식, 판단 기준, 말투처럼 몇 달 뒤에도 맞을 것만, 다섯 줄 안으로.",
      ],
      [
        "기억하지 않는 것",
        "프로젝트, 일정, 파일처럼 바뀌는 것. 필요할 때 그때 찾아봐요.",
      ],
      ["걸리는 시간", "30초쯤. 이 창을 닫아도 뒤에서 계속돼요."],
    ],
    folders: "최근에 일한 폴더예요. 읽지 말았으면 하는 곳은 빼 주세요.",
    noFolders:
      "이 컴퓨터에서 AI 대화 기록을 찾지 못했어요. 평소 쓰는 AI가 아는 당신을 가져오면 가장 빨라요.",
    sessions: (n: number) => `대화 ${n}개`,
    leaveOut: "빼기",
    leftOut: "뺐어요",
    start: "읽어 주세요",
    importOpen: "다른 AI에서 가져오기",
    importWhile: "기다리는 동안, 평소 쓰는 AI가 아는 당신도 가져올까요?",
    importStep1:
      "이 글을 복사해 평소 쓰는 AI(ChatGPT, Claude, Gemini 등)와의 대화에 붙여 넣으세요.",
    copy: "복사",
    copied: "복사했어요",
    importStep2:
      "그 AI가 준 답을 여기에 붙여 넣으세요. 오래갈 것만 골라 기억하고, 붙여 넣은 글은 저장하지 않아요.",
    importPlaceholder: "여기에 붙여 넣기",
    importAdd: "기억에 추가",
    importing: "오래갈 것만 고르는 중",
    imported: (n: number) =>
      n ? `${n}줄을 기억했어요.` : "새로 기억할 만한 게 없었어요.",
    close: "닫기",
    phase: {
      index: "대화 기록을 정리하는 중",
      read: "기록을 읽는 중",
      learn: "읽은 것으로 배우는 중",
    },
    source: {
      notes: "AI 지침과 메모 파일을 읽는 중",
      inputs: "최근에 AI에게 한 말을 읽는 중",
      commits: "커밋을 보는 중",
      work: "쓰는 문서 종류와 앱을 보는 중",
    } as Record<string, string>,
    sourceLabel: {
      notes: "AI 지침·메모 파일",
      inputs: "AI에게 한 말",
      commits: "커밋",
      work: "문서 종류와 앱",
    } as Record<string, string>,
    read: "읽은 것",
    memoryTitle: "제가 기억하는 당신",
    lines: (n: number) => `${n}줄`,
    memoryNone: "아직 기억한 게 없어요. 같이 일하면서 배울게요.",
    memoryWhere: (dir: string) =>
      `이 컴퓨터의 ${dir}에 이대로 저장돼 있어요. 바뀌는 건 기억하지 않고 필요할 때 찾아봐요.`,
    isNew: "새로",
    fix: "고치기",
    fixHint: "어떻게 고칠까요?",
    remove: "지우기",
    removeSure: "이 줄을 지울까요?",
    cancel: "그만두기",
    tryNow: "바로 같이 해 볼까요?",
    ask: "다른 일 시키기",
    send: "보내기",
    saved: "기억함",
    error: (m: string) => `문제가 생겼어요: ${m}`,
    noClaude:
      "이 컴퓨터에서 Claude Code를 찾지 못했어요. 설치하고 로그인한 뒤 다시 열어 주세요.",
    again: "다시 읽기",
    startOver: "처음부터 다시",
    startOverSure:
      "지금 기억은 보관함으로 옮기고 처음부터 시작할까요? 지우지는 않아요.",
    startOverYes: "처음부터",
    newChat: "새 대화",
    pastChats: "이전 대화",
    noChats: "아직 대화가 없어요",
    carrying:
      "대화가 길어져서, 기억할 것을 먼저 챙기고 앞의 대화를 정리하는 중",
    carried: "앞의 대화를 정리해 두었어요. 그 정리에서 이어 갈게요.",
    turnsCount: (n: number) => `${n}번 말함`,
    needsYou: "답이 필요해요",
    fromColleague: "동료 미니미의 답",
    ownAnswer: "직접 답하기",
    mayI: "이걸 해도 될까요?",
    allow: "허락",
    deny: "거절",
    always: "앞으로 이런 건 묻지 않기",
    allowed: "허락했어요",
    denied: "거절했어요",
    answered: (a: string) => `답: ${a}`,
    noLonger: "이 질문은 이제 기다리지 않아요",
    doing: {
      Read: "파일 읽기",
      Glob: "파일 찾기",
      Grep: "파일 내용에서 찾기",
      WebFetch: "웹 페이지 열기",
      WebSearch: "웹 검색",
      mcp__minime__ask_colleague: "동료 미니미에게 부탁 보내기",
    } as Record<string, string>,
    freshOffer: (n: number) =>
      `지난번 읽은 뒤로 AI와 새로 나눈 대화가 ${n}개 있어요. 새로 알게 될 게 있는지 읽어 볼까요?`,
    freshRead: "읽어 보기",
    files: "저장된 파일 전체",
    filesWhere: (home: string) =>
      `미니미가 이 컴퓨터에 남긴 파일 전부예요. 모두 ${home} 안에 있고, 아무 편집기로 열어 볼 수 있어요.`,
    fileGroup: {
      memory: "매번 읽는 기억 (나 USER.md, 일 환경 MEMORY.md)",
      skills: "스킬",
      notes: "노트",
      chats: "나와 나눈 대화 (대화 하나에 파일 하나)",
      logs: "실행 기록 (세션마다 무엇을 했는지, 걸린 시간과 사용량. 대화 내용은 없어요)",
      reading: "지난 읽기 기록 (언제 무엇을 읽었는지, 해 볼 일)",
      settings: "설정 (뺀 폴더)",
      index: "대화 검색 색인 (원래 기록에서 다시 만들 수 있어요)",
      backup: "보관함 (처음부터 다시 할 때 옮긴 것)",
      other: "그 밖의 파일",
    } as Record<string, string>,
    fileEmpty: "(비어 있음)",
  },
  en: {
    hello:
      "Hi, I'm your mini-me. To work the way you do, I first need to learn how you work. Here is how I'll learn.",
    me: "My mini-me",
    plan: [
      [
        "What I read",
        "What you asked your AI tools in the last 14 days, your AI instruction and memory files, the kinds of documents and apps you use, and your commits if you write code. For documents I see only the kind, never the contents or names.",
      ],
      [
        "What I keep",
        "Only what will still be true in months — how you work, decide and talk — in five lines or fewer.",
      ],
      [
        "What I don't keep",
        "Things that change, like projects, schedules and files. I look them up when I need them.",
      ],
      [
        "How long",
        "About 30 seconds. It keeps going if you close this window.",
      ],
    ],
    folders:
      "These are the folders you worked in lately. Leave out any I shouldn't read.",
    noFolders:
      "I found no AI conversations on this computer. Bringing what your usual AI knows about you is the quickest start.",
    sessions: (n: number) => `${n} conversations`,
    leaveOut: "Leave out",
    leftOut: "Left out",
    start: "Go ahead",
    importOpen: "Bring it from another AI",
    importWhile:
      "While you wait, shall I bring what your usual AI knows about you?",
    importStep1:
      "Copy this into a chat with the AI you use most, such as ChatGPT, Claude or Gemini.",
    copy: "Copy",
    copied: "Copied",
    importStep2:
      "Paste its answer here. I'll keep only what lasts, and the pasted text is not stored.",
    importPlaceholder: "Paste here",
    importAdd: "Add to memory",
    importing: "Picking out what lasts",
    imported: (n: number) =>
      n
        ? `I kept ${n} line${n === 1 ? "" : "s"}.`
        : "There was nothing new worth keeping.",
    close: "Close",
    phase: {
      index: "Sorting your conversation records",
      read: "Reading your records",
      learn: "Learning from what I read",
    },
    source: {
      notes: "Reading your AI instructions and memory files",
      inputs: "Reading what you asked your AI tools lately",
      commits: "Looking at your commits",
      work: "Looking at the kinds of documents and apps you use",
    } as Record<string, string>,
    sourceLabel: {
      notes: "AI instruction and memory files",
      inputs: "what you asked AI tools",
      commits: "commits",
      work: "document kinds and apps",
    } as Record<string, string>,
    read: "Read",
    memoryTitle: "What I remember about you",
    lines: (n: number) => `${n} line${n === 1 ? "" : "s"}`,
    memoryNone: "Nothing yet. I'll learn as we work together.",
    memoryWhere: (dir: string) =>
      `Saved exactly like this in ${dir} on this computer. Things that change aren't kept; I look them up when I need them.`,
    isNew: "New",
    fix: "Correct",
    fixHint: "How should it read?",
    remove: "Remove",
    removeSure: "Remove this line?",
    cancel: "Cancel",
    tryNow: "Shall we do one together now?",
    ask: "Ask something else",
    send: "Send",
    saved: "Saved",
    error: (m: string) => `Something went wrong: ${m}`,
    noClaude:
      "Claude Code isn't installed or signed in on this computer. Set it up, then reopen this page.",
    again: "Read again",
    startOver: "Start over",
    startOverSure:
      "Move what I remember into a backup and start from the beginning? Nothing is deleted.",
    startOverYes: "Start over",
    newChat: "New conversation",
    pastChats: "Past conversations",
    noChats: "No conversations yet",
    carrying:
      "This conversation is long: keeping what matters first, then summing up what came before",
    carried: "I summed up what came before and will go on from that.",
    turnsCount: (n: number) => `${n} message${n === 1 ? "" : "s"}`,
    needsYou: "Needs you",
    fromColleague: "From a colleague's mini-me",
    ownAnswer: "Your own answer",
    mayI: "May I do this?",
    allow: "Allow",
    deny: "Don't",
    always: "Don't ask again for this",
    allowed: "Allowed",
    denied: "Declined",
    answered: (a: string) => `Answer: ${a}`,
    noLonger: "This question is no longer waiting",
    doing: {
      Read: "Read a file",
      Glob: "Find files",
      Grep: "Search inside files",
      WebFetch: "Open a web page",
      WebSearch: "Search the web",
      mcp__minime__ask_colleague: "Send a request to a colleague's mini-me",
    } as Record<string, string>,
    freshOffer: (n: number) =>
      `You've had ${n} new conversations with your AI tools since I last read. Shall I see if there's anything new to learn?`,
    freshRead: "Read them",
    files: "All files I keep",
    filesWhere: (home: string) =>
      `Every file your mini-me keeps on this computer. All of it is in ${home}, and any text editor can open it.`,
    fileGroup: {
      memory: "Read every time (about you: USER.md, your work: MEMORY.md)",
      skills: "Skills",
      notes: "Notes",
      chats: "Our conversations (one file each)",
      logs: "Run log (what each session did, how long it took and what it used; no conversation text)",
      reading: "The last reading (what was read when, things to try)",
      settings: "Settings (folders left out)",
      index: "Conversation search index (rebuilt from the original records)",
      backup: "Backups (moved there when starting over)",
      other: "Other files",
    } as Record<string, string>,
    fileEmpty: "(empty)",
  },
};
type Copy = (typeof COPY)[Locale];

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
  // The screen's words exist in Korean and English for now; the mini-me is told the browser's own
  // language, whatever it is, and keeps what it learns in it.
  const [lang, setLang] = useState("en");
  const locale: Locale = lang.toLowerCase().startsWith("ko") ? "ko" : "en";
  const copy: Copy = COPY[locale];
  const [stage, setStage] = useState<"boot" | "intro" | "learning" | "known">(
    "boot",
  );
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [learned, setLearned] = useState<string[]>([]);
  const [memory, setMemory] = useState<Memory | null>(null);
  const [fresh, setFresh] = useState<string[]>([]);
  const [tasks, setTasks] = useState<{ label: string; why: string }[]>([]);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const [sureOver, setSureOver] = useState(false);
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
      messages: { role: string; text: string }[];
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

  const loadFolders = useCallback(
    () =>
      fetch("/api/me/sources", { headers: HEADERS })
        .then((r) => r.json())
        .then((data: { folders: Folder[]; exclude: string[] }) => {
          setFolders(data.folders);
          setExcludes(data.exclude);
          if (data.folders.length === 0) setImporting(true);
        })
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
          void loadMemory();
          setStage("known");
          break;
        }
        case "error":
          setProblem(String(event.message));
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
    setLang(navigator.language || "en");
    const controller = new AbortController();
    void followLearn(controller.signal);
    void loadFolders();
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

  const toggle = async (folder: Folder) => {
    const next = folder.excluded
      ? excludes.filter((p) => p !== folder.path)
      : [...excludes, folder.path];
    setExcludes(next);
    setFolders(
      (all) =>
        all?.map((f) =>
          f.path === folder.path ? { ...f, excluded: !f.excluded } : f,
        ) ?? null,
    );
    await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    });
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
      setProblem(
        data.error === "claude-missing"
          ? copy.noClaude
          : copy.error(String(data.error ?? response.status)),
      );
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
      setProblem(copy.error(String(response.status)));
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
    void loadFolders();
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
      push({ kind: "error", text: copy.error((error as Error).message) });
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
    else setProblem(copy.error(String(data.error ?? response.status)));
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
              next.splice(at, 0, { id, kind: "note", text: copy.carrying });
              return next;
            });
          }
          if (event.type === "carried")
            setTurns((all) =>
              all.map((t) =>
                t.id === note ? { ...t, text: copy.carried } : t,
              ),
            );
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
            push({ kind: "error", text: copy.error(String(event.message)) });
        },
      );
    } catch (error) {
      const message = (error as Error).message;
      push({
        kind: "error",
        text:
          message === "claude-missing" ? copy.noClaude : copy.error(message),
      });
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
    setTurns((all) =>
      all.map((t) =>
        t.id === turnId && t.kind === "ask"
          ? {
              ...t,
              state: "done",
              answer: response.ok ? answer : copy.noLonger,
            }
          : t,
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

  const label = progress
    ? progress.phase === "read" && progress.source
      ? (copy.source[progress.source] ?? copy.phase.read)
      : copy.phase[progress.phase]
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
          label={copy.me}
          className="shrink-0"
        />
        <Bubble variant="secondary">
          <BubbleContent className="text-[15px]">{copy.hello}</BubbleContent>
        </Bubble>
      </header>

      {stage === "intro" && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            {copy.plan.map(([term, text]) => (
              <div key={term} className="contents">
                <dt className="font-medium">{term}</dt>
                <dd className="mb-1 text-muted-foreground sm:mb-0">{text}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {folders?.length === 0 ? copy.noFolders : copy.folders}
          </p>
          {folders && folders.length > 0 && (
            <ul className="flex flex-col">
              {folders.map((folder) => (
                <li
                  key={folder.path}
                  className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
                >
                  <span
                    className={cn(
                      "min-w-0 truncate text-sm",
                      folder.excluded && "text-muted-foreground line-through",
                    )}
                  >
                    {folder.name}
                    <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                      {copy.sessions(folder.sessions)}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant={folder.excluded ? "secondary" : "outline"}
                    onClick={() => void toggle(folder)}
                  >
                    {folder.excluded ? copy.leftOut : copy.leaveOut}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void start()}>{copy.start}</Button>
            {!importing && (
              <Button variant="outline" onClick={() => setImporting(true)}>
                {copy.importOpen}
              </Button>
            )}
          </div>
        </div>
      )}

      {problem && (
        <Bubble variant="destructive">
          <BubbleContent className="text-[15px]">{problem}</BubbleContent>
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
            <span className="text-muted-foreground">{copy.read}: </span>
            {sources
              .filter((s) => s.items > 0)
              .map((s) => `${copy.sourceLabel[s.id] ?? s.label} ${s.items}`)
              .join(" · ")}
          </div>
        )}

      {stage === "learning" &&
        learned.map((text, i) => (
          <span
            key={`${i}-${text}`}
            className="self-start rounded-md bg-muted px-2 py-1 text-xs"
          >
            💾 {copy.saved}: {text}
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
              <b>{copy.memoryTitle}</b>
              <span className="text-xs text-muted-foreground tabular-nums">
                {copy.lines(entries.length)}{" "}
                {(memoryOpen ?? turns.length === 0) ? "▴" : "▾"}
              </span>
            </button>
            {(memoryOpen ?? turns.length === 0) &&
              memory &&
              entries.length === 0 && <p>{copy.memoryNone}</p>}
            {(memoryOpen ?? turns.length === 0) && entries.length > 0 && (
              <ol className="flex flex-col gap-2">
                {entries.map((entry, i) => (
                  <MemoryRow
                    key={`${entry.target}-${entry.text}`}
                    copy={copy}
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
                {copy.memoryWhere(memory.dir)}
              </p>
            )}
          </BubbleContent>
        </Bubble>
      )}

      {/* One place for the import in every stage, so what it did stays on screen when the stage changes. */}
      {stage !== "boot" &&
        (importing ? (
          <ImportCard
            copy={copy}
            onWorking={setListening}
            locale={locale}
            lang={lang}
            onClose={() => setImporting(false)}
            onImported={onImported}
          />
        ) : (
          stage === "learning" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0">{copy.importWhile}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setImporting(true)}
              >
                {copy.importOpen}
              </Button>
            </div>
          )
        ))}

      {stage === "known" && freshOffer > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
          <span className="min-w-0">{copy.freshOffer(freshOffer)}</span>
          <Button size="sm" variant="outline" onClick={() => void start()}>
            {copy.freshRead}
          </Button>
        </div>
      )}

      {showMemory && (
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="min-w-0 truncate text-sm font-medium">
            {chats.find((c) => c.id === chatId)?.title ?? copy.newChat}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || turns.length === 0}
              onClick={newChat}
            >
              {copy.newChat}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button size="sm" variant="ghost" disabled={busy}>
                    {copy.pastChats}
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuGroup>
                  {chats.length === 0 && (
                    <DropdownMenuLabel>{copy.noChats}</DropdownMenuLabel>
                  )}
                  {chats.map((chat) => (
                    <DropdownMenuItem
                      key={chat.id}
                      onClick={() => void openChat(chat.id)}
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{chat.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(chat.updated).toLocaleString(lang, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}{" "}
                          · {copy.turnsCount(chat.turns)}
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
          <p className="text-sm text-muted-foreground">{copy.tryNow}</p>
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
              copy={copy}
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
                  {copy.fromColleague}
                </span>
                <span className="whitespace-pre-wrap">{turn.text}</span>
              </BubbleContent>
            </Bubble>
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
              💾 {copy.saved}: {turn.text}
            </span>
          );
        return (
          <Bubble key={turn.id} variant="destructive">
            <BubbleContent className="text-[15px]">{turn.text}</BubbleContent>
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
              {copy.again}
            </Button>
            {!importing && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => setImporting(true)}
              >
                {copy.importOpen}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={busy}
              onClick={() => setSureOver(true)}
            >
              {copy.startOver}
            </Button>
          </div>
          {sureOver && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">{copy.startOverSure}</span>
              <Button size="sm" onClick={() => void startOver()}>
                {copy.startOverYes}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSureOver(false)}
              >
                {copy.cancel}
              </Button>
            </div>
          )}
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
            placeholder={copy.ask}
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
            {copy.send}
          </Button>
        </form>
      )}
      {stage !== "boot" && (
        <OfficePanel
          locale={locale}
          lang={lang}
          askCopy={copy}
          onWaiting={setOfficeWaiting}
          onNews={refreshChat}
        />
      )}
      {stage !== "boot" && <StoredFiles copy={copy} />}
      <div ref={bottom} />
    </div>
  );
}

/**
 * Bringing what another AI remembers, in Claude's two steps: copy the prompt into a chat with that
 * AI, paste its answer back. Only what lasts is kept; the pasted text is not stored.
 */
function ImportCard({
  copy,
  onWorking,
  locale,
  lang,
  onClose,
  onImported,
}: {
  copy: Copy;
  onWorking: (working: boolean) => void;
  locale: Locale;
  lang: string;
  onClose: () => void;
  onImported: (kept: string[], saved: string[]) => void;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const prompt = EXPORT_PROMPT[locale];

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
          setResult(copy.imported(kept.length));
          setText("");
        }
        if (event.type === "error")
          setResult(copy.error(String(event.message)));
      });
    } catch (error) {
      const message = (error as Error).message;
      setResult(
        message === "claude-missing" ? copy.noClaude : copy.error(message),
      );
    } finally {
      setWorking(false);
      onWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border p-4">
      <b>{copy.importOpen}</b>
      <ol className="flex flex-col gap-4 text-sm">
        <li className="flex flex-col gap-2">
          <span className="flex items-start gap-2">
            <Step n={1} />
            <span className="min-w-0 flex-1">{copy.importStep1}</span>
            <Button
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void copyPrompt()}
            >
              {copied ? copy.copied : copy.copy}
            </Button>
          </span>
          <pre className="max-h-36 overflow-auto rounded-lg bg-muted p-3 font-sans text-xs whitespace-pre-wrap text-muted-foreground">
            {prompt}
          </pre>
        </li>
        <li className="flex flex-col gap-2">
          <span className="flex gap-2">
            <Step n={2} />
            <span className="min-w-0">{copy.importStep2}</span>
          </span>
          <Textarea
            id="minime-import"
            value={text}
            placeholder={copy.importPlaceholder}
            className="min-h-30"
            disabled={working}
            onChange={(event) => setText(event.target.value)}
          />
        </li>
      </ol>
      {working && <ShinyText className="text-sm" text={copy.importing} />}
      {!working && result && <p className="text-sm">{result}</p>}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {result ? copy.close : copy.cancel}
        </Button>
        <Button
          size="sm"
          disabled={!text.trim() || working}
          loading={working}
          onClick={() => void submit()}
        >
          {copy.importAdd}
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
  "index",
  "backup",
  "other",
];

function bytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

/** Every file the mini-me keeps, grouped by kind, each text file openable in place. */
function StoredFiles({ copy }: { copy: Copy }) {
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
        {copy.files}
        {data && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {data.files.length}
          </span>
        )}
      </summary>
      {data && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-muted-foreground">{copy.filesWhere(data.home)}</p>
          {FILE_GROUPS.map((group) => {
            const files = data.files.filter((f) => f.group === group);
            if (files.length === 0) return null;
            return (
              <section key={group} className="flex flex-col gap-1">
                <h3 className="font-medium">{copy.fileGroup[group]}</h3>
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
                            {file.text || copy.fileEmpty}
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
  copy,
  index,
  entry,
  isNew,
  onFix,
  onRemove,
}: {
  copy: Copy;
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
  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <span className="text-muted-foreground tabular-nums">{index + 1}</span>
        <span className="min-w-0 flex-1 basis-56">
          {entry.text}
          {isNew && (
            <span className="ml-2 inline-block rounded-sm border border-border px-1.5 py-0.5 align-middle text-xs whitespace-nowrap text-muted-foreground">
              {copy.isNew}
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
              {copy.fix}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setState("sure")}
            >
              {copy.remove}
            </Button>
          </span>
        )}
        {(state === "saving" || state === "removing") && (
          <span className="ml-auto shrink-0 text-sm">
            <ShinyText text={state === "saving" ? copy.fix : copy.remove} />
          </span>
        )}
      </div>
      {state === "sure" && (
        <span className="flex flex-wrap items-center gap-2 pl-5 text-sm">
          <span>{copy.removeSure}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setState("removing");
              void onRemove().finally(() => setState("open"));
            }}
          >
            {copy.remove}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setState("open")}>
            {copy.cancel}
          </Button>
        </span>
      )}
      {state === "fixing" && (
        <span className="flex flex-col gap-2 pl-5">
          <Textarea
            id={`memory-fix-${index}`}
            value={text}
            aria-label={copy.fixHint}
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
              {copy.fix}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("open")}>
              {copy.cancel}
            </Button>
          </span>
        </span>
      )}
    </li>
  );
}
