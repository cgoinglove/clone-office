/**
 * The office's pieces as SVG markup: the personal desk and what stands on it, rooms and
 * commons, and the wall pieces that show what is going on. Every function takes the build
 * time `t0` (ms) its parts arrive at; a `null` t0 draws a part as it is, without arriving.
 */

import {
  at,
  box,
  ellipseAt,
  flat,
  floorText,
  hash,
  hashStr,
  ln,
  type Pt,
  part,
  planeText,
  poly,
  quad,
  r1,
  TAU,
  wallM,
  wallRect,
  withOv,
} from "./iso";

export type DeskStyle = "panel" | "frame" | "wood";
export type Status = "active" | "away" | "offline";
export type Sky = "day" | "evening" | "night";
export type PlantKind = "small" | "leafy" | "tall";
export type DeskItem = "mug" | "plant" | "books" | "photo";

/** Desk size and height, in plan units. */
export const DK = { w: 18, d: 11, top: 7.4 };
/** One person's patch of floor. */
export const PW = 36;
export const PD = 34;

export interface Pod {
  px: number;
  py: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Where the chair, and a seated bot, stand. */
  seat: Pt;
  /** Where a visitor stands to hand something over. */
  spot: Pt;
}

/** A desk on the patch whose back-left corner is (px, py). */
export function podAt(px: number, py: number): Pod {
  const x0 = px + 9;
  const y0 = py + 11;
  const x1 = x0 + DK.w;
  const y1 = y0 + DK.d;
  return {
    px,
    py,
    x0,
    y0,
    x1,
    y1,
    seat: [x0 + 6, y0 - 4],
    spot: [x1 - 4.3, y1 + 4.5],
  };
}

export const lapGeo = (d: Pod) => ({
  x0: d.x0 + 2.5,
  x1: d.x0 + 8.5,
  y0: d.y0 + 4.4,
  y1: d.y0 + 8.6,
  z: DK.top,
});
export const lampGeo = (d: Pod) => ({
  bx: d.x0 + 1.9,
  by: d.y0 + 1.8,
  z: DK.top,
});
export const trayGeo = (d: Pod) => ({
  x0: d.x1 - 6.6,
  x1: d.x1 - 2,
  y0: d.y1 - 6.2,
  y1: d.y1 - 1,
  z: DK.top,
});
export const itemGeo = (d: Pod) => ({ x: d.x1 - 4, y: d.y0 + 2.4, z: DK.top });

type Rect = ReturnType<typeof lapGeo>;

/** Wraps a part only while it is arriving. */
const arrive = (t0: number | null) => (cls: string, d: number, s: string) =>
  t0 === null ? s : part(cls, t0 + d, s);

// ---- plants

function leaves(
  top: Pt,
  count: number,
  len: number,
  rise: number,
  seed: number,
) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * TAU + 0.4 + seed;
    const l = len * (0.8 + 0.4 * hash(i + seed * 13));
    const lx = top[0] + Math.cos(ang) * l * 0.55;
    const ly = top[1] - rise - Math.abs(Math.sin(ang)) * l * 0.35 - i * 1.5;
    const mx = (top[0] + lx) / 2;
    const my = (top[1] + ly) / 2;
    const rot = (Math.atan2(ly - top[1], lx - top[0]) * 180) / Math.PI;
    s += `<ellipse class="f-leaf" cx="${r1(mx)}" cy="${r1(my)}" rx="${r1(l / 2)}" ry="${r1(l / 5.5)}" transform="rotate(${r1(rot)} ${r1(mx)} ${r1(my)})"/>`;
  }
  return s;
}

function blades(top: Pt, count: number, h: number, seed: number) {
  let s = "";
  for (let i = 0; i < count; i++) {
    const off = (i - (count - 1) / 2) * 5 + (hash(seed + i) - 0.5) * 3;
    const len = h * (0.75 + 0.35 * hash(seed + i * 7));
    const lean = (i - (count - 1) / 2) * 5;
    const mx = top[0] + off + lean / 2;
    const my = top[1] - len / 2;
    s += `<ellipse class="f-leaf" cx="${r1(mx)}" cy="${r1(my)}" rx="3.2" ry="${r1(len / 2)}" transform="rotate(${r1(lean * 0.9)} ${r1(mx)} ${r1(my + len / 2)})"/>`;
  }
  return s;
}

/** A potted plant: "leafy" spreads, "tall" grows up in blades, "small" sits on a desk. */
export function plantSvg(
  x: number,
  y: number,
  kind: PlantKind = "leafy",
  t0 = 0,
) {
  return withOv(0, () => {
    const big = kind !== "small";
    const k = big ? 1.5 : 1;
    const pw = 2.2 * k;
    const ph = 2.6 * k;
    const top = at(x, y, ph);
    const pot = part(
      "k-drop",
      t0,
      box(x - pw / 2, y - pw / 2, x + pw / 2, y + pw / 2, 0, ph),
    );
    const green =
      kind === "tall"
        ? blades(top, 5, 46, x)
        : leaves(top, big ? 6 : 4, big ? 34 : 22, big ? 30 : 20, x * 0.1);
    return pot + part("k-grow", t0 + 260, green);
  });
}

// ---- the personal desk and what stands on it

