"use client";

// Settings › AI model: what the clone used its AI for in the last 30 days, from its run log, so the
// person sees where their plan or key went (after OpenClaw's 30-day usage and Paperclip's costs):
// each use's share as a bar (by tokens, else by runs), its numbers beneath (10-19 redesign).

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Group } from "./parts";

interface UseLine {
  group: "conversations" | "colleagues" | "flows" | "learning" | "other";
  runs: number;
  failed: number;
  tokens: number;
  cached: number;
  sent: number;
  cost?: number;
}

const HEADERS = { "x-clone-office": "1" };

export function UsageSection() {
  const t = useTranslations("settings.usage");
  const format = useFormatter();
  const [lines, setLines] = useState<UseLine[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/usage", { headers: HEADERS })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: { lines?: UseLine[] } | null) => {
        if (live) setLines(body?.lines ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!lines) return null;
  // shares by what was sent and read when the log knows it for every use (a model on this computer
  // may count none), else by how many times
  const tokens = lines.reduce((sum, line) => sum + line.tokens, 0);
  const byTokens = lines.every((line) => line.tokens > 0 || line.runs === 0);
  const whole = byTokens
    ? tokens
    : lines.reduce((sum, line) => sum + line.runs, 0);
  const cost = lines.reduce<number | undefined>(
    (sum, line) => (line.cost === undefined ? sum : (sum ?? 0) + line.cost),
    undefined,
  );
  return (
    <Group title={t("title")} hint={t("hint")}>
      {lines.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("none")}</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {lines.map((line) => {
            const share = Math.round(
              (100 * (byTokens ? line.tokens : line.runs)) / (whole || 1),
            );
            return (
              <li key={line.group} className="flex flex-col gap-1">
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 text-[13.5px]">
                    {t(`groups.${line.group}`)}
                  </span>
                  <span
                    className="h-1.5 w-[min(14rem,40%)] shrink-0 overflow-hidden rounded-full bg-muted"
                    aria-hidden
                  >
                    <span
                      className="block h-full rounded-full bg-foreground"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {share}%
                  </span>
                </span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t("runs", { count: line.runs })}
                  {line.failed > 0 &&
                    ` · ${t("failed", { count: line.failed })}`}
                  {line.tokens > 0 &&
                    ` · ${t("tokens", {
                      tokens: format.number(line.tokens, {
                        notation: "compact",
                      }),
                    })}`}
                  {line.cached > 0 &&
                    line.sent > 0 &&
                    ` · ${t("cached", {
                      percent: Math.round((line.cached / line.sent) * 100),
                    })}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {cost !== undefined && cost > 0 && (
        <p className="text-[13px] text-muted-foreground">
          {t("cost", {
            cost: format.number(cost, { style: "currency", currency: "USD" }),
          })}
        </p>
      )}
    </Group>
  );
}
