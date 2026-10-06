"use client";

// The person's office on their mini-me's page: joining with the relay's address and the office's
// key, their own card and status, their colleagues' mini-mes (with "ask"), the requests sent and
// received and how far each has come, and the questions about requests that wait for them.
// It looks again every few seconds while open.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { OfficeFloor, type OfficePerson } from "@/features/office";
import { cn } from "@/lib/utils";
import { AskCard, type AskCopy, type GateAsk } from "./ask-card";

type State =
  | "SUBMITTED"
  | "WORKING"
  | "INPUT_REQUIRED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
  | "REJECTED";

interface Card {
  name: string;
  description: string;
  status?: string;
}

interface Task {
  id: string;
  status: { state: State; timestamp: string };
  history: { role: "user" | "agent"; parts: { text: string }[] }[];
  metadata: { from: string; to: string; created: string };
}

interface Office {
  joined: boolean;
  relay?: string;
  me?: { id: string; card: Card };
  members?: { id: string; card: Card; seen: string }[];
  tasks?: Task[];
  asks?: { id: string; chat?: string; ask: GateAsk }[];
  problem?: string;
}

const COPY = {
  ko: {
    title: "오피스",
    intro:
      "동료의 미니미와 부탁을 주고받는 곳이에요. 팀이 띄운 릴레이의 주소와 오피스 열쇠로 들어가요. 내 기억이나 대화는 릴레이로 가지 않고, 명함과 부탁만 오가요.",
    relay: "릴레이 주소",
    key: "오피스 열쇠",
    name: "내 이름",
    role: "하는 일 한 줄",
    rolePlaceholder: "예: 결제 API와 배포를 맡아요",
    draft: "초안 써 줘",
    drafting: "미니미가 쓰는 중",
    join: "들어가기",
    me: "나",
    statuses: ["일하는 중", "회의 중", "자리 비움", "퇴근"],
    colleagues: "동료",
    nobody: "아직 다른 미니미가 없어요. 오피스 열쇠를 동료에게 알려 주세요.",
    ask: "부탁하기",
    askPlaceholder: (name: string) => `${name}의 미니미에게 부탁할 것`,
    send: "보내기",
    cancel: "그만두기",
    requests: "부탁",
    none: "주고받은 부탁이 없어요.",
    sent: (name: string) => `→ ${name}`,
    received: (name: string) => `← ${name}`,
    state: {
      SUBMITTED: "보냄",
      WORKING: "처리 중",
      INPUT_REQUIRED: "더 필요해요",
      COMPLETED: "끝남",
      FAILED: "실패",
      CANCELED: "취소",
      REJECTED: "거절",
    } as Record<State, string>,
    reply: "답하기",
    seen: (when: string) => `마지막 접속 ${when}`,
    leave: "오피스 나가기",
    problem: (m: string) => `릴레이에 닿지 않아요: ${m}`,
    asksTitle: "받은 부탁에 답이 필요해요",
    team: "우리 팀",
    away: ["회의 중", "자리 비움"],
    off: "퇴근",
    needsYou: "답이 필요해요",
  },
  en: {
    title: "Office",
    intro:
      "Where your mini-me and your colleagues' trade requests. Join with the address of the relay your team runs and the office key. Your memory and conversations never go to the relay; only cards and requests do.",
    relay: "Relay address",
    key: "Office key",
    name: "Your name",
    role: "What you do, in a line",
    rolePlaceholder: "e.g. I look after the payments API and releases",
    draft: "Draft it for me",
    drafting: "Your mini-me is writing",
    join: "Join",
    me: "You",
    statuses: ["Working", "In a meeting", "Away", "Off"],
    colleagues: "Colleagues",
    nobody: "No other mini-me yet. Share the office key with a colleague.",
    ask: "Ask",
    askPlaceholder: (name: string) => `What to ask ${name}'s mini-me`,
    send: "Send",
    cancel: "Cancel",
    requests: "Requests",
    none: "No requests yet.",
    sent: (name: string) => `→ ${name}`,
    received: (name: string) => `← ${name}`,
    state: {
      SUBMITTED: "Sent",
      WORKING: "Working",
      INPUT_REQUIRED: "Needs more",
      COMPLETED: "Done",
      FAILED: "Failed",
      CANCELED: "Canceled",
      REJECTED: "Declined",
    } as Record<State, string>,
    reply: "Reply",
    seen: (when: string) => `Last seen ${when}`,
    leave: "Leave the office",
    problem: (m: string) => `Can't reach the relay: ${m}`,
    asksTitle: "A request needs your answer",
    team: "Our team",
    away: ["In a meeting", "Away"],
    off: "Off",
    needsYou: "Needs you",
  },
};

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