export function chairSvg(cx: number, cy: number, t0 = 0) {
  return withOv(0, () => {
    let base = "";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      base += ln(
        at(cx, cy, 0.5),
        at(cx + Math.cos(a) * 2.6, cy + Math.sin(a) * 2.6, 0.2),
        "ol",
      );
    }
    base += ln(at(cx, cy, 0.5), at(cx, cy, 3.2), "ol s");
    return (
      part("k-grow", t0, base) +
      part(
        "k-drop",
        t0 + 120,
        box(cx - 2.4, cy - 3.4, cx + 2.4, cy - 2.7, 4.2, 10.8) +
          box(cx - 2.6, cy - 2.4, cx + 2.6, cy + 2.4, 3.2, 4),
      )
    );
  });
}

/** Closed when the computer is off; open, its logo breathing, while the bot works. */
export function lapSvg(
  g: Rect,
  status: Status,
  working: boolean,
  t0: number | null = null,
) {
  return withOv(0, () => {
    const { x0, x1, y0, y1, z } = g;
    const p = arrive(t0);
    const s = p(
      "k-drop",
      0,
      flat(x0, y0, x1, y1, z + 0.05, "f-front", "ol") +
        ln(
          at(x0 + 0.8, y0 + 0.8, z + 0.06),
          at(x1 - 0.8, y0 + 0.8, z + 0.06),
          "ol f",
        ) +
        ln(
          at(x0 + 0.8, y0 + 1.8, z + 0.06),
          at(x1 - 0.8, y0 + 1.8, z + 0.06),
          "ol f",
        ),
    );
    if (status === "offline")
      return (
        s +
        p(
          "k-drop",
          120,
          box(x0, y0, x1, y1, z + 0.05, z + 0.55, {
            top: "f-lid",
            hatch: false,
          }),
        )
      );
    const lid = [
      at(x0, y1, z + 0.05),
      at(x1, y1, z + 0.05),
      at(x1, y1 - 0.9, z + 4.4),
      at(x0, y1 - 0.9, z + 4.4),
    ];
    const c = at((x0 + x1) / 2, y1 - 0.45, z + 2.3);
    return (
      s +
      p(
        "k-rise",
        120,
        `<g class="${working ? "lit" : ""}">${quad(lid, "f-lid")}<circle class="logo" cx="${r1(c[0])}" cy="${r1(c[1])}" r="3.2"/></g>`,
      )
    );
  });
}

/** On while the person is at the desk; its light pools on the desk, clear of the bot's face. */
export function lampSvg(
  g: ReturnType<typeof lampGeo>,
  on: boolean,
  t0: number | null = null,
) {
  return withOv(0, () => {
    const { bx, by, z } = g;
    const p = arrive(t0);
    const j = at(bx, by, z + 6);
    const hd = at(bx + 1.4, by + 1.6, z + 6.8);
    const shade = [
      at(bx + 0.6, by + 2.4, z + 5.1),
      at(bx + 0.9, by + 0.8, z + 6.9),
      at(bx + 2.8, by + 1.2, z + 6.8),
      at(bx + 2.5, by + 2.8, z + 4.9),
    ];
    let s = "";
    if (on)
      s += p("k-fade", 420, ellipseAt(bx + 3.2, by + 4.2, z, 30, 11, "f-lamp"));
    return (
      s +
      p(
        "k-rise",
        0,
        flat(bx - 0.9, by - 0.9, bx + 0.9, by + 0.9, z + 0.05, "f-top", "ol") +
          ln(at(bx, by, z), j, "ol") +
          ln(j, hd, "ol") +
          quad(shade, on ? "f-paper" : "f-front"),
      )
    );
  });
}

/** One sheet per piece of work: up to 8 stack by height, past that a count shows. */
export const STACK_CAP = 8;

export function stackSvg(
  g: Rect,
  n: number,
  seedName: string,
  t0: number | null = null,
) {
  return withOv(0, () => {
    const { x0, x1, y0, y1, z } = g;
    const seed = hashStr(seedName) % 97;
    const show = Math.min(n, STACK_CAP);
    let s = flat(
      x0 - 0.4,
      y0 - 0.4,
      x1 + 0.4,
      y1 + 0.4,
      z + 0.04,
      "f-front",
      "ol f",
    );
    if (t0 !== null) s = part("k-drop", t0, s);
    for (let i = 0; i < show; i++) {
      const zz = z + 0.25 + i * 0.42;
      const jx = (hash(i * 3.1 + seed) - 0.5) * 0.8;
      const jy = (hash(i * 7.3 + 11) - 0.5) * 0.6;
      let sh = flat(x0 + jx, y0 + jy, x1 + jx, y1 + jy, zz, "f-paper");
      if (i === show - 1)
        sh +=
          ln(
            at(x0 + jx + 1, y0 + jy + 2, zz),
            at(x1 + jx - 1, y0 + jy + 2, zz),
            "ol f",
          ) +
          ln(
            at(x0 + jx + 1, y0 + jy + 3.5, zz),
            at(x1 + jx - 2.2, y0 + jy + 3.5, zz),
            "ol f",
          );
      s += t0 === null ? sh : part("k-drop", t0 + 140 + i * 70, sh);
    }
    if (n > STACK_CAP) {
      const c = at(x1 + 0.6, y0, z + 0.25 + show * 0.42 + 1.4);
      const w = n > 99 ? 36 : 28;
      const b = `<rect class="badge-c" x="${r1(c[0] - w / 2)}" y="${r1(c[1] - 11)}" width="${w}" height="22" rx="11"/><text class="badge-t" x="${r1(c[0])}" y="${r1(c[1] + 5)}" text-anchor="middle">${n}</text>`;
      s += t0 === null ? b : part("k-grow", t0 + 140 + show * 70 + 80, b);
    }
    return s;
  });
}

