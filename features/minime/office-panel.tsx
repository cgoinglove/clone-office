"use client";

// The person's office on their mini-me's page: joining with the relay's address and the office's
// key, their own card and status, their colleagues' mini-mes (with "ask"), the requests sent and
// received and how far each has come, and the questions about requests that wait for them.
// It looks again every few seconds while open.

import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { OfficeRoom } from "@/features/office/room/office-room";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { AskCard, describe, type GateAsk } from "./ask-card";
import { dueAt } from "./batch";
import { parseInvite } from "./office/invite";
import type { LikeMe } from "./office/likeme";
import { roomData, STATUSES, statusCode } from "./office/room-data";

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
  /** The kinds of request they take (A2A skills), from their menu. */
  skills?: { id: string; name: string; description?: string }[];
  /** How to work with them (their ME.md), the lines they added one by one. */
  howToWork?: string[];
}

type Trust = "auto" | "tell" | "ask";

interface MenuItem {
  id?: string;
  name: string;
  description: string;
  examples?: string[];
  trust: Trust;
}

const TRUSTS: Trust[] = ["auto", "tell", "ask"];

interface Task {
  id: string;
  status: { state: State; timestamp: string };
  history: { role: "user" | "agent"; parts: { text: string }[] }[];
  metadata: {
    from: string;
    to: string;
    created: string;
    /** Asked by a link: the one asked, who has no mini-me. */
    guest?: string;
    /** To the one who made it: the link's path on the relay. */
    link?: string;
  };
}

interface Office {
  joined: boolean;
  relay?: string;
  me?: { id: string; card: Card };
  /** The person's own menu, with how much their mini-me does alone for each kind. */
  menu?: MenuItem[];
  /** Of the answers the person saw first lately, how many they sent as they were. */
  likeMe?: LikeMe;
  members?: { id: string; card: Card; seen: string }[];
  tasks?: Task[];
  asks?: { id: string; chat?: string; ask: GateAsk }[];
  /** Questions about requests kept for the person: answering one lets the request go on. */
  later?: {
    id: string;
    task: string;
    from?: string;
    at: string;
    ask: GateAsk;
  }[];
  problem?: string;
}

type Translate = ReturnType<typeof useTranslations<"office">>;

function statusText(t: Translate, status: string | undefined): string {
  const code = statusCode(status);
  return code ? t(`status.${code}`) : (status ?? "");
}

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

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

