"use client";

// The requests between the person's clone and their colleagues', as one list (after Linear's inbox):
// those waiting on the person first, then those on their way, then those finished, each group's
// heading saying the state so its lines need not. A line is the same everywhere (`RequestLine`): the
// other side's clone, what was asked, who asks whom and what goes on, and when; a finished one says
// how the clone answered (alone, telling the person, after asking them, or the person's own words).
// Each opens on its own page. Asking a colleague starts here too.

import { Link2, Plus, Search, UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
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
import { HEADERS, type Task } from "../home/use-office";
import { useApp } from "./app-state";
import { OfficeTrouble } from "./office-trouble";
import {
  type Handled,
  PageHeader,
  RequestLine,
  useRequestWords,
  useWhen,
} from "./parts";
import { askLine } from "./your-turn";

type Side = "all" | "received" | "sent";

/** The three groups a list is read in: what waits on the person, what is on its way, what ended. */
type Group = "yours" | "moving" | "done";
const GROUPS: Group[] = ["yours", "moving", "done"];
const FINISHED = ["COMPLETED", "FAILED", "REJECTED", "CANCELED"];

/** How the clone's answer went, from its own record of what it did in the person's name. */
function useHandled(): Map<string, Handled> {
  const [handled, setHandled] = useState(new Map<string, Handled>());
  useEffect(() => {
    let live = true;
    void fetch("/api/me/activity?limit=1000", { headers: HEADERS })
      .then((r) => r.json())
      .then(
        (body: {
          activity?: { kind: string; task?: string; how?: string }[];
        }) => {
          if (!live) return;
          const map = new Map<string, Handled>();
          for (const line of body.activity ?? []) {
            if (line.kind !== "answered" || !line.task || map.has(line.task))
              continue;
            map.set(
              line.task,
              line.how === "alone"
                ? "alone"
                : line.how === "told"
                  ? "told"
                  : "asked",
            );
          }
          setHandled(map);
        },
      )
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return handled;
}

/** A request's first words: what was asked. */
export const askedText = (task: Task) =>
  task.history[0]?.parts.map((part) => part.text).join(" ") ?? "";

export function RequestsScreen() {
  const t = useTranslations("shell.requests");
  const tOffice = useTranslations("office");
  const tAsk = useTranslations("ask");
  const app = useApp();
  const router = useRouter();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const [side, setSide] = useState<Side>("all");
  // a colleague's page or panel sends here to ask them (?ask=<member>)
  const params = useSearchParams();
  const askOf = params.get("ask");
  const [asking, setAsking] = useState(Boolean(askOf));
  // the colleague a link asked for, whose box opens once; the address forgets it at once, so
  // the dialog opened again later starts with every box closed
  const [askFor, setAskFor] = useState(askOf);
  useEffect(() => {
    if (!askOf) return;
    setAskFor(askOf);
    setAsking(true);
    router.replace("/requests", { scroll: false });
  }, [askOf, router]);
  const [find, setFind] = useState("");
  const words = useRequestWords();
  const handledBy = useHandled();
  const when = useWhen();

  const yours = app.tasksToDecide;
  // what the clone asks the person about each request waiting on them, said on its row
  const questions = new Map(
    app.turns.flatMap((item) =>
      item.where.kind === "request" && item.where.task
        ? [[item.where.task, askLine(tAsk, item.ask)] as const]
        : [],
    ),
  );
  const nameOf = (task: Task) => {
    const other =
      task.metadata.from === me ? task.metadata.to : task.metadata.from;
    return (
      office.names.get(other) ??
      (task.metadata.guest
        ? tOffice("byLink", { name: task.metadata.guest })
        : other)
    );
  };
  const needle = find.trim().toLowerCase();
  const all = data?.tasks ?? [];
  const tasks = all
    .filter((task) =>
      side === "all"
        ? true
        : side === "sent"
          ? task.metadata.from === me
          : task.metadata.from !== me,
    )
    .filter(
      (task) =>
        !needle ||
        `${askedText(task)} ${nameOf(task)}`.toLowerCase().includes(needle),
    )
    .sort((a, b) => b.status.timestamp.localeCompare(a.status.timestamp));
  const groupOf = (task: Task): Group =>
    yours.has(task.id)
      ? "yours"
      : FINISHED.includes(task.status.state)
        ? "done"
        : "moving";
  // how a finished request a colleague sent was answered: the person's own words, or the clone's way
  const handledOf = (task: Task): Handled | undefined => {
    if (task.metadata.from === me || task.status.state !== "COMPLETED")
      return undefined;
    if (
      task.history.some(
        (message) =>
          message.role === "agent" &&
          (message.metadata as { by?: string } | undefined)?.by === "person",
      )
    )
      return "self";
    return handledBy.get(task.id);
  };
  const received = (data?.tasks ?? []).filter(
    (task) => task.metadata.from !== me,
  );
  const { indexOf } = office;
  const colleagues = members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.id !== me);

  const ask = () => {
    if (colleagues.length) setAsking(true);
    else router.push(`/chat?say=${encodeURIComponent(t("linkStarter"))}`);
  };

  // Finished by the clone on its own: alone, or telling the person after (not asked, not theirs).
  const handled = received.filter((task) => {
    const how = handledOf(task);
    return how === "alone" || how === "told";
  }).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[53rem] flex-col gap-6 px-8 pt-10 pb-12">
        <OfficeTrouble />
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
            <div className="flex flex-wrap items-center gap-3">
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
              />
              <label className="ml-auto flex h-8.5 w-56 items-center gap-2 rounded-[10px] px-3 shadow-[inset_0_0_0_1px_var(--field)] focus-within:shadow-[inset_0_0_0_1px_var(--field),0_0_0_3px_var(--alpha-05)] max-sm:w-full">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  value={find}
                  onChange={(event) => setFind(event.target.value)}
                  placeholder={t("find")}
                  aria-label={t("find")}
                  className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
                />
              </label>
            </div>
            <div className="flex flex-col gap-7">
              {GROUPS.map((group) => {
                const rows = tasks.filter((task) => groupOf(task) === group);
                if (!rows.length) return null;
                return (
                  <section key={group} aria-labelledby={`g-${group}`}>
                    <h2
                      id={`g-${group}`}
                      className="flex items-center gap-2 px-3 pb-2 text-[14.5px] font-semibold"
                    >
                      {group === "yours" && (
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-waiting"
                        />
                      )}
                      {t(`groups.${group}`)}
                      <span
                        className={cn(
                          "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums",
                          group === "yours"
                            ? "bg-waiting/14 text-waiting-ink"
                            : "bg-foreground/[0.07] text-muted-foreground",
                        )}
                      >
                        {rows.length}
                      </span>
                    </h2>
                    <ul className="flex flex-col gap-px">
                      {rows.map((task) => {
                        const sent = task.metadata.from === me;
                        const other = sent
                          ? task.metadata.to
                          : task.metadata.from;
                        const name = nameOf(task);
                        return (
                          <RequestLine
                            key={task.id}
                            task={task}
                            me={me}
                            yours={group === "yours"}
                            name={name}
                            index={indexOf(other)}
                            words={words(
                              task,
                              sent,
                              name,
                              group === "yours"
                                ? questions.get(task.id)
                                : undefined,
                            )}
                            when={when(task.status.timestamp)}
                            handled={handledOf(task)}
                          />
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              {!tasks.length && (
                <p className="px-3 text-[14px] text-muted-foreground">
                  {t("noneFound")}
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog
        open={asking}
        onOpenChange={(open) => {
          setAsking(open);
          if (!open) setAskFor(null);
        }}
      >
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
                open={member.id === askFor}
                onSend={async (text, files) => {
                  const ok = await office.post({
                    action: "send",
                    to: member.id,
                    text,
                    files,
                  });
                  if (ok) {
                    setAsking(false);
                    setAskFor(null);
                  }
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
        <Button variant="secondary" onClick={onInvite}>
          <UserPlus />
          {t("invite")}
        </Button>
      </div>
    </div>
  );
}