export function itemSvg(g: ReturnType<typeof itemGeo>, kind: DeskItem, t0 = 0) {
  return withOv(0, () => {
    const { x, y, z } = g;
    if (kind === "mug")
      return part(
        "k-drop",
        t0,
        box(x - 0.8, y - 0.8, x + 0.8, y + 0.8, z, z + 1.9, { hatch: false }) +
          ellipseAt(x, y, z + 1.9, 6, 3, "f-ink", ' opacity=".7"'),
      );
    if (kind === "plant")
      return (
        part("k-drop", t0, box(x - 1, y - 1, x + 1, y + 1, z, z + 1.6)) +
        part("k-grow", t0 + 200, leaves(at(x, y, z + 1.6), 4, 16, 9, x * 0.3))
      );
    if (kind === "books")
      return part(
        "k-drop",
        t0,
        box(x - 2, y - 1, x + 2, y + 1.2, z, z + 0.7) +
          box(x - 1.7, y - 0.8, x + 1.6, y + 1, z + 0.7, z + 1.3),
      );
    return part(
      "k-drop",
      t0,
      quad(
        [
          at(x - 1.6, y, z),
          at(x + 1.6, y, z),
          at(x + 1.6, y - 0.4, z + 2.8),
          at(x - 1.6, y - 0.4, z + 2.8),
        ],
        "f-top",
      ) +
        quad(
          [
            at(x - 1.1, y - 0.05, z + 0.5),
            at(x + 1.1, y - 0.05, z + 0.5),
            at(x + 1.1, y - 0.33, z + 2.3),
            at(x - 1.1, y - 0.33, z + 2.3),
          ],
          "f-side",
          "ol f",
        ),
    );
  });
}

/** The desk itself, in one of three styles: its frame rises, its top lands. Things on it are drawn separately. */
export function deskFrame(d: Pod, t0: number, style: DeskStyle) {
  const zt = DK.top;
  const zb = zt - 0.7;
  let s = "";
  if (style === "panel") {
    s += withOv(0.3, () =>
      part(
        "k-rise",
        t0,
        box(d.x0 + 0.4, d.y0 + 0.6, d.x0 + 1.2, d.y1 - 0.6, 0, zb),
      ),
    );
    const pq = [
      at(d.x0 + 1.2, d.y0 + 1, 2.2),
      at(d.x1 - 5.2, d.y0 + 1, 2.2),
      at(d.x1 - 5.2, d.y0 + 1, zb),
      at(d.x0 + 1.2, d.y0 + 1, zb),
    ];
    s += withOv(0, () =>
      part("k-rise", t0 + 60, poly(pq, "f-front") + ln(pq[0], pq[1], "ol f")),
    );
    const px0 = d.x1 - 5.2;
    const px1 = d.x1 - 0.4;
    const py1 = d.y1 - 0.8;
    const pedestal = withOv(0.3, () => box(px0, d.y0 + 0.8, px1, py1, 0, zb));
    const drawers = withOv(0, () => {
      let l = "";
      for (const z of [2.3, 4.5])
        l += ln(at(px0 + 0.3, py1, z), at(px1 - 0.3, py1, z), "ol f");
      for (const z of [1.3, 3.4, 5.6])
        l += ln(at(px0 + 1.8, py1, z), at(px0 + 3, py1, z), "ol");
      return l;
    });
    s += part("k-rise", t0 + 110, pedestal + drawers);
    return (
      s +
      withOv(0.55, () =>
        part("k-drop", t0 + 240, box(d.x0, d.y0, d.x1, d.y1, zb, zt)),
      )
    );
  }
  if (style === "frame") {
    s += withOv(0, () => {
      let legs = "";
      for (const [x, y] of [
        [d.x0 + 0.6, d.y0 + 0.6],
        [d.x1 - 1.2, d.y0 + 0.6],
        [d.x0 + 0.6, d.y1 - 1.2],
        [d.x1 - 1.2, d.y1 - 1.2],
      ])
        legs += box(x, y, x + 0.6, y + 0.6, 0, zb, {
          edges: "leg",
          hatch: false,
        });
      legs += ln(
        at(d.x0 + 0.9, d.y0 + 0.9, 1.6),
        at(d.x1 - 0.9, d.y0 + 0.9, 1.6),
        "ol",
      );
      return (
        part("k-rise", t0, legs) +
        part(
          "k-drop",
          t0 + 160,
          box(d.x1 - 7, d.y0 + 1.2, d.x1 - 1.4, d.y1 - 1.6, zb - 1.5, zb, {
            hatch: false,
          }) +
            ln(
              at(d.x1 - 5.2, d.y1 - 1.6, zb - 0.75),
              at(d.x1 - 3.2, d.y1 - 1.6, zb - 0.75),
              "ol",
            ),
        )
      );
    });
    return (
      s +
      withOv(0.55, () =>
        part("k-drop", t0 + 240, box(d.x0, d.y0, d.x1, d.y1, zt - 0.4, zt)),
      )
    );
  }
  // wood: thick square legs, an apron, a drawer in the apron
  s += withOv(0.2, () => {
    let legs = "";
    for (const [x, y] of [
      [d.x0 + 0.3, d.y0 + 0.3],
      [d.x1 - 1.6, d.y0 + 0.3],
      [d.x0 + 0.3, d.y1 - 1.6],
      [d.x1 - 1.6, d.y1 - 1.6],
    ])
      legs += box(x, y, x + 1.3, y + 1.3, 0, zb - 1.2, { edges: "leg" });
    return part("k-rise", t0, legs);
  });
  const apron = withOv(0.3, () =>
    box(d.x0 + 0.3, d.y0 + 0.3, d.x1 - 0.3, d.y1 - 0.3, zb - 1.2, zb),
  );
  const drawer = withOv(
    0,
    () =>
      ln(
        at(d.x0 + 6, d.y1 - 0.3, zb - 0.6),
        at(d.x0 + 12, d.y1 - 0.3, zb - 0.6),
        "ol",
      ) +
      ln(
        at(d.x0 + 8.4, d.y1 - 0.3, zb - 0.35),
        at(d.x0 + 9.6, d.y1 - 0.3, zb - 0.35),
        "ol s",
      ),
  );
  s += part("k-drop", t0 + 160, apron + drawer);
  return (
    s +
    withOv(0.55, () =>
      part(
        "k-drop",
        t0 + 260,
        box(d.x0 - 0.4, d.y0 - 0.4, d.x1 + 0.4, d.y1 + 0.4, zb, zt + 0.2),
      ),
    )
  );
}

