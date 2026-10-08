"use client";

// The clone's screen, In your name: what it did for the person, latest first, any day (answers it
// sent colleagues and how, ones it held back, requests it sent, "from now on" made or taken back,
// flows run), each request opening where it is answered (server/activity.ts).

import {
  ArrowUpRight,
  Check,
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
import { Empty, Rows } from "../settings/parts";

type Logged = { at: string } & (
  | {
      kind: "answered";
      task: string;
      to?: string;
      text: string;
      how: "alone" | "told" | "as-is" | "changed";
      files?: string[];
    }
  | { kind: "held"; task: string; to?: string }
  | { kind: "asked"; task: string; to: string; text: string; files?: number }
  | { kind: "rule"; rule: string; added: boolean }
  | { kind: "flow"; name: string; ok: boolean; quiet?: boolean }
);

const ICONS = {
  answered: Check,
  held: Hand,
  asked: Send,
  rule: ShieldCheck,
  flow: Repeat,
} as const;

export function ActivityList() {
  const t = useTranslations("shell.clone.activity");
  const ask = useTranslations("ask");
  const format = useFormatter();
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
    return t(line.ok ? (line.quiet ? "flowQuiet" : "flow") : "flowFailed", {
      name: line.name,
    });
  };
  return (
    <Rows>
      {lines.map((line, index) => {
        const Icon = ICONS[line.kind];
        const href =
          "task" in line
            ? `/requests/${encodeURIComponent(line.task)}`
            : undefined;
        const body =
          line.kind === "answered" || line.kind === "asked"
            ? line.text
            : undefined;
        return (
          <li
            key={`${line.at}-${index}`}
            className="flex items-start gap-3 px-3.5 py-3 text-sm"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="font-medium">{head(line)}</span>
              {body && (
                <span className="line-clamp-2 text-[13px] text-muted-foreground">
                  {body}
                </span>
              )}
              <span className="text-xs text-muted-foreground tabular-nums">
                {format.dateTime(new Date(line.at), {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            </div>
            {href && (
              <Link
                href={href}
                aria-label={t("open")}
                title={t("open")}
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ArrowUpRight className="size-4" />
              </Link>
            )}
          </li>
        );
      })}
    </Rows>
  );
}
