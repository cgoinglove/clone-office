"use client";

// What waits on the person, as rows answered in place (after Paperclip's Decisions): a permission
// or a question with a few choices takes its answer right on the row, and the chevron at its end
// goes to where it was asked. The office's board and Home show the same rows.
//
// An answer is a call made in the person's name, so a stray tap must not make it: the choices
// weigh the same, the row answered stays where it was (saying what goes, with its own Undo, which
// the keyboard lands on) while the Undo lasts, the answer goes when that runs out or the screen
// goes, and a tap that lands just as the rows moved, or just after an answer, is not taken.
// Meanwhile it no longer counts as waiting anywhere (`app.toDecide`).

import { ChevronRight, Clock } from "lucide-react";
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
  className,
}: {
  turns: TurnItem[];
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

  return (
    <ol ref={list} className={cn("flex flex-col", className)}>
      {turns.map((item, at) => {
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
                if (item.waiting)
                  await app.office.answer(item.waiting, option.reply, false);
                else if (item.chatAsk)
                  await app.answerChatAsk(item.chatAsk.id, option.reply);
                app.markAnswering(item.key, false);
                return true;
              },
              undo: () => app.markAnswering(item.key, false),
            },
          );
          // The keyboard stays on this row, on its Undo: never on the next question's choice.
          requestAnimationFrame(() =>
            list.current?.children[at]
              ?.querySelector<HTMLElement>("[data-undo]")
              ?.focus(),
          );
        };
        return (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
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
                className="text-[13.5px] leading-snug font-semibold"
              >
                {askLine(tAsk, ask)}
              </span>
              {sent !== undefined ? (
                <span className="mt-1.5 flex h-7 items-center gap-2 text-[13px] text-muted-foreground">
                  <Clock className="size-3.5" />
                  {t("answering", { choice: sent })}
                  <Button
                    data-undo
                    size="xs"
                    variant="ghost"
                    className="text-foreground"
                    onClick={() => sending.undo(item.key)}
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
                        data-choice
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
