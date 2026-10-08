/**
 * The bot's mark, as Thursday draws it: a seeded blob (or a squircle, a heart) with two hollow
 * eyes. A mood is a pose, a handful of numbers (squash, lean, eye size and bend, gaze, a hop),
 * so a new feeling needs no new drawing; the pose eases toward each mood's target every frame.
 */

import { clamp, hash, lerp, type Pt, r1, r2, TAU } from "./iso";

export type Mood =
  | "idle"
  | "listening"
  | "working"
  | "asking"
  | "happy"
  | "surprised"
  | "talk"
  | "walk"
  | "sleep";

export const MOODS: Mood[] = [
  "idle",
  "listening",
  "working",
  "asking",
  "happy",
  "surprised",
  "talk",
  "walk",
  "sleep",
];

export type BotShape =
  | "b113"
  | "b7"
  | "b23"
  | "b41"
  | "b58"
  | "b77"
  | "b90"
  | "squircle"
  | "heart";

/** The mark's own box, and where its centre and radius sit in it. */
export const BOT_VIEW = 240;
const N = 72;
const CX = 120;
const CY = 122;
const R = 100;

function superR(th: number, n: number, a: number, b: number) {
  const c = Math.abs(Math.cos(th)) / a;
  const s = Math.abs(Math.sin(th)) / b;
  return (c ** n + s ** n) ** (-1 / n);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fromPolar = (fn: (th: number) => number): Pt[] =>
  Array.from({ length: N }, (_, i) => {
    const th = (i / N) * TAU;
    const r = fn(th);
    return [Math.cos(th) * r, Math.sin(th) * r];
  });

function extent(pts: Pt[]) {
  let x0 = 1e9;
  let x1 = -1e9;
  let y0 = 1e9;
  let y1 = -1e9;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  return { x0, x1, y0, y1 };
}

function normalize(pts: Pt[]): Pt[] {
  const { x0, x1, y0, y1 } = extent(pts);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const s = 1 / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
  return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

/** Resamples a dense outline at N even angles round its centre. */
function polarize(dense: Pt[]): Pt[] {
  const { x0, x1, y0, y1 } = extent(dense);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const P = dense
    .map(
      ([x, y]) =>
        [Math.atan2(y - cy, x - cx), Math.hypot(x - cx, y - cy)] as Pt,
    )
    .sort((a, b) => a[0] - b[0]);
  const last = P.length - 1;
  return Array.from({ length: N }, (_, i) => {
    let th = (i / N) * TAU;
    if (th > Math.PI) th -= TAU;
    let r: number;
    if (th <= P[0][0] || th >= P[last][0]) {
      const a = P[last];
      const b0 = P[0][0] + TAU;
      const tt = th < P[0][0] ? th + TAU : th;
      r = lerp(a[1], P[0][1], (tt - a[0]) / (b0 - a[0] || 1));
    } else {
      let lo = 0;
      let hi = last;
      while (hi - lo > 1) {
        const m = (lo + hi) >> 1;
        if (P[m][0] <= th) lo = m;
        else hi = m;
      }
      r = lerp(
        P[lo][1],
        P[hi][1],
        (th - P[lo][0]) / (P[hi][0] - P[lo][0] || 1),
      );
    }
    return [Math.cos(th) * r, Math.sin(th) * r] as Pt;
  });
}

function blob(seed: number, wobble = 0.17) {
  const rnd = mulberry32(seed);
  const hs = [1, 2, 3, 4, 5].map((k) => ({
    k,
    a: (rnd() * 2 - 1) / k,
    p: rnd() * TAU,
  }));
  const raw = (th: number) =>
    hs.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.p), 0);
  let peak = 0;
  for (let i = 0; i < 360; i++)
    peak = Math.max(peak, Math.abs(raw((i / 360) * TAU)));
  return normalize(fromPolar((th) => 1 + raw(th) * (wobble / (peak || 1))));
}

const SHAPES: Record<BotShape, Pt[]> = {
  b113: blob(113),
  b7: blob(7),
  b23: blob(23),
  b41: blob(41),
  b58: blob(58),
  b77: blob(77),
  b90: blob(90),
  squircle: normalize(fromPolar((th) => superR(th, 4.6, 1, 0.92))),
  heart: normalize(
    polarize(
      Array.from({ length: 720 }, (_, i) => {
        const t = (i / 720) * TAU;
        return [
          16 * Math.sin(t) ** 3,
          -(
            13 * Math.cos(t) -
            5 * Math.cos(2 * t) -
            2 * Math.cos(3 * t) -
            Math.cos(4 * t)
          ),
        ] as Pt;
      }),
    ),
  ),
};
/** What every shape leans toward while it works: a rounded square, like a screen. */
const WORK_SHAPE = normalize(fromPolar((th) => superR(th, 4.2, 1, 0.92)));

