/**
 * Floors in four layouts. Each lays the same team areas out differently and lists what stands
 * where; the pieces are then put in the order they must be painted in, back to front.
 *
 * A floor holds at most 24 seats and an area at most 6, two to a row; more people take more
 * areas, then more floors, with a lift between them.
 */

import {
  at,
  box,
  flat,
  floorText,
  type Pt,
  part,
  poly,
  screenBox,
  sideWallM,
  tiles,
  withOv,
} from "./iso";
import {
  armchairSvg,
  type BoardCard,
  boardSvg,
  calendarSvg,
  chairSvg,
  clockFace,
  coffeeSvg,
  type DeskItem,
  type DeskStyle,
  DK,
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
  PD,
  type PlantKind,
  type Pod,
  PW,
  plantSvg,
  podAt,
  pongSvg,
  type ScreenStats,
  type Sky,
  type Status,
  screenSvg,
  shelfSvg,
  signSvg,
  signWidth,
  sofaSvg,
  stackSvg,
  sunBack,
  sunSide,
  type TeamCounts,
  trayGeo,
  windowBack,
  windowSide,
} from "./pieces";

export type Layout = "plaza" | "grid" | "rooms" | "library";

export const FLOOR_CAP = 24;
export const AREA_CAP = 6;

/** The fixed left zone (meeting room, lounge, entrance), the avenues between areas, the top margin, the walls' height. */
const ZA = 58;
const AV = 20;
const AH = 22;
const TOP = 10;
export const WALL_H = 24;

export interface Area {
  team: string;
  names: string[];
  cols: number;
  rows: number;
  w: number;
  d: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  c?: number;
  r?: number;
}

export type Thing =
  | { kind: "coffee" | "tea"; x: number; y: number; island: boolean }
  | {
      kind: "shelf";
      x0: number;
      y0: number;
      x1: number;
      y1: number;
      face: "x" | "y";
      h?: number;
    }
  | { kind: "pong"; cx: number; cy: number }
  | { kind: "armchairs"; x: number; y: number }
  | { kind: "lowtable"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "plant"; x: number; y: number; p: PlantKind }
  | { kind: "glass"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "sign"; x: number; y: number; team: string };

