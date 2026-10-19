"use client";

// Home, the first screen: what is happening, what waits on the person, and what to do about it
// (Paperclip's rule for every screen; ChatGPT, Grok and Lindy left a chat as home for named lists).
// One box asks the clone (or a colleague, by name); then what to decide, first, as cards answered
// in place with what the clone checked; the requests on their way, one line each; and beside them
// what the clone did today and who is in. While nothing is going on yet the first steps come
// first; after that they wait as one card beside (10-19 redesign).

import {
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  Check,
  ChevronRight,
  Link2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { Bot } from "@/features/office";
import { useSlashKey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { HEADERS } from "../home/use-office";
import { statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { OfficeTrouble } from "./office-trouble";
import { lastWords, Mark, RequestLine, useRequestWords } from "./parts";
import { askedText } from "./requests-screen";
import { StarNote } from "./star-note";
import { TurnRows } from "./turn-rows";
import { FirstSteps } from "./welcome";

interface FlowLine {
  id: string;
  name: string;
  paused: boolean;
  next?: string;
  last?: { at: string; ok?: boolean };
}

const OPEN = ["SUBMITTED", "WORKING", "INPUT_REQUIRED"];

/** The start of this day, on this computer's clock. */
function startOfDay(now = new Date()): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function HomeScreen() {
  const t = useTranslations("shell.home");
  const format = useFormatter();
  const router = useRouter();
  const app = useApp();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const { indexOf } = office;
  const nameOf = (id: string) => office.names.get(id) ?? "";
  const words = useRequestWords();
  // every question still on the list (an answer on its way stays in place, with its Undo); what
  // is counted is what still waits
  const turns = app.turns;
  const open = app.toDecide.length;
  const tasks = data?.tasks ?? [];
  const yours = app.tasksToDecide;
  const now = Date.now();
  // within the hour "n minutes ago", today the clock, before that the day (one rule everywhere)
  const when = (iso: string) => {
    const at = Date.parse(iso);
    if (now - at < 60 * 60 * 1000)
      return format.relativeTime(Math.min(at, now), now);
    if (at >= startOfDay())
      return format.dateTime(new Date(at), {
        hour: "numeric",
        minute: "2-digit",
      });
    return format.relativeTime(at, { now, unit: "day" });
  };

  const [flows, setFlows] = useState<FlowLine[]>([]);
  useEffect(() => {
    let live = true;
    void fetch("/api/me/flows", { headers: HEADERS })
      .then((r) => r.json())
      .then((body: { flows?: FlowLine[] }) => {
        if (live) setFlows(body.flows ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const dayStart = startOfDay();
  const today = (iso?: string) =>
    Boolean(iso) && Date.parse(iso as string) >= dayStart;
  const tomorrow = dayStart + 24 * 60 * 60 * 1000;

  // Requests on their way: what waits on the person is above, as cards, so not again here.
  const moving = tasks
    .filter((task) => OPEN.includes(task.status.state) && !yours.has(task.id))
    .sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp));

  // What the clone did for the person today: answers it gave colleagues, flows it ran.
  const answeredTasks = tasks.filter(
    (task) =>
      task.metadata.to === me &&
      task.status.state === "COMPLETED" &&
      today(task.status.timestamp),
  );
  const did: {
    key: string;
    at: string;
    icon: ReactNode;
    text: string;
    detail?: string;
    href: string;
    tone?: "failed";
  }[] = [
    ...answeredTasks.map((task) => {
      const answer = lastWords(task);
      return {
        key: `t:${task.id}`,
        at: task.status.timestamp,
        icon: (
          <Mark
            id={task.metadata.from}
            index={indexOf(task.metadata.from)}
            size={22}
          />
        ),
        text: t("answered", { name: nameOf(task.metadata.from) }),
        detail: answer ? t("quoted", { text: answer }) : askedText(task),
        href: `/requests/${encodeURIComponent(task.id)}`,
      };
    }),
    ...flows
      .filter((flow) => today(flow.last?.at))
      .map((flow) => ({
        key: `f:${flow.id}`,
        at: flow.last?.at ?? "",
        icon: (
          <span className="grid size-[22px] place-items-center rounded-md bg-muted">
            <CalendarClock className="size-3.5 text-muted-foreground" />
          </span>
        ),
        text:
          flow.last?.ok === false
            ? t("flowFailed", { name: flow.name })
            : t("flowRan", { name: flow.name }),
        href: "/clone?tab=flows",
        ...(flow.last?.ok === false ? { tone: "failed" as const } : {}),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Today, still to come: the flows due.
  const coming = flows
    .filter(
      (flow) =>
        !flow.paused &&
        flow.next &&
        Date.parse(flow.next) >= Date.now() &&
        Date.parse(flow.next) < tomorrow,
    )
    .sort((a, b) => (a.next ?? "").localeCompare(b.next ?? ""));
  const colleagues = members.filter((member) => member.id !== me);
  const isOff = (member: (typeof members)[number]) => {
    const code = statusCode(member.card.status);
    // On the web: no clone to have gone quiet, so never off.
    return (
      code === "off" ||
      (code !== "web" && Date.now() - Date.parse(member.seen) > 120_000)
    );
  };
  const inNow = members.filter((member) => !isOff(member)).length;

  const hour = new Date().getHours();
  const part =
    hour < 5
      ? "night"
      : hour < 12
        ? "morning"
        : hour < 18
          ? "afternoon"
          : "evening";
  // the colleagues the clone answered for the person today, each once
  const answeredFor = new Set(answeredTasks.map((task) => task.metadata.from))
    .size;
  const quiet = !turns.length && !moving.length && !answeredFor;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[67rem] flex-col gap-8 px-8 pt-11 pb-16">
        <OfficeTrouble />
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-balance">
            {app.name
              ? t(`hello.${part}`, { name: app.name })
              : t(`helloPlain.${part}`)}
          </h1>
          <p className="text-[15px] text-muted-foreground text-pretty">
            {quiet
              ? t("summaryQuiet")
              : `${t("summaryAnswered", { count: answeredFor })} `}
            {!quiet &&
              t.rich("summaryDecide", {
                count: open,
                b: (chunk) => (
                  <b className="font-semibold text-foreground">{chunk}</b>
                ),
              })}
          </p>
        </header>

        <AskBox
          suggestions={
            app.learn.tasks.length
              ? app.learn.tasks.slice(0, 3).map((task) => task.label)
              : [t("try.yesterday"), t("try.status"), t("try.find")]
          }
          onSend={(text) =>
            router.push(`/chat?send=${encodeURIComponent(text)}`)
          }
        />

        <StarNote
          ready={tasks.some(
            (task) =>
              task.metadata.to === me && task.status.state === "COMPLETED",
          )}
        />

        <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-9">
            {quiet && (
              <FirstSteps
                onWrite={(text) =>
                  router.push(
                    text ? `/chat?say=${encodeURIComponent(text)}` : "/chat",
                  )
                }
              />
            )}
            <Section
              id="h-decide"
              title={t("decide")}
              count={open}
              waiting
              hint={turns.length ? t("decideHint") : undefined}
            >
              {turns.length ? (
                <TurnRows turns={turns} heading="h-decide" />
              ) : (
                <Quiet icon={<Check className="size-4" />}>
                  {t("caughtUp")}
                </Quiet>
              )}
            </Section>

            <Section
              id="h-moving"
              title={t("moving")}
              count={moving.length}
              action={
                <Link
                  href="/requests"
                  className="flex items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("allRequests")}
                  <ChevronRight className="size-3.5" />
                </Link>
              }
            >
              {moving.length ? (
                <ul className="-mx-3 flex flex-col gap-px">
                  {moving.slice(0, 6).map((task) => {
                    const sent = task.metadata.from === me;
                    const name = sent
                      ? (task.metadata.guest ?? nameOf(task.metadata.to))
                      : nameOf(task.metadata.from);
                    return (
                      <RequestLine
                        key={task.id}
                        task={task}
                        me={me}
                        name={name}
                        index={indexOf(
                          sent ? task.metadata.to : task.metadata.from,
                        )}
                        words={words(task, sent, name)}
                        when={when(task.status.timestamp)}
                      />
                    );
                  })}
                </ul>
              ) : colleagues.length ? (
                <Quiet icon={<ArrowUpRight className="size-4" />}>
                  {t("movingEmpty")}
                </Quiet>
              ) : (
                <div className="flex flex-col gap-3">
                  <Quiet icon={<UserPlus className="size-4" />}>
                    {t("movingAlone")}
                  </Quiet>
                  <div className="flex flex-wrap gap-2 pl-6.5">
                    <Button
                      variant="secondary"
                      className="h-8.5 rounded-[10px] px-3"
                      onClick={() =>
                        router.push(
                          `/chat?say=${encodeURIComponent(t("linkStarter"))}`,
                        )
                      }
                    >
                      <Link2 />
                      {t("askByLink")}
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-8.5 rounded-[10px] px-3"
                      onClick={() => app.setSettings("office")}
                    >
                      <UserPlus />
                      {app.joined ? t("invite") : t("setUpOffice")}
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          </div>

          {/* The day at a glance, beside: what the clone did, who is in, and the first steps left. */}
          <aside aria-label={t("today")} className="flex flex-col gap-3.5">
            <section
              aria-labelledby="h-did"
              className="flex flex-col gap-3.5 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)]"
            >
              <h2
                id="h-did"
                className="flex items-center gap-2 text-[14px] font-semibold"
              >
                <Bot size={18} mood="idle" still mine className="shrink-0" />
                <span className="flex-1">{t("did")}</span>
                <Tip label={t("allDid")}>
                  <Link
                    href="/clone?tab=activity"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                      "-my-1 text-muted-foreground",
                    )}
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </Tip>
              </h2>
              {did.length ? (
                <ul className="-mx-2 flex flex-col gap-1">
                  {did.slice(0, 5).map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/[0.04]"
                      >
                        <span className="mt-0.5 shrink-0">{item.icon}</span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-baseline gap-2">
                            <span
                              className={cn(
                                "min-w-0 flex-1 truncate text-[13.5px] font-medium",
                                item.tone === "failed" && "text-destructive",
                              )}
                            >
                              {item.text}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                              {when(item.at)}
                            </span>
                          </span>
                          {item.detail && (
                            <span className="truncate text-[12.5px] text-muted-foreground">
                              {item.detail}
                            </span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  {t("didEmpty")}
                </p>
              )}
              {coming.length > 0 && (
                <p className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
                  <CalendarClock className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">
                    {t("next", {
                      name: coming[0].name,
                      at: coming[0].next ? when(coming[0].next) : "",
                    })}
                  </span>
                </p>
              )}
            </section>

            {colleagues.length > 0 && (
              <section
                aria-labelledby="h-colleagues"
                className="flex flex-col gap-3 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)]"
              >
                <h2
                  id="h-colleagues"
                  className="flex items-baseline gap-2 text-[14px] font-semibold"
                >
                  <span className="flex-1">{t("colleagues")}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {t("inOf", { count: inNow, all: members.length })}
                  </span>
                </h2>
                <ul className="flex flex-wrap gap-x-1 gap-y-2">
                  {colleagues.slice(0, 11).map((member) => (
                    <li
                      key={member.id}
                      className="flex w-[42px] flex-col items-center gap-1"
                    >
                      <Mark
                        id={member.id}
                        index={indexOf(member.id)}
                        size={24}
                        off={isOff(member)}
                        label={member.card.name}
                      />
                      <span className="w-full truncate text-center text-[11.5px] text-muted-foreground">
                        {member.card.name}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {!quiet && (
              <FirstSteps
                compact
                onWrite={(text) =>
                  router.push(
                    text ? `/chat?say=${encodeURIComponent(text)}` : "/chat",
                  )
                }
              />
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/** One box: what the person types goes to their clone, which asks a colleague when named. */
function AskBox({
  suggestions,
  onSend,
}: {
  suggestions: string[];
  onSend: (text: string) => void;
}) {
  const t = useTranslations("shell.home");
  const [text, setText] = useState("");
  // "/" writes to the clone from anywhere on Home, as in a conversation.
  useSlashKey(() => document.getElementById("home-ask")?.focus());
  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) onSend(text.trim());
        }}
        data-ask-box
        className="flex items-center gap-2 rounded-[26px] bg-background py-1.5 pr-1.5 pl-5 shadow-[0_0_0_1px_var(--field)] transition-shadow focus-within:shadow-[0_0_0_1px_var(--field),0_0_0_4px_var(--alpha-05)]"
      >
        <input
          id="home-ask"
          aria-keyshortcuts="/"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("askPlaceholder")}
          aria-label={t("askPlaceholder")}
          className="h-11 min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-muted-foreground"
        />
        <Tip label={t("askSend")} keys="↵">
          <Button
            type="submit"
            size="icon"
            disabled={!text.trim()}
            className="size-10 rounded-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
          >
            <ArrowUp className="size-4.5" />
          </Button>
        </Tip>
      </form>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSend(suggestion)}
            className="flex h-8 items-center rounded-full bg-muted/60 px-3.5 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  count,
  waiting = false,
  hint,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  /** What waits on the person: its orange dot, and its count on the orange's soft fill. */
  waiting?: boolean;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {/* the heading takes the keyboard when the rows under it are gone */}
        <h2
          id={id}
          tabIndex={-1}
          className="-mx-1 flex items-center gap-2 rounded-sm px-1 text-[16px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {waiting && count !== undefined && count > 0 && (
            <span aria-hidden className="size-1.5 rounded-full bg-waiting" />
          )}
          {title}
          {count !== undefined && count > 0 && (
            <span
              className={cn(
                "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums",
                waiting
                  ? "bg-waiting/14 text-waiting-ink"
                  : "bg-foreground/[0.07] text-muted-foreground",
              )}
            >
              {count}
            </span>
          )}
          {hint && (
            <span className="ml-1 text-[13px] font-normal text-muted-foreground max-sm:hidden">
              {hint}
            </span>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Nothing here yet, said in one line: an empty part is a sentence, never an empty box. */
function Quiet({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[14px] leading-relaxed text-muted-foreground [&_svg]:mt-0.5 [&_svg]:shrink-0">
      {icon}
      <span>{children}</span>
    </p>
  );
}