/** The patch of floor a desk stands on: a rug (mine a shade darker), or a dashed outline for an open seat. */
export function deskRug(d: Pod, kind: "mine" | "taken" | "open") {
  const rug = [
    at(d.px + 3, d.py + 2),
    at(d.px + 33, d.py + 2),
    at(d.px + 33, d.py + 31),
    at(d.px + 3, d.py + 31),
  ];
  return kind === "open"
    ? poly(rug, "f-open") +
        floorText("OPEN SEAT", d.px + 8, d.py + 29.6, 2.2, "ftext faint")
    : poly(rug, kind === "mine" ? "f-myrug" : "f-rug");
}

/** The desk's shadow on the floor. */
export const deskShade = (d: Pod) =>
  poly(
    [
      at(d.x0 + 1, d.y0 + 2),
      at(d.x1 + 2.5, d.y0 + 2),
      at(d.x1 + 2.5, d.y1 + 2.4),
      at(d.x0 + 1, d.y1 + 2.4),
    ],
    "f-shade",
  );

// ---- rooms, commons and the walls' furniture

export function shelfSvg(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  h: number,
  face: "x" | "y",
  seed: number,
  t0 = 0,
) {
  const s = withOv(0.35, () =>
    part(
      "k-rise",
      t0,
      box(x0, y0, x1, y1, 0, h, {
        hatch: face !== "x",
        side: face === "x" ? "f-front" : "f-side",
      }),
    ),
  );
  const rows = [1.2, 4.9, 8.6, 12.3].filter((z) => z + 3 < h);
  const books = withOv(0, () => {
    let b = "";
    rows.forEach((zb, ri) => {
      const len = face === "x" ? y1 - y0 : x1 - x0;
      let u = 0.5;
      let k = 0;
      while (u < len - 0.8) {
        const w = 0.55 + 0.6 * hash(seed + ri * 31 + k);
        const bh = 2.2 + 1.1 * hash(seed + ri * 17 + k * 3);
        const dark = hash(seed + k * 7 + ri) < 0.18;
        const q =
          face === "x"
            ? [
                at(x1 + 0.03, y1 - u, zb),
                at(x1 + 0.03, y1 - u - w, zb),
                at(x1 + 0.03, y1 - u - w, zb + bh),
                at(x1 + 0.03, y1 - u, zb + bh),
              ]
            : [
                at(x0 + u, y1 + 0.03, zb),
                at(x0 + u + w, y1 + 0.03, zb),
                at(x0 + u + w, y1 + 0.03, zb + bh),
                at(x0 + u, y1 + 0.03, zb + bh),
              ];
        b += quad(q, dark ? "f-lid" : "f-book", "ol f");
        u += w + (hash(seed + k * 5 + ri) < 0.15 ? 1.2 : 0.05);
        k++;
      }
      const a =
        face === "x"
          ? at(x1 + 0.03, y0, zb - 0.1)
          : at(x0, y1 + 0.03, zb - 0.1);
      const e =
        face === "x"
          ? at(x1 + 0.03, y1, zb - 0.1)
          : at(x1, y1 + 0.03, zb - 0.1);
      b += ln(a, e, "ol");
    });
    return b;
  });
  return s + part("k-fade", t0 + 260, books);
}

export const sofaSvg = (x0: number, y0: number, x1: number, t0 = 0) =>
  withOv(0.25, () =>
    part(
      "k-drop",
      t0,
      box(x0, y0, x1, y0 + 2.5, 0, 6.2) +
        box(x0, y0 + 2.5, x1, y0 + 6, 0, 3.2) +
        box(x0 - 0.6, y0, x0 + 1, y0 + 6, 0, 4.4) +
        box(x1 - 1, y0, x1 + 0.6, y0 + 6, 0, 4.4),
    ),
  );

