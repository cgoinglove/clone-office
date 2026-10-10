"use client";

// The office, as its own screen: the drawing fills it, its lobby once a day as the person clocks
// in. What waits on the person hangs over it as the office's own board, and the simple ones are
// answered right there (yes or no, allow or not); anything longer opens where it belongs. The
// clones' meetings start from its header; while one goes on, the clones gather on the floor and
// what they say is read beside it.

import { ChevronDown, ChevronUp, MessagesSquare, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { OfficeRoom } from "@/features/office/room/office-room";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { MeetingPanel, MeetingStart, useMeetings } from "./meeting";
import { OfficeTrouble } from "./office-trouble";
import { TurnRows } from "./turn-rows";
import { type TurnItem, turnHref } from "./your-turn";

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

/** Whether the screen is phone-sized, followed as it is resized. */
function useSmall() {
  const [small, setSmall] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const follow = () => setSmall(query.matches);
    follow();
    query.addEventListener("change", follow);
    return () => query.removeEventListener("change", follow);
  }, []);
  return small;
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
  const turns = app.turns;
  // the floor and its lobby count what waits as the column does
  const waits = app.toDecide.length;
  const room = useMemo(
    () =>
      office.room && {
        ...office.room,
        waiting: { ...office.room.waiting, count: waits },
      },
    [office.room, waits],
  );
  // Read once: the office does not go back to the lobby while the screen is open.
  const [lobby] = useState(
    () => typeof window !== "undefined" && !clockedInToday(),
  );
  const [clocked, setClocked] = useState(false);
  const atLobby = lobby && Boolean(preferences?.lobby) && !clocked;
  const moving = (data?.tasks ?? []).filter((task) =>
    ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(task.status.state),
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
  // the meeting's buttons keep their room through the lobby and the ride (unseen, out of reach), so
  // the header does not grow as the doors open and the floor is not framed again
  const meets = app.joined && members.length > 1;
  // how far down the board over the office reaches: the floor may pass beneath it
  const [boardHeight, setBoardHeight] = useState(0);
  // the office's own panel about one person and the board take turns at the right
  const [panelOpen, setPanelOpen] = useState(false);
  // On a phone the board would cover the floor: it folds into a pill, opened when wanted.
  const small = useSmall();
  const [boardOpen, setBoardOpen] = useState(false);
  // On a phone a folded board stays mounted, hidden, so an answer waiting out its Undo there is
  // not sent by folding it.
  const boardOn = turns.length > 0 && !atLobby && !panelOpen;
  const boardShown = boardOn && (!small || boardOpen);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-wrap items-center gap-4 border-b border-border/60 px-6 py-3">
        <div className="flex min-w-0 flex-col">
          <h1
            id="office-title"
            tabIndex={-1}
            className="rounded-sm text-[17px] leading-tight font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {t("title")}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {app.joined ? t("line", { moving }) : t("alone")}
            {/* who is in is drawn on the clock; a screen reader hears it here */}
            {app.joined && (
              <span className="sr-only">
                {" · "}
                {t("inNow", {
                  count:
                    office.room?.people.filter((p) => p.status !== "offline")
                      .length ?? 0,
                  all: office.room?.people.length ?? 0,
                })}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {meets && (
            <span className={cn("contents", atLobby && "invisible")}>
              <MeetingStart
                onStarted={() => {
                  setClosedId(undefined);
                  setShowLatest(false);
                }}
              />
              {latest && !shown && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowLatest(true)}
                >
                  <MessagesSquare />
                  {tMeeting("latest")}
                </Button>
              )}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => app.setSettings("office")}
          >
            <UserPlus />
            {app.joined ? t("invite") : t("setUp")}
          </Button>
        </div>
      </header>
      <OfficeTrouble className="mx-6 mt-3 shrink-0" />
      <div className="relative min-h-0 flex-1">
        {room && preferences && (
          <OfficeRoom
            full
            className="of-pane"
            data={room}
            lobby={lobby && preferences.lobby}
            // on a phone the board lies over the floor, which stays as it is beneath it
            inset={boardShown && !small ? BOARD + 32 : 0}
            insetHeight={small ? 0 : boardHeight}
            turnShown
            onPanel={setPanelOpen}
            insetLeft={shown && meets && !atLobby ? MEETING + 32 : 0}
            onEnter={() => {
              rememberClockIn();
              // the lobby's button goes with the lobby: the keyboard lands on the office
              document.getElementById("office-title")?.focus();
            }}
            onClockIn={() => setClocked(true)}
            onAnswer={() => {
              const first = turns[0];
              if (first) router.push(turnHref(first));
            }}
            onAsk={(text) =>
              router.push(`/chat?say=${encodeURIComponent(text)}`)
            }
          />
        )}
        {boardOn && (
          <Board
            hidden={!boardShown}
            turns={turns}
            count={app.toDecide.length}
            onHeight={setBoardHeight}
            onFold={
              small
                ? () => {
                    setBoardOpen(false);
                    // the keyboard goes back to the pill that opened it
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLElement>("[data-board-pill]")
                        ?.focus(),
                    );
                  }
                : undefined
            }
          />
        )}
        {small && turns.length > 0 && !atLobby && !panelOpen && !boardOpen && (
          <button
            type="button"
            data-board-pill
            aria-expanded={false}
            onClick={() => {
              setBoardOpen(true);
              // the keyboard goes into the board, on the button that folds it again
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLElement>("[data-board-fold]")
                  ?.focus(),
              );
            }}
            className="absolute top-4 right-4 z-10 flex h-8 items-center gap-1.5 rounded-full bg-background px-3 text-[13px] font-semibold text-waiting shadow-[0_0_0_1px_var(--alpha-08),0_8px_24px_-12px_var(--alpha-20)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("yourTurn")}
            <span className="tabular-nums">{app.toDecide.length}</span>
            <ChevronDown className="size-3.5" />
          </button>
        )}
        {shown && meets && !atLobby && (
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
function Board({
  hidden,
  turns,
  count,
  onHeight,
  onFold,
}: {
  hidden: boolean;
  turns: TurnItem[];
  /** How many still wait (an answer on its way stays on the board, uncounted). */
  count: number;
  /** On a phone, folds the board back into its pill. */
  onFold?: () => void;
  /** How far down from the office's top it reaches, as it grows and shrinks. */
  onHeight: (px: number) => void;
}) {
  const t = useTranslations("shell.office");
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const seen = new ResizeObserver(() =>
      onHeight(el.offsetTop + el.offsetHeight),
    );
    seen.observe(el);
    return () => {
      seen.disconnect();
      onHeight(0);
    };
  }, [onHeight]);
  return (
    <section
      ref={box}
      hidden={hidden}
      aria-labelledby="o-turn"
      style={{ width: BOARD }}
      className="absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[14px] bg-background/97 shadow-[0_0_0_1px_var(--alpha-08),0_18px_40px_-20px_var(--alpha-20)]"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <h2
          id="o-turn"
          tabIndex={-1}
          className="rounded-sm text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {t("yourTurn")}
        </h2>
        {/* only while something still waits: answers on their way are not counted */}
        {count > 0 && (
          <>
            <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
              {count}
            </span>
            <span className="ml-auto text-xs text-muted-foreground">
              {t("answerHere")}
            </span>
          </>
        )}
        {onFold && (
          <Tip label={t("fold")}>
            <button
              type="button"
              data-board-fold
              aria-expanded
              onClick={onFold}
              className={cn(
                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                "-mr-1.5 text-muted-foreground",
                count === 0 && "ml-auto",
              )}
            >
              <ChevronUp className="size-4" />
            </button>
          </Tip>
        )}
      </div>
      {/* when the last is answered the board goes, and the keyboard lands on the office's title */}
      <TurnRows
        turns={turns}
        heading="office-title"
        className="overflow-y-auto"
      />
    </section>
  );
}