export function OfficePanel({
  lang,
  onWaiting,
  onNews,
}: {
  /** The language the mini-me works in, for what it writes (a card's draft, its answers). */
  lang: string;
  /** How many questions about requests wait for the person, for the bot's face. */
  onWaiting?: (count: number) => void;
  /** A request this mini-me sent was answered (or needs more): its conversation may have news. */
  onNews?: () => void;
}) {
  const t = useTranslations("office");
  const tAsk = useTranslations("ask");
  const problemText = useProblem();
  const [office, setOffice] = useState<Office | null>(null);
  const asksBox = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [answered, setAnswered] = useState<Record<string, string>>({});

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
    // A request whose state moved since the last look, or one first seen already answered (sent and
    // answered between two looks): its answer may be in a conversation.
    let news = false;
    for (const task of data.tasks ?? []) {
      const before = seen.current.get(task.id);
      if (before !== undefined && before !== task.status.state) news = true;
      if (
        before === undefined &&
        looked.current &&
        task.status.state !== "SUBMITTED" &&
        task.status.state !== "WORKING"
      )
        news = true;
      seen.current.set(task.id, task.status.state);
    }
    looked.current = true;
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
  const waiting = [
    ...(office?.asks ?? []),
    ...(office?.later ?? []).map((entry) => ({ ...entry, later: true })),
  ].filter((a) => !answered[a.id]);
  // Questions kept for later call the person only at the day's batch moments; the list shows
  // them all the same.
  const due = waiting.filter(
    (a) => !("later" in a) || Date.now() >= dueAt(new Date(a.at)).getTime(),
  );
  const calling = due.length;
  // The office floor redraws from this only when a look brings something new.
  const first = due[0]?.ask;
  const line = !first
    ? undefined
    : first.kind === "question"
      ? first.question
      : first.kind === "permission"
        ? `${tAsk("mayI")} ${describe(tAsk, first.tool, first.input)}`
        : tAsk("rule", { menu: first.menu });
  const room = useMemo(
    () => (office?.joined ? roomData(office, calling, line) : null),
    [office, calling, line],
  );
  useEffect(() => {
    onWaiting?.(calling);
  }, [calling, onWaiting]);

  return (
    <details
      className="rounded-xl border border-border p-4 text-sm"
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {office?.joined && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {others.length}
          </span>
        )}
        {calling > 0 && (
          <span className="ml-2 text-xs font-medium text-waiting">
            {t("asksTitle")}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        {office && !office.joined && (
          <Join lang={lang} busy={busy} onJoin={(body) => post(body)} />
        )}
        {office?.joined && office.me && (
          <>
            {office.problem && (
              <p className="text-destructive">{problemText(office.problem)}</p>
            )}
            <div ref={asksBox} className="flex flex-col gap-4 empty:hidden">
              {waiting.map((pending) => (
                <AskCard
                  key={pending.id}
                  turn={{
                    id: 0,
                    gate: pending.id,
                    ask: pending.ask,
                    state: answered[pending.id] ? "done" : "open",
                    answer: answered[pending.id],
                  }}
                  onAnswer={(answer, always) => {
                    setAnswered((all) => ({ ...all, [pending.id]: answer }));
                    // A question kept for later lets its request go on; a live one answers the gate.
                    void (
                      "later" in pending
                        ? post({ action: "later", id: pending.id, answer })
                        : fetch("/api/me/gate/answer", {
                            method: "POST",
                            headers: HEADERS,
                            body: JSON.stringify({
                              id: pending.id,
                              answer,
                              always,
                            }),
                          })
                    ).then(() => load());
                  }}
                />
              ))}
            </div>
            {open && room && (
              <OfficeRoom
                data={room}
                lobby={!clockedInToday()}
                onClockIn={rememberClockIn}
                onAnswer={() => {
                  const box = asksBox.current;
                  box?.scrollIntoView({ behavior: "smooth", block: "center" });
                  box?.querySelector("button")?.focus({ preventScroll: true });
                }}
              />
            )}
            <MyCard
              card={office.me.card}
              lang={lang}
              busy={busy}
              onStatus={(status) =>
                void post({
                  action: "card",
                  card: { ...office.me?.card, status },
                })
              }
              onWays={(howToWork) =>
                post({
                  action: "card",
                  card: { ...office.me?.card, howToWork },
                })
              }
            />
            <Menu
              menu={office.menu ?? []}
              likeMe={office.likeMe}
              lang={lang}
              busy={busy}
              onSave={(menu) => post({ action: "menu", menu })}
            />
            <section className="flex flex-col gap-2">
              <h3 className="font-medium">{t("colleagues")}</h3>
              {others.length === 0 && (
                <p className="text-muted-foreground">{t("nobody")}</p>
              )}
              <Invite busy={busy} />
              <ul className="flex flex-col">
                {others.map((member) => (
                  <Colleague
                    key={member.id}
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
              <h3 className="font-medium">{t("requests")}</h3>
              {(office.tasks ?? []).length === 0 && (
                <p className="text-muted-foreground">{t("none")}</p>
              )}
              <ul className="flex flex-col">
                {(office.tasks ?? []).map((task) => (
                  <Request
                    key={task.id}
                    task={task}
                    me={office.me?.id ?? ""}
                    relay={office.relay}
                    names={names}
                    busy={busy}
                    onReply={(text) =>
                      post({ action: "reply", id: task.id, text })
                    }
                  />
                ))}
              </ul>
            </section>
            {error && <p className="text-destructive">{problemText(error)}</p>}
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-muted-foreground"
              disabled={busy}
              onClick={() => void post({ action: "leave" })}
            >
              {t("leave")}
            </Button>
          </>
        )}
        {office && !office.joined && error && (
          <p className="text-destructive">{problemText(error)}</p>
        )}
      </div>
    </details>
  );
}

function Join({
  lang,
  busy,
  onJoin,
}: {
  lang: string;
  busy: boolean;
  onJoin: (body: unknown) => Promise<boolean>;
}) {
  const [relay, setRelay] = useState("http://127.0.0.1:3200");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [drafting, setDrafting] = useState(false);
  const t = useTranslations("office");
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
      <p className="text-muted-foreground">{t("intro")}</p>
      <label className="flex flex-col gap-1">
        <span>{t("relay")}</span>
        <Input
          value={relay}
          placeholder={t("relayPlaceholder")}
          onChange={(e) => {
            // An invite link fills in both the relay and the key.
            const invite = parseInvite(e.target.value);
            setRelay(invite ? invite.relay : e.target.value);
            if (invite) setKey(invite.key);
          }}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t("key")}</span>
        <Input value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t("name")}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        <span>{t("role")}</span>
        <div className="flex gap-2">
          <Input
            value={role}
            className="flex-1"
            placeholder={drafting ? t("drafting") : t("rolePlaceholder")}
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
            {t("draft")}
          </Button>
        </div>
      </label>
      <Button
        type="submit"
        className="self-start"
        disabled={busy || !relay.trim() || !key.trim() || !name.trim()}
        loading={busy}
      >
        {t("join")}
      </Button>
    </form>
  );
}

function MyCard({
  card,
  lang,
  busy,
  onStatus,
  onWays,
}: {
  card: Card;
  lang: string;
  busy: boolean;
  onStatus: (status: string) => void;
  onWays: (lines: string[]) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const current = statusCode(card.status);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{t("me")}</h3>
      <div className="flex flex-col gap-1">
        <span>
          {card.name}
          {card.description && (
            <span className="text-muted-foreground"> · {card.description}</span>
          )}
        </span>
        <div className="flex flex-wrap gap-1">
          {STATUSES.map((status) => (
            <Button
              key={status}
              size="xs"
              variant={current === status ? "secondary" : "ghost"}
              disabled={busy}
              onClick={() => onStatus(status)}
            >
              {t(`status.${status}`)}
            </Button>
          ))}
        </div>
      </div>
      <Ways
        lines={card.howToWork ?? []}
        lang={lang}
        busy={busy}
        onSave={onWays}
      />
    </section>
  );
}

/** One link to bring a colleague in: the relay and the office's key, on the relay's invite page. */
function Invite({ busy }: { busy: boolean }) {
  const t = useTranslations("office");
  const problemText = useProblem();
  const [url, setUrl] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const make = async () => {
    setProblem(null);
    const response = await fetch("/api/me/office", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "invite" }),
    }).catch(() => undefined);
    const data = await response?.json().catch(() => ({}));
    if (!response?.ok || typeof data?.url !== "string") {
      setProblem(
        String(data?.error ?? response?.status ?? "relay-unreachable"),
      );
      return;
    }
    setUrl(data.url);
  };
  if (!url)
    return (
      <div className="flex flex-col gap-1">
        <div>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void make()}
          >
            {t("invite")}
          </Button>
        </div>
        {problem && <p className="text-destructive">{problemText(problem)}</p>}
      </div>
    );
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-3">
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 truncate text-xs">{url}</code>
        <Button
          size="xs"
          variant="outline"
          className="shrink-0"
          onClick={() => {
            void navigator.clipboard
              ?.writeText(url)
              .then(() => setCopied(true))
              .catch(() => {});
          }}
        >
          {copied ? t("copied") : t("copyInvite")}
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">{t("inviteNote")}</span>
    </div>
  );
}

