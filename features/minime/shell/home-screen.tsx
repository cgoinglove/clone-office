"use client";

// Home, the first screen: what is happening, what waits on the person, and what to do about it
// (Paperclip's rule for every screen; ChatGPT, Grok and Lindy left a chat as home for named lists).
// One box asks the clone (or a colleague, by name); then what to decide now, answered in place;
// the requests on their way, by whose turn it is; what the clone did for them today; and today's
// meeting, flows and colleagues. While the app is new, its first steps come before all that.

import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  Check,
  Link2,
  MessagesSquare,
  Send,
  Sparkles,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HEADERS, statusText, type Task } from "../home/use-office";
import { statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { OfficeTrouble } from "./office-trouble";
import { Mark, PhaseChip, phaseOf } from "./parts";
import { askedText } from "./requests-screen";
import { TurnRows } from "./turn-rows";
import { FirstSteps } from "./welcome";
import { taskOf, yourTurn } from "./your-turn";

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
  const tOffice = useTranslations("office");
  const tMeeting = useTranslations("shell.meeting");
  const format = useFormatter();
  const router = useRouter();
  const app = useApp();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const memberIds = members.map((member) => member.id);
  const indexOf = (id: string) => Math.max(0, memberIds.indexOf(id));
  const nameOf = (id: string) => office.names.get(id) ?? "";
  const turns = yourTurn(office, app.chatAsks);
  const tasks = data?.tasks ?? [];
  const yours = new Set(
    office.waiting.map((waiting) => taskOf(waiting)).filter(Boolean),
  );
  const clock = (iso: string) =>
    format.dateTime(new Date(iso), {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

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

  // Requests on their way, those waiting on the person first.
  const moving = tasks
    .filter((task) => OPEN.includes(task.status.state))
    .sort(
      (a, b) =>
        Number(yours.has(b.id)) - Number(yours.has(a.id)) ||
        b.status.timestamp.localeCompare(a.status.timestamp),
    );

  // What the clone did for the person today: answers it gave colleagues, meetings it brought back,
  // flows it ran.
  const did: {
    key: string;
    at: string;
    icon: ReactNode;
    text: string;
    detail?: string;
    href: string;
    tone?: "failed";
  }[] = [
    ...tasks
      .filter(
        (task) =>
          task.metadata.to === me &&
          task.status.state === "COMPLETED" &&
          today(task.status.timestamp),
      )
      .map((task) => ({
        key: `t:${task.id}`,
        at: task.status.timestamp,
        icon: (
          <Mark
            id={task.metadata.from}
            index={indexOf(task.metadata.from)}
            size={18}
          />
        ),
        text: t("answered", { name: nameOf(task.metadata.from) }),
        detail: askedText(task),
        href: `/requests/${encodeURIComponent(task.id)}`,
      })),
    ...(data?.meetings ?? [])
      .filter(
        (meeting) =>
          meeting.state === "closed" &&
          today(meeting.closed) &&
          Boolean(me) &&
          meeting.members.includes(me as string) &&
          data?.meetingChats?.[meeting.id],
      )
      .map((meeting) => ({
        key: `m:${meeting.id}`,
        at: meeting.closed ?? meeting.created,
        icon: <MessagesSquare className="size-4 text-muted-foreground" />,
        text: t("meetingBack", { kind: tMeeting(meeting.kind) }),
        detail: meeting.kind === "question" ? meeting.topic : undefined,
        href: `/chat?c=${encodeURIComponent(data?.meetingChats?.[meeting.id] ?? "")}`,
      })),
    ...flows
      .filter((flow) => today(flow.last?.at))
      .map((flow) => ({
        key: `f:${flow.id}`,
        at: flow.last?.at ?? "",
        icon: <CalendarClock className="size-4 text-muted-foreground" />,
        text:
          flow.last?.ok === false
            ? t("flowFailed", { name: flow.name })
            : t("flowRan", { name: flow.name }),
        href: "/clone?tab=flows",
        ...(flow.last?.ok === false ? { tone: "failed" as const } : {}),
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Today, still to come: the standup if the office holds one today, and the flows due.
  const standup = data?.standup;
  const standupToday =
    standup && standup.days.includes(new Date().getDay())
      ? standup.time
      : undefined;
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

  const hour = new Date().getHours();
  const part =
    hour < 5
      ? "night"
      : hour < 12
        ? "morning"
        : hour < 18
          ? "afternoon"
          : "evening";
  const answeredToday = did.filter((item) => item.key.startsWith("t:")).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-8 pt-8 pb-14">
        <OfficeTrouble />
        <header className="flex flex-col gap-1.5">
          <h1 className="text-[24px] leading-tight font-semibold tracking-tight text-balance">
            {app.name
              ? t(`hello.${part}`, { name: app.name })
              : t(`helloPlain.${part}`)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("summary", {
              decide: turns.length,
              moving: moving.length,
              answered: answeredToday,
            })}
          </p>
        </header>

        <AskBox
          suggestions={
            app.learn.tasks.length
              ? app.learn.tasks.slice(0, 3).map((task) => task.label)
              : [t("try.yesterday"), t("try.waiting"), t("try.know")]
          }
          onSend={(text) =>
            router.push(`/chat?send=${encodeURIComponent(text)}`)
          }
        />

        <FirstSteps
          onWrite={(text) =>
            router.push(
              text ? `/chat?say=${encodeURIComponent(text)}` : "/chat",
            )
          }
        />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-8">
            <Section
              id="h-decide"
              title={t("decide")}
              count={turns.length}
              tone={turns.length ? "ember" : undefined}
              hint={t("decideHint")}
            >
              {turns.length ? (
                <div className="overflow-hidden rounded-[14px] bg-background shadow-[0_0_0_1px_var(--alpha-10)]">
                  <TurnRows turns={turns} members={memberIds} />
                </div>
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
                  <ArrowRight className="size-3.5" />
                </Link>
              }
            >
              {moving.length ? (
                <ul className="flex flex-col overflow-hidden rounded-[14px] shadow-[0_0_0_1px_var(--alpha-10)]">
                  {moving.slice(0, 6).map((task) => (
                    <RequestRow
                      key={task.id}
                      task={task}
                      me={me}
                      yours={yours.has(task.id)}
                      name={
                        task.metadata.from === me
                          ? (task.metadata.guest ?? nameOf(task.metadata.to))
                          : nameOf(task.metadata.from)
                      }
                      index={indexOf(
                        task.metadata.from === me
                          ? task.metadata.to
                          : task.metadata.from,
                      )}
                      when={clock(task.status.timestamp)}
                    />
                  ))}
                </ul>
              ) : colleagues.length ? (
                <Quiet>{t("movingEmpty")}</Quiet>
              ) : (
                <div className="flex flex-col gap-3 rounded-[14px] px-4 py-4 shadow-[inset_0_0_0_1px_var(--alpha-10)]">
                  <p className="text-[13.5px] leading-relaxed text-muted-foreground">
                    {t("movingAlone")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="brand"
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
                      size="sm"
                      variant="outline"
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

          <div className="flex min-w-0 flex-col gap-8">
            <Section id="h-did" title={t("did")} hint={t("didHint")}>
              {did.length ? (
                <ul className="flex flex-col">
                  {did.slice(0, 8).map((item) => (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
                      >
                        <span className="mt-0.5 grid size-[18px] shrink-0 place-items-center">
                          {item.icon}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span
                            className={cn(
                              "text-[13.5px] font-medium",
                              item.tone === "failed" && "text-destructive",
                            )}
                          >
                            {item.text}
                          </span>
                          {item.detail && (
                            <span className="truncate text-xs text-muted-foreground">
                              {item.detail}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
                          {clock(item.at)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Quiet>{t("didEmpty")}</Quiet>
              )}
            </Section>

            <Section id="h-today" title={t("today")}>
              <ul className="flex flex-col gap-1.5">
                {standupToday && (
                  <li className="flex items-center gap-2.5 text-[13.5px]">
                    <MessagesSquare className="size-4 shrink-0 text-muted-foreground" />
                    <span className="flex-1">{t("standupAt")}</span>
                    <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                      {standupToday}
                    </span>
                  </li>
                )}
                {coming.map((flow) => (
                  <li
                    key={flow.id}
                    className="flex items-center gap-2.5 text-[13.5px]"
                  >
                    <CalendarClock className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{flow.name}</span>
                    <span className="font-mono text-[12px] text-muted-foreground tabular-nums">
                      {flow.next ? clock(flow.next) : ""}
                    </span>
                  </li>
                ))}
                {!standupToday && !coming.length && (
                  <li>
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/chat?say=${encodeURIComponent(t("flowStarter"))}`,
                        )
                      }
                      className="flex items-center gap-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Sparkles className="size-3.5 shrink-0" />
                      {t("nothingToday")}
                    </button>
                  </li>
                )}
              </ul>
              {colleagues.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1 border-t border-border/60 pt-3">
                  {colleagues.slice(0, 8).map((member) => {
                    const code = statusCode(member.card.status);
                    const off =
                      code === "off" ||
                      Date.now() - Date.parse(member.seen) > 120_000;
                    return (
                      <li
                        key={member.id}
                        className="flex items-center gap-2.5 text-[13.5px]"
                      >
                        <Mark
                          id={member.id}
                          index={indexOf(member.id)}
                          size={18}
                          off={off}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {member.card.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {off
                            ? t("off")
                            : statusText(tOffice, member.card.status) ||
                              t("in")}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          </div>
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
  return (
    <div className="flex flex-col gap-2.5">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) onSend(text.trim());
        }}
        className="flex items-center gap-2 rounded-[14px] bg-background py-2 pr-2 pl-4 shadow-[0_0_0_1px_var(--alpha-15),0_10px_30px_-22px_var(--alpha-30)] focus-within:shadow-[0_0_0_1.5px_var(--brand)]"
      >
        <input
          id="home-ask"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("askPlaceholder")}
          aria-label={t("askPlaceholder")}
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" variant="brand" disabled={!text.trim()}>
          <Send />
          {t("askSend")}
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSend(suggestion)}
            className="rounded-lg px-2.5 py-1 text-[12.5px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--alpha-10)] transition-colors hover:bg-muted hover:text-foreground"
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
  tone,
  hint,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  tone?: "ember";
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id={id}
            className="flex items-center gap-2 text-[15px] font-semibold"
          >
            {title}
            {count !== undefined && count > 0 && (
              <span
                className={cn(
                  "rounded-md px-1.5 font-mono text-[11.5px] font-medium tabular-nums",
                  tone === "ember"
                    ? "bg-waiting/10 text-waiting"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            )}
          </h2>
          {hint && (
            <p className="text-[12.5px] text-muted-foreground">{hint}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Quiet({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-[14px] px-4 py-3.5 text-[13.5px] text-muted-foreground shadow-[inset_0_0_0_1px_var(--alpha-08)]">
      {icon}
      {children}
    </p>
  );
}

function RequestRow({
  task,
  me,
  yours,
  name,
  index,
  when,
}: {
  task: Task;
  me?: string;
  yours: boolean;
  name: string;
  index: number;
  when: string;
}) {
  const t = useTranslations("shell.home");
  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  return (
    <li className="border-t border-border/60 first:border-t-0">
      <Link
        href={`/requests/${encodeURIComponent(task.id)}`}
        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
      >
        {sent ? (
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
        ) : (
          <ArrowDownLeft className="size-4 shrink-0 text-muted-foreground" />
        )}
        <Mark id={other} index={index} size={20} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] font-medium">
            {askedText(task)}
          </span>
          <span className="text-xs text-muted-foreground">
            {sent ? t("to", { name }) : t("from", { name })}
          </span>
        </span>
        <PhaseChip phase={phaseOf(task.status.state, yours)} />
        <span className="shrink-0 font-mono text-[11.5px] text-muted-foreground tabular-nums">
          {when}
        </span>
      </Link>
    </li>
  );
}
