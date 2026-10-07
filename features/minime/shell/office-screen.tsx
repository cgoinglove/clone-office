"use client";

// The office, as its own screen: the drawing fills it, its lobby once a day as the person clocks
// in. What waits on the person hangs over it as the office's own board, and the simple ones are
// answered right there (yes or no, allow or not); anything longer opens where it belongs. The
// clones' meetings start from its header; while one goes on, the clones gather on the floor and
// what they say is read beside it.

import { MessagesSquare, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { OfficeRoom } from "@/features/office/room/office-room";
import { useApp } from "./app-state";
import { MeetingPanel, MeetingStart, useMeetings } from "./meeting";
import { Flap, twoDigits } from "./parts";
import { TurnRows } from "./turn-rows";
import { type TurnItem, turnHref, yourTurn } from "./your-turn";

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
      <TurnRows turns={turns} members={members} className="overflow-y-auto" />
    </section>
  );
}
