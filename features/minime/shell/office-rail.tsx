"use client";

// The column beside the conversation: the office, live and small, with a line on what is moving
// in it; the requests on their way between clones; and today's flows. Alone in an office, it says
// how to ask someone anyway (a reply link, nothing to install) and how to bring the team in.

import { CalendarClock, Check, Clock, Link2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { OfficeRoom } from "@/features/office/room/office-room";
import { HEADERS, type Task } from "../home/use-office";
import { useApp } from "./app-state";
import { Flap, Mark, PhaseChip, phaseOf } from "./parts";
import { taskOf } from "./your-turn";

interface FlowLine {
  id: string;
  name: string;
  paused: boolean;
  next?: string;
  last?: { at: string; ok?: boolean };
}

export function OfficeRail({ onInsert }: { onInsert: (text: string) => void }) {
  const t = useTranslations("shell.rail");
  const format = useFormatter();
  const app = useApp();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const alone = !app.joined || members.length < 2;
  const clock = (iso: string) =>
    format.dateTime(new Date(iso), {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });

  const yours = new Set(
    office.waiting.map((waiting) => taskOf(waiting)).filter(Boolean),
  );
  const moving = (data?.tasks ?? [])
    .filter((task) =>
      ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(task.status.state),
    )
    .sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp))
    .slice(0, 4);
  const indexOf = (id: string) =>
    Math.max(
      0,
      members.findIndex((member) => member.id === id),
    );
  const nameOf = (task: Task) => {
    const other =
      task.metadata.from === me ? task.metadata.to : task.metadata.from;
    return office.names.get(other) ?? task.metadata.guest ?? t("someone");
  };
  const latest = moving[0];
  const line = latest
    ? latest.metadata.from === me
      ? t("goingTo", { name: nameOf(latest) })
      : t("comingFrom", { name: nameOf(latest) })
    : t("quiet");

  const [flows, setFlows] = useState<FlowLine[] | null>(null);
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
  const today = new Date().toDateString();
  const todays = (flows ?? [])
    .filter(
      (flow) =>
        !flow.paused &&
        ((flow.next && new Date(flow.next).toDateString() === today) ||
          (flow.last && new Date(flow.last.at).toDateString() === today)),
    )
    .slice(0, 3);

  return (
    <aside
      aria-label={t("label")}
      className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border/60 bg-muted/25 px-4 pt-4 pb-5 max-[1180px]:hidden"
    >
      <section aria-labelledby="r-office" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2
            id="r-office"
            className="text-xs font-semibold text-muted-foreground"
          >
            {t("office")}
          </h2>
          <Link
            href="/office"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("open")}
          </Link>
        </div>
        <Link
          href="/office"
          aria-label={t("openOffice")}
          className="relative block h-[172px] overflow-hidden rounded-xl bg-background shadow-[inset_0_0_0_1px_var(--alpha-08)]"
        >
          {office.room && <OfficeRoom data={office.room} className="of-mini" />}
          <span className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 rounded-lg bg-background/95 px-2 py-1.5 text-[11.5px] text-foreground/85 shadow-[0_0_0_1px_var(--alpha-08)]">
            <span
              aria-hidden
              className={
                latest
                  ? "size-1.5 shrink-0 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
                  : "size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
              }
            />
            <span className="truncate">{line}</span>
          </span>
        </Link>
      </section>

      {alone ? (
        <section className="flex flex-col gap-3 rounded-xl bg-background p-4 shadow-[0_0_0_1px_var(--alpha-08)]">
          <h2 className="text-[13.5px] font-semibold">{t("aloneTitle")}</h2>
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            {t("aloneBody")}
          </p>
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => onInsert(t("linkStarter"))}
              className="flex h-8 items-center gap-2 rounded-lg bg-brand px-3 text-[13px] font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
            >
              <Link2 className="size-3.5" />
              {t("linkAsk")}
            </button>
            <button
              type="button"
              onClick={() => app.setSettings("office")}
              className="flex h-8 items-center gap-2 rounded-lg px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--alpha-15)] transition-colors hover:bg-muted"
            >
              <UserPlus className="size-3.5" />
              {app.joined ? t("invite") : t("setUp")}
            </button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="r-moving" className="flex flex-col">
          <h2
            id="r-moving"
            className="flex items-center gap-2 pb-2 text-xs font-semibold text-muted-foreground"
          >
            {t("moving")}
            <span className="font-mono font-normal tabular-nums">
              {moving.length}
            </span>
          </h2>
          {moving.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {t("noneMoving")}
            </p>
          ) : (
            moving.map((task) => {
              const other =
                task.metadata.from === me
                  ? task.metadata.to
                  : task.metadata.from;
              const text =
                task.history[0]?.parts.map((part) => part.text).join(" ") ?? "";
              return (
                <Link
                  key={task.id}
                  href={`/requests/${encodeURIComponent(task.id)}`}
                  className="-mx-2 flex flex-col gap-1.5 rounded-lg border-t border-border/50 px-2 py-2.5 transition-colors first-of-type:border-t-0 hover:bg-background"
                >
                  <span className="flex items-center gap-2">
                    <Mark id={other} index={indexOf(other)} size={18} />
                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">
                      {text}
                    </span>
                    <Flap
                      value={clock(task.status.timestamp)}
                      label={clock(task.status.timestamp)}
                    />
                  </span>
                  <span className="flex items-center gap-2 pl-[26px]">
                    <PhaseChip
                      phase={phaseOf(task.status.state, yours.has(task.id))}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {task.metadata.from === me
                        ? t("to", { name: nameOf(task) })
                        : t("from", { name: nameOf(task) })}
                    </span>
                  </span>
                </Link>
              );
            })
          )}
        </section>
      )}

      <section aria-labelledby="r-flows" className="flex flex-col gap-1">
        <div className="flex items-center justify-between pb-1">
          <h2
            id="r-flows"
            className="text-xs font-semibold text-muted-foreground"
          >
            {t("flows")}
          </h2>
          <Link
            href="/clone?tab=flows"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t("all")}
          </Link>
        </div>
        {flows && todays.length === 0 ? (
          <button
            type="button"
            onClick={() => onInsert(t("flowStarter"))}
            className="flex items-center gap-2 rounded-lg py-1 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <CalendarClock className="size-3.5 shrink-0" />
            {t("noFlows")}
          </button>
        ) : (
          todays.map((flow) => {
            const ran =
              flow.last && new Date(flow.last.at).toDateString() === today;
            return (
              <div
                key={flow.id}
                className="flex items-center gap-2 py-1 text-[13px]"
              >
                {ran ? (
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <Clock className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate">{flow.name}</span>
                <span className="font-mono text-[11.5px] text-muted-foreground tabular-nums">
                  {ran && flow.last
                    ? clock(flow.last.at)
                    : flow.next
                      ? clock(flow.next)
                      : ""}
                </span>
              </div>
            );
          })
        )}
      </section>
    </aside>
  );
}