interface FloorArt {
  kind: "plaza" | "room" | "rug";
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Desk extends Pod {
  /** Whose desk it is; null for an open seat. */
  name: string | null;
  key: string;
  area: Area;
  /** When it arrives in the build, ms. */
  t0: number;
}

export interface Floor {
  index: number;
  name: string;
  layout: Layout;
  areas: Area[];
  things: Thing[];
  floorArt: FloorArt[];
  /** Stretches of the back wall kept free of windows. */
  wallKeep: [number, number][];
  W: number;
  D: number;
  desks: Desk[];
}

export type Teams = [string, string[]][];

export function areasOf(teams: Teams): Area[] {
  const areas: Area[] = [];
  for (const [team, names] of teams)
    for (let i = 0; i < names.length; i += AREA_CAP) {
      const chunk = names.slice(i, i + AREA_CAP);
      const cols = chunk.length === 1 ? 1 : 2;
      const rows = Math.ceil(chunk.length / cols);
      areas.push({
        team,
        names: chunk,
        cols,
        rows,
        w: cols * PW,
        d: rows * PD,
        x0: 0,
        y0: 0,
        x1: 0,
        y1: 0,
      });
    }
  return areas;
}

export function planFloor(teams: Teams, fi: number, layout: Layout): Floor {
  const areas = areasOf(teams);
  const fl: Floor = {
    index: fi,
    name: `Floor ${fi + 1}`,
    layout,
    areas,
    things: [],
    floorArt: [],
    wallKeep: [],
    W: 0,
    D: 0,
    desks: [],
  };
  const X0 = ZA + 22;
  if (layout === "grid" || layout === "library") {
    const n = areas.length;
    const gc = n <= 2 ? n : n <= 4 ? 2 : 3;
    const gr = Math.ceil(n / gc);
    const colW: number[] = [];
    const rowH: number[] = [];
    areas.forEach((a, i) => {
      a.c = i % gc;
      a.r = Math.floor(i / gc);
      colW[a.c] = Math.max(colW[a.c] || 0, a.w);
      rowH[a.r] = Math.max(rowH[a.r] || 0, a.d);
    });
    const colX: number[] = [];
    const rowY: number[] = [];
    let x = X0;
    for (let c = 0; c < gc; c++) {
      colX[c] = x;
      x += colW[c] + AV;
    }
    let y = TOP;
    for (let r = 0; r < gr; r++) {
      rowY[r] = y;
      y += rowH[r] + AH;
    }
    for (const a of areas) {
      a.x0 = colX[a.c ?? 0];
      a.y0 = rowY[a.r ?? 0];
    }
    const cx0 = x - AV + 22;
    fl.W = cx0 + 52;
    fl.D = Math.max(176, y + 16);
    if (layout === "grid") {
      fl.things.push({ kind: "coffee", x: cx0 + 6, y: 0.6, island: false });
      fl.things.push({
        kind: "shelf",
        x0: cx0 + 30,
        y0: 0.6,
        x1: cx0 + 44,
        y1: 4.2,
        face: "y",
      });
      fl.things.push({
        kind: "pong",
        cx: cx0 + 24,
        cy: Math.round(fl.D * 0.48),
      });
      fl.things.push({ kind: "armchairs", x: cx0 + 14, y: fl.D - 32 });
      fl.things.push({ kind: "plant", x: fl.W - 8, y: fl.D - 10, p: "tall" });
      fl.things.push({ kind: "plant", x: cx0 + 2, y: fl.D - 10, p: "leafy" });
      fl.wallKeep.push([cx0 + 4, cx0 + 46]);
    } else {
      for (const a of areas)
        for (let r = 0; r < a.rows; r++)
          fl.things.push({
            kind: "shelf",
            x0: a.x0 - 3.6,
            y0: a.y0 + r * PD + 3,
            x1: a.x0 - 0.8,
            y1: a.y0 + r * PD + 21,
            face: "x",
            h: 13,
          });
      const ry = Math.round(fl.D * 0.45);
      fl.things.push({ kind: "tea", x: cx0 + 6, y: 0.6, island: false });
      fl.things.push({
        kind: "shelf",
        x0: cx0 + 28,
        y0: 0.6,
        x1: cx0 + 44,
        y1: 4.2,
        face: "y",
      });
      fl.things.push({ kind: "armchairs", x: cx0 + 12, y: ry });
      fl.things.push({ kind: "armchairs", x: cx0 + 12, y: ry + 22 });
      fl.things.push({ kind: "plant", x: fl.W - 8, y: fl.D - 10, p: "tall" });
      fl.wallKeep.push([cx0 + 4, cx0 + 46]);
      fl.floorArt.push({
        kind: "rug",
        x0: cx0 + 2,
        y0: ry - 8,
        x1: cx0 + 34,
        y1: ry + 30,
      });
    }
  } else {
    // plaza and rooms: a back row and a front row of areas with a wide middle between them
    const back: Area[] = [];
    const front: Area[] = [];
    let wb = 0;
    let wf = 0;
    const gap = layout === "rooms" ? 14 : AV;
    for (const a of areas) {
      if (wb <= wf) {
        back.push(a);
        wb += a.w + gap;
      } else {
        front.push(a);
        wf += a.w + gap;
      }
    }
    const pad = layout === "rooms" ? 5 : 0;
    const Hb = Math.max(PD, ...back.map((a) => a.d));
    const Hf = Math.max(PD, ...front.map((a) => a.d));
    const MID = layout === "plaza" ? 64 : 30;
    const yb = TOP + pad;
    const yf = TOP + pad * 2 + Hb + MID + pad;
    const lay = (list: Area[], y0: number) => {
      let x = X0 + pad;
      for (const a of list) {
        a.x0 = x;
        a.y0 = y0 + (list === back ? Hb - a.d : 0);
        x += a.w + gap;
      }
      return x;
    };
    const xe = Math.max(lay(back, yb), lay(front, yf));
    const midY0 = yb + Hb + pad;
    const midY1 = yf - pad;
    if (layout === "plaza") {
      fl.W = Math.max(xe + 12, X0 + 200);
      fl.D = Math.max(176, yf + Hf + 20);
      const cx = X0 + 12;
      const cy = (midY0 + midY1) / 2;
      fl.floorArt.push({
        kind: "plaza",
        x0: X0 - 4,
        y0: midY0 + 6,
        x1: fl.W - 10,
        y1: midY1 - 6,
      });
      fl.things.push({ kind: "coffee", x: cx, y: cy - 6, island: true });
      fl.things.push({ kind: "pong", cx: cx + 60, cy: cy - 1 });
      fl.things.push({ kind: "armchairs", x: cx + 104, y: cy - 6 });
      fl.things.push({ kind: "armchairs", x: cx + 114, y: cy - 6 });
      fl.things.push({
        kind: "lowtable",
        x0: cx + 103,
        y0: cy + 2,
        x1: cx + 116,
        y1: cy + 7,
      });
      fl.things.push({ kind: "plant", x: cx + 38, y: cy - 9, p: "leafy" });
      fl.things.push({ kind: "plant", x: cx + 86, y: cy + 9, p: "tall" });
      fl.things.push({ kind: "plant", x: fl.W - 16, y: cy - 9, p: "leafy" });
      fl.things.push({
        kind: "shelf",
        x0: fl.W - 34,
        y0: 0.6,
        x1: fl.W - 20,
        y1: 4.2,
        face: "y",
      });
      fl.wallKeep.push([fl.W - 36, fl.W - 18]);
    } else {
      fl.W = xe + 56;
      fl.D = Math.max(176, yf + Hf + pad + 18);
      const cx0 = xe + 4;
      for (const a of areas) {
        const isBack = back.includes(a);
        const rx0 = a.x0 - pad;
        const rx1 = a.x0 + a.w + pad;
        const ry0 = a.y0 - pad;
        const ry1 = a.y0 + a.d + pad - 1;
        const doorY = isBack ? ry1 : ry0;
        const d0 = rx0 + 2;
        const d1 = rx0 + 12;
        const wallY = isBack ? ry0 : ry1;
        fl.things.push({
          kind: "glass",
          x0: rx0,
          y0: ry0,
          x1: rx0 + 0.3,
          y1: ry1 + 0.3,
        });
        fl.things.push({
          kind: "glass",
          x0: rx1 - 0.3,
          y0: ry0,
          x1: rx1,
          y1: ry1 + 0.3,
        });
        fl.things.push({
          kind: "glass",
          x0: rx0,
          y0: wallY,
          x1: rx1,
          y1: wallY + 0.3,
        });
        fl.things.push({
          kind: "glass",
          x0: d1,
          y0: doorY,
          x1: rx1,
          y1: doorY + 0.3,
        });
        fl.things.push({
          kind: "glass",
          x0: rx0,
          y0: doorY,
          x1: d0,
          y1: doorY + 0.3,
        });
        fl.floorArt.push({ kind: "room", x0: rx0, y0: ry0, x1: rx1, y1: ry1 });
      }
      fl.things.push({ kind: "coffee", x: cx0 + 4, y: 0.6, island: false });
      fl.things.push({
        kind: "pong",
        cx: cx0 + 24,
        cy: Math.round((midY0 + midY1) / 2) + 34,
      });
      fl.things.push({ kind: "armchairs", x: cx0 + 12, y: fl.D - 30 });
      fl.things.push({ kind: "plant", x: fl.W - 8, y: fl.D - 10, p: "tall" });
      fl.wallKeep.push([cx0 + 2, cx0 + 24]);
    }
  }
  // seats in every area; empty ones stay open for whoever joins
  for (const a of areas) {
    a.x1 = a.x0 + a.w;
    a.y1 = a.y0 + a.d;
    for (let k = 0; k < a.cols * a.rows; k++) {
      const col = k % a.cols;
      const row = Math.floor(k / a.cols);
      const name = a.names[k] ?? null;
      fl.desks.push({
        ...podAt(a.x0 + col * PW, a.y0 + row * PD),
        name,
        key: name ?? `open-${fi}-${fl.desks.length}`,
        area: a,
        t0: 0,
      });
    }
    fl.things.push({
      kind: "sign",
      x: a.x0 + 2,
      y: a.y1 + (layout === "rooms" ? 2.6 : 2.2),
      team: a.team,
    });
  }
  return fl;
}

/** Teams fill floors in order; a team that would push a floor past 24 seats starts the next one. No one at all is one empty floor. */
export function floorsOf(teams: Teams, layout: Layout): Floor[] {
  const out: { teams: Teams; count: number }[] = [];
  let cur: { teams: Teams; count: number } | null = null;
  for (const [team, names] of teams) {
    if (!cur || cur.count + names.length > FLOOR_CAP) {
      cur = { teams: [], count: 0 };
      out.push(cur);
    }
    cur.teams.push([team, names]);
    cur.count += names.length;
  }
  if (!out.length) return [planFloor([], 0, layout)];
  return out.map((f, i) => planFloor(f.teams, i, layout));
}

/** How one desk looks: decided by whoever sits there. */
export interface DeskLook {
  style: DeskStyle;
  status: Status;
  working: boolean;
  pile: number;
  item: DeskItem;
  /** The viewer's own desk: a darker rug and a plant beside it. */
  mine: boolean;
}

/** A piece standing on the floor: its plan footprint (for depth), its screen box, how it is drawn. */
export interface Piece {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  box: [number, number, number, number];
  t0: number;
  draw: (t0: number) => string;
  person: string | null;
}

export function piecesOf(
  fl: Floor,
  lookOf: (d: Desk) => DeskLook,
  countsOf: (team: string) => TeamCounts | null,
  brewing: boolean,
): Piece[] {
  const out: Piece[] = [];
  const maxK = fl.W + fl.D;
  const when = (x: number, y: number) => 700 + ((x + y) / maxK) * 1900;
  const add = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    z1: number,
    t0: number,
    draw: (t: number) => string,
    person: string | null = null,
  ) => {
    const [a0, c0, a1, c1] = screenBox(x0, y0, x1, y1, 0, z1);
    out.push({
      x0,
      y0,
      x1,
      y1,
      box: [a0 - 40, c0 - 60, a1 + 40, c1 + 20],
      t0,
      draw,
      person,
    });
  };
  for (const d of fl.desks) {
    const t0 = when(d.px, d.py);
    const look = lookOf(d);
    const [cx, cy] = d.seat;
    d.t0 = t0;
    add(cx - 2.6, cy - 3.5, cx + 2.6, cy + 2.6, 11, t0 + 560, (t) =>
      chairSvg(cx, cy, t),
    );
    add(
      d.x0,
      d.y0,
      d.x1,
      d.y1,
      DK.top + 9,
      t0,
      (t) =>
        deskFrame(d, t, look.style) +
        itemSvg(itemGeo(d), look.item, t + 860) +
        lampSvg(
          lampGeo(d),
          look.status === "active" && d.name !== null,
          t + 620,
        ) +
        lapSvg(lapGeo(d), look.status, look.working, t + 700) +
        stackSvg(trayGeo(d), look.pile, d.key, t + 780),
      d.name,
    );
    if (look.mine)
      add(d.x1 + 1.4, d.y0 + 1, d.x1 + 4.6, d.y0 + 4.2, 9, t0 + 900, (t) =>
        plantSvg(d.x1 + 3, d.y0 + 2.6, "leafy", t),
      );
  }
  const D = fl.D;
  const a0 = 500;
  // the meeting room, the lounge and the way in, on the left of every layout
  add(6, 10, ZA - 6, 10.3, 9.5, a0, (t) => glassSvg(6, 10, ZA - 6, 10.3, t));
  add(6, 10, 6.3, 46, 9.5, a0 + 60, (t) => glassSvg(6, 10, 6.3, 46, t));
  add(ZA - 6.3, 10, ZA - 6, 46, 9.5, a0 + 120, (t) =>
    glassSvg(ZA - 6.3, 10, ZA - 6, 46, t),
  );
  add(14, 14.5, 38, 37.1, 7, a0 + 260, (t) => meetingSvg(t));
  add(6, 45.7, 20, 46, 9.5, a0 + 180, (t) => glassSvg(6, 45.7, 20, 46, t));
  add(30, 45.7, ZA - 6, 46, 9.5, a0 + 220, (t) =>
    glassSvg(30, 45.7, ZA - 6, 46, t),
  );
  add(0.6, 96, 4.2, 122, 15, a0 + 300, (t) =>
    shelfSvg(0.6, 96, 4.2, 122, 15, "x", 3, t),
  );
  add(8, 60, 34.6, 66, 6.2, a0 + 420, (t) => sofaSvg(8, 60, 34, t));
  add(12, 72, 30, 78, 3.4, a0 + 520, (t) => lowTableSvg(12, 72, 30, 78, t));
  add(41, 61, 45, 65, 9, a0 + 600, (t) => plantSvg(43, 63, "leafy", t));
  add(10, D - 33, 36, D - 28, 11.2, a0 + 700, (t) =>
    withOv(
      0.6,
      () =>
        part("k-rise", t, box(10, D - 32.4, 36, D - 28, 0, 8.6)) +
        part(
          "k-drop",
          t + 200,
          box(10, D - 33, 36, D - 32.4, 8.6, 11.2, { hatch: false }),
        ),
    ),
  );
  add(ZA - 8, D - 12, ZA - 4, D - 8, 9, a0 + 800, (t) =>
    plantSvg(ZA - 6, D - 10, "tall", t),
  );
  // what this layout adds
  for (const th of fl.things) {
    if (th.kind === "coffee" || th.kind === "tea") {
      const w = th.island ? 20 : 18;
      const dd = th.island ? 6 : 5;
      add(th.x, th.y, th.x + w, th.y + dd, 12.5, when(th.x, th.y), (t) =>
        coffeeSvg(th.x, th.y, th.island, brewing, t),
      );
    } else if (th.kind === "shelf")
      add(th.x0, th.y0, th.x1, th.y1, th.h || 15, when(th.x0, th.y0), (t) =>
        shelfSvg(
          th.x0,
          th.y0,
          th.x1,
          th.y1,
          th.h || 15,
          th.face,
          Math.round(th.x0 + th.y0),
          t,
        ),
      );
    else if (th.kind === "pong")
      add(
        th.cx - 8,
        th.cy - 4.9,
        th.cx + 8,
        th.cy + 4.9,
        6.4,
        when(th.cx, th.cy),
        (t) => pongSvg(th.cx, th.cy, t),
      );
    else if (th.kind === "armchairs")
      add(
        th.x - 3.6,
        th.y - 3,
        th.x + 3.6,
        th.y + 3,
        6.6,
        when(th.x, th.y),
        (t) => armchairSvg(th.x, th.y, t),
      );
    else if (th.kind === "lowtable")
      add(th.x0, th.y0, th.x1, th.y1, 3.4, when(th.x0, th.y0), (t) =>
        lowTableSvg(th.x0, th.y0, th.x1, th.y1, t),
      );
    else if (th.kind === "plant")
      add(
        th.x - 1.8,
        th.y - 1.8,
        th.x + 1.8,
        th.y + 1.8,
        9,
        when(th.x, th.y),
        (t) => plantSvg(th.x, th.y, th.p, t),
      );
    else if (th.kind === "glass")
      add(th.x0, th.y0, th.x1, th.y1, 9.5, when(th.x0, th.y0) - 300, (t) =>
        glassSvg(th.x0, th.y0, th.x1, th.y1, t),
      );
    else if (th.kind === "sign")
      add(
        th.x - 0.6,
        th.y - 0.3,
        th.x + signWidth(th.team, countsOf(th.team)),
        th.y + 0.3,
        9.8,
        when(th.x, th.y) + 400,
        (t) => signSvg(th.x, th.y, th.team, countsOf(th.team), t),
      );
  }
  return out;
}

