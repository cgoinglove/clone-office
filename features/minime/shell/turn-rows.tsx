"use client";

// What waits on the person, as one card each answered in place (after Paperclip's Decisions and
// Superhuman's instant replies): who asks and how long ago, the question, what the clone checked
// that bears on it, and the answers of equal weight beside writing one's own; the chevron goes to
// where it was asked. Home, the office's board and a request's page draw the same card, `size`
// only making it smaller (10-19 redesign).
//
// An answer is a call made in the person's name, so a stray tap must not make it: the choices
// weigh the same, the row answered stays where it was (saying what goes, with its own Undo, which
// the keyboard lands on) while the Undo lasts, the answer goes when that runs out or the screen
// goes, and a tap that lands just as the rows moved, or just after an answer, is not taken.
// Meanwhile it no longer counts as waiting anywhere (`app.toDecide`). The keyboard never lands on
// another question's choice: once the answer goes it moves to the next question (or the heading,
// `heading`, when none is left), once undone back to the choice, and either is said aloud.

import { ChevronRight, Loader2, PenLine } from "lucide-react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { Bot } from "@/features/office";
import { useUndoableRemoval } from "@/hooks/use-undoable-removal";
import { clip, cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { Asking, Mark } from "./parts";
import { askLine, type TurnItem, turnHref } from "./your-turn";

/** How long rows that just moved ignore a tap: what was under the pointer is not there any more. */
export const SETTLE_MS = 450;

/** How much of an answer a row or a toast shows: one written in full is cut short. */
export const ANSWER_CHARS = 48;

/** An answer on its way, in place of the choices: what goes, still under way, with its own Undo. */
export function PendingAnswer({
  choice,
  hold,
  release,
  onUndo,
}: {
  choice: string;
  hold: () => void;
  release: () => void;
  onUndo: () => void;
}) {
  const t = useTranslations("shell.office");
  const undo = useTranslations("common")("undo");
  return (
    <span className="mt-1.5 flex h-7 min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
      {/* still under way, and says so */}
      <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      <span className="min-w-0 truncate">
        {t("answering", { choice: clip(choice, ANSWER_CHARS) })}
      </span>
      <Button
        data-undo
        size="xs"
        variant="ghost"
        className="shrink-0 text-foreground"
        onPointerEnter={hold}
        onPointerLeave={release}
        onClick={onUndo}
      >
        {undo}
      </Button>
    </span>
  );
}

/** Where writing one's own answer happens: the request's page opens on it. */
function ownAnswerHref(item: TurnItem): string {
  const href = turnHref(item);
  return item.where.kind === "request" && item.where.task
    ? `${href}?answer=own`
    : href;
}

export function TurnRows({
  turns,
  heading,
  className,
  size = "md",
}: {
  turns: TurnItem[];
  /** The heading over the rows, which takes the keyboard when the last one is answered. */
  heading?: string;
  className?: string;
  /** "sm" where it lies over the office's floor. */
  size?: "md" | "sm";
}) {
  const t = useTranslations("shell.office");
  const format = useFormatter();
  const now = useNow({ updateInterval: 30_000 });
  const small = size === "sm";
  const tAsk = useTranslations("ask");
  const undo = useTranslations("common")("undo");
  const app = useApp();
  // The answers chosen and waiting out their Undo, by row: the row shows the choice meanwhile.
  const sending = useUndoableRemoval(undo);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const keys = turns.map((item) => item.key).join("|");
  const movedAt = useRef(0);
  useEffect(() => {
    void keys;
    movedAt.current = performance.now();
  }, [keys]);
  const list = useRef<HTMLOListElement>(null);
  const rowOf = (key: string) =>
    list.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(key)}"]`);

  return (
    <ol ref={list} className={cn("flex flex-col gap-2.5", className)}>
      {turns.map((item) => {
        const ask = item.ask;
        // A permission is allowed or not; a question offers its first few choices.
        const options =
          ask.kind === "permission"
            ? [
                { reply: "allow", label: tAsk("allow") },
                { reply: "deny", label: tAsk("deny") },
              ]
            : ask.kind === "question"
              ? (ask.choices ?? [])
                  .slice(0, 3)
                  .map((choice) => ({ reply: choice, label: choice }))
              : [];
        const from = item.from;
        const fromName = from ? (app.office.names.get(from) ?? "") : "";
        const sent = sending.hidden.has(item.key)
          ? chosen[item.key]
          : undefined;
        // the answer goes to the person's own clone, which answers the colleague as it goes on
        const told = (choice: string) =>
          from
            ? t("answerFor", {
                name: fromName,
                choice: clip(choice, ANSWER_CHARS),
              })
            : t("answerToClone", { choice: clip(choice, ANSWER_CHARS) });
        const gone = (choice: string) =>
          from
            ? t("sentFor", {
                name: fromName,
                choice: clip(choice, ANSWER_CHARS),
              })
            : t("sentToClone", { choice: clip(choice, ANSWER_CHARS) });
        const question = `q-${item.key}`;
        const choose = (option: { reply: string; label: string }) => {
          if (performance.now() - movedAt.current < SETTLE_MS) return;
          // nor is a second tap (or Enter) just after, now on the next question
          movedAt.current = performance.now();
          setChosen((all) => ({ ...all, [item.key]: option.label }));
          app.markAnswering(item.key, true);
          sending.remove(item.key, told(option.label), {
            commit: async () => {
              // where the keyboard goes once this row is gone: the question after it, else the heading
              const row = rowOf(item.key);
              const here =
                !!row?.contains(document.activeElement) ||
                document.activeElement === document.body;
              const after = row?.nextElementSibling?.getAttribute("data-row");
              const last = (list.current?.children.length ?? 0) <= 1;
              if (item.waiting)
                await app.office.answer(item.waiting, option.reply, false);
              else if (item.chatAsk)
                await app.answerChatAsk(item.chatAsk.id, option.reply);
              app.markAnswering(item.key, false);
              app.announce(
                last
                  ? `${gone(option.label)} ${t("noneLeft")}`
                  : gone(option.label),
              );
              if (here)
                requestAnimationFrame(() => {
                  const next = after
                    ? rowOf(after)?.querySelector<HTMLElement>(
                        "[data-question]",
                      )
                    : undefined;
                  (
                    next ?? (heading ? document.getElementById(heading) : null)
                  )?.focus();
                });
              return true;
            },
            undo: () => {
              app.markAnswering(item.key, false);
              app.announce(t("undone"));
              // back on the choice it was, when the keyboard was on this row's Undo
              const row = rowOf(item.key);
              if (row?.contains(document.activeElement))
                requestAnimationFrame(() =>
                  rowOf(item.key)
                    ?.querySelector<HTMLElement>(
                      `[data-choice="${CSS.escape(option.reply)}"]`,
                    )
                    ?.focus(),
                );
            },
          });
          // The keyboard stays on this row, on its Undo: never on the next question's choice.
          requestAnimationFrame(() =>
            rowOf(item.key)?.querySelector<HTMLElement>("[data-undo]")?.focus(),
          );
        };
        const ago = item.since
          ? format.relativeTime(
              Math.min(Date.parse(item.since), now.getTime()),
              { now },
            )
          : undefined;
        const why = ask.kind === "question" ? ask.why : undefined;
        return (
          <li
            key={item.key}
            data-row={item.key}
            className={cn(
              "flex gap-3.5 rounded-[14px] bg-background shadow-[0_0_0_1px_var(--alpha-10)]",
              small ? "flex-col gap-2 px-4 py-3.5" : "px-4.5 py-4",
            )}
          >
            {!small && (
              <Asking>
                {from ? (
                  <Mark id={from} index={app.office.indexOf(from)} size={30} />
                ) : (
                  <Bot
                    size={30}
                    mood="asking"
                    still
                    mine
                    className="shrink-0"
                  />
                )}
              </Asking>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex min-w-0 items-center gap-2">
                {small && (
                  <Asking>
                    {from ? (
                      <Mark
                        id={from}
                        index={app.office.indexOf(from)}
                        size={22}
                      />
                    ) : (
                      <Bot
                        size={22}
                        mood="asking"
                        still
                        mine
                        className="shrink-0"
                      />
                    )}
                  </Asking>
                )}
                <span className="min-w-0 truncate text-[12.5px] font-semibold">
                  {from
                    ? t(
                        app.office.onWeb.has(from)
                          ? "fromPerson"
                          : "fromColleague",
                        { name: fromName },
                      )
                    : t("fromClone")}
                </span>
                {ago && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    · {ago}
                  </span>
                )}
                <Tip label={t("open")}>
                  <Link
                    href={turnHref(item)}
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "icon-sm" }),
                      "-my-1 ml-auto text-muted-foreground",
                    )}
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                </Tip>
              </div>
              <span
                id={question}
                data-question
                tabIndex={-1}
                className={cn(
                  "-mx-1 rounded-sm px-1 leading-snug font-semibold tracking-[-0.01em] text-pretty outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  small ? "text-[14.5px]" : "text-[16px]",
                )}
              >
                {askLine(tAsk, ask)}
              </span>
              {why && (
                <p className="text-[13px] leading-relaxed text-muted-foreground text-pretty">
                  {why}
                </p>
              )}
              {sent !== undefined ? (
                <PendingAnswer
                  choice={sent}
                  // its clock waits while it is pointed at; the keyboard is put here by the app,
                  // so its focus alone holds nothing, or the answer would never go
                  hold={() => sending.hold(item.key, "row-pointer")}
                  release={() => sending.release(item.key, "row-pointer")}
                  onUndo={() => {
                    // a second press just after the answer is a bounce, not a change of mind
                    if (performance.now() - movedAt.current < SETTLE_MS) return;
                    sending.undo(item.key);
                  }}
                />
              ) : (
                <div
                  role="group"
                  aria-labelledby={question}
                  className="mt-1 flex flex-wrap items-center gap-2"
                >
                  {options.map((option) => (
                    <Button
                      key={option.reply}
                      data-choice={option.reply}
                      variant="secondary"
                      className={cn(
                        "rounded-[10px] px-3.5",
                        small ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
                      )}
                      onClick={() => choose(option)}
                    >
                      {option.label}
                    </Button>
                  ))}
                  {ask.kind === "question" && (
                    <Link
                      href={ownAnswerHref(item)}
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "rounded-[10px] px-2.5 text-muted-foreground",
                        small ? "h-8 text-[13px]" : "h-9 text-[13.5px]",
                      )}
                    >
                      <PenLine />
                      {t("ownAnswer")}
                    </Link>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
