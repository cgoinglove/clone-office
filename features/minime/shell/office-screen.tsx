"use client";

// The office, as its own screen: the drawing fills it, its lobby once a day as the person clocks
// in. What waits on the person hangs over it as the office's own board, and the simple ones are
// answered right there (yes or no, allow or not); anything longer opens where it belongs.

import { ChevronDown, ChevronUp, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { OfficeRoom } from "@/features/office/room/office-room";
import { useSlashKey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";
import { OfficeTrouble } from "./office-trouble";
import { TurnRows } from "./turn-rows";
import { useInvite } from "./use-invite";
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

/** The board's width, which the office keeps clear at its right. */
const BOARD = 360;

export function OfficeScreen() {
  const t = useTranslations("shell.office");
  const tHome = useTranslations("shell.home");
  const app = useApp();
  const router = useRouter();
  const { office, preferences } = app;
  const data = office.office;
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
  const everyone = office.room?.people.length ?? 0;
  const inNow =
    office.room?.people.filter((p) => p.status !== "offline").length ?? 0;
  const invite = useInvite();
  // how far down the board over the office reaches: the floor may pass beneath it
  const [boardHeight, setBoardHeight] = useState(0);
  // the office's own panel about one person and the board take turns at the right
  const [panelOpen, setPanelOpen] = useState(false);
  // On a phone the board would cover the floor: it folds into a pill, opened when wanted.
  const small = useSmall();
  const [boardOpen, setBoardOpen] = useState(false);
  // "/" writes to the clone here too: the office's own box, once the doors are open
  useSlashKey(() => {
    const box = document.querySelector<HTMLInputElement>(
      ".of-wrap [data-of=ask-input]",
    );
    if (box?.offsetParent) box.focus();
  });
  // On a phone a folded board stays mounted, hidden, so an answer waiting out its Undo there is
  // not sent by folding it.
  // It is there, unseen, through the lobby and the ride too, so the floor behind the lift's doors
  // is framed beside it already and nothing moves as they open.
  const boardOn = turns.length > 0 && !panelOpen;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-6 py-2.5">
        <h1
          id="office-title"
          tabIndex={-1}
          className="-mx-1 rounded-sm px-1 text-[17px] leading-tight font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {t("title")}
        </h1>
        <p className="min-w-0 truncate text-[13px] text-muted-foreground">
          {app.joined
            ? [
                data?.name,
                tHome("inOf", { count: inNow, all: everyone }),
                t("line", { moving }),
              ]
                .filter(Boolean)
                .join(" · ")
            : t("alone")}
        </p>
        <div className="ml-auto flex items-center gap-1.5">
          {app.joined && everyone > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => app.setSettings("office")}
            >
              <Users />
              {t("people", { count: everyone })}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            loading={invite.making}
            onClick={app.joined ? invite.copy : () => app.setSettings("office")}
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
            inset={boardOn && !small ? BOARD + 32 : 0}
            insetHeight={small ? 0 : boardHeight}
            turnShown
            onPanel={setPanelOpen}
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
            onAskOf={(id) =>
              router.push(`/requests?ask=${encodeURIComponent(id)}`)
            }
            onRequest={(id) =>
              router.push(`/requests/${encodeURIComponent(id)}`)
            }
          />
        )}
        {boardOn && (
          <Board
            hidden={small && !boardOpen}
            unseen={atLobby}
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
            className="absolute top-4 right-4 z-10 flex h-8 items-center gap-1.5 rounded-full bg-background px-3 text-[13px] font-semibold text-waiting-ink shadow-[0_0_0_1px_var(--alpha-08),0_8px_24px_-12px_var(--alpha-20)] outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("yourTurn")}
            <span className="tabular-nums">{app.toDecide.length}</span>
            <ChevronDown className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** What waits on the person, hung over the office: answered in place when it is a tap. */
function Board({
  hidden,
  unseen,
  turns,
  count,
  onHeight,
  onFold,
}: {
  hidden: boolean;
  /** Laid out but not seen nor reached (the lobby and the ride), so its room is known. */
  unseen: boolean;
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
      className={cn(
        unseen && "invisible",
        // the cards lie on the floor as they are, under their heading: no board around them
        "absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col gap-2.5",
      )}
    >
      <div className="flex h-8 w-fit max-w-full items-center gap-2 self-start rounded-[10px] bg-background/92 px-2.5">
        <span className="size-2 shrink-0 rounded-full bg-waiting" aria-hidden />
        <h2
          id="o-turn"
          tabIndex={-1}
          className="-mx-1 rounded-sm px-1 text-[13.5px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          {t("yourTurn")}
        </h2>
        {/* only while something still waits: answers on their way are not counted */}
        {count > 0 && (
          <span className="text-[13px] font-semibold text-waiting-ink tabular-nums">
            {count}
          </span>
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
                "-mr-1.5 ml-1 text-muted-foreground",
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
        size="sm"
        className="min-h-0 overflow-y-auto p-px"
      />
    </section>
  );
}
