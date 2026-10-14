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
import { liftNotices } from "@/components/ui/toast";
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
  example = false,
  turnShown = false,
  fps = 60,
  full = false,
  inset = 0,
  insetHeight = 0,
  insetLeft = 0,
  onClockIn,
  onEnter,
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
  /** How far down that panel reaches, when it ends partway: the floor may pass beneath it. */
  insetHeight?: number;
  /** Pixels kept clear at the left, for a column of words laid over it. */
  insetLeft?: number;
  /** The office's own panel about one person opened or closed. */
  onPanel?: (open: boolean) => void;
  ref?: Ref<OfficeControl>;
  /** Opens at the lobby (the building, a card to clock in, the lift up) rather than at the office. */
  lobby?: boolean;
  /**
   * An example with nobody real in it (the first steps): everyone already in their chair, each
   * named, the desks framed close. Read once, as `lobby` is.
   */
  example?: boolean;
  /**
   * The page shows what waits on the viewer itself (the office screen's board): the office only marks
   * it on their clone, and asks nothing over its head. Read once.
   */
  turnShown?: boolean;
  /** 30 runs the office on every other frame: for a small view beside something else. */
  fps?: 30 | 60;
  /** Clocked in at the lobby: the ride starts (the lobby's button is gone). */
  onEnter?: () => void;
  /** Arrived: the lift's doors are open on the floor. */
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
      floorGroup: t("room.floorGroup"),
      done: t("room.done"),
      answer: t("room.answer"),
      needsYouChip: t("room.needsYouChip"),
      yourMiniMe: t("yourMiniMe"),
      miniMe: (name) => t("miniMe", { name }),
      requestState: (state) => t(`state.${state}`),
      views: {
        label: t("room.views.label"),
        desk: t("room.views.desk"),
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
      clock: { in: t("room.clock.in") },
      plate: {
        youShort: t("room.plate.youShort"),
        you: (name) => t("room.plate.you", { name }),
        needsYou: t("room.plate.needsYou"),
        deciding: t("room.plate.deciding"),
        workingFor: (name) => t("room.plate.workingFor", { name }),
        workingForYou: t("room.plate.workingForYou"),
        away: t("room.plate.away"),
        inMeeting: t("room.plate.inMeeting"),
        goingTo: (name) => t("room.plate.goingTo", { name }),
        off: t("room.plate.off"),
        onWeb: t("room.plate.onWeb"),
      },
      say: {
        isIn: (name) => t("room.say.isIn", { name }),
        bye: (name) => t("room.say.bye", { name }),
        bring: (to, from, what) => t("room.say.bring", { to, from, what }),
        leftOnDesk: (name) => t("room.say.leftOnDesk", { name }),
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
        label: t("room.lobby.label"),
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
        needsYou: t("room.panel.needsYou"),
        waitingOn: (name) => t("room.panel.waitingOn", { name }),
        onDesk: t("room.panel.onDesk"),
        doneToday: t("room.panel.doneToday"),
        asked: t("room.panel.asked"),
        now: t("room.panel.now"),
        workingOn: (what) => t("room.panel.workingOn", { what }),
        waitingFor: (name) => t("room.panel.waitingFor", { name }),
        waitingForYou: t("room.panel.waitingForYou"),
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
  const handlers = useRef({ onAnswer, onAsk, onClockIn, onEnter, onPanel });
  handlers.current = { onAnswer, onAsk, onClockIn, onEnter, onPanel };
  const insetNow = useRef<[number, number, number]>([
    inset,
    insetLeft,
    insetHeight,
  ]);
  insetNow.current = [inset, insetLeft, insetHeight];
  useImperativeHandle(ref, () => ({
    closePanel: () => room.current?.closePanel(),
  }));
  // Read once: the office does not go back to the lobby while it is open.
  const atLobby = useRef(lobby).current;
  const asExample = useRef(example).current;
  const turnElsewhere = useRef(turnShown).current;
  const asks = !!onAsk;

  useEffect(() => {
    let alive = true;
    let made: Room | null = null;
    let unlift = () => {};
    void import("./office.mjs").then(({ createOffice }) => {
      if (!alive || !box.current) return;
      made = createOffice(box.current, {
        words,
        locale,
        onAnswer: () => handlers.current.onAnswer?.(),
        onAsk: asks ? (text) => handlers.current.onAsk?.(text) : undefined,
        lobby: atLobby,
        example: asExample,
        turnShown: turnElsewhere,
        fps,
        onClockIn: () => handlers.current.onClockIn?.(),
        onEnter: () => handlers.current.onEnter?.(),
        onPanel: (open) => handlers.current.onPanel?.(open),
      });
      made.update(latest.current);
      made.setInset(...insetNow.current);
      room.current = made;
      // toasts and news stand above the office's ask box
      if (asks)
        unlift = liftNotices(box.current.querySelector('[data-of="composer"]'));
    });
    return () => {
      alive = false;
      unlift();
      made?.destroy();
      room.current = null;
    };
  }, [words, locale, asks, atLobby, asExample, turnElsewhere, fps]);

  useEffect(() => {
    room.current?.update(data);
  }, [data]);

  useEffect(() => {
    room.current?.setInset(inset, insetLeft, insetHeight);
  }, [inset, insetLeft, insetHeight]);

  // The class list is set once: the office adds its own (the lobby, a drag) as it runs, and a
  // class changed here later would wipe them.
  const classes = useRef(cn("of-wrap", full && "of-full", className)).current;
  return <div ref={box} className={classes} />;
}
