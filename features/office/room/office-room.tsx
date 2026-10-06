"use client";

// The office room on a page: a box the drawing (office.mjs) fills and moves on its own frame loop.
// React hands it the relay's look and the screen's words, and nothing else; it never re-renders
// what is inside. The engine loads with the box, so pages without an office never carry it.

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Room, RoomData, RoomWords } from "./office.mjs";
import "./room.css";

export type { RoomData, RoomPerson, RoomRequest } from "./office.mjs";

export function OfficeRoom({
  data,
  onAnswer,
  onAsk,
  className,
}: {
  data: RoomData;
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
      panel: {
        close: t("room.panel.close"),
        yours: t("room.panel.yours"),
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
  const handlers = useRef({ onAnswer, onAsk });
  handlers.current = { onAnswer, onAsk };
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
      });
      made.update(latest.current);
      room.current = made;
    });
    return () => {
      alive = false;
      made?.destroy();
      room.current = null;
    };
  }, [words, locale, asks]);

  useEffect(() => {
    room.current?.update(data);
  }, [data]);

  return <div ref={box} className={cn("of-wrap", className)} />;
}
