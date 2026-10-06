"use client";

// The office room on a page: a box the drawing (office.mjs) fills and moves on its own frame loop.
// React hands it the relay's look and the screen's words, and nothing else; it never re-renders
// what is inside. The engine loads with the box, so pages without an office never carry it.

import { useLocale, useTranslations } from "next-intl";
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { cn } from "@/lib/utils";
import type { Room, RoomData, RoomWords } from "./office.mjs";
import "./room.css";

export type { RoomData, RoomPerson, RoomRequest } from "./office.mjs";

/** What a page may ask of the office it holds. */
export interface OfficeControl {
  /** Closes the panel about one person, if it is open. */
  closePanel(): void;
}

export function OfficeRoom({
  data,
  lobby = false,
  full = false,
  inset = 0,
  insetLeft = 0,
  onClockIn,
  onAnswer,
  onAsk,
  onPanel,
  className,
  ref,
}: {
  data: RoomData;
  /** Fills the screen it is on, with no frame of its own: the app's main screen. */
  full?: boolean;
  /** Pixels kept clear at the right for a panel the page lays over the office. */
  inset?: number;
  /** Pixels kept clear at the left, for a column of words laid over it. */
  insetLeft?: number;
  /** The office's own panel about one person opened or closed. */
  onPanel?: (open: boolean) => void;
  ref?: Ref<OfficeControl>;
  /** Opens at the lobby (the building, a card to clock in, the lift up) rather than at the office. */
  lobby?: boolean;
  onClockIn?: () => void;
  /** Opens what waits for the viewer, when they tap their mini-me's question. */
  onAnswer?: () => void;
  /** Hands a request to the viewer's mini-me; without it the office has no box to ask in. */
  onAsk?: (text: string) => void;
  className?: string;
}) {
  const t = useTranslations("office");
  const locale = useLocale();
  const words = useMemo<RoomWords>(
    () => ({
      label: t("room.label"),
      team: t("team"),
      floor: (n) => t("room.floor", { n }),
      people: (count) => t("room.people", { count }),
      floorGroup: t("room.floorGroup"),
      openSeat: t("room.openSeat"),
      lift: t("room.lift"),
      offTag: t("room.offTag"),
      done: t("room.done"),
      answer: t("room.answer"),
      needsYouChip: t("room.needsYouChip"),
      yourMiniMe: t("yourMiniMe"),
      miniMe: (name) => t("miniMe", { name }),
      requestState: (state) => t(`state.${state}`),
      notes: {
        myDesk: t("room.notes.myDesk"),
        tea: t("room.notes.tea"),
        lift: t("room.notes.lift"),
      },
      views: {
        label: t("room.views.label"),
        desk: t("room.views.desk"),
        board: t("room.views.board"),
        office: t("room.views.office"),
        zoomIn: t("room.views.zoomIn"),
        zoomOut: t("room.views.zoomOut"),
      },
      composer: {
        placeholder: t("room.composer.placeholder"),
        send: t("room.composer.send"),
        askFor: (name, what) => t("room.composer.askFor", { name, what }),
        askText: (name, what) => t("room.composer.askText", { name, what }),
      },
      board: {
        you: t("room.board.you"),
        who: t("room.board.who"),
        status: t("room.board.status"),
        on: t("room.board.on"),
        desk: t("room.board.desk"),
        to: (name) => t("room.board.to", { name }),
        wait: (name) => t("room.board.wait", { name }),
        states: {
          ask: t("room.board.states.ask"),
          deciding: t("room.board.states.deciding"),
          work: t("room.board.states.work"),
          free: t("room.board.states.free"),
          away: t("room.board.states.away"),
          off: t("room.board.states.off"),
        },
      },
      counts: {
        in: (count) => t("room.counts.in", { count }),
        off: (count) => t("room.counts.off", { count }),
        waiting: (count) => t("room.counts.waiting", { count }),
      },
      sign: {
        you: t("room.sign.you"),
        work: t("room.sign.work"),
        quiet: t("room.sign.quiet"),
      },
      plate: {
        youShort: t("room.plate.youShort"),
        you: (name) => t("room.plate.you", { name }),
        needsYou: t("room.plate.needsYou"),
        deciding: t("room.plate.deciding"),
        computerOff: t("room.plate.computerOff"),
        working: t("room.plate.working"),
        away: t("room.plate.away"),
        free: t("room.plate.free"),
        onDesk: (count) => t("room.plate.onDesk", { count }),
        goingTo: (name) => t("room.plate.goingTo", { name }),
      },
      say: {
        isIn: (name) => t("room.say.isIn", { name }),
        bye: (name) => t("room.say.bye", { name }),
        bring: (to, from, what) => t("room.say.bring", { to, from, what }),
        leftOnDesk: (name) => t("room.say.leftOnDesk", { name }),
        gotIt: t("room.say.gotIt"),
        thanks: (name) => t("room.say.thanks", { name }),
      },
      lobby: {
        greeting: (hour, name) =>
          t(
            hour < 5
              ? "room.lobby.late"
              : hour < 12
                ? "room.lobby.morning"
                : hour < 18
                  ? "room.lobby.afternoon"
                  : "room.lobby.evening",
            { name },
          ),
        in: (count, of) => t("room.lobby.in", { in: count, count: of }),
        alone: t("room.lobby.alone"),
        waiting: (count) => t("room.lobby.waiting", { count }),
        clockIn: t("room.lobby.clockIn"),
        enter: t("room.lobby.enter"),
        foot: t("room.lobby.foot"),
        floors: (count) => t("room.lobby.floors", { count }),
        yourFloor: t("room.lobby.yourFloor"),
      },
      panel: {
        close: t("room.panel.close"),
        atDesk: t("room.panel.atDesk"),
        away: t("room.panel.away"),
        off: t("room.panel.off"),
        needsYou: t("room.panel.needsYou"),
        waitingOn: (name) => t("room.panel.waitingOn", { name }),
        onDesk: t("room.panel.onDesk"),
        doneToday: t("room.panel.doneToday"),
        asked: t("room.panel.asked"),
        now: t("room.panel.now"),
        workingOn: (what) => t("room.panel.workingOn", { what }),
        waitingFor: (name) => t("room.panel.waitingFor", { name }),
        free: t("room.panel.free"),
        notIn: (name) => t("room.panel.notIn", { name }),
        ways: (name) => t("room.panel.ways", { name }),
        myMenu: t("room.panel.myMenu"),
        menu: (name) => t("room.panel.menu", { name }),
        earlier: t("room.panel.earlier"),
        nothingYet: t("room.panel.nothingYet"),
      },
    }),
    [t],
  );
  const box = useRef<HTMLDivElement>(null);
  const room = useRef<Room | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const handlers = useRef({ onAnswer, onAsk, onClockIn, onPanel });
  handlers.current = { onAnswer, onAsk, onClockIn, onPanel };
  const insetNow = useRef([inset, insetLeft]);
  insetNow.current = [inset, insetLeft];
  useImperativeHandle(ref, () => ({
    closePanel: () => room.current?.closePanel(),
  }));
  // Read once: the office does not go back to the lobby while it is open.
  const atLobby = useRef(lobby).current;
  const asks = !!onAsk;

  useEffect(() => {
    let alive = true;
    let made: Room | null = null;
    void import("./office.mjs").then(({ createOffice }) => {
      if (!alive || !box.current) return;
      made = createOffice(box.current, {
        words,
        locale,
        onAnswer: () => handlers.current.onAnswer?.(),
        onAsk: asks ? (text) => handlers.current.onAsk?.(text) : undefined,
        lobby: atLobby,
        onClockIn: () => handlers.current.onClockIn?.(),
        onPanel: (open) => handlers.current.onPanel?.(open),
      });
      made.update(latest.current);
      made.setInset(insetNow.current[0], insetNow.current[1]);
      room.current = made;
    });
    return () => {
      alive = false;
      made?.destroy();
      room.current = null;
    };
  }, [words, locale, asks, atLobby]);

  useEffect(() => {
    room.current?.update(data);
  }, [data]);

  useEffect(() => {
    room.current?.setInset(inset, insetLeft);
  }, [inset, insetLeft]);

  // The class list is set once: the office adds its own (the lobby, a drag) as it runs, and a
  // class changed here later would wipe them.
  const classes = useRef(cn("of-wrap", full && "of-full", className)).current;
  return <div ref={box} className={classes} />;
}
