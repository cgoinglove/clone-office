"use client";

// Settings › Flows: the person's flows: what each one asks, when it runs (in their language), when it
// runs next and how its last run went, with run now, pause or resume, and remove. Flows are made by
// talking to the mini-me, so an empty list says how.

import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { When } from "./flows/schedule";
import { whenText } from "./flows/when-text";

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

const HEADERS = { "content-type": "application/json", "x-clone-office": "1" };

const SUGGESTIONS = ["morning", "week"] as const;

export function FlowsPanel({
  onOpenChat,
  onNews,
  onAsk,
}: {
  onOpenChat: (id: string) => void;
  /** Something changed in a conversation (a card, an answer): the open one is read again. */
  onNews: () => void;
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

  useEffect(() => {
    void load();
  }, []);

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
    // A run takes a little while. Its conversation opens, where its questions come as cards (it
    // asks what it may not do alone yet) and its answer lands.
    const { chat } = (await response.json().catch(() => ({}))) as {
      chat?: string;
    };
    if (chat) onOpenChat(chat);
    setRunning((all) => new Set(all).add(flow.id));
    const before = flow.last?.at;
    const started = Date.now();
    let cards = "";
    clearInterval(watching.current);
    watching.current = setInterval(async () => {
      const fresh = await load();
      const done = fresh?.find((f) => f.id === flow.id);
      const finished =
        (done && done.last?.at !== before) ||
        Date.now() - started > 16 * 60 * 1000;
      if (chat) {
        const waiting = (await fetch(
          `/api/me/gate?chat=${encodeURIComponent(chat)}`,
          { headers: HEADERS },
        )
          .then((r) => r.json())
          .catch(() => ({ asks: [] }))) as { asks: { id: string }[] };
        const now = waiting.asks.map((ask) => ask.id).join(",");
        if (now !== cards || finished) onNews();
        cards = now;
      }
      if (finished) {
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
    <div className="flex flex-col gap-3 text-sm">
      {flows && (
        <div className="flex flex-col gap-2">
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
    </div>
  );
}
