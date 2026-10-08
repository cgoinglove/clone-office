"use client";

// Settings › AI model: what the clone used its AI for in the last 30 days, from its run log, so the
// person sees where their plan or key went (after OpenClaw's 30-day usage and Paperclip's costs).

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Group, Rows } from "./parts";

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
  const cost = lines.reduce<number | undefined>(
    (sum, line) => (line.cost === undefined ? sum : (sum ?? 0) + line.cost),
    undefined,
  );
  return (
    <Group title={t("title")} hint={t("hint")}>
      {lines.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t("none")}</p>
      ) : (
        <Rows>
          {lines.map((line) => (
            <li
              key={line.group}
              className="flex items-baseline justify-between gap-4 px-3.5 py-2.5 text-sm"
            >
              <span className="min-w-0">{t(`groups.${line.group}`)}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {t("runs", { count: line.runs })}
                {line.failed > 0 && ` · ${t("failed", { count: line.failed })}`}
                {line.tokens > 0 &&
                  ` · ${t("tokens", {
                    tokens: format.number(line.tokens, { notation: "compact" }),
                  })}`}
                {line.cached > 0 &&
                  line.sent > 0 &&
                  ` · ${t("cached", {
                    percent: Math.round((line.cached / line.sent) * 100),
                  })}`}
              </span>
            </li>
          ))}
        </Rows>
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