export const BOT_SHAPES = Object.keys(SHAPES) as BotShape[];

/** Where a shape's feet are (its lowest point) and its half height, in the mark's box. */
export function shapeMetrics(shape: BotShape) {
  const { y0, y1 } = extent(SHAPES[shape]);
  return { anchor: y1 * R, hh: (y1 - y0) / 2, cx: CX, cy: CY, r: R };
}

/** A closed Catmull-Rom curve through the points. */
function pathOf(pts: Pt[]) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return `${d}Z`;
}

const EYE = { w: 34, h: 46, n: 2.8, sep: 39, y: -18 };

interface Pose {
  sx: number;
  sy: number;
  lean: number;
  rot: number;
  ty: number;
  blend: number;
  ew: number;
  eh: number;
  en: number;
  bend: number;
  gx: number;
  gy: number;
  dot: number;
  dim: number;
}
const KEYS = Object.keys({
  sx: 0,
  sy: 0,
  lean: 0,
  rot: 0,
  ty: 0,
  blend: 0,
  ew: 0,
  eh: 0,
  en: 0,
  bend: 0,
  gx: 0,
  gy: 0,
  dot: 0,
  dim: 0,
} satisfies Pose) as (keyof Pose)[];
const FAST = new Set<keyof Pose>(["sx", "sy", "ty"]);
const BLINKS = new Set<Mood>([
  "idle",
  "listening",
  "working",
  "asking",
  "walk",
  "talk",
]);

function poseOf(mood: Mood, T: number, ph: number, still: boolean): Pose {
  const t = T + ph * 7;
  const br = still ? 0 : Math.sin((t * TAU) / 3.6);
  const p: Pose = {
    sx: 1 - 0.012 * br,
    sy: 1 + 0.018 * br,
    lean: 0,
    rot: 0,
    ty: 0,
    blend: 0,
    ew: 1,
    eh: 1,
    en: EYE.n,
    bend: 0,
    gx: 0,
    gy: 0,
    dot: 0,
    dim: 1,
  };
  switch (mood) {
    case "idle":
      if (!still) {
        const k = Math.floor(t / 2.4);
        p.gx = (hash(k + ph * 91) - 0.5) * 14;
        p.gy = (hash(k * 3.7 + ph * 13) - 0.5) * 6;
      }
      break;
    case "listening":
      p.ew = 1.06;
      p.eh = 1.14;
      p.gy = -5;
      p.sy += 0.03;
      if (!still) p.rot = 2.5 * Math.sin(t * 1.8);
      break;
    case "working":
      p.eh = 0.56;
      p.ew = 1.1;
      p.en = EYE.n + 0.9;
      p.blend = 0.28;
      p.gy = 6;
      if (!still) {
        const u = (((t / 1.7) % 1) + 1) % 1;
        p.gx =
          u < 0.82 ? lerp(-9, 9, u / 0.82) : lerp(9, -9, (u - 0.82) / 0.18);
        p.ty = -1.6 * Math.abs(Math.sin(t * TAU * 1.4));
      }
      break;
    case "asking":
      p.eh = 1.08;
      p.ew = 1.04;
      p.en = 2.1;
      p.rot = 6;
      p.gy = -1;
      p.dot = 1;
      if (!still) {
        const u = ((t % 2.6) + 2.6) % 2.6;
        if (u < 0.5) {
          const v = u / 0.5;
          p.ty = -10 * 4 * v * (1 - v);
        }
      }
      break;
    case "happy":
      p.bend = 9;
      p.eh = 0.3;
      p.ew = 1.12;
      p.gy = -3;
      if (!still) p.ty = -2.5 * Math.abs(Math.sin(t * TAU * 0.9));
      break;
    case "surprised":
      p.eh = 1.3;
      p.ew = 1.15;
      p.en = 2;
      p.gy = -5;
      p.sy += 0.04;
      p.sx -= 0.02;
      break;
    case "talk":
      p.eh = 1.03;
      if (!still) {
        const s =
          Math.max(0, Math.sin(t * TAU * 3.1)) *
          (0.55 + 0.45 * Math.sin(t * 1.9));
        p.sy += 0.04 * s;
        p.sx -= 0.025 * s;
      }
      break;
    case "walk":
      p.eh = 0.96;
      break;
    case "sleep": {
      const b2 = still ? 0 : Math.sin((t * TAU) / 5.4);
      p.sy = 0.955 + 0.025 * b2;
      p.sx = 1.02 - 0.012 * b2;
      p.eh = 0.13;
      p.bend = -3.5;
      p.gy = 7;
      p.dim = 0.78;
      p.rot = -3;
      break;
    }
  }
  return p;
}

