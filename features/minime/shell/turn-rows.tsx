"use client";

// What waits on the person, as rows answered in place (after Paperclip's Decisions): a permission
// or a question with a few choices takes its answer right on the row, and the chevron at its end
// goes to where it was asked. The office's board and Home show the same rows.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { Bot } from "@/features/office";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { Mark } from "./parts";
import { askLine, type TurnItem, turnHref } from "./your-turn";

export function TurnRows({
  turns,
  members,
  className,
}: {
  turns: TurnItem[];
  /** The office's members in order, which sets each colleague's colour. */
  members: string[];
  className?: string;
}) {
  const t = useTranslations("shell.office");
  const tAsk = useTranslations("ask");
  const app = useApp();
  return (
    <ol className={cn("flex flex-col", className)}>
      {turns.map((item) => {
        const ask = item.ask;
        const answer = (reply: string) => {
          if (item.waiting) void app.office.answer(item.waiting, reply, false);
          else if (item.chatAsk) void app.answerChatAsk(item.chatAsk.id, reply);
        };
        const choices =
          ask.kind === "question" ? (ask.choices ?? []).slice(0, 3) : [];
        const from = item.from;
        return (
          <li
            key={item.key}
            className="flex items-center gap-3 border-t border-border/60 px-4 py-3 first:border-t-0"
          >
            {from ? (
              <Mark
                id={from}
                index={Math.max(0, members.indexOf(from))}
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
                {from
                  ? t("fromColleague", {
                      name: app.office.names.get(from) ?? "",
                    })
                  : t("fromClone")}
              </span>
              <span className="text-[13.5px] leading-snug font-semibold">
                {askLine(tAsk, ask)}
              </span>
              {(ask.kind === "permission" || choices.length > 0) && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {ask.kind === "permission" ? (
                    <>
                      <Button
                        size="sm"
                        variant="brand"
                        onClick={() => answer("allow")}
                      >
                        {tAsk("allow")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => answer("deny")}
                      >
                        {tAsk("deny")}
                      </Button>
                    </>
                  ) : (
                    choices.map((choice, at) => (
                      <Button
                        key={choice}
                        size="sm"
                        variant={at === 0 ? "brand" : "ghost"}
                        onClick={() => answer(choice)}
                      >
                        {choice}
                      </Button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Tip label={t("open")}>
              <Link
                href={turnHref(item)}
                aria-label={t("open")}
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
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
