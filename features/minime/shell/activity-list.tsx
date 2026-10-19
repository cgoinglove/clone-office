"use client";

// The clone's screen, In your name: what it did for the person, latest first, any day, under the
// day's heading (answers it sent colleagues and how, ones it held back, requests it sent, "from now
// on" made or taken back, flows run, skills shared with the office or added from it), each led by
// the colleague's clone it was with, each request opening where it is answered (server/activity.ts).

import {
  BookOpen,
  Check,
  ChevronRight,
  Hand,
  Repeat,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ruleText } from "../ask-text";
import { HEADERS } from "../home/use-office";
import { Empty } from "../settings/parts";
import { useApp } from "./app-state";
import { Mark } from "./parts";

export type Logged = { at: string } & (
  | {
      kind: "answered";
      task: string;
      to?: string;
      text: string;
      how: "alone" | "told" | "as-is" | "changed" | "decided";
      files?: string[];
    }
  | { kind: "held"; task: string; to?: string }
  | { kind: "asked"; task: string; to: string; text: string; files?: number }
  | { kind: "rule"; rule: string; added: boolean }
  | { kind: "flow"; name: string; ok: boolean; quiet?: boolean }
  | {
      kind: "skill";
      name: string;
      action: "shared" | "unshared" | "added" | "updated";
      from?: string;
    }
);

const ICONS = {
  answered: Check,
  held: Hand,
  asked: Send,
  rule: ShieldCheck,
  flow: Repeat,
  skill: BookOpen,
} as const;

/** What the clone did in the person's name, latest first; null until it is read. */
export function useActivity(): Logged[] | null {
  const [lines, setLines] = useState<Logged[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/activity", { headers: HEADERS })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { activity?: Logged[] } | null) => {
        if (live) setLines(body?.activity ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return lines;
}

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function ActivityList({ lines }: { lines: Logged[] | null }) {
  const t = useTranslations("shell.clone.activity");
  const ask = useTranslations("ask");
  const format = useFormatter();
  const app = useApp();
  if (!lines) return null;
  if (!lines.length)
    return <Empty icon={<Check className="size-5" />}>{t("none")}</Empty>;
  const head = (line: Logged): string => {
    const name = ("to" in line && line.to) || t("colleague");
    if (line.kind === "answered") return t(`answered.${line.how}`, { name });
    if (line.kind === "held") return t("held", { name });
    if (line.kind === "asked") return t("asked", { name });
    if (line.kind === "rule")
      return t(line.added ? "ruleAdded" : "ruleRemoved", {
        rule: ruleText(ask, line.rule),
      });
    if (line.kind === "skill")
      return t(`skill.${line.action}`, {
        name: line.name,
        from: line.from ?? t("colleague"),
      });
    return t(line.ok ? (line.quiet ? "flowQuiet" : "flow") : "flowFailed", {
      name: line.name,
    });
  };
  // the colleague a line was with, by the name it kept, so it is led by their clone's mark
  const members = app.office.office?.members ?? [];
  const memberOf = (name?: string) =>
    name ? members.find((member) => member.card.name === name) : undefined;
  const today = dayOf(new Date().toISOString());
  const days: { day: number; lines: Logged[] }[] = [];
  for (const line of lines) {
    const day = dayOf(line.at);
    const last = days.at(-1);
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  return (
    <div className="flex max-w-[48rem] flex-col gap-6">
      {days.map(({ day, lines: those }) => (
        <section key={day} className="flex flex-col gap-1.5">
          <h2 className="px-1 text-[13px] font-semibold text-muted-foreground">
            {day === today
              ? t("today")
              : day === today - 86_400_000
                ? t("yesterday")
                : format.dateTime(new Date(day), {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  })}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {those.map((line, index) => {
              const Icon = ICONS[line.kind];
              const href =
                "task" in line
                  ? `/requests/${encodeURIComponent(line.task)}`
                  : undefined;
              const body =
                line.kind === "answered" || line.kind === "asked"
                  ? line.text
                  : undefined;
              const member = memberOf("to" in line ? line.to : undefined);
              const row = (
                <>
                  {member ? (
                    <Mark
                      id={member.id}
                      index={app.office.indexOf(member.id)}
                      size={28}
                      className="shrink-0"
                    />
                  ) : (
                    <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-muted">
                      <Icon className="size-3.5" />
                    </span>
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13.5px] font-medium">
                      {head(line)}
                    </span>
                    {body && (
                      <span className="line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
                        {t("quoted", { text: body })}
                      </span>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {format.dateTime(new Date(line.at), {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    {href && (
                      <ChevronRight className="size-4 text-muted-foreground/70" />
                    )}
                  </span>
                </>
              );
              const classes =
                "flex items-start gap-3 rounded-[10px] px-3 py-2.5 text-sm";
              return (
                <li key={`${line.at}-${index}`}>
                  {href ? (
                    <Link
                      href={href}
                      className={`${classes} outline-none hover:bg-foreground/[0.035] focus-visible:ring-2 focus-visible:ring-ring`}
                    >
                      {row}
                    </Link>
                  ) : (
                    <div className={classes}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
