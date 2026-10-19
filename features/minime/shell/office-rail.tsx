"use client";

// The column beside the conversation: the office, live and small, with a line on what is moving
// in it; the requests on their way between clones; and today's flows. Alone in an office, it says
// how to ask someone anyway (a reply link, nothing to install) and how to bring the team in.

import {
  CalendarClock,
  Check,
  ChevronRight,
  Clock,
  Link2,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { OfficeRoom } from "@/features/office/room/office-room";
import { cn } from "@/lib/utils";
import { HEADERS, type Task } from "../home/use-office";
import { useApp } from "./app-state";
import { RequestLine, useRequestWords, useWhen } from "./parts";

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
    format.dateTime(new Date(iso), { hour: "numeric", minute: "2-digit" });
  const when = useWhen();
  const words = useRequestWords();

  const yours = app.tasksToDecide;
  // on their way, and not waiting on the person: those are in the column's To decide
  const moving = (data?.tasks ?? [])
    .filter(
      (task) =>
        ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(
          task.status.state,
        ) && !yours.has(task.id),
    )
    .sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp))
    .slice(0, 4);
  const { indexOf } = office;
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
      className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border/60 bg-background px-4 pt-4 pb-5 max-[1180px]:hidden"
    >
      <section aria-labelledby="r-office" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 id="r-office" className="text-[13.5px] font-semibold">
            {t("office")}
          </h2>
          <Tip label={t("open")}>
            <Link
              href="/office"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "text-muted-foreground",
              )}
            >
              <ChevronRight className="size-4" />
            </Link>
          </Tip>
        </div>
        <Link
          href="/office"
          aria-label={t("openOffice")}
          className="relative block h-[172px] overflow-hidden rounded-xl bg-background shadow-[inset_0_0_0_1px_var(--alpha-08)]"
        >
          {office.room && (
            <OfficeRoom data={office.room} fps={30} className="of-mini" />
          )}
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
            {/* the one thing it asks for, and a quiet way on: both the app's own buttons */}
            <Button
              variant="brand"
              className="justify-start"
              onClick={() => onInsert(t("linkStarter"))}
            >
              <Link2 className="size-3.5" />
              {t("linkAsk")}
            </Button>
            <Button
              variant="secondary"
              className="justify-start"
              onClick={() => app.setSettings("office")}
            >
              <UserPlus className="size-3.5" />
              {app.joined ? t("invite") : t("setUp")}
            </Button>
          </div>
        </section>
      ) : (
        <section aria-labelledby="r-moving" className="flex flex-col">
          <h2
            id="r-moving"
            className="flex items-center gap-2 pb-1.5 text-[13.5px] font-semibold"
          >
            {t("moving")}
            {moving.length > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-foreground/[0.07] px-1.5 text-[11px] font-semibold text-muted-foreground tabular-nums">
                {moving.length}
              </span>
            )}
          </h2>
          {moving.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">
              {t("noneMoving")}
            </p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {moving.map((task) => {
                const sent = task.metadata.from === me;
                const other = sent ? task.metadata.to : task.metadata.from;
                const name = nameOf(task);
                return (
                  <RequestLine
                    key={task.id}
                    size="sm"
                    task={task}
                    me={me}
                    name={name}
                    index={indexOf(other)}
                    words={words(task, sent, name)}
                    when={when(task.status.timestamp)}
                  />
                );
              })}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="r-flows" className="flex flex-col gap-1">
        <div className="flex items-center justify-between pb-1">
          <h2 id="r-flows" className="text-[13.5px] font-semibold">
            {t("flows")}
          </h2>
          <Tip label={t("all")}>
            <Link
              href="/clone?tab=flows"
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "text-muted-foreground",
              )}
            >
              <ChevronRight className="size-4" />
            </Link>
          </Tip>
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
                <span className="text-xs text-muted-foreground tabular-nums">
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