const inFront = (b: Footprint, a: Footprint) =>
  b.x0 >= a.x1 - 0.01 || b.y0 >= a.y1 - 0.01;
const meets = (a: Piece, b: Piece) =>
  a.box[0] < b.box[2] &&
  b.box[0] < a.box[2] &&
  a.box[1] < b.box[3] &&
  b.box[1] < a.box[3];

type Footprint = { x0: number; y0: number; x1: number; y1: number };

/** Painter's order: a piece wholly in front of an overlapping one is drawn after it. */
export function depthSort(list: Piece[]): Piece[] {
  const n = list.length;
  const after: number[][] = list.map(() => []);
  const deg = new Array<number>(n).fill(0);
  const key = (o: Piece) => o.x0 + o.x1 + o.y0 + o.y1;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j || !meets(list[i], list[j])) continue;
      if (inFront(list[j], list[i]) && !inFront(list[i], list[j])) {
        after[i].push(j);
        deg[j]++;
      }
    }
  const ready: number[] = [];
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) if (!deg[i]) ready.push(i);
  while (ready.length) {
    ready.sort((a, b) => key(list[a]) - key(list[b]));
    const i = ready.shift() as number;
    out.push(list[i]);
    for (const j of after[i]) if (--deg[j] === 0) ready.push(j);
  }
  if (out.length < n) for (const o of list) if (!out.includes(o)) out.push(o);
  return out;
}