export const armchairSvg = (x: number, y: number, t0 = 0) =>
  withOv(0.2, () =>
    part(
      "k-drop",
      t0,
      box(x - 3, y - 3, x + 3, y - 1.4, 0, 6.6) +
        box(x - 3, y - 1.4, x + 3, y + 3, 0, 3.4) +
        box(x - 3.6, y - 3, x - 2.4, y + 3, 0, 4.6) +
        box(x + 2.4, y - 3, x + 3.6, y + 3, 0, 4.6),
    ),
  );

export function lowTableSvg(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0 = 0,
) {
  return withOv(0, () => {
    let legs = "";
    for (const [x, y] of [
      [x0 + 0.6, y0 + 0.6],
      [x1 - 1.4, y0 + 0.6],
      [x0 + 0.6, y1 - 1.4],
      [x1 - 1.4, y1 - 1.4],
    ])
      legs += box(x, y, x + 0.8, y + 0.8, 0, 2.8, { edges: "leg" });
    return (
      part("k-rise", t0, legs) +
      part("k-drop", t0 + 160, box(x0, y0, x1, y1, 2.8, 3.4))
    );
  });
}

/** The meeting room's table and chairs, at its fixed place on the left of every floor. */
export function meetingSvg(t0 = 0) {
  return withOv(0, () => {
    let chairs = "";
    let front = "";
    for (const cx of [19, 26, 33])
      chairs +=
        box(cx - 1.5, 14.9, cx + 1.5, 17.9, 0, 3.6) +
        box(cx - 1.5, 14.5, cx + 1.5, 15, 3.6, 7);
    for (const cx of [19, 26, 33])
      front += box(cx - 1.5, 34.1, cx + 1.5, 37.1, 0, 3.6);
    return (
      part("k-drop", t0, chairs) +
      part(
        "k-rise",
        t0 + 120,
        box(25.4, 25.4, 26.6, 26.6, 0, 6.1, { edges: "leg" }),
      ) +
      withOv(0.4, () =>
        part("k-drop", t0 + 220, box(14, 19.5, 38, 32.5, 6.1, 6.8)),
      ) +
      part("k-drop", t0 + 340, front)
    );
  });
}

const GL = {
  front: "f-glass",
  side: "f-glass",
  top: "f-glass",
  hatch: false,
  line: "ol f",
};

/** A low glass wall. */
export const glassSvg = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t0 = 0,
  h = 9.5,
) => withOv(0.5, () => part("k-rise", t0, box(x0, y0, x1, y1, 0, h, GL)));

/** A coffee counter: against the back wall, or an island open on both sides with stools in front. */
export function coffeeSvg(
  x0: number,
  y0: number,
  island: boolean,
  brewing: boolean,
  t0 = 0,
) {
  const w = island ? 20 : 18;
  const d = island ? 6 : 5;
  const x1 = x0 + w;
  const y1 = y0 + d;
  let s = withOv(0.35, () =>
    part("k-rise", t0, box(x0, y0, x1, y1, 0, 7.4, { top: "f-front" })),
  );
  s += withOv(0, () => {
    let doors = "";
    for (let x = x0 + 4.5; x < x1 - 1; x += 4.5)
      doors += ln(at(x, y1, 0.6), at(x, y1, 6.8), "ol f");
    return part("k-fade", t0 + 120, doors);
  });
  const mx = x0 + (island ? 8 : 2);
  const my = y0 + 1;
  s += withOv(0, () =>
    part(
      "k-drop",
      t0 + 240,
      box(mx, my, mx + 4, my + 3.2, 7.4, 12.2, { front: "f-lid" }) +
        box(mx + 1.4, my + 3.2, mx + 2.6, my + 3.9, 9.2, 10.2, {
          hatch: false,
        }) +
        box(mx + 1.5, my + 3.4, mx + 2.5, my + 4.2, 7.4, 8.6, { hatch: false }),
    ),
  );
  s += withOv(0, () =>
    part(
      "k-drop",
      t0 + 360,
      box(mx + 6, my + 1, mx + 7, my + 2, 7.4, 8.8, { hatch: false }) +
        box(mx + 7.6, my + 1.4, mx + 8.6, my + 2.4, 7.4, 8.8, { hatch: false }),
    ),
  );
  const st = at(mx + 2, my + 1.6, 12.4);
  s += `<g class="steam${brewing ? " on" : ""}">${[0, 6, -6]
    .map(
      (dx) => `<path d="M${r1(st[0] + dx)} ${r1(st[1])} c 5 -7 -5 -12 0 -20"/>`,
    )
    .join("")}</g>`;
  if (island)
    s += withOv(0, () =>
      part(
        "k-drop",
        t0 + 480,
        [x0 + 4, x0 + 10, x0 + 16]
          .map((x) => box(x - 1.3, y1 + 2, x + 1.3, y1 + 4.6, 0, 5.2))
          .join(""),
      ),
    );
  return s;
}