/**
 * How to work with the person: the lines of their ME.md that colleagues and their mini-mes read on
 * the card. The mini-me drafts lines from what it knows; a line goes on the card only when the
 * person adds it, and any line can be taken off.
 */
function Ways({
  lines,
  lang,
  busy,
  onSave,
}: {
  lines: string[];
  lang: string;
  busy: boolean;
  onSave: (lines: string[]) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const problemText = useProblem();
  // Kept here as well, so lines added one after another never undo each other.
  const [mine, setMine] = useState(lines);
  useEffect(() => setMine(lines), [lines]);
  const [drafted, setDrafted] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  const save = (next: string[]) => {
    setMine(next);
    void onSave(next);
  };

  const draft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft-ways", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProblem(String(data.error ?? response.status));
        return;
      }
      setDrafted(
        ((data.lines as string[]) ?? []).filter((line) => !mine.includes(line)),
      );
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs text-muted-foreground">{t("ways.title")}</span>
      {mine.length === 0 && drafted.length === 0 && (
        <p className="text-muted-foreground">{t("ways.none")}</p>
      )}
      {mine.length > 0 && (
        <ul className="flex flex-col">
          {mine.map((line) => (
            <li
              key={line}
              className="flex items-start justify-between gap-2 border-b border-border py-1.5 last:border-b-0"
            >
              <span className="min-w-0">{line}</span>
              <Button
                size="xs"
                variant="ghost"
                className="shrink-0 text-muted-foreground"
                disabled={busy}
                onClick={() => save(mine.filter((l) => l !== line))}
              >
                {t("menu.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {drafted.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg bg-muted p-3">
          <span className="text-xs text-muted-foreground">
            {t("ways.drafted")}
          </span>
          {drafted.map((line) => (
            <div key={line} className="flex items-start justify-between gap-2">
              <span className="min-w-0">{line}</span>
              <span className="flex shrink-0 gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    save([...mine, line]);
                    setDrafted((all) => all.filter((l) => l !== line));
                  }}
                >
                  {t("ways.add")}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() =>
                    setDrafted((all) => all.filter((l) => l !== line))
                  }
                >
                  {t("ways.skip")}
                </Button>
              </span>
            </div>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const line = typed.trim();
          if (!line || mine.includes(line)) return;
          setTyped("");
          save([...mine, line]);
        }}
      >
        <Input
          value={typed}
          placeholder={t("ways.placeholder")}
          aria-label={t("ways.placeholder")}
          onChange={(event) => setTyped(event.target.value)}
        />
        <Button
          size="sm"
          variant="ghost"
          type="submit"
          disabled={busy || !typed.trim()}
        >
          {t("ways.add")}
        </Button>
      </form>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={drafting || busy}
          loading={drafting}
          onClick={() => void draft()}
        >
          {drafting ? t("drafting") : t("draft")}
        </Button>
      </div>
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </div>
  );
}

/**
 * The kinds of request the person takes, each with how much their mini-me does alone: on its
 * own, then tell them, or ask them first. Every change is kept and goes on the card at once.
 */
function Menu({
  menu,
  likeMe,
  lang,
  busy,
  onSave,
}: {
  menu: MenuItem[];
  likeMe?: LikeMe;
  lang: string;
  busy: boolean;
  onSave: (menu: MenuItem[]) => Promise<boolean>;
}) {
  const t = useTranslations("office");
  const cancel = useTranslations("common")("cancel");
  const problemText = useProblem();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The mini-me drafts the kinds from what it knows; the person keeps, changes or removes them.
  const draft = async () => {
    setDrafting(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/office", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify({ action: "draft-menu", locale: lang }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProblem(String(data.error ?? response.status));
        return;
      }
      const known = new Set(menu.map((item) => item.name.toLowerCase()));
      const fresh = ((data.menu as MenuItem[]) ?? []).filter(
        (item) => !known.has(item.name.toLowerCase()),
      );
      if (fresh.length) await onSave([...menu, ...fresh]);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium">{t("menu.title")}</h3>
      <p className="text-muted-foreground">
        {menu.length ? t("menu.intro") : t("menu.none")}
      </p>
      {likeMe && likeMe.total > 0 && (
        <p>
          {/* Few answers make a percentage say more than it knows. */}
          {likeMe.total >= 5
            ? t.rich("menu.likeMe", {
                percent: Math.round((100 * likeMe.asIs) / likeMe.total),
                asIs: likeMe.asIs,
                total: likeMe.total,
                b: (chunks) => <b className="font-medium">{chunks}</b>,
              })
            : t("menu.likeMeFew", {
                asIs: likeMe.asIs,
                total: likeMe.total,
              })}
        </p>
      )}
      {menu.length > 0 && (
        <ul className="flex flex-col">
          {menu.map((item, index) => (
            <li
              key={item.id ?? item.name}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border py-2 last:border-b-0"
            >
              <span className="min-w-0 flex-1 basis-48">
                <span className="font-medium">{item.name}</span>
                {item.description && (
                  <span className="block text-xs text-muted-foreground">
                    {item.description}
                  </span>
                )}
                {item.id && likeMe?.byMenu[item.id] && (
                  <span className="block text-xs text-muted-foreground tabular-nums">
                    {t("menu.itemLikeMe", likeMe.byMenu[item.id])}
                  </span>
                )}
              </span>
              <Segmented<Trust>
                size="sm"
                options={TRUSTS.map((trust) => ({
                  value: trust,
                  label: t(`menu.trust.${trust}`),
                  title: t(`menu.trustHint.${trust}`),
                }))}
                value={item.trust}
                onChange={(trust) =>
                  void onSave(
                    menu.map((m, i) => (i === index ? { ...m, trust } : m)),
                  )
                }
              />
              <Button
                size="xs"
                variant="ghost"
                className="text-muted-foreground"
                disabled={busy}
                onClick={() => void onSave(menu.filter((_, i) => i !== index))}
              >
                {t("menu.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {menu.length > 0 && (
        <p className="text-xs text-muted-foreground">{t("menu.free")}</p>
      )}
      {adding && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onSave([
              ...menu,
              {
                name: name.trim(),
                description: description.trim(),
                trust: "tell",
              },
            ]).then((ok) => {
              if (!ok) return;
              setName("");
              setDescription("");
              setAdding(false);
            });
          }}
        >
          <label className="flex flex-col gap-1">
            <span>{t("menu.name")}</span>
            <Input
              value={name}
              placeholder={t("menu.namePlaceholder")}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>{t("menu.description")}</span>
            <Input
              value={description}
              placeholder={t("menu.descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {t("menu.save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {cancel}
            </Button>
          </div>
        </form>
      )}
      {!adding && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={drafting || busy}
            loading={drafting}
            onClick={() => void draft()}
          >
            {drafting ? t("drafting") : t("draft")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            {t("menu.add")}
          </Button>
        </div>
      )}
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </section>
  );
}

function Colleague({
  member,
  busy,
  onSend,
}: {
  member: { id: string; card: Card; seen: string };
  busy: boolean;
  onSend: (text: string) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const t = useTranslations("office");
  const common = useTranslations("common");
  const format = useFormatter();
  return (
    <li className="flex flex-col gap-2 border-b border-border py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0">
          <span className="font-medium">{member.card.name}</span>
          {member.card.status && (
            <span className="ml-2 text-xs text-muted-foreground">
              {statusText(t, member.card.status)}
            </span>
          )}
          {member.card.description && (
            <span className="block text-muted-foreground">
              {member.card.description}
            </span>
          )}
          {(member.card.howToWork ?? []).length > 0 && (
            <span className="mt-1 block text-xs text-muted-foreground">
              {t("ways.theirs", { name: member.card.name })}
              <span className="block whitespace-pre-line text-foreground">
                {(member.card.howToWork ?? [])
                  .map((line) => `· ${line}`)
                  .join("\n")}
              </span>
            </span>
          )}
          {(member.card.skills ?? []).length > 0 && (
            <span className="block text-xs text-muted-foreground">
              {t("menu.takes", {
                list: (member.card.skills ?? [])
                  .map((skill) => skill.name)
                  .join(" · "),
              })}
            </span>
          )}
          <span className="block text-xs text-muted-foreground">
            {t("seen", {
              when: format.dateTime(new Date(member.seen), {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
            })}
          </span>
        </span>
        {!asking && (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => setAsking(true)}
          >
            {t("ask")}
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
            placeholder={t("askPlaceholder", { name: member.card.name })}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              disabled={busy || !text.trim()}
              loading={busy}
            >
              {common("send")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
              {common("cancel")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function Request({
  task,
  me,
  relay,
  names,
  busy,
  onReply,
}: {
  task: Task;
  me: string;
  relay?: string;
  names: Map<string, string>;
  busy: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("office");
  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  const who =
    names.get(other) ??
    (task.metadata.guest ? t("byLink", { name: task.metadata.guest }) : other);
  const link =
    relay && task.metadata.link
      ? new URL(task.metadata.link, relay).toString()
      : undefined;
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
          {sent ? t("sent", { name: who }) : t("received", { name: who })}
        </span>
        <span
          className={cn(
            "shrink-0 text-xs",
            state === "INPUT_REQUIRED"
              ? "text-waiting"
              : "text-muted-foreground",
          )}
        >
          {moving ? (
            <ShinyText text={t(`state.${state}`)} />
          ) : (
            t(`state.${state}`)
          )}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-muted-foreground">{first}</p>
      {answer && <p className="whitespace-pre-wrap">{answer}</p>}
      {link && moving && (
        <div className="flex min-w-0 items-center gap-2">
          <code className="min-w-0 truncate text-xs text-muted-foreground">
            {link}
          </code>
          <Button
            size="xs"
            variant="outline"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? t("copied") : t("copyLink")}
          </Button>
        </div>
      )}
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
            {t("reply")}
          </Button>
        </form>
      )}
    </li>
  );
}
