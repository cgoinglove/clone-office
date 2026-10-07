"use client";

// The requests between the person's clone and their colleagues', as one list: those waiting on the
// person first, then those on their way, then those finished (stamped DONE). Each opens on its own
// page. Asking a colleague starts here too; with nobody to ask yet, the screen says how to begin.

import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  Plus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Bot } from "@/features/office";
import { cn } from "@/lib/utils";
import { Colleague } from "../home/colleague";
import type { Task } from "../home/use-office";
import { useApp } from "./app-state";
import { Mark, PageHeader, type Phase, PhaseChip, phaseOf } from "./parts";
import { taskOf } from "./your-turn";

type Side = "all" | "received" | "sent";

const GROUPS: Phase[] = ["yours", "working", "waiting", "done"];

/** A request's first words: what was asked. */
export const askedText = (task: Task) =>
  task.history[0]?.parts.map((part) => part.text).join(" ") ?? "";

export function RequestsScreen() {
  const t = useTranslations("shell.requests");
  const tOffice = useTranslations("office");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const app = useApp();
  const router = useRouter();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const [side, setSide] = useState<Side>("all");
  const [asking, setAsking] = useState(false);

  const yours = new Set(
    office.waiting.map((waiting) => taskOf(waiting)).filter(Boolean),
  );
  const tasks = (data?.tasks ?? [])
    .filter((task) =>
      side === "all"
        ? true
        : side === "sent"
          ? task.metadata.from === me
          : task.metadata.from !== me,
    )
    .sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp));
  const received = (data?.tasks ?? []).filter(
    (task) => task.metadata.from !== me,
  );
  const handled = received.filter(
    (task) => task.status.state === "COMPLETED" && !yours.has(task.id),
  ).length;
  const indexOf = (id: string) =>
    Math.max(
      0,
      members.findIndex((member) => member.id === id),
    );
  const colleagues = members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.id !== me);

  const ask = () => {
    if (colleagues.length) setAsking(true);
    else router.push(`/chat?say=${encodeURIComponent(t("linkStarter"))}`);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-8 pt-8 pb-12">
        <PageHeader
          title={t("title")}
          hint={
            received.length
              ? t("hintHandled", { handled, count: received.length })
              : t("hint")
          }
          actions={
            <Button variant="brand" onClick={ask}>
              <Plus />
              {t("ask")}
            </Button>
          }
        />

        {(data?.tasks ?? []).length === 0 ? (
          <Empty
            alone={!colleagues.length}
            onAsk={ask}
            onInvite={() => app.setSettings("office")}
          />
        ) : (
          <>
            <Segmented<Side>
              view
              aria-label={t("side")}
              options={[
                { value: "all", label: t("all") },
                { value: "received", label: t("received") },
                { value: "sent", label: t("sent") },
              ]}
              value={side}
              onChange={setSide}
              className="self-start"
            />
            <div className="flex flex-col gap-6">
              {GROUPS.map((group) => {
                const rows = tasks.filter(
                  (task) =>
                    phaseOf(task.status.state, yours.has(task.id)) === group,
                );
                if (!rows.length) return null;
                return (
                  <section key={group} aria-labelledby={`g-${group}`}>
                    <h2
                      id={`g-${group}`}
                      className={cn(
                        "flex items-center gap-2 px-3 pb-2 text-[13px] font-semibold",
                        group === "yours"
                          ? "text-waiting"
                          : "text-muted-foreground",
                      )}
                    >
                      {group === "yours" && (
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-waiting"
                        />
                      )}
                      {t(`groups.${group}`)}
                      <span className="font-mono text-xs font-normal tabular-nums">
                        {rows.length}
                      </span>
                    </h2>
                    <ul className="flex flex-col border-t border-border/60">
                      {rows.map((task) => {
                        const sent = task.metadata.from === me;
                        const other = sent
                          ? task.metadata.to
                          : task.metadata.from;
                        const name =
                          office.names.get(other) ??
                          (task.metadata.guest
                            ? tOffice("byLink", { name: task.metadata.guest })
                            : other);
                        const answer = [...task.history]
                          .reverse()
                          .find((message) => message.role === "agent")
                          ?.parts.map((part) => part.text)
                          .join(" ");
                        const failed = [
                          "FAILED",
                          "REJECTED",
                          "CANCELED",
                        ].includes(task.status.state);
                        return (
                          <li
                            key={task.id}
                            className="border-b border-border/60"
                          >
                            <Link
                              href={`/requests/${encodeURIComponent(task.id)}`}
                              className="grid grid-cols-[minmax(0,1fr)_150px_112px_64px] items-center gap-4 rounded-lg px-3 py-3 transition-colors hover:bg-muted/50 max-md:grid-cols-[minmax(0,1fr)_auto]"
                            >
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span
                                  className={cn(
                                    "truncate text-[14.5px]",
                                    group === "done"
                                      ? "text-foreground/80"
                                      : "font-medium",
                                  )}
                                >
                                  {askedText(task)}
                                </span>
                                <span className="truncate text-[13px] text-muted-foreground">
                                  {answer ??
                                    t(sent ? "noAnswerYet" : "notAnsweredYet")}
                                </span>
                              </span>
                              <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground/85 max-md:hidden">
                                {sent ? (
                                  <ArrowUpRight
                                    aria-label={t("sentTo")}
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                  />
                                ) : (
                                  <ArrowDownLeft
                                    aria-label={t("receivedFrom")}
                                    className="size-3.5 shrink-0 text-muted-foreground"
                                  />
                                )}
                                {task.metadata.guest ? (
                                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                                ) : (
                                  <Mark
                                    id={other}
                                    index={indexOf(other)}
                                    size={18}
                                  />
                                )}
                                <span className="truncate">{name}</span>
                              </span>
                              <span>
                                <PhaseChip phase={group} failed={failed} />
                              </span>
                              <span className="text-right font-mono text-xs text-muted-foreground tabular-nums max-md:hidden">
                                {format.relativeTime(
                                  new Date(task.status.timestamp),
                                  now,
                                )}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="max-h-[min(44rem,calc(100vh-4rem))] overflow-y-auto sm:max-w-lg">
          <DialogTitle>{t("askTitle")}</DialogTitle>
          <DialogDescription>{t("askHint")}</DialogDescription>
          <ul className="flex flex-col gap-1">
            {colleagues.map(({ member, index }) => (
              <Colleague
                key={member.id}
                member={member}
                index={index}
                busy={office.busy}
                onSend={async (text, files) => {
                  const ok = await office.post({
                    action: "send",
                    to: member.id,
                    text,
                    files,
                  });
                  if (ok) setAsking(false);
                  return ok;
                }}
              />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Empty({
  alone,
  onAsk,
  onInvite,
}: {
  alone: boolean;
  onAsk: () => void;
  onInvite: () => void;
}) {
  const t = useTranslations("shell.requests.empty");
  return (
    <div className="flex flex-col items-center gap-5 rounded-[14px] px-6 py-16 text-center shadow-[inset_0_0_0_1px_var(--alpha-08)]">
      <div className="flex items-end gap-1" aria-hidden>
        <Bot size={44} mood="idle" still />
        <span className="mb-4 font-mono text-muted-foreground">→</span>
        <Bot
          size={44}
          mood="idle"
          still
          mine={false}
          color="var(--muted-foreground)"
        />
      </div>
      <div className="flex max-w-md flex-col gap-1.5">
        <h2 className="text-lg font-semibold">{t("title")}</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {alone ? t("bodyAlone") : t("body")}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="brand" onClick={onAsk}>
          {alone ? <Link2 /> : <Plus />}
          {alone ? t("byLink") : t("ask")}
        </Button>
        <Button variant="outline" onClick={onInvite}>
          <UserPlus />
          {t("invite")}
        </Button>
      </div>
    </div>
  );
}
