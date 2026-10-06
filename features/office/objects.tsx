"use client";

import type { CSSProperties } from "react";
import { BotBody } from "./bot";
import type { BotShape, Mood } from "./bot-shape";
import { botAt, Figure, SEAT_Z } from "./figure";
import { at, box, flat, part, poly, tiles, withOv } from "./iso";
import {
  type BoardCard,
  boardSvg,
  calendarSvg,
  chairSvg,
  clockFace,
  coffeeSvg,
  type DeskItem,
  type DeskStyle,
  deskFrame,
  deskRug,
  deskShade,
  glassSvg,
  itemGeo,
  itemSvg,
  lampGeo,
  lampSvg,
  lapGeo,
  lapSvg,
  liftSvg,
  lowTableSvg,
  meetingSvg,
  type PlantKind,
  plantSvg,
  podAt,
  pongSvg,
  rallySvg,
  type Sky,
  type Status,
  screenSvg,
  shelfSvg,
  signSvg,
  signWidth,
  skyFor,
  sofaSvg,
  stackSvg,
  sunBack,
  trayGeo,
  windowBack,
  windowSide,
} from "./pieces";

/** What every office piece takes. */
export interface PieceProps {
  /** Width in pixels; the piece shrinks to fit a narrower container. */
  width?: number;
  /** Plays the build-in (lines draw, parts rise and drop into place) when it first appears. On unless false. */
  assemble?: boolean;
  /** What a screen reader hears. */
  label?: string;
  className?: string;
}

const pod = podAt(0, 0);
const slab = (x0: number, y0: number, x1: number, y1: number) =>
  withOv(0.4, () => box(x0, y0, x1, y1, 6.7, 7.4));
const wallBit = (x0: number, x1: number, h = 22, d = 0) =>
  part(
    "k-draw",
    d,
    withOv(0.6, () =>
      box(x0, -1.2, x1, 0, 0, h, {
        front: "f-wall",
        hatch: false,
        line: "ol f",
      }),
    ),
  );
const floorPatch = (x0: number, y0: number, x1: number, y1: number) =>
  part(
    "k-fade",
    0,
    withOv(0, () => flat(x0, y0, x1, y1, 0, "f-floor", "ol f")),
  );

export interface DeskProps extends PieceProps {
  /** "panel": a panel leg and a pedestal of drawers; "frame": thin legs; "wood": thick legs and an apron. */
  deskStyle?: DeskStyle;
  /** At the desk (lamp on), away (bot on duty), or computer off (laptop shut, bot asleep). */
  status?: Status;
  /** Pieces of work on the desk: a sheet each up to 8, a count above that. */
  pile?: number;
  /** The one personal thing on the desk. */
  item?: DeskItem;
  /** Shows the bot in its chair. On unless false. */
  bot?: boolean;
  /** The bot's mood; follows the status when left out (working, free, asleep). */
  mood?: Mood;
  botColor?: string;
  botShape?: BotShape;
  /** The viewer's own desk: a darker rug. On unless false. */
  mine?: boolean;
}

/**
 * One person's desk with their bot in its chair. The legs stand, the top lands, the chair rolls
 * in, then the laptop, lamp, paper tray and one personal thing, and the bot sits down last.
 */
export function Desk({
  deskStyle = "panel",
  status = "active",
  pile = 3,
  item = "photo",
  bot = true,
  mood,
  botColor,
  botShape = "b113",
  mine = true,
  width = 440,
  assemble = true,
  label = "A personal desk",
  className,
}: DeskProps) {
  const m =
    mood ??
    (status === "offline" ? "sleep" : status === "active" ? "working" : "idle");
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[pod.px + 2, pod.py + 1, pod.px + 34, pod.py + 32, 0, 22]}
      layers={() => [
        part("k-fade", 0, deskRug(pod, mine ? "mine" : "taken")) +
          part("k-fade", 120, deskShade(pod)) +
          chairSvg(pod.seat[0], pod.seat[1], 560),
        bot && (
          <g className="k-grow" style={{ "--d": "1350ms" } as CSSProperties}>
            <g transform={botAt(pod.seat, SEAT_Z, botShape)}>
              <BotBody mood={m} color={botColor} shape={botShape} phase={0.3} />
            </g>
          </g>
        ),
        deskFrame(pod, 0, deskStyle) + itemSvg(itemGeo(pod), item, 860),
        lampSvg(lampGeo(pod), status === "active", 620) +
          lapSvg(lapGeo(pod), status, m === "working", 700) +
          stackSvg(trayGeo(pod), pile, "desk", 780),
      ]}
    />
  );
}