/** Where a bot standing at `pos` goes in the painted order: after what it stands in front of. */
export function slotOf(order: Piece[], pos: Pt): number {
  const [bx, by] = pos;
  const me = { x0: bx - 0.4, y0: by - 0.4, x1: bx + 0.4, y1: by + 0.4 };
  let lastBehind = -1;
  let firstFront = order.length;
  for (let i = 0; i < order.length; i++) {
    const o = order[i];
    const fr = inFront(me, o);
    const bk = inFront(o, me);
    let front = fr;
    if (fr === bk)
      front = bx + by > (fr ? o.x1 + o.y0 : (o.x0 + o.x1 + o.y0 + o.y1) / 2);
    if (front) lastBehind = i;
    else if (i < firstFront) firstFront = i;
  }
  return Math.min(lastBehind + 1, firstFront);
}

/** The back wall's window slots, clear of the left zone and whatever stands against the wall. */
export function windowXs(fl: Floor): number[] {
  const keep: [number, number][] = [[0, ZA + 22], ...fl.wallKeep];
  const out: number[] = [];
  for (let x = ZA + 26; x + 24 < fl.W - 8; x += 36)
    if (!keep.some(([a, b]) => x < b && x + 24 > a)) out.push(x);
  return out;
}

/** The floor itself: slab, seams, the light from the windows, rugs, each desk's patch. */
export function floorSvg(
  fl: Floor,
  sky: Sky,
  rugOf: (d: Desk) => "mine" | "taken" | "open",
) {
  const { W, D } = fl;
  const xs = windowXs(fl);
  let f = part(
    "k-draw",
    0,
    box(0, 0, W, D, -2.6, 0, { top: "f-floor", line: "ol s" }),
  );
  f += part("k-draw", 300, tiles(0, 0, W, D));
  if (sky === "night")
    f += poly([at(0, 0), at(W, 0), at(W, D), at(0, D)], "f-veil");
  let sun = "";
  for (const x of xs.slice(1)) sun += sunBack(x, sky);
  for (let y = 58; y + 22 < D - 40; y += 36) sun += sunSide(y, sky);
  f += part("k-fade", 1300, sun);
  f += part(
    "k-fade",
    900,
    poly([at(6, 54), at(50, 54), at(50, 88), at(6, 88)], "f-rug"),
  );
  for (const art of fl.floorArt) {
    const q = [
      at(art.x0, art.y0),
      at(art.x1, art.y0),
      at(art.x1, art.y1),
      at(art.x0, art.y1),
    ];
    if (art.kind === "plaza")
      f += part(
        "k-fade",
        800,
        poly(q, "f-plaza") +
          withOv(0, () =>
            flat(
              art.x0 + 2,
              art.y0 + 2,
              art.x1 - 2,
              art.y1 - 2,
              0.02,
              "f-none",
              "ol f",
            ),
          ),
      );
    else
      f += part(
        "k-fade",
        700,
        poly(q, art.kind === "room" ? "f-room" : "f-rug"),
      );
  }
  for (const d of fl.desks)
    f += part("k-fade", d.t0 - 80, deskRug(d, rugOf(d)) + deskShade(d));
  f += part(
    "k-fade",
    1200,
    poly(
      [at(8, D - 14), at(40, D - 14), at(40, D - 3), at(8, D - 3)],
      "f-rug",
    ) + floorText("ENTRANCE", 12, D - 6.5, 3.2),
  );
  return f;
}