/** One frame of the mark, ready to set on its SVG parts. */
export interface BotFrame {
  body: string;
  eyes: [string, string];
  opacity: number;
  /** The "needs you" dot by the head, when shown. */
  dot: { transform: string; pulseR: number; pulseOpacity: number } | null;
  /** The two z's over a sleeping bot, when shown. */
  zs: { x: number; y: number; size: number; opacity: number }[] | null;
}

/** A bot's pose over time: give it the clock each frame and it eases toward its mood. */
export class BotMotion {
  mood: Mood;
  gaze: Pt | null = null;
  private cur: Pose | null = null;

  readonly shape: BotShape;
  readonly phase: number;

  constructor(shape: BotShape, mood: Mood, phase: number) {
    this.shape = shape;
    this.mood = mood;
    this.phase = phase;
  }

  frame(t: number, dt: number, still: boolean): BotFrame {
    const T = still ? 0 : t;
    const tp = poseOf(this.mood, T, this.phase, still);
    if (this.gaze) {
      tp.gx = this.gaze[0];
      tp.gy = this.gaze[1];
    }
    if (!this.cur) this.cur = { ...tp };
    const c = this.cur;
    const a = 1 - Math.exp(-dt * 13);
    const af = 1 - Math.exp(-dt * 30);
    for (const k of KEYS) c[k] += (tp[k] - c[k]) * (FAST.has(k) ? af : a);
    let eh = c.eh;
    if (!still && BLINKS.has(this.mood)) {
      const bp = (t + this.phase * 5.3) % 4.3;
      if (bp < 0.17) eh *= 1 - 0.92 * Math.sin((bp / 0.17) * Math.PI);
    }
    const { anchor: B } = shapeMetrics(this.shape);
    const rad = (c.rot * Math.PI) / 180;
    const cs = Math.cos(rad);
    const sn = Math.sin(rad);
    const xf = (x: number, y: number): Pt => {
      const yy = B + (y - B) * c.sy;
      const xx = x * c.sx + c.lean * (B - yy);
      const dy = yy - B;
      return [CX + xx * cs - dy * sn, CY + c.ty + B + xx * sn + dy * cs];
    };
    const shape = SHAPES[this.shape];
    const pts: Pt[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = shape[i];
      const q = WORK_SHAPE[i];
      pts[i] = xf(lerp(p[0], q[0], c.blend) * R, lerp(p[1], q[1], c.blend) * R);
    }
    const look = clamp(c.gx / 12, -1, 1);
    const eyes = [0, 1].map((s) => {
      const side = s ? 1 : -1;
      const hw = (EYE.w / 2) * c.ew * (1 - 0.16 * Math.max(0, look * side));
      const hh = Math.max(0.6, (EYE.h / 2) * eh);
      const ex = side * EYE.sep * (1 - 0.05 * Math.abs(look)) + c.gx;
      const ey = EYE.y + c.gy;
      const n = c.en;
      const out: Pt[] = [];
      for (let i = 0; i < 26; i++) {
        const th = (i / 26) * TAU;
        const co = Math.cos(th);
        const si = Math.sin(th);
        const x = Math.sign(co) * Math.abs(co) ** (2 / n) * hw;
        const u = x / hw;
        out.push(
          xf(
            ex + x,
            ey +
              Math.sign(si) * Math.abs(si) ** (2 / n) * hh -
              c.bend * (1 - u * u),
          ),
        );
      }
      return pathOf(out);
    }) as [string, string];
    let dot: BotFrame["dot"] = null;
    if (c.dot > 0.02) {
      const p = pts[Math.round(N * 0.875) % N];
      const dx = p[0] - CX;
      const dy = p[1] - CY;
      const L = Math.hypot(dx, dy) || 1;
      const u = still ? 0.45 : (t * 0.75) % 1;
      dot = {
        transform: `translate(${r1(p[0] + (dx / L) * 2)} ${r1(p[1] + (dy / L) * 2)}) scale(${r2(c.dot)})`,
        pulseR: r1(16 + 14 * u),
        pulseOpacity: r2(0.45 * (1 - u)),
      };
    }
    let zs: BotFrame["zs"] = null;
    if (this.mood === "sleep")
      zs = [0, 1].map((i) => {
        const u = still
          ? 0.3 + i * 0.35
          : ((((t + this.phase * 3 + i * 1.3) / 2.6) % 1) + 1) % 1;
        return {
          x: r1(CX + 62 + u * 34 + i * 6),
          y: r1(CY - 70 - u * 70 - i * 10),
          size: 30 + i * 10,
          opacity: r2(Math.sin(u * Math.PI) * 0.9),
        };
      });
    return { body: pathOf(pts), eyes, opacity: r2(c.dim), dot, zs };
  }
}
