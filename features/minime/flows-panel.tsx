"use client";

// The person's flows on their page: what each one asks, when it runs (in their language), when it
// runs next and how its last run went, with run now, pause or resume, and remove. Flows are made by
// talking to the mini-me, so an empty list says how.

import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { When } from "./flows/schedule";

interface FlowView {
  id: string;
  name: string;
  when: When;
  /** For a request flow: the name of the kind of request it is for. */
  menuName?: string;
  what: string;
  paused: boolean;
  next?: string;
  last?: { at: string; ok: boolean; missed?: boolean; error?: string };
  chat?: string;
}

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

type Format = ReturnType<typeof useFormatter>;
type Translate = ReturnType<typeof useTranslations<"flows">>;

/**
 * A schedule in the person's language, with their own way of writing days and times. A request
 * flow shows the kind it is for (`kind`, its name when known).
 */
export function whenText(
  t: Translate,
  format: Format,
  when: When,
  kind?: string,
): string {
  if (when.kind === "request")
    return when.menu
      ? t("when.request", { kind: kind ?? when.menu.replaceAll("-", " ") })
      : t("when.anyRequest");
  const clock = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return format.dateTime(new Date(2000, 0, 1, hour, minute), {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (when.kind === "every")
    return when.minutes % 60 === 0
      ? t("when.hours", { hours: when.minutes / 60 })
      : t("when.minutes", { minutes: when.minutes });
  if (when.kind === "once") {
    const [date, time] = when.at.split("T");
    const [y, m, d] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    return t("when.once", {
      at: format.dateTime(new Date(y, m - 1, d, hour, minute), {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    });
  }
  const time = clock(when.time);
  if (when.days.length === 7) return t("when.daily", { time });
  if (when.days.join(",") === "1,2,3,4,5") return t("when.weekdays", { time });
  // 4 October 2026 was a Sunday: each day's name in the person's language.
  const days = when.days
    .map((day) =>
      format.dateTime(new Date(2026, 9, 4 + day), { weekday: "short" }),
    )
    .join(", ");
  return t("when.days", { days, time });
}

/** A flow the mini-me is about to make or change, as its card shows it. */
export function FlowAsk({ input }: { input: Record<string, unknown> }) {
  const t = useTranslations("flows");
  const format = useFormatter();
  // What the mini-me wrote, before the code checked it: a one-off may still be "in N minutes".
  const raw = input.when as Record<string, unknown> | undefined;
  let line: string | undefined;
  try {
    line =
      raw?.kind === "once" && typeof raw.in_minutes === "number"
        ? t("when.inMinutes", { minutes: raw.in_minutes })
        : raw?.kind
          ? whenText(t, format, raw as unknown as When)
          : undefined;
  } catch {
    line = undefined;
  }
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
      {typeof input.name === "string" && (
        <span className="font-medium">{input.name}</span>
      )}
      {line && <span>{line}</span>}
      {typeof input.what === "string" && (
        <span className="whitespace-pre-wrap text-muted-foreground">
          {input.what}
        </span>
      )}
    </div>
  );
}

const SUGGESTIONS = ["morning", "week"] as const;

export function FlowsPanel({
  onOpenChat,
  onAsk,
}: {
  onOpenChat: (id: string) => void;
  /** Say something to the mini-me in the conversation: a suggested flow is made by asking. */
  onAsk: (text: string) => void;
}) {
  const t = useTranslations("flows");
  const cancel = useTranslations("common")("cancel");
  const format = useFormatter();
  const [flows, setFlows] = useState<FlowView[] | null>(null);
  const [sure, setSure] = useState<string>();
  const [running, setRunning] = useState<Set<string>>(new Set());
  const watching = useRef<ReturnType<typeof setInterval>>(undefined);

  const load = () =>
    fetch("/api/me/flows", { headers: HEADERS })
      .then((r) => r.json())
      .then((data: { flows: FlowView[] }) => {
        setFlows(data.flows);
        return data.flows;
      })
      .catch(() => undefined);

  const act = async (
    action: "run" | "pause" | "resume" | "remove",
    flow: FlowView,
  ) => {
    setSure(undefined);
    const response = await fetch("/api/me/flows", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action, id: flow.id }),
    }).catch(() => undefined);
    if (action !== "run" || !response?.ok) {
      await load();
      return;
    }
    // A run takes a little while; its answer lands in the flow's conversation.
    setRunning((all) => new Set(all).add(flow.id));
    const before = flow.last?.at;
    const started = Date.now();
    clearInterval(watching.current);
    watching.current = setInterval(async () => {
      const fresh = await load();
      const done = fresh?.find((f) => f.id === flow.id);
      if (
        (done && done.last?.at !== before) ||
        Date.now() - started > 6 * 60 * 1000
      ) {
        clearInterval(watching.current);
        setRunning((all) => {
          const next = new Set(all);
          next.delete(flow.id);
          return next;
        });
      }
    }, 3000);
  };

  const at = (iso: string) =>
    format.dateTime(new Date(iso), {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <details
      className="rounded-xl border border-border p-4 text-sm"
      onToggle={(event) => {
        if ((event.currentTarget as HTMLDetailsElement).open) void load();
      }}
    >
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {flows && flows.length > 0 && (
          <span className="ml-2 text-muted-foreground tabular-nums">
            {flows.length}
          </span>
        )}
      </summary>
      {flows && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-muted-foreground">
            {flows.length ? t("intro") : t("none")}
          </p>
          {flows.length === 0 && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  onClick={() => onAsk(t(`suggest.${kind}Ask`))}
                >
                  {t(`suggest.${kind}`)}
                </Button>
              ))}
            </div>
          )}
          <ul className="flex flex-col">
            {flows.map((flow) => (
              <li
                key={flow.id}
                className="flex flex-col gap-1 border-b border-border py-2 last:border-b-0"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="font-medium">{flow.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {whenText(t, format, flow.when, flow.menuName)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {flow.what}
                </p>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {[
                    running.has(flow.id)
                      ? t("running")
                      : flow.paused
                        ? t("paused")
                        : flow.when.kind === "request"
                          ? t("onRequest")
                          : flow.next
                            ? t("next", { at: at(flow.next) })
                            : t("finished"),
                    flow.last &&
                      t(
                        flow.last.missed
                          ? "lastMissed"
                          : flow.last.ok
                            ? "lastDone"
                            : "lastFailed",
                        { at: at(flow.last.at) },
                      ),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <div className="flex flex-wrap items-center gap-1">
                  {flow.when.kind !== "request" && (
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={running.has(flow.id)}
                      loading={running.has(flow.id)}
                      onClick={() => void act("run", flow)}
                    >
                      {t("runNow")}
                    </Button>
                  )}
                  {flow.chat && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => onOpenChat(flow.chat as string)}
                    >
                      {t("open")}
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    className="text-muted-foreground"
                    onClick={() =>
                      void act(flow.paused ? "resume" : "pause", flow)
                    }
                  >
                    {flow.paused ? t("resume") : t("pause")}
                  </Button>
                  {sure === flow.id ? (
                    <>
                      <span className="text-xs">{t("removeSure")}</span>
                      <Button
                        size="xs"
                        onClick={() => void act("remove", flow)}
                      >
                        {t("removeYes")}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setSure(undefined)}
                      >
                        {cancel}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="text-muted-foreground"
                      onClick={() => setSure(flow.id)}
                    >
                      {t("remove")}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </details>
  );
}