export interface WallData {
  stats: ScreenStats;
  cards: BoardCard[];
  date: Date;
  /** The lift's doors, 0 shut to 1 open. */
  liftOpen: number;
}

/** The two high walls and what hangs on them: windows, the office screen, the lift and its clock, the decisions board, the calendar. */
export function wallSvg(fl: Floor, sky: Sky, data: WallData) {
  const { W, D } = fl;
  const xs = windowXs(fl);
  let w = part(
    "k-draw",
    150,
    box(0, -1.2, W, 0, 0, WALL_H, {
      front: "f-wall",
      hatch: false,
      line: "ol s",
    }) + box(-1.2, -1.2, 0, D, 0, WALL_H, { line: "ol s" }),
  );
  let wins = "";
  for (const x of xs.slice(1)) wins += windowBack(x, sky);
  for (let y = 58; y + 22 < D - 40; y += 36) wins += windowSide(y, sky);
  w += part("k-fade", 800, wins);
  if (xs.length)
    w += screenSvg(xs[0], 6.5, 24, 12.5, data.stats, data.date, 1100);
  w += part("k-fade", 900, liftSvg(ZA + 3, data.liftOpen, fl.index + 1));
  w += clockFace(ZA + 10, 19.6, 2.9, 1250);
  w += boardSvg(8, 46, 12, 21.5, data.cards, 1000);
  w += calendarSvg(48.5, 12.5, data.date, 1150);
  w += part(
    "k-fade",
    1000,
    `<text class="wtext" transform="${sideWallM(D - 14, 21.5)}" font-size="2.4">${fl.name.toUpperCase()}</text>`,
  );
  return w;
}

/** The screen rectangle a whole floor takes, walls included. */
export function floorBounds(fl: Floor): [number, number, number, number] {
  return screenBox(-1.2, -1.2, fl.W, fl.D, -2.6, WALL_H);
}