export interface LaptopProps extends PieceProps {
  /** Closed when the computer is off; open otherwise. */
  status?: Status;
  /** The logo on the lid breathes while the bot works. */
  working?: boolean;
}

/** A laptop on a slice of desk: shut means the computer is off; its logo breathes while the bot works. */
export function Laptop({
  status = "active",
  working = true,
  width = 220,
  assemble = true,
  label = "A laptop",
  className,
}: LaptopProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[
        pod.x0 + 0.5,
        pod.y0 + 2.5,
        pod.x0 + 10.5,
        pod.y0 + 10.5,
        6.7,
        12.5,
      ]}
      layers={() => [
        part(
          "k-drop",
          0,
          slab(pod.x0 + 0.5, pod.y0 + 2.5, pod.x0 + 10.5, pod.y0 + 10.5),
        ) + lapSvg(lapGeo(pod), status, working && status !== "offline", 200),
      ]}
    />
  );
}

export interface DeskLampProps extends PieceProps {
  /** Lit while the person is at their desk. */
  on?: boolean;
}

/** A desk lamp: lit means the person is at their desk. Its light pools on the desk, clear of the bot's face. */
export function DeskLamp({
  on = true,
  width = 200,
  assemble = true,
  label = "A desk lamp",
  className,
}: DeskLampProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[pod.x0, pod.y0, pod.x0 + 9, pod.y0 + 9, 6.7, 15]}
      layers={() => [
        part("k-drop", 0, slab(pod.x0, pod.y0, pod.x0 + 9, pod.y0 + 9)) +
          lampSvg(lampGeo(pod), on, 200),
      ]}
    />
  );
}

export interface PaperTrayProps extends PieceProps {
  /** Pieces of work waiting: a sheet each up to 8, a count above that. */
  count?: number;
}

/** A tray of work: one sheet per request the bot holds for its person; past 8 the stack stops growing and a count shows. */
export function PaperTray({
  count = 3,
  width = 200,
  assemble = true,
  label,
  className,
}: PaperTrayProps) {
  return (
    <Figure
      label={label ?? `${count} pieces of work`}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[pod.x1 - 9, pod.y1 - 8.5, pod.x1 + 1, pod.y1 + 1, 6.7, 13]}
      layers={() => [
        part(
          "k-drop",
          0,
          slab(pod.x1 - 9, pod.y1 - 8.5, pod.x1 + 1, pod.y1 + 1),
        ) + stackSvg(trayGeo(pod), count, "tray", 200),
      ]}
    />
  );
}

/** The chair a bot sits in: the star of legs opens, the seat and back drop in. */
export function DeskChair({
  width = 120,
  assemble = true,
  label = "A desk chair",
  className,
}: PieceProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-4, -4, 4, 4, 0, 12]}
      layers={() => [chairSvg(0, 0, 0)]}
    />
  );
}

export interface WallClockProps extends PieceProps {
  /** A fixed time to show; the clock runs live when left out. */
  time?: Date;
}

/** The wall clock, on the real time: the second hand alone is ember. It spins onto the wall as it is hung. */
export function WallClock({
  time,
  width = 180,
  assemble = true,
  label = "Wall clock",
  className,
}: WallClockProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      time={time}
      className={className}
      bounds={[-4, -1, 6, 0, 13, 24]}
      layers={() => [wallBit(-5, 7, 24) + clockFace(1, 18.6, 3.4, 300)]}
    />
  );
}

export interface WallCalendarProps extends PieceProps {
  /** The day to show; today when left out. */
  date?: Date;
}

/** A tear-off calendar on today's date. It flips open as it is hung. */
export function WallCalendar({
  date,
  width = 160,
  assemble = true,
  label = "Calendar",
  className,
}: WallCalendarProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-1, -1, 8, 0, 10, 22]}
      layers={() => [
        wallBit(-2, 9, 22) + calendarSvg(0, 12, date ?? new Date(), 300),
      ]}
    />
  );
}

export interface OfficeScreenProps extends PieceProps {
  /** Requests finished today. */
  done?: number;
  /** Requests waiting on a person's decision; shown in ember when any. */
  waiting?: number;
  /** Bots working right now. */
  working?: number;
  /** People away or with their computer off. */
  away?: number;
  /** Requests finished per hour, oldest first. */
  hours?: number[];
  /** Which bar is the current hour. */
  now?: number;
  /** The day in the heading; today when left out. */
  date?: Date;
}

