/**
 * The office's sketch: plan units (x across, y back to front, z up) projected isometrically to
 * the screen, and the primitives every piece is drawn from, as SVG markup.
 *
 * A piece is wrapped with how it arrives (`part`) and when. Lines run past their corners only
 * where the overshoot multiplier says so (`withOv`): the building and big furniture, not small
 * things. The overshoot itself is set per drawing from the scale it is shown at (`drawAt`), so
 * it stays the same few pixels however far the floor is zoomed.
 */

export type Pt = [number, number];

/** Plan units to SVG units. */
export const WS = 10;
export const TAU = Math.PI * 2;

export const clamp = (x: number, a: number, b: number) =>
  Math.min(b, Math.max(a, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r2 = (n: number) => Math.round(n * 100) / 100;
export const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const easeOut = (x: number) => 1 - (1 - clamp(x, 0, 1)) ** 3;

/** A stable 0..1 from a number. */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** FNV-1a: a stable integer from a string. */
export const hashStr = (str: string) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

export const at = (x: number, y: number, z = 0): Pt => [
  (x - y) * 0.894 * WS,
  (x + y) * 0.447 * WS - z * 0.94 * WS,
];

const P = (list: Pt[]) => list.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");

const ov = { base: 4, k: 1 };

/** Draws at a scale (screen pixels per SVG unit), so overshooting lines stay a few pixels long. */
export function drawAt<T>(scale: number, f: () => T): T {
  const prev = ov.base;
  ov.base = 3.8 / scale;
  try {
    return f();
  } finally {
    ov.base = prev;
  }
}

/** Draws with lines running `k` times the standard overshoot past their corners; 0 closes them. */
export function withOv<T>(k: number, f: () => T): T {
  const prev = ov.k;
  ov.k = k;
  try {
    return f();
  } finally {
    ov.k = prev;
  }
}

/** A group that arrives by one of the `.of-k-*` animations, `d` ms into the build. */
export const part = (cls: string, d: number, s: string) =>
  `<g class="${cls}" style="--d:${Math.round(d)}ms">${s}</g>`;

export const ln = (a: Pt, b: Pt, cls = "ol") => {
  const o = ov.base * ov.k;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const L = Math.hypot(dx, dy) || 1;
  const ox = (dx / L) * o;
  const oy = (dy / L) * o;
  return `<line class="${cls}" pathLength="1" x1="${r1(a[0] - ox)}" y1="${r1(a[1] - oy)}" x2="${r1(b[0] + ox)}" y2="${r1(b[1] + oy)}"/>`;
};

export const poly = (pts: Pt[], cls: string) =>
  `<polygon class="${cls}" points="${P(pts)}"/>`;

export const quad = (q: Pt[], cls: string, line = "ol") =>
  poly(q, cls) +
  ln(q[0], q[1], line) +
  ln(q[1], q[2], line) +
  ln(q[2], q[3], line) +
  ln(q[3], q[0], line);

export interface BoxStyle {
  front?: string;
  side?: string;
  top?: string;
  line?: string;
  /** Hatch the side face; on unless false. */
  hatch?: boolean;
  /** Draw the two bottom edges; on unless false. */
  base?: boolean;
  /** "leg": only the three upright edges, for thin legs. */
  edges?: "leg";
}

/** A box seen from the front-right: front, side and top faces with their edges. */
export function box(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
  o: BoxStyle = {},
) {
  const c = o.line || "ol";
  const fr = [at(x0, y1, z0), at(x1, y1, z0), at(x1, y1, z1), at(x0, y1, z1)];
  const sd = [at(x1, y0, z0), at(x1, y1, z0), at(x1, y1, z1), at(x1, y0, z1)];
  const tp = [at(x0, y0, z1), at(x1, y0, z1), at(x1, y1, z1), at(x0, y1, z1)];
  let s = poly(fr, o.front || "f-front") + poly(sd, o.side || "f-side");
  if (o.hatch !== false) s += poly(sd, "f-hatch");
  s += poly(tp, o.top || "f-top");
  const up =
    ln(at(x0, y1, z0), at(x0, y1, z1), c) +
    ln(at(x1, y1, z0), at(x1, y1, z1), c) +
    ln(at(x1, y0, z0), at(x1, y0, z1), c);
  if (o.edges === "leg") return s + up;
  s +=
    ln(at(x0, y0, z1), at(x1, y0, z1), c) +
    ln(at(x0, y0, z1), at(x0, y1, z1), c) +
    ln(at(x0, y1, z1), at(x1, y1, z1), c) +
    ln(at(x1, y0, z1), at(x1, y1, z1), c);
  s += up;
  if (o.base !== false)
    s +=
      ln(at(x0, y1, z0), at(x1, y1, z0), c) +
      ln(at(x1, y0, z0), at(x1, y1, z0), c);
  return s;
}

/** A flat rectangle lying at height z. */
export const flat = (
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z: number,
  cls: string,
  line = "ol f",
) =>
  quad([at(x0, y0, z), at(x1, y0, z), at(x1, y1, z), at(x0, y1, z)], cls, line);

/** The transform for text standing in a plane that faces the viewer along y (the back wall, a sign, a screen). */
export const planeM = (x: number, y: number, z: number) => {
  const [e, f] = at(x, y, z);
  return `matrix(${r2(0.894 * WS)} ${r2(0.447 * WS)} 0 ${r2(0.94 * WS)} ${r1(e)} ${r1(f)})`;
};
export const wallM = (x: number, z: number) => planeM(x, 0.05, z);
export const sideWallM = (y: number, z: number) => {
  const [e, f] = at(0.05, y, z);
  return `matrix(${r2(0.894 * WS)} ${r2(-0.447 * WS)} 0 ${r2(0.94 * WS)} ${r1(e)} ${r1(f)})`;
};
const floorM = (x: number, y: number) => {
  const [e, f] = at(x, y);
  return `matrix(${r2(0.894 * WS)} ${r2(0.447 * WS)} ${r2(-0.894 * WS)} ${r2(0.447 * WS)} ${r1(e)} ${r1(f)})`;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const floorText = (
  s: string,
  x: number,
  y: number,
  size: number,
  cls = "ftext",
) =>
  `<text class="${cls}" transform="${floorM(x, y)}" font-size="${size}">${esc(s)}</text>`;

export const planeText = (
  s: string,
  x: number,
  y: number,
  z: number,
  size: number,
  cls: string,
) =>
  `<text class="${cls}" transform="${planeM(x, y, z)}" font-size="${size}">${esc(s)}</text>`;

export const ellipseAt = (
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  cls: string,
  extra = "",
) => {
  const c = at(x, y, z);
  return `<ellipse class="${cls}" cx="${r1(c[0])}" cy="${r1(c[1])}" rx="${r1(rx)}" ry="${r1(ry)}"${extra}/>`;
};

/** A rectangle on the back wall. */
export const wallRect = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cls: string,
  y = 0.03,
  line = "ol",
) =>
  quad([at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)], cls, line);

/** Floor tile seams. */
export function tiles(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step = 12,
) {
  let s = "";
  const seam = (a: Pt, b: Pt) =>
    `<line class="tl" pathLength="1" x1="${r1(a[0])}" y1="${r1(a[1])}" x2="${r1(b[0])}" y2="${r1(b[1])}"/>`;
  for (let x = x0 + step; x < x1 - 0.5; x += step)
    s += seam(at(x, y0), at(x, y1));
  for (let y = y0 + step; y < y1 - 0.5; y += step)
    s += seam(at(x0, y), at(x1, y));
  return s;
}

/** The screen rectangle [x0, y0, x1, y1] a plan box covers. */
export function screenBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
): [number, number, number, number] {
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (const x of [x0, x1])
    for (const y of [y0, y1])
      for (const z of [z0, z1]) {
        const [u, v] = at(x, y, z);
        a0 = Math.min(a0, u);
        a1 = Math.max(a1, u);
        b0 = Math.min(b0, v);
        b1 = Math.max(b1, v);
      }
  return [a0, b0, a1, b1];
}
