"use client";

// What waits on the person, as rows answered in place (after Paperclip's Decisions): a permission
// or a question with a few choices takes its answer right on the row, and "Open" goes to where it
// was asked. The office's board and Home show the same rows.

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
            className="flex flex-col gap-2 border-t border-border/60 px-4 py-3 first:border-t-0"
          >
            <div className="flex items-start gap-2.5">
              {from ? (
                <Mark
                  id={from}
                  index={Math.max(0, members.indexOf(from))}
                  size={22}
                  className="mt-0.5"
                />
              ) : (
                <Bot
                  size={22}
                  mood="asking"
                  still
                  className="mt-0.5 shrink-0"
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
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-8">
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
                    variant="outline"
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
                    variant={at === 0 ? "brand" : "outline"}
                    onClick={() => answer(choice)}
                  >
                    {choice}
                  </Button>
                ))
              )}
              <Link
                href={turnHref(item)}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {t("open")}
                <ChevronRight className="size-3.5" />
              </Link>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
