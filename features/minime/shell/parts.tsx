"use client";

// The pieces every screen of the app is built from, so a change to one shows everywhere: a
// screen's heading, a colleague's clone, the four states a request can be in, and the office's own
// marks (the departures board's flap digits, the DONE stamp) carried out of the drawing.

import { Clock, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Bot, type BotShape, type Mood } from "@/features/office";
import { looksOf } from "@/features/office/room/looks.mjs";
import { cn } from "@/lib/utils";
import type { State } from "../home/use-office";

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
          ? "bg-waiting/8 font-semibold text-waiting"
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
 * Digits as the office's departures board shows them: one card per character, its lower half a
 * shade darker. The ember board counts what waits on the person; the paper one tells times.
 */
export function Flap({
  value,
  tone = "paper",
  label,
  className,
}: {
  value: string;
  tone?: "paper" | "ember";
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
            className={cn(
              "grid h-[18px] w-[13px] place-items-center rounded-[3px]",
              tone === "ember"
                ? "bg-[linear-gradient(var(--waiting)_0_50%,color-mix(in_oklab,var(--waiting),black_14%)_50%_100%)] text-white"
                : "bg-[linear-gradient(var(--background)_0_50%,var(--muted)_50%_100%)] text-foreground shadow-[inset_0_0_0_1px_var(--alpha-12)]",
            )}
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

/** Two digits, as the board counts. */
export const twoDigits = (n: number) =>
  String(Math.min(99, n)).padStart(2, "0");

/** A person's office status as a dot: the brand while working, a ring when gone home. */
export function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "working"
          ? "bg-brand"
          : status === "off"
            ? "border border-muted-foreground/60"
            : "bg-muted-foreground/60",
      )}
    />
  );
}