/** The office screen on the back wall: requests done today, what waits on people, bots at work, and an hourly bar chart. */
export function OfficeScreen({
  done = 23,
  waiting = 2,
  working = 4,
  away = 2,
  hours = [3, 5, 7, 4, 6, 8, 5, 2, 1],
  now = 5,
  date,
  width = 420,
  assemble = true,
  label = "Office screen",
  className,
}: OfficeScreenProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-1, -1, 27, 0, 5, 21]}
      layers={() => [
        wallBit(-2, 28, 22) +
          screenSvg(
            0,
            6.5,
            26,
            13,
            { done, waiting, working, away, hours, now },
            date ?? new Date(),
            200,
          ),
      ]}
    />
  );
}

export interface DecisionBoardProps extends PieceProps {
  /** Whose decision each waiting request needs, up to five; the viewer's own card is ember. */
  cards?: BoardCard[];
}

/** The decisions board: a pinned card for each request waiting on a person's call. The viewer's own card is ember and reads "needs you". */
export function DecisionBoard({
  cards = [],
  width = 520,
  assemble = true,
  label = "Decisions board",
  className,
}: DecisionBoardProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-1, -1, 40, 0, 10, 23]}
      layers={() => [
        wallBit(-2, 41, 24) + boardSvg(0, 38, 11, 21.5, cards, 200),
      ]}
    />
  );
}

export interface TeamSignProps extends PieceProps {
  team: string;
  /** Bots of this team working now. */
  working?: number;
  /** Bots free now. */
  free?: number;
  /** People with their computer off. */
  off?: number;
  /** Requests waiting on someone in this team; when any, the sign says so in ember instead. */
  waiting?: number;
}

/** The sign in front of a team's area: its name, and how many are working, free or off, or that a decision is waiting. */
export function TeamSign({
  team,
  working = 2,
  free = 1,
  off = 0,
  waiting = 0,
  width = 260,
  assemble = true,
  label,
  className,
}: TeamSignProps) {
  const counts = { working, free, off, waiting };
  const w = signWidth(team, counts);
  return (
    <Figure
      label={label ?? `${team} team sign`}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-2, -1, w + 1, 1, 0, 11]}
      layers={() => [
        floorPatch(-2, -2, w + 2, 2) + signSvg(0, 0, team, counts, 120),
      ]}
    />
  );
}

export interface PlantProps extends PieceProps {
  /** "small" sits on a desk; "leafy" spreads; "tall" grows up in blades. */
  kind?: PlantKind;
}

/** A potted plant. The pot drops in and the leaves grow last. */
export function Plant({
  kind = "leafy",
  width,
  assemble = true,
  label = "A plant",
  className,
}: PlantProps) {
  const h = kind === "tall" ? 16 : kind === "leafy" ? 12 : 7;
  const r = kind === "small" ? 2 : 3;
  return (
    <Figure
      label={label}
      width={width ?? (kind === "small" ? 90 : 120)}
      assemble={assemble}
      className={className}
      bounds={[-r, -r, r, r, 0, h]}
      layers={() => [plantSvg(0, 0, kind, 0)]}
    />
  );
}

export interface CoffeeCornerProps extends PieceProps {
  /** An island open on both sides with stools, as on the plaza; a counter against the wall otherwise. On unless false. */
  island?: boolean;
  /** Steam rises while the machine runs. On unless false. */
  brewing?: boolean;
}

/** Where idle bots go for coffee: a counter with a machine and cups, steam rising while it brews. */
export function CoffeeCorner({
  island = true,
  brewing = true,
  width = 380,
  assemble = true,
  label = "Coffee corner",
  className,
}: CoffeeCornerProps) {
  const w = island ? 20 : 18;
  const d = island ? 13 : 7;
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-1, -1, w + 2, d, 0, 14]}
      layers={() => [
        floorPatch(-2, -1, w + 3, d + 1) +
          coffeeSvg(0, 0, island, brewing, 100),
      ]}
    />
  );
}

export interface PingPongTableProps extends PieceProps {
  /** Shows a ball mid-rally, bouncing once on the far side. On unless false. */
  rally?: boolean;
}

/** A table-tennis table: two idle bots play a rally, and the winner hops. */
export function PingPongTable({
  rally = true,
  width = 380,
  assemble = true,
  label = "Table tennis",
  className,
}: PingPongTableProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[-14, -6, 14, 6, 0, 10]}
      layers={() => [
        floorPatch(-15, -7, 15, 7) +
          pongSvg(0, 0, 120) +
          (rally ? part("k-fade", 900, rallySvg(0, 0)) : ""),
      ]}
    />
  );
}