export function pongSvg(cx: number, cy: number, t0 = 0) {
  return withOv(0, () => {
    let legs = "";
    for (const [x, y] of [
      [cx - 7, cy - 3.6],
      [cx + 6.2, cy - 3.6],
      [cx - 7, cy + 2.8],
      [cx + 6.2, cy + 2.8],
    ])
      legs += box(x, y, x + 0.8, y + 0.8, 0, 4.6, { edges: "leg" });
    const top = withOv(0.3, () =>
      box(cx - 8, cy - 4.5, cx + 8, cy + 4.5, 4.6, 5.1, { top: "f-front" }),
    );
    const lines =
      ln(at(cx - 7.6, cy, 5.12), at(cx + 7.6, cy, 5.12), "ol f") +
      flat(cx - 7.6, cy - 4.1, cx + 7.6, cy + 4.1, 5.12, "f-none", "ol f");
    const net = quad(
      [
        at(cx, cy - 4.9, 5.1),
        at(cx, cy + 4.9, 5.1),
        at(cx, cy + 4.9, 6.4),
        at(cx, cy - 4.9, 6.4),
      ],
      "f-glass",
      "ol",
    );
    return (
      part("k-rise", t0, legs) +
      part("k-drop", t0 + 160, top + lines) +
      part("k-flip", t0 + 360, net)
    );
  });
}

/** A ball's path over the table: up from one end, a bounce on the far half, over to the other. */
export function rallySvg(cx: number, cy: number) {
  const p = (x: number, y: number, z: number) => {
    const [u, v] = at(cx + x, cy + y, z);
    return `${r1(u)} ${r1(v)}`;
  };
  return `<path class="f-open" d="M${p(-11, 0, 9)} Q ${p(-7, 0, 13)} ${p(-4, 1, 5.2)} Q ${p(3, 0, 14)} ${p(11, 0, 9)}"/>${ellipseAt(cx + 3, cy, 14, 4.5, 4.5, "ball")}`;
}

/** What a team sign says under its name. */
export interface TeamCounts {
  working: number;
  free: number;
  off: number;
  waiting: number;
}

export const signLine = (c: TeamCounts) =>
  c.waiting
    ? `${c.waiting} waiting on a decision`
    : c.working
      ? `${c.working} working · ${c.free} free${c.off ? ` · ${c.off} off` : ""}`
      : `${c.free} here${c.off ? ` · ${c.off} off` : ""}`;

/** How far a sign's board reaches past its post: wide enough for its longest line. */
export function signWidth(team: string, counts: TeamCounts | null) {
  const name = team.length * 1.5 * 0.7;
  const line = counts ? signLine(counts).length * 1.05 * 0.62 : 0;
  return Math.max(11, Math.ceil(Math.max(name, line) + 0.9));
}

export function signSvg(
  x: number,
  y: number,
  team: string,
  counts: TeamCounts | null,
  t0 = 0,
) {
  const x1 = x + signWidth(team, counts);
  return withOv(0, () => {
    const post = box(x - 0.25, y - 0.25, x + 0.25, y + 0.25, 0, 6.4, {
      hatch: false,
    });
    const board = withOv(0.2, () =>
      quad(
        [
          at(x - 0.6, y, 6.4),
          at(x1, y, 6.4),
          at(x1, y, 9.8),
          at(x - 0.6, y, 9.8),
        ],
        "f-top",
      ),
    );
    const line = counts
      ? planeText(
          signLine(counts),
          x + 0.2,
          y + 0.02,
          6.85,
          1.05,
          `wtext${counts.waiting ? " on" : ""}`,
        )
      : "";
    return (
      part("k-rise", t0, post) +
      part(
        "k-flip",
        t0 + 140,
        board +
          planeText(
            team.toUpperCase(),
            x + 0.2,
            y + 0.02,
            8.15,
            1.5,
            "wtext ink",
          ) +
          line,
      )
    );
  });
}

// ---- wall pieces: windows that follow the time of day, a clock, a calendar, a screen, a board, the lift

const skyFill = (sky: Sky) =>
  sky === "night" ? "f-night" : sky === "evening" ? "f-dusk" : "f-sun";

export function windowBack(x: number, sky: Sky, w = 24) {
  return withOv(0, () => {
    const mull = sky === "night" ? "ol w" : "ol f";
    let s =
      wallRect(x, 7, x + w, 19, skyFill(sky)) +
      ln(at(x + w / 2, 0.02, 7), at(x + w / 2, 0.02, 19), mull) +
      ln(at(x, 0.02, 13), at(x + w, 0.02, 13), mull);
    if (sky === "night")
      for (let i = 0; i < 4; i++)
        s += ellipseAt(
          x + 2 + hash(x + i) * (w - 4),
          0.04,
          13.6 + hash(x * 3 + i) * 4.8,
          1.3,
          1.3,
          "f-star",
        );
    return s;
  });
}

export function windowSide(y: number, sky: Sky, w = 22) {
  return withOv(
    0,
    () =>
      quad(
        [
          at(0.02, y, 7),
          at(0.02, y + w, 7),
          at(0.02, y + w, 19),
          at(0.02, y, 19),
        ],
        skyFill(sky),
      ) +
      ln(
        at(0.02, y + w / 2, 7),
        at(0.02, y + w / 2, 19),
        sky === "night" ? "ol w" : "ol f",
      ),
  );
}

/** The light a back window throws on the floor. */
export function sunBack(x: number, sky: Sky) {
  if (sky === "night") return "";
  const k = sky === "evening" ? 1.7 : 1;
  return poly(
    [
      at(x + 2, 0.2),
      at(x + 26, 0.2),
      at(x + 26 + 7 * k, 16 * k),
      at(x + 2 + 7 * k, 16 * k),
    ],
    sky === "evening" ? "f-dusk" : "f-sun",
  );
}

