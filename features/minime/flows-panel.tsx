"use client";

// Your clone › Flows (10-19 redesign): the person's flows as cards: what each one asks, when it runs
// (in their language), when it runs next and how its last run went, a switch to pause or resume it,
// run once now, its answers, and remove. Flows are made by talking to the clone, so beside them a
// box says it to the clone, with a few to start from.

import {
  ArrowUp,
  CalendarClock,
  MessageSquare,
  Play,
  Trash2,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tip } from "@/components/ui/tooltip";
import { useUndoableRemoval } from "@/hooks/use-undoable-removal";
import { cn } from "@/lib/utils";
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

const SUGGESTIONS = ["topic", "notes"] as const;

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
  const undo = useTranslations("common")("undo");
  const format = useFormatter();
  const [flows, setFlows] = useState<FlowView[] | null>(null);
  // Removed flows are hidden at once and removed when their toast goes without Undo.
  const removal = useUndoableRemoval(undo);
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

  // A removed flow is paused at once, so it does not run while its Undo waits; it is removed when
  // the Undo runs out or this panel goes, and shows again as it was (running again, if it was)
  // when that fails or is undone.
  const removeLater = (flow: FlowView) => {
    if (!flow.paused) void post("pause", flow.id);
    removal.remove(flow.id, t("removed", { name: flow.name }), {
      commit: async () => {
        const done = await post("remove", flow.id);
        if (!done && !flow.paused) await post("resume", flow.id);
        void load();
        return done;
      },
      undo: () => {
        if (!flow.paused) void post("resume", flow.id);
      },
    });
  };

  /** One change to a flow, kept alive so a removal done as the page goes still arrives. */
  const post = async (
    action: "pause" | "resume" | "remove",
    id: string,
  ): Promise<boolean> => {
    const response = await fetch("/api/me/flows", {
      method: "POST",
      headers: HEADERS,
      keepalive: true,
      body: JSON.stringify({ action, id }),
    }).catch(() => undefined);
    return Boolean(response?.ok);
  };

  const act = async (
    action: "run" | "pause" | "resume" | "remove",
    flow: FlowView,
  ) => {
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

  const shown = (flows ?? []).filter((flow) => !removal.hidden.has(flow.id));
  const on = shown.filter((flow) => !flow.paused).length;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-x-9 gap-y-8 text-sm lg:grid-cols-[minmax(0,1fr)_21.5rem]">
      <section className="flex min-w-0 flex-col gap-2.5">
        <div className="flex min-h-8 items-center gap-2.5">
          <h2 className="text-[15px] font-semibold tracking-tight">
            {t("heading")}
          </h2>
          {flows && shown.length > 0 && (
            <span className="text-[13px] text-muted-foreground">
              {t("counts", { count: shown.length, on })}
            </span>
          )}
        </div>
        {flows && shown.length === 0 && (
          <p className="text-[13.5px] leading-relaxed text-muted-foreground">
            {t("none")}
          </p>
        )}
        <ul className="flex flex-col gap-2.5">
          {shown.map((flow) => {
            const Icon = flow.when.kind === "request" ? Users : CalendarClock;
            const busy = running.has(flow.id);
            return (
              <li
                key={flow.id}
                className="flex items-start gap-3.5 rounded-[14px] bg-background px-4.5 py-4 shadow-[0_0_0_1px_var(--alpha-10)]"
              >
                <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-muted">
                  <Icon className="size-4.5" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span
                    className={cn(
                      "text-[14.5px] font-semibold",
                      flow.paused && "text-muted-foreground",
                    )}
                  >
                    {flow.name}
                  </span>
                  <span className="text-[13px]">
                    {whenText(t, format, flow.when, flow.menuName)}
                  </span>
                  <p className="line-clamp-3 text-[13px] leading-relaxed whitespace-pre-wrap text-muted-foreground">
                    {t("quoted", { what: flow.what })}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {[
                        busy
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
                    </span>
                    <span className="ml-auto flex items-center gap-0.5">
                      {flow.when.kind !== "request" && (
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={busy}
                          loading={busy}
                          onClick={() => void act("run", flow)}
                        >
                          {!busy && <Play />}
                          {t("runOnce")}
                        </Button>
                      )}
                      {flow.chat && (
                        <Tip label={t("open")}>
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            className="text-muted-foreground"
                            onClick={() => onOpenChat(flow.chat as string)}
                          >
                            <MessageSquare />
                          </Button>
                        </Tip>
                      )}
                      <Tip label={t("remove")}>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => removeLater(flow)}
                        >
                          <Trash2 />
                        </Button>
                      </Tip>
                    </span>
                  </div>
                </div>
                <Switch
                  checked={!flow.paused}
                  aria-label={t("onLabel", { name: flow.name })}
                  className="mt-1"
                  onCheckedChange={(checked) =>
                    void act(checked ? "resume" : "pause", flow)
                  }
                />
              </li>
            );
          })}
        </ul>
      </section>
      <aside className="flex min-w-0 flex-col gap-3.5">
        <MakeOne onAsk={onAsk} />
        <p className="px-1 text-xs leading-relaxed text-muted-foreground">
          {t("alone")}
        </p>
      </aside>
    </div>
  );
}

/** A flow is made by saying it to the clone: a box that says it, and a few to start from. */
function MakeOne({ onAsk }: { onAsk: (text: string) => void }) {
  const t = useTranslations("flows");
  const [text, setText] = useState("");
  const words = text.trim();
  return (
    <section className="flex flex-col gap-3 rounded-[14px] bg-background p-4 shadow-[0_0_0_1px_var(--alpha-10)]">
      <div className="flex flex-col gap-1">
        <h3 className="text-[14px] font-semibold">{t("make.title")}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("make.hint")}
        </p>
      </div>
      <form
        data-ask-box
        onSubmit={(event) => {
          event.preventDefault();
          if (words) onAsk(t("make.ask", { what: words }));
        }}
        className="flex h-11 items-center gap-2 rounded-[22px] bg-background pr-1.5 pl-4 shadow-[0_0_0_1px_var(--field)] focus-within:shadow-[0_0_0_1px_var(--field),0_0_0_4px_var(--alpha-05)]"
      >
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={t("make.placeholder")}
          aria-label={t("make.title")}
          className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
        <Tip label={t("make.send")}>
          <Button
            type="submit"
            size="icon"
            disabled={!words}
            className="size-8 rounded-full"
          >
            <ArrowUp className="size-4" />
          </Button>
        </Tip>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((kind) => (
          <button
            key={kind}
            type="button"
            onClick={() => onAsk(t(`suggest.${kind}Ask`))}
            className="inline-flex h-8 items-center rounded-full bg-muted px-3 text-[12.5px] outline-none hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t(`suggest.${kind}`)}
          </button>
        ))}
      </div>
    </section>
  );
}