/** A bookshelf against the wall. In the library layout, shelves divide the team areas. */
export function Bookshelf({
  width = 260,
  assemble = true,
  label = "Bookshelf",
  className,
}: PieceProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[0, -1, 16, 5, 0, 16]}
      layers={() => [
        wallBit(-1, 18, 16) + shelfSvg(1, 0.2, 15, 3.8, 15, "y", 21, 120),
      ]}
    />
  );
}

/** The lounge: a rug, a sofa, a low table and a plant. */
export function Lounge({
  width = 400,
  assemble = true,
  label = "Lounge",
  className,
}: PieceProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[2, 54, 48, 84, 0, 12]}
      layers={() => [
        part(
          "k-fade",
          0,
          poly([at(4, 56), at(48, 56), at(48, 84), at(4, 84)], "f-rug"),
        ) +
          sofaSvg(8, 60, 34, 120) +
          lowTableSvg(12, 72, 30, 78, 300) +
          plantSvg(42, 63, "leafy", 460),
      ]}
    />
  );
}

/** The meeting room: glass walls rise, then the table and chairs come in. The team rooms are built from the same glass. */
export function MeetingRoom({
  width = 440,
  assemble = true,
  label = "Meeting room",
  className,
}: PieceProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[6, 10, 52, 46, 0, 10]}
      layers={() => [
        glassSvg(6, 10, 52, 10.3, 0) +
          glassSvg(6, 10, 6.3, 46, 60) +
          glassSvg(51.7, 10, 52, 46, 120) +
          meetingSvg(260) +
          glassSvg(6, 45.7, 20, 46, 500) +
          glassSvg(30, 45.7, 52, 46, 540),
      ]}
    />
  );
}

export interface OfficeCornerProps extends PieceProps {
  /** The time of day the windows show; "now" follows the clock (day 7 to 17, evening to 20, then night). */
  sky?: Sky | "now";
}

/** A corner of the building: floor, the two high walls, and windows that follow the time of day. */
export function OfficeCorner({
  sky = "now",
  width = 440,
  assemble = true,
  label = "A corner of the office",
  className,
}: OfficeCornerProps) {
  const s = skyFor(sky);
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      className={className}
      bounds={[0, 0, 44, 26, -2.6, 24]}
      layers={() => [
        part(
          "k-draw",
          0,
          box(0, 0, 44, 26, -2.6, 0, { top: "f-floor", line: "ol s" }) +
            tiles(0, 0, 44, 26),
        ) +
          (s === "night"
            ? poly([at(0, 0), at(44, 0), at(44, 26), at(0, 26)], "f-veil")
            : "") +
          part(
            "k-draw",
            160,
            box(0, -1.2, 44, 0, 0, 24, {
              front: "f-wall",
              hatch: false,
              line: "ol s",
            }) + box(-1.2, -1.2, 0, 26, 0, 24, { line: "ol s" }),
          ) +
          part("k-fade", 600, windowBack(10, s) + sunBack(10, s)) +
          part("k-fade", 760, windowSide(2, s)) +
          plantSvg(38, 21, "tall", 900),
      ]}
    />
  );
}

export interface LiftProps extends PieceProps {
  /** How far the doors are open, 0 to 1. */
  open?: number;
  /** The floor number over the doors. */
  floor?: number;
  /** A fixed time for the clock above; live when left out. */
  time?: Date;
}

/** The lift between floors, with the wall clock above it. Bots ride it to colleagues on other floors. */
export function Lift({
  open = 0,
  floor = 1,
  time,
  width = 300,
  assemble = true,
  label = "Lift",
  className,
}: LiftProps) {
  return (
    <Figure
      label={label}
      width={width}
      assemble={assemble}
      time={time}
      className={className}
      bounds={[0, -1, 18, 8, 0, 24]}
      layers={() => [
        part(
          "k-draw",
          0,
          withOv(
            0.6,
            () =>
              box(-2, -1.2, 20, 0, 0, 24, {
                front: "f-wall",
                hatch: false,
                line: "ol f",
              }) + flat(-2, 0, 20, 8, 0, "f-floor", "ol f"),
          ),
        ) +
          part("k-fade", 300, liftSvg(2, open, floor)) +
          clockFace(9, 19.6, 2.9, 500),
      ]}
    />
  );
}