/** The light a side window throws on the floor. */
export function sunSide(y: number, sky: Sky) {
  if (sky === "night") return "";
  const k = sky === "evening" ? 1.5 : 1;
  return poly(
    [
      at(0.2, y),
      at(0.2, y + 22),
      at(14 * k, y + 22 + 6 * k),
      at(14 * k, y + 6 * k),
    ],
    sky === "evening" ? "f-dusk" : "f-sun",
  );
}

/** The clock's face; its hands are drawn into the `[data-hands]` group it leaves. */
export function clockFace(cx: number, cz: number, r: number, t0 = 0) {
  const pts: Pt[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * TAU;
    pts.push(at(cx + Math.cos(a) * r, 0.04, cz + Math.sin(a) * r));
  }
  const pp = pts.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
  let ticks = "";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const k = i % 3 === 0 ? 0.74 : 0.84;
    const p0 = at(cx + Math.cos(a) * r * k, 0.05, cz + Math.sin(a) * r * k);
    const p1 = at(
      cx + Math.cos(a) * r * 0.94,
      0.05,
      cz + Math.sin(a) * r * 0.94,
    );
    ticks += `<line class="tick" x1="${r1(p0[0])}" y1="${r1(p0[1])}" x2="${r1(p1[0])}" y2="${r1(p1[1])}"/>`;
  }
  return part(
    "k-spin",
    t0,
    `<polygon class="f-paper" points="${pp}"/><polygon class="rim" points="${pp}"/>${ticks}<g data-hands="${cx},${cz},${r}"></g>`,
  );
}

export function handsAt(cx: number, cz: number, r: number, d: Date) {
  const h = (d.getHours() % 12) + d.getMinutes() / 60;
  const m = d.getMinutes() + d.getSeconds() / 60;
  const s = d.getSeconds();
  const hand = (frac: number, len: number, cls: string) => {
    const a = Math.PI / 2 - frac * TAU;
    const p0 = at(cx, 0.06, cz);
    const p1 = at(cx + Math.cos(a) * len, 0.06, cz + Math.sin(a) * len);
    return `<line class="${cls}" x1="${r1(p0[0])}" y1="${r1(p0[1])}" x2="${r1(p1[0])}" y2="${r1(p1[1])}"/>`;
  };
  const c = at(cx, 0.07, cz);
  return (
    hand(h / 12, r * 0.52, "hand-h") +
    hand(m / 60, r * 0.78, "hand-m") +
    hand(s / 60, r * 0.86, "hand-s") +
    `<circle class="f-ink" cx="${r1(c[0])}" cy="${r1(c[1])}" r="2.2"/>`
  );
}

