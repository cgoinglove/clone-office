"use client";

// The office, as its own screen: the drawing fills it, its lobby once a day as the person clocks
// in. What waits on the person hangs over it as the office's own board, and the simple ones are
// answered right there (yes or no, allow or not); anything longer opens where it belongs. The
// clones' meetings start from its header; while one goes on, the clones gather on the floor and
// what they say is read beside it.

import { ChevronRight, MessagesSquare, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Bot } from "@/features/office";
import { OfficeRoom } from "@/features/office/room/office-room";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { MeetingPanel, MeetingStart, useMeetings } from "./meeting";
import { Flap, Mark, twoDigits } from "./parts";
import { askLine, type TurnItem, turnHref, yourTurn } from "./your-turn";

// The office opens at its lobby once a day: the day it was last done is kept in this browser.
const CLOCKED_IN = "sub-office.clocked-in";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
function clockedInToday(): boolean {
  try {
    return localStorage.getItem(CLOCKED_IN) === today();
  } catch {
    return true;
  }
}
function rememberClockIn(): void {
  try {
    localStorage.setItem(CLOCKED_IN, today());
  } catch {}
}

/** The board's width, which the office keeps clear at its right; the meeting's, at its left. */
const BOARD = 340;
const MEETING = 340;

export function OfficeScreen() {
  const t = useTranslations("shell.office");
  const tMeeting = useTranslations("shell.meeting");
  const app = useApp();
  const router = useRouter();
  const { office, preferences } = app;
  const data = office.office;
  const members = data?.members ?? [];
  const turns = yourTurn(office, app.chatAsks);
  // Read once: the office does not go back to the lobby while the screen is open.
  const [lobby] = useState(
    () => typeof window !== "undefined" && !clockedInToday(),
  );
  const [clocked, setClocked] = useState(false);
  const atLobby = lobby && Boolean(preferences?.lobby) && !clocked;
  const moving = (data?.tasks ?? []).filter((task) =>
    ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(task.status.state),
  ).length;
  const inToday = members.filter(
    (member) => Date.now() - Date.parse(member.seen) < 120_000,
  ).length;
  // A meeting going on (or just over) shows beside the floor; the last one, when asked for.
  const { current, latest } = useMeetings();
  const [closedId, setClosedId] = useState<string>();
  const [showLatest, setShowLatest] = useState(false);
  const shown =
    current && current.id !== closedId
      ? current
      : showLatest
        ? latest
        : undefined;
  const meets = app.joined && members.length > 1 && !atLobby;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border/60 px-6 py-3">
        <div className="flex min-w-0 flex-col">
          <h1 className="text-[17px] leading-tight font-semibold">
            {t("title")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {app.joined ? t("line", { count: inToday, moving }) : t("alone")}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {meets && (
            <MeetingStart
              onStarted={() => {
                setClosedId(undefined);
                setShowLatest(false);
              }}
            />
          )}
          {meets && latest && !shown && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLatest(true)}
            >
              <MessagesSquare />
              {tMeeting("latest")}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => app.setSettings("office")}
          >
            <UserPlus />
            {app.joined ? t("invite") : t("setUp")}
          </Button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {office.room && preferences && (
          <OfficeRoom
            full
            className="of-pane"
            data={office.room}
            lobby={lobby && preferences.lobby}
            inset={turns.length && !atLobby ? BOARD + 32 : 0}
            insetLeft={shown && meets ? MEETING + 32 : 0}
            onClockIn={() => {
              rememberClockIn();
              setClocked(true);
            }}
            onAnswer={() => {
              const first = turns[0];
              if (first) router.push(turnHref(first));
            }}
            onAsk={(text) =>
              router.push(`/chat?say=${encodeURIComponent(text)}`)
            }
          />
        )}
        {turns.length > 0 && !atLobby && (
          <Board turns={turns} members={members.map((m) => m.id)} />
        )}
        {shown && meets && (
          <MeetingPanel
            meeting={shown}
            width={MEETING}
            onClose={() => {
              setClosedId(shown.id);
              setShowLatest(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/** What waits on the person, hung over the office: answered in place when it is a tap. */
function Board({ turns, members }: { turns: TurnItem[]; members: string[] }) {
  const t = useTranslations("shell.office");
  const tAsk = useTranslations("ask");
  const app = useApp();
  return (
    <section
      aria-labelledby="o-turn"
      style={{ width: BOARD }}
      className="absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[14px] bg-background/97 shadow-[0_0_0_1px_var(--alpha-08),0_18px_40px_-20px_var(--alpha-20)]"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <h2 id="o-turn" className="text-sm font-semibold">
          {t("yourTurn")}
        </h2>
        <Flap value={twoDigits(turns.length)} tone="ember" />
        <span className="ml-auto text-xs text-muted-foreground">
          {t("answerHere")}
        </span>
      </div>
      <ol className="flex flex-col overflow-y-auto">
        {turns.map((item) => {
          const ask = item.ask;
          const answer = (reply: string) => {
            if (item.waiting)
              void app.office.answer(item.waiting, reply, false);
            else if (item.chatAsk)
              void app.answerChatAsk(item.chatAsk.id, reply);
          };
          const choices =
            ask.kind === "question"
              ? (ask.choices ?? []).slice(0, 3)
              : ask.kind === "permission"
                ? []
                : [];
          const from = item.from;
          return (
            <li
              key={item.key}
              className="flex flex-col gap-2 border-t border-border/60 px-4 py-3"
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
                  className={cn(
                    "flex h-8 items-center gap-1 rounded-lg px-2 text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  )}
                >
                  {t("open")}
                  <ChevronRight className="size-3.5" />
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
