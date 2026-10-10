"use client";

// What waits on the person, as rows answered in place (after Paperclip's Decisions): a permission
// or a question with a few choices takes its answer right on the row, and the chevron at its end
// goes to where it was asked. The office's board and Home show the same rows.
//
// An answer is a call made in the person's name, so a stray tap must not make it: the choices
// weigh the same, the row answered stays where it was (saying what goes, with its own Undo, which
// the keyboard lands on) while the Undo lasts, the answer goes when that runs out or the screen
// goes, and a tap that lands just as the rows moved, or just after an answer, is not taken.
// Meanwhile it no longer counts as waiting anywhere (`app.toDecide`). The keyboard never lands on
// another question's choice: once the answer goes it moves to the next question (or the heading,
// `heading`, when none is left), once undone back to the choice, and either is said aloud.

import { ChevronRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { Bot } from "@/features/office";
import { useUndoableRemoval } from "@/hooks/use-undoable-removal";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { Mark } from "./parts";
import { askLine, type TurnItem, turnHref } from "./your-turn";

/** How long rows that just moved ignore a tap: what was under the pointer is not there any more. */
const SETTLE_MS = 450;

export function TurnRows({
  turns,
  heading,
  className,
}: {
  turns: TurnItem[];
  /** The heading over the rows, which takes the keyboard when the last one is answered. */
  heading?: string;
  className?: string;
}) {
  const t = useTranslations("shell.office");
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
    <ol ref={list} className={cn("flex flex-col", className)}>
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
        const who = from ? t("cloneOf", { name: fromName }) : t("yourClone");
        const question = `q-${item.key}`;
        const choose = (option: { reply: string; label: string }) => {
          if (performance.now() - movedAt.current < SETTLE_MS) return;
          // nor is a second tap (or Enter) just after, now on the next question
          movedAt.current = performance.now();
          setChosen((all) => ({ ...all, [item.key]: option.label }));
          app.markAnswering(item.key, true);
          sending.remove(
            item.key,
            t("answerTo", { who, choice: option.label }),
            {
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
                    ? `${t("sentTo", { who, choice: option.label })} ${t("noneLeft")}`
                    : t("sentTo", { who, choice: option.label }),
                );
                if (here)
                  requestAnimationFrame(() => {
                    const next = after
                      ? rowOf(after)?.querySelector<HTMLElement>(
                          "[data-question]",
                        )
                      : undefined;
                    (
                      next ??
                      (heading ? document.getElementById(heading) : null)
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
            },
          );
          // The keyboard stays on this row, on its Undo: never on the next question's choice.
          requestAnimationFrame(() =>
            rowOf(item.key)?.querySelector<HTMLElement>("[data-undo]")?.focus(),
          );
        };
        return (
          <li
            key={item.key}
            data-row={item.key}
            className="flex items-center gap-3 px-4 py-3"
          >
            {from ? (
              <Mark
                id={from}
                index={app.office.indexOf(from)}
                size={22}
                className="self-start"
              />
            ) : (
              <Bot
                size={22}
                mood="asking"
                still
                className="shrink-0 self-start"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                {from ? t("fromColleague", { name: fromName }) : t("fromClone")}
              </span>
              <span
                id={question}
                data-question
                tabIndex={-1}
                className="rounded-sm text-[13.5px] leading-snug font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {askLine(tAsk, ask)}
              </span>
              {sent !== undefined ? (
                <span className="mt-1.5 flex h-7 items-center gap-2 text-[13px] text-muted-foreground">
                  {/* still under way, and says so */}
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                  {t("answering", { choice: sent })}
                  <Button
                    data-undo
                    size="xs"
                    variant="ghost"
                    className="text-foreground"
                    // its clock waits while it is pointed at or focused, as the toast's does
                    onPointerEnter={() => sending.hold(item.key, "row-pointer")}
                    onPointerLeave={() =>
                      sending.release(item.key, "row-pointer")
                    }
                    onFocus={() => sending.hold(item.key, "row-focus")}
                    onBlur={() => sending.release(item.key, "row-focus")}
                    onClick={() => {
                      // a second press just after the answer is a bounce, not a change of mind
                      if (performance.now() - movedAt.current < SETTLE_MS)
                        return;
                      sending.undo(item.key);
                    }}
                  >
                    {undo}
                  </Button>
                </span>
              ) : (
                options.length > 0 && (
                  <div
                    role="group"
                    aria-labelledby={question}
                    className="mt-1.5 flex flex-wrap gap-1.5"
                  >
                    {options.map((option) => (
                      <Button
                        key={option.reply}
                        data-choice={option.reply}
                        size="sm"
                        variant="secondary"
                        onClick={() => choose(option)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                )
              )}
            </div>
            <Tip label={t("open")}>
              <Link
                href={turnHref(item)}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon" }),
                  "text-muted-foreground",
                )}
              >
                <ChevronRight className="size-4" />
              </Link>
            </Tip>
          </li>
        );
      })}
    </ol>
  );
}