/** Fills every clock's hands under `root` with the time `d`. */
export function setHands(root: ParentNode, d: Date) {
  for (const g of root.querySelectorAll<SVGGElement>("[data-hands]")) {
    const [cx, cz, r] = (g.dataset.hands ?? "").split(",").map(Number);
    g.innerHTML = handsAt(cx, cz, r, d);
  }
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

export function calendarSvg(x0: number, z0: number, d: Date, t0 = 0) {
  return withOv(0, () =>
    part(
      "k-flip",
      t0,
      wallRect(x0, z0, x0 + 6, z0 + 7.5, "f-top") +
        wallRect(x0, z0 + 5.6, x0 + 6, z0 + 7.5, "f-ink", 0.04) +
        planeText(MONTHS[d.getMonth()], x0 + 0.7, 0.06, z0 + 6.05, 1.2, "scr") +
        planeText(
          String(d.getDate()),
          x0 + (d.getDate() > 9 ? 0.8 : 1.9),
          0.06,
          z0 + 1.9,
          3.4,
          "wtext ink",
        ) +
        planeText(DAYS[d.getDay()], x0 + 0.8, 0.06, z0 + 0.7, 0.95, "wtext"),
    ),
  );
}

/** What the office screen shows. */
export interface ScreenStats {
  /** Requests finished today. */
  done: number;
  /** Requests waiting on a person's decision. */
  waiting: number;
  /** Bots working right now. */
  working: number;
  /** People away or with their computer off. */
  away: number;
  /** Requests finished per hour, oldest first. */
  hours: number[];
  /** Which bar is the current hour. */
  now: number;
}

function screenText(
  x0: number,
  z0: number,
  w: number,
  h: number,
  st: ScreenStats,
  d: Date,
) {
  let s = planeText(
    `TODAY · ${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`,
    x0 + 1.2,
    0.05,
    z0 + h - 2,
    0.95,
    "scr dim",
  );
  s +=
    planeText(String(st.done), x0 + 1.2, 0.05, z0 + h - 6.2, 3.6, "scr") +
    planeText(
      "requests done",
      x0 + 1.4 + String(st.done).length * 2.3,
      0.05,
      z0 + h - 5.4,
      1.05,
      "scr dim",
    );
  s += planeText(
    `${st.waiting} waiting on people`,
    x0 + 1.2,
    0.05,
    z0 + 3.2,
    1.1,
    st.waiting ? "scr ember" : "scr dim",
  );
  s += planeText(
    `${st.working} bots working · ${st.away} away`,
    x0 + 1.2,
    0.05,
    z0 + 1.4,
    1.1,
    "scr dim",
  );
  const bx = x0 + w * 0.58;
  const bw = (w * 0.38) / Math.max(1, st.hours.length);
  const max = Math.max(...st.hours, 1);
  st.hours.forEach((v, i) => {
    const hh = (v / max) * (h - 5.5);
    const q = [
      at(bx + i * bw, 0.05, z0 + 1.4),
      at(bx + i * bw + bw * 0.62, 0.05, z0 + 1.4),
      at(bx + i * bw + bw * 0.62, 0.05, z0 + 1.4 + hh),
      at(bx + i * bw, 0.05, z0 + 1.4 + hh),
    ];
    s += poly(q, `bar${i === st.now ? " now" : ""}`);
  });
  return s;
}

export function screenSvg(
  x0: number,
  z0: number,
  w: number,
  h: number,
  st: ScreenStats,
  d: Date,
  t0 = 0,
) {
  return withOv(0.15, () =>
    part(
      "k-fade",
      t0,
      wallRect(x0, z0, x0 + w, z0 + h, "f-screen", 0.03, "ol s") +
        screenText(x0, z0, w, h, st, d),
    ),
  );
}

/** A card on the decisions board: whose call a request waits on. */
export interface BoardCard {
  name: string;
  /** The viewer's own call: drawn in ember, as "You". */
  mine?: boolean;
}

export function boardSvg(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  cards: BoardCard[],
  t0 = 0,
) {
  const pinned = withOv(0, () =>
    cards
      .slice(0, Math.max(1, Math.floor((x1 - x0 - 1.2) / 7.2)))
      .map((it, i) => {
        const cx = x0 + 1.2 + i * 7.2;
        const top = z1 - 3;
        const bot = z0 + 1.2;
        const tilt = (hash(i + 3) - 0.5) * 0.5;
        const q = [
          at(cx, 0.05, bot),
          at(cx + 6.2, 0.05, bot + tilt),
          at(cx + 6.2, 0.05, top + tilt),
          at(cx, 0.05, top),
        ];
        const pin = at(cx + 3.1, 0.06, top - 0.6);
        return (
          quad(q, it.mine ? "f-soft" : "f-paper", "ol f") +
          `<circle class="${it.mine ? "sb-dotc" : "f-ink"}" cx="${r1(pin[0])}" cy="${r1(pin[1])}" r="2.6"/>` +
          planeText(
            it.mine ? "You" : it.name,
            cx + 0.7,
            0.06,
            top - 2.6,
            1.15,
            "wtext ink",
          ) +
          planeText(
            it.mine ? "needs you" : "decides",
            cx + 0.7,
            0.06,
            top - 4.1,
            0.85,
            `wtext${it.mine ? " on" : ""}`,
          )
        );
      })
      .join(""),
  );
  return withOv(0.25, () =>
    part(
      "k-fade",
      t0,
      wallRect(x0, z0, x1, z1, "f-top") +
        planeText("DECISIONS", x0 + 1.2, 0.05, z1 - 1.6, 1.2, "wtext") +
        pinned,
    ),
  );
}

function liftDoors(lx: number, open: number) {
  return withOv(0, () => {
    const g = 3.6 * open;
    const l = [
      at(lx + 0.6, 0.04, 0),
      at(lx + 7 - g, 0.04, 0),
      at(lx + 7 - g, 0.04, 13.2),
      at(lx + 0.6, 0.04, 13.2),
    ];
    const r = [
      at(lx + 7 + g, 0.04, 0),
      at(lx + 13.4, 0.04, 0),
      at(lx + 13.4, 0.04, 13.2),
      at(lx + 7 + g, 0.04, 13.2),
    ];
    return (
      (open > 0.05
        ? poly(
            [
              at(lx + 7 - g, 0.04, 0),
              at(lx + 7 + g, 0.04, 0),
              at(lx + 7 + g, 0.04, 13.2),
              at(lx + 7 - g, 0.04, 13.2),
            ],
            "f-ink",
          )
        : "") +
      poly(l, "f-side") +
      poly(r, "f-side") +
      ln(l[1], l[2], "ol f") +
      ln(r[0], r[3], "ol f")
    );
  });
}

/** The lift in the back wall; `open` runs 0 (shut) to 1. */
export function liftSvg(lx: number, open: number, floorNo: number) {
  return (
    withOv(1, () => {
      const fq = [
        at(lx, 0.02, 0),
        at(lx + 14, 0.02, 0),
        at(lx + 14, 0.02, 14),
        at(lx, 0.02, 14),
      ];
      return (
        poly(fq, "f-front") +
        ln(fq[0], fq[3], "ol s") +
        ln(fq[3], fq[2], "ol s") +
        ln(fq[2], fq[1], "ol s")
      );
    }) +
    liftDoors(lx, open) +
    `<text class="wtext" transform="${wallM(lx + 5.4, 15)}" font-size="1.4">▲ ${floorNo}</text>`
  );
}

/** The time of day the windows show: "now" follows the clock. */
export function skyFor(mode: Sky | "now", now = new Date()): Sky {
  if (mode !== "now") return mode;
  const h = now.getHours();
  return h >= 7 && h < 17
    ? "day"
    : (h >= 17 && h < 20) || h === 6
      ? "evening"
      : "night";
}