export function OfficePanel({
  locale,
  lang,
  askCopy,
  onWaiting,
  onNews,
}: {
  locale: "ko" | "en";
  lang: string;
  askCopy: AskCopy;
  /** How many questions about requests wait for the person, for the bot's face. */
  onWaiting?: (count: number) => void;
  /** A request this mini-me sent was answered (or needs more): its conversation may have news. */
  onNews?: () => void;
}) {
  const copy = COPY[locale];
  const [office, setOffice] = useState<Office | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState<Record<string, string>>({});

  const seen = useRef(new Map<string, string>());
  const load = useCallback(async () => {
    const data = (await fetch(
      `/api/me/office?locale=${encodeURIComponent(lang)}`,
      { headers: HEADERS },
    )
      .then((r) => r.json())
      .catch(() => null)) as Office | null;
    if (!data) return;
    setOffice(data);
    // A sent request whose state moved since the last look: its answer may be in a conversation.
    let news = false;
    for (const task of data.tasks ?? []) {
      const before = seen.current.get(task.id);
      if (
        before !== undefined &&
        before !== task.status.state &&
        task.metadata.from === data.me?.id
      )
        news = true;
      seen.current.set(task.id, task.status.state);
    }
    if (news) onNews?.();
  }, [lang, onNews]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!office?.joined) return;
    const timer = setInterval(() => void load(), open ? 4000 : 15000);
    return () => clearInterval(timer);
  }, [open, office?.joined, load]);

  const post = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(String(data.error ?? response.status));
      await load();
      return response.ok;
    } finally {
      setBusy(false);
    }
  };

  const names = new Map(
    (office?.members ?? []).map((m) => [m.id, m.card.name]),
  );
  const others = (office?.members ?? []).filter((m) => m.id !== office?.me?.id);
  const waiting = (office?.asks ?? []).filter((a) => !answered[a.id]);
  useEffect(() => {
    onWaiting?.(waiting.length);
  }, [waiting.length, onWaiting]);

  return (
    <details
      className="rounded-xl border border-border p-4 text-sm"
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer font-medium">
        {copy.title}
        {office?.joined && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {others.length}
          </span>
        )}
        {waiting.length > 0 && (
          <span className="ml-2 text-xs font-medium text-waiting">
            {copy.asksTitle}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {office && !office.joined && (
          <Join
            copy={copy}
            lang={lang}
            busy={busy}
            onJoin={(body) => post(body)}
          />
        )}
        {office?.joined && office.me && (
          <>
            {office.problem && (
              <p className="text-destructive">{copy.problem(office.problem)}</p>
            )}
            {waiting.map((pending) => (
              <AskCard
                key={pending.id}
                copy={askCopy}
                turn={{
                  id: 0,
                  gate: pending.id,
                  ask: pending.ask,
                  state: answered[pending.id] ? "done" : "open",
                  answer: answered[pending.id],
                }}
                onAnswer={(answer, always) => {
                  setAnswered((all) => ({ ...all, [pending.id]: answer }));
                  void fetch("/api/me/gate/answer", {
                    method: "POST",
                    headers: HEADERS,
                    body: JSON.stringify({ id: pending.id, answer, always }),
                  }).then(() => load());
                }}
              />
            ))}
            <OfficeFloor
              people={floor(copy, office, waiting.length)}
              layout="plaza"
              sky="now"
              label={copy.title}
            />
            <MyCard
              copy={copy}
              card={office.me.card}
              busy={busy}
              onStatus={(status) =>
                void post({
                  action: "card",
                  card: { ...office.me?.card, status },
                })
              }
            />
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{copy.colleagues}</h3>
              {others.length === 0 && (
                <p className="text-muted-foreground">{copy.nobody}</p>
              )}
              <ul className="flex flex-col">
                {others.map((member) => (
                  <Colleague
                    key={member.id}
                    copy={copy}
                    lang={lang}
                    member={member}
                    busy={busy}
                    onSend={(text) =>
                      post({ action: "send", to: member.id, text })
                    }
                  />
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{copy.requests}</h3>
              {(office.tasks ?? []).length === 0 && (
                <p className="text-muted-foreground">{copy.none}</p>
              )}
              <ul className="flex flex-col">
                {(office.tasks ?? []).map((task) => (
                  <Request
                    key={task.id}
                    copy={copy}
                    task={task}
                    me={office.me?.id ?? ""}
                    names={names}
                    busy={busy}
                    onReply={(text) =>
                      post({ action: "reply", id: task.id, text })
                    }
                  />
                ))}
              </ul>
            </section>
            {error && <p className="text-destructive">{error}</p>}
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-muted-foreground"
              disabled={busy}
              onClick={() => void post({ action: "leave" })}
            >
              {copy.leave}
            </Button>
          </>
        )}
        {office && !office.joined && error && (
          <p className="text-destructive">{error}</p>
        )}
      </div>
    </details>
  );
}

type Copy = (typeof COPY)["ko"];

const FINAL_STATES: State[] = ["COMPLETED", "FAILED", "CANCELED", "REJECTED"];

/**
 * The office as a floor: each member's bot at their desk, as their card's status says (a computer
 * not at the relay for two minutes is off), with the open requests on their desk, and a word from
 * the viewer's own bot when a request waits for them.
 */
function floor(copy: Copy, office: Office, waiting: number): OfficePerson[] {
  const now = Date.now();
  return (office.members ?? []).map((member) => {
    const you = member.id === office.me?.id;
    const status = member.card.status ?? "";
    const gone = now - Date.parse(member.seen) > 2 * 60 * 1000;
    const open = (office.tasks ?? []).filter(
      (task) =>
        task.metadata.to === member.id &&
        !FINAL_STATES.includes(task.status.state),
    );
    return {
      name: member.card.name,
      team: copy.team,
      you,
      status:
        status === copy.off || (gone && !you)
          ? "offline"
          : copy.away.includes(status)
            ? "away"
            : "active",
      pile: open.length,
      ...(open.some((task) => task.status.state === "WORKING")
        ? { mood: "working" as const }
        : {}),
      ...(you && waiting > 0
        ? { needsDecision: true, says: copy.needsYou }
        : {}),
    };
  });
}

function Join({
  copy,
  lang,
  busy,
  onJoin,
}: {
  copy: Copy;
  lang: string;
  busy: boolean;
  onJoin: (body: unknown) => Promise<boolean>;
}) {
  const [relay, setRelay] = useState("http://127.0.0.1:3200");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [drafting, setDrafting] = useState(false);
  // The mini-me drafts the line from what it knows; the person corrects it before joining.
  const draft = async () => {
    setDrafting(true);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && typeof data.description === "string")
        setRole(data.description);
    } finally {
      setDrafting(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void onJoin({
          action: "join",
          relay,
          key,
          card: { name, description: role },
        });
      }}
    >
      <p className="text-muted-foreground">{copy.intro}</p>
      <label className="flex flex-col gap-1">
        <span>{copy.relay}</span>
        <Input value={relay} onChange={(e) => setRelay(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{copy.key}</span>
        <Input value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{copy.name}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{copy.role}</span>
        <div className="flex gap-2">
          <Input
            value={role}
            className="flex-1"
            placeholder={drafting ? copy.drafting : copy.rolePlaceholder}
            disabled={drafting}
            onChange={(e) => setRole(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            disabled={drafting}
            loading={drafting}
            onClick={() => void draft()}
          >
            {copy.draft}
          </Button>
        </div>
      </label>
      <Button
        type="submit"
        className="self-start"
        disabled={busy || !relay.trim() || !key.trim() || !name.trim()}
        loading={busy}
      >
        {copy.join}
      </Button>
    </form>
  );
}

function MyCard({
  copy,
  card,
  busy,
  onStatus,
}: {
  copy: Copy;
  card: Card;
  busy: boolean;
  onStatus: (status: string) => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{copy.me}</h3>
      <div className="flex flex-col gap-1">
        <span>
          {card.name}
          {card.description && (
            <span className="text-muted-foreground"> · {card.description}</span>
          )}
        </span>
        <div className="flex flex-wrap gap-1">
          {copy.statuses.map((status) => (
            <Button
              key={status}
              size="xs"
              variant={card.status === status ? "secondary" : "ghost"}
              disabled={busy}
              onClick={() => onStatus(status)}
            >
              {status}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function Colleague({
  copy,
  lang,
  member,
  busy,
  onSend,
}: {
  copy: Copy;
  lang: string;
  member: { id: string; card: Card; seen: string };
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  return (
    <li className="flex flex-col gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{member.card.name}</span>
          {member.card.status && (
            <span className="ml-2 text-xs text-muted-foreground">
              {member.card.status}
            </span>
          )}
          {member.card.description && (
            <span className="block text-muted-foreground">
              {member.card.description}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {copy.seen(
              new Date(member.seen).toLocaleString(lang, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            )}
          </span>
        </span>
        {!asking && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setAsking(true)}
          >
            {copy.ask}
          </Button>
        )}
      </div>
      {asking && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onSend(text.trim()).then((ok) => {
              if (ok) {
                setText("");
                setAsking(false);
              }
            });
          }}
        >
          <Textarea
            value={text}
            placeholder={copy.askPlaceholder(member.card.name)}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !text.trim()}
              loading={busy}
            >
              {copy.send}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              {copy.cancel}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function Request({
  copy,
  task,
  me,
  names,
  busy,
  onReply,
}: {
  copy: Copy;
  task: Task;
  me: string;
  names: Map<string, string>;
  busy: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  const first = task.history[0]?.parts.map((p) => p.text).join(" ") ?? "";
  const answer = [...task.history]
    .reverse()
    .find((m) => m.role === "agent")
    ?.parts.map((p) => p.text)
    .join(" ");
  const state = task.status.state;
  const moving = state === "SUBMITTED" || state === "WORKING";
  return (
    <li className="flex min-w-0 flex-col gap-1 border-b border-border py-2 last:border-b-0">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate font-medium">
          {sent
            ? copy.sent(names.get(other) ?? other)
            : copy.received(names.get(other) ?? other)}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs",
            state === "INPUT_REQUIRED"
              ? "text-waiting"
              : "text-muted-foreground",
          )}
        >
          {moving ? <ShinyText text={copy.state[state]} /> : copy.state[state]}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">{first}</p>
      {answer && <p className="whitespace-pre-wrap">{answer}</p>}
      {sent && state === "INPUT_REQUIRED" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onReply(text.trim()).then((ok) => ok && setText(""));
          }}
        >
          <Textarea
            value={text}
            className="min-h-9 flex-1"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            {copy.reply}
          </Button>
        </form>
      )}
    </li>
  );
}
