"use client";

// The pieces every screen of the app is built from, so a change to one shows everywhere: a
// screen's heading, a colleague's clone, the four states a request can be in, and the office's own
// marks (the departures board's flap digits, the DONE stamp) carried out of the drawing.

import { Check, Clock, Link2, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Bot, type BotShape, type Mood } from "@/features/office";
import { looksOf } from "@/features/office/room/looks.mjs";
import { cn } from "@/lib/utils";
import type { State, Task } from "../home/use-office";

/** A screen's heading: what it is, a line saying what it is for, and its own actions. */
export function PageHeader({
  title,
  hint,
  actions,
  className,
}: {
  title: ReactNode;
  hint?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-balance">
          {title}
        </h1>
        {hint && (
          <p className="max-w-[60ch] text-sm text-muted-foreground text-pretty">
            {hint}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

/** A colleague's clone as it looks in the office: its colour and shape by place in the office. */
export function Mark({
  id,
  index = 0,
  mine = false,
  size = 18,
  mood = "idle",
  off = false,
  label,
  className,
}: {
  id: string;
  /** Its place in the office's list of members, which sets its colour. */
  index?: number;
  mine?: boolean;
  size?: number;
  mood?: Mood;
  /** Gone home or away from their desk: shown faded. */
  off?: boolean;
  label?: string;
  className?: string;
}) {
  const look = looksOf({ id, mine }, index);
  return (
    <Bot
      size={size}
      mood={mood}
      still
      label={label}
      mine={mine}
      color={mine ? undefined : look.color}
      shape={look.shape as BotShape}
      className={cn("shrink-0", off && "opacity-45", className)}
    />
  );
}

/** The four states a person sees a request in, from the relay's A2A states. */
export type Phase = "yours" | "working" | "waiting" | "done";

export function phaseOf(state: State, yours: boolean): Phase {
  if (yours) return "yours";
  if (state === "SUBMITTED" || state === "WORKING") return "working";
  if (state === "INPUT_REQUIRED") return "waiting";
  return "done";
}

/** A request's state as a small chip: the ember when it is the person's turn. */
export function PhaseChip({
  phase,
  failed = false,
}: {
  phase: Phase;
  /** A finished request that did not end well. */
  failed?: boolean;
}) {
  const t = useTranslations("shell.phase");
  if (phase === "done")
    return failed ? (
      <span className="inline-flex h-6 items-center rounded-md bg-destructive/8 px-2 text-xs font-medium text-destructive">
        {t("failed")}
      </span>
    ) : (
      <DoneStamp />
    );
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs",
        phase === "yours"
          ? "bg-waiting/8 font-semibold text-waiting-ink"
          : "bg-muted text-foreground/80",
      )}
    >
      {phase === "yours" && (
        <span aria-hidden className="size-1.5 rounded-full bg-waiting" />
      )}
      {phase === "working" && (
        <LoaderCircle
          aria-hidden
          className="size-3 animate-spin text-brand motion-reduce:animate-none"
        />
      )}
      {phase === "waiting" && (
        <Clock aria-hidden className="size-3 text-muted-foreground" />
      )}
      {t(phase)}
    </span>
  );
}

/** The office's DONE stamp, on a finished request. */
export function DoneStamp({ className }: { className?: string }) {
  const t = useTranslations("shell.phase");
  return (
    <span
      role="img"
      aria-label={t("done")}
      className={cn(
        "inline-block -rotate-6 rounded-[4px] border-[1.5px] border-muted-foreground/70 px-1.5 font-mono text-[10.5px] leading-[18px] font-semibold tracking-[0.12em] text-muted-foreground",
        className,
      )}
    >
      DONE
    </span>
  );
}

/**
 * Digits as a departures board shows them, one card per character with its lower half a shade
 * darker: times and rounds. A count of what waits on the person is a plain number (10-10).
 */
export function Flap({
  value,
  label,
  className,
}: {
  value: string;
  /** What a screen reader hears instead of the cards. */
  label?: string;
  className?: string;
}) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        "inline-flex items-center gap-px font-mono text-[11px] leading-none font-semibold tabular-nums",
        className,
      )}
    >
      {[...value].map((char, at) =>
        /[0-9A-Z]/.test(char) ? (
          <span
            key={at}
            className="grid h-[18px] w-[13px] place-items-center rounded-[3px] bg-[linear-gradient(var(--background)_0_50%,var(--muted)_50%_100%)] text-foreground shadow-[inset_0_0_0_1px_var(--alpha-12)]"
          >
            {char}
          </span>
        ) : (
          <span key={at} className="px-px text-muted-foreground">
            {char}
          </span>
        ),
      )}
    </span>
  );
}

/** The asking clone wears a red dot while its question waits on the person. */
export function Asking({ children }: { children: ReactNode }) {
  return (
    <span className="relative inline-flex shrink-0 self-start">
      {children}
      <span
        aria-hidden
        className="absolute -top-px -right-0.5 size-[28%] min-h-[7px] min-w-[7px] rounded-full bg-destructive ring-[1.5px] ring-background"
      />
    </span>
  );
}

/** A person's office status as a dot: the brand while working, a ring when gone home. */
export function StatusDot({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        className,
        status === "working"
          ? "bg-brand"
          : status === "off"
            ? "border border-muted-foreground/60"
            : "bg-muted-foreground/60",
      )}
    />
  );
}

/** How the clone's answer to a colleague went: alone, telling the person after, after they saw it, or theirs. */
export type Handled = "alone" | "told" | "asked" | "self";

/** A request's last words, from either side. */
export const lastWords = (task: Task) =>
  [...task.history]
    .reverse()
    .find((message) => message.role === "agent")
    ?.parts.map((part) => part.text)
    .join(" ");

/**
 * The line under a request's title, in the person's words: who asks whom, then what is happening
 * now (the clone answering, a colleague's clone answering, what the clone asks the person) or how
 * it ended (the last answer, quoted).
 */
export function useRequestWords() {
  const t = useTranslations("shell.line");
  return (task: Task, sent: boolean, name: string, question?: string) => {
    const state = task.status.state;
    if (question) return t("asking", { question });
    if (["FAILED", "REJECTED", "CANCELED"].includes(state)) return t("failed");
    const answer = lastWords(task);
    if (state === "COMPLETED")
      return answer ? t("quote", { text: answer }) : t("done");
    if (state === "INPUT_REQUIRED")
      return sent ? t("theirsAsking", { name }) : t("askingPlain");
    return sent ? t("theirsWorking", { name }) : t("mineWorking");
  };
}

/**
 * One request in a list, the same everywhere a request is listed (Home, Requests, a conversation's
 * side, a colleague's panel): the other side's clone (wearing its dot while the request waits on
 * the person), what was asked, who asks whom and what goes on now, and when. `sm` keeps the first
 * line and who asks whom with the time, for narrow sides.
 */
export function RequestLine({
  task,
  me,
  yours = false,
  name,
  index,
  words,
  when,
  handled,
  size = "md",
}: {
  task: Task;
  me?: string;
  /** It waits on the person. */
  yours?: boolean;
  /** The other side's name (or the guest's, asked by a link). */
  name: string;
  index: number;
  words?: string;
  when: string;
  handled?: Handled;
  size?: "md" | "sm";
}) {
  const t = useTranslations("shell.line");
  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  const small = size === "sm";
  const state = task.status.state;
  const failed = ["FAILED", "REJECTED", "CANCELED"].includes(state);
  const glyph = yours ? (
    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-waiting" />
  ) : failed ? (
    <X aria-hidden className="size-3 shrink-0 text-destructive" />
  ) : state === "COMPLETED" ? (
    <Check aria-hidden className="size-3 shrink-0" />
  ) : state === "INPUT_REQUIRED" ? (
    <Clock aria-hidden className="size-3 shrink-0" />
  ) : (
    <LoaderCircle
      aria-hidden
      className="size-3 shrink-0 animate-spin motion-reduce:animate-none"
    />
  );
  const face = task.metadata.guest ? (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-muted text-muted-foreground",
        small ? "size-[22px]" : "size-7",
      )}
    >
      <Link2 className="size-3.5" />
    </span>
  ) : (
    <Mark id={other} index={index} size={small ? 22 : 28} />
  );
  const way = sent
    ? t("way", { from: t("me"), to: name })
    : t("way", { from: name, to: t("me") });
  return (
    <li>
      <Link
        href={`/requests/${encodeURIComponent(task.id)}`}
        className={cn(
          "flex items-center rounded-xl transition-colors hover:bg-foreground/[0.04] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          small ? "gap-2.5 px-2 py-1.5" : "gap-3.5 px-3 py-2.5",
        )}
      >
        {yours ? <Asking>{face}</Asking> : face}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate font-medium",
              small ? "text-[13.5px]" : "text-[14.5px]",
            )}
          >
            {task.history[0]?.parts.map((part) => part.text).join(" ")}
          </span>
          <span
            className={cn(
              "flex min-w-0 items-center gap-1.5 text-muted-foreground",
              small ? "text-xs" : "text-[13px]",
            )}
          >
            {glyph}
            <span className="shrink-0">{way}</span>
            <span aria-hidden>·</span>
            <span className="min-w-0 truncate">{small ? when : words}</span>
            {/* drawn small, how it stands is the glyph alone: a screen reader hears it in words */}
            {small && words && <span className="sr-only">, {words}</span>}
          </span>
        </span>
        {!small && handled && (
          <span className="inline-flex h-[21px] shrink-0 items-center rounded-full bg-muted px-2 text-[11.5px] font-medium text-foreground/75 max-sm:hidden">
            {t(`handled.${handled}`)}
          </span>
        )}
        {!small && (
          <span className="w-16 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
            {when}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * When something happened, by one rule on every screen (10-19): within a minute "just now", within
 * the hour "n minutes ago", earlier today the clock, yesterday "yesterday", before that the day.
 */
export function useWhen(): (iso: string) => string {
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const t = useTranslations("shell.line");
  return (iso: string) => {
    const when = Date.parse(iso);
    if (Number.isNaN(when)) return "";
    // a time still to come (a flow's next run) by its clock, or its day; never "just now"
    if (when > now.getTime() + 60_000) {
      const end = new Date(now);
      end.setHours(24, 0, 0, 0);
      return when < end.getTime()
        ? format.dateTime(new Date(when), {
            hour: "numeric",
            minute: "2-digit",
          })
        : format.dateTime(new Date(when), {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
    }
    const at = Math.min(when, now.getTime());
    const ago = now.getTime() - at;
    if (ago < 60_000) return t("justNow");
    if (ago < 60 * 60_000)
      return format.relativeTime(at, { now, unit: "minute" });
    const day = new Date(now);
    day.setHours(0, 0, 0, 0);
    if (at >= day.getTime())
      return format.dateTime(new Date(at), {
        hour: "numeric",
        minute: "2-digit",
      });
    const yesterday = new Date(day);
    yesterday.setDate(yesterday.getDate() - 1);
    if (at >= yesterday.getTime()) return t("yesterday");
    return format.dateTime(new Date(at), { month: "short", day: "numeric" });
  };
}
