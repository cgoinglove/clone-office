// The office room's drawing kit: a mini-me (Thursday's mark), the hand-drawn line, the plan
// projection, and the frame clock everything moves on. Ported from the confirmed design (v13).
// Plain ES modules on purpose: they build SVG as strings and move a few hundred nodes a frame,
// and the shape of that work (three sheets, copies cut to a mover, merged lines, half-rate
// frames; see office.mjs) matters more here than types. `office.d.mts` types what the app uses.

export const SVGNS = "http://www.w3.org/2000/svg";
export const TAU = Math.PI * 2,
  N = 72,
  CX = 120,
  CY = 122,
  R = 100;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const r1 = (n) => Math.round(n * 10) / 10;
export const r2 = (n) => Math.round(n * 100) / 100;
export const r3 = (n) => Math.round(n * 1000) / 1000;
export const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const hashStr = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
export const easeInOut = (x) =>
  x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
export const easeOut = (x) => 1 - (1 - clamp(x, 0, 1)) ** 3;
export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
export let REDUCED = false;
/** Every other frame: what can move at half the rate (a mini-me breathing, the page's own little marks) moves on these, so the frames between have nothing to repaint. */
export let EVEN = true;
try {
  REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch {}

// ====================================================================================
// Motion curves. A jump is Thursday's: gather, push, rise, fall, land, rebound, settle;
// each beat on its own easing, so the weight reads (crew-hop in app/globals.css).
// ====================================================================================

export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1,
    bx = 3 * (x2 - x1) - cx,
    ax = 1 - cx - bx,
    cy = 3 * y1,
    by = 3 * (y2 - y1) - cy,
    ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t,
    Y = (t) => ((ay * t + by) * t + cy) * t,
    dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x;
      if (Math.abs(e) < 1e-5) break;
      const d = dX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (!(t >= 0 && t <= 1)) {
      let lo = 0,
        hi = 1;
      t = x;
      for (let i = 0; i < 24; i++) {
        const v = X(t);
        if (Math.abs(v - x) < 1e-5) break;
        if (v < x) lo = t;
        else hi = t;
        t = (lo + hi) / 2;
      }
    }
    return Y(t);
  };
}
export const LIN = (x) => x;
export const E_OUT = bezier(0, 0, 0.58, 1),
  E_IN = bezier(0.42, 0, 1, 1);
/** A keyframe track: [time 0..1, value (number or pair), easing to the next frame]. */
export function track(frames) {
  return (u) => {
    const last = frames[frames.length - 1];
    if (u <= frames[0][0]) return frames[0][1];
    if (u >= last[0]) return last[1];
    for (let i = 0; i < frames.length - 1; i++) {
      const f0 = frames[i],
        f1 = frames[i + 1];
      if (u < f1[0]) {
        const k =
            f1[0] > f0[0] ? (f0[2] || LIN)((u - f0[0]) / (f1[0] - f0[0])) : 1,
          a = f0[1],
          b = f1[1];
        return typeof a === "number"
          ? lerp(a, b, k)
          : [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      }
    }
    return last[1];
  };
}
export const HOP_Y = track([
  [0, 0, bezier(0.25, 0, 0.2, 1)],
  [0.162, 0.1, bezier(0.08, 0.62, 0.3, 1)],
  [0.243, 0, bezier(0.1, 0.6, 0.3, 1)],
  [0.486, -1, bezier(0.72, 0, 0.9, 0.42)],
  [0.716, 0],
  [0.797, 0, bezier(0.2, 0.82, 0.4, 1)],
  [0.892, -0.2, bezier(0.45, 0, 0.5, 1)],
  [1, 0],
]);
export const HOP_S = track([
  [0, [1, 1], bezier(0.35, 0, 0.3, 1)],
  [0.162, [1.15, 0.81], bezier(0.2, 0.9, 0.4, 1)],
  [0.243, [0.89, 1.19], E_OUT],
  [0.37, [1, 1], E_IN],
  [0.62, [0.94, 1.08]],
  [0.716, [1, 1], bezier(0.25, 0.9, 0.4, 1)],
  [0.797, [1.26, 0.73], bezier(0.25, 0.9, 0.4, 1)],
  [0.892, [0.94, 1.09], bezier(0.4, 0, 0.4, 1)],
  [0.95, [1.04, 0.97]],
  [1, [1, 1]],
]);
export const HOP_SPIN = track([
  [0, 0],
  [0.243, 0, bezier(0.3, 0, 0.35, 1)],
  [0.716, 1],
  [1, 1],
]);
/** Each jump a mini-me makes: how long, how high (share of its height), how much it squashes, whether it turns. */
export const LEAPS = {
  hop: { dur: 0.74, rise: 0.27, squash: 0.8 },
  flip: { dur: 0.86, rise: 0.36, squash: 0.8, spin: true },
  tap: { dur: 0.42, rise: 0.07, squash: 0.45 },
  bounce: { dur: 0.62, rise: 0.15, squash: 0.65 },
};
export function leapAt(kind, t) {
  const L = LEAPS[kind],
    u = clamp(t / L.dur, 0, 1),
    s = HOP_S(u);
  return {
    lift: -HOP_Y(u) * L.rise,
    sx: 1 + (s[0] - 1) * L.squash,
    sy: 1 + (s[1] - 1) * L.squash,
    spin: L.spin ? HOP_SPIN(u) * 360 : 0,
    done: u >= 1,
  };
}
/** Dropping in from above onto its spot, then the landing of a jump. */
export const DROP_FALL = 0.36,
  DROP_LAND = 0.44;
export function dropAt(t) {
  if (t < DROP_FALL) {
    const q = t / DROP_FALL;
    return {
      lift: (1 - q * q) * 0.6,
      sx: 0.93 + 0.07 * q,
      sy: 1.1 - 0.1 * q,
      alpha: Math.min(1, q * 4),
    };
  }
  const u = 0.716 + clamp((t - DROP_FALL) / DROP_LAND, 0, 1) * 0.284,
    s = HOP_S(u);
  return {
    lift: -HOP_Y(u) * 0.27,
    sx: 1 + (s[0] - 1) * 0.9,
    sy: 1 + (s[1] - 1) * 0.9,
    alpha: 1,
    done: t >= DROP_FALL + DROP_LAND,
  };
}
/** One step of a walk: a low hop, squashed where it touches the floor. */
export function stepAt(u) {
  const C = 0.2;
  if (u < C) {
    const q = Math.sin((u / C) * Math.PI);
    return { lift: 0, sx: 1 + 0.055 * q, sy: 1 - 0.075 * q };
  }
  const q = (u - C) / (1 - C),
    arc = Math.sin(q * Math.PI);
  return {
    lift: 0.07 * arc,
    sx: 1 - 0.025 * arc,
    sy: 1 + 0.04 * Math.sin(Math.min(1, q * 1.5) * Math.PI),
  };
}

// ====================================================================================
// The mark, as Thursday draws it: a seeded blob (or squircle, heart) with two hollow eyes.
// A body wears a colour, or one of Thursday's paints: a sliding rainbow, or two colours.
// ====================================================================================

export function superR(th, n, a, b) {
  const c = Math.abs(Math.cos(th)) / a,
    s = Math.abs(Math.sin(th)) / b;
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n);
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const fromPolar = (fn) =>
  Array.from({ length: N }, (_, i) => {
    const th = (i / N) * TAU,
      r = fn(th);
    return [Math.cos(th) * r, Math.sin(th) * r];
  });
export function normalize(pts) {
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    s = 1 / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
  return pts.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}
export function polarize(dense) {
  let x0 = 1e9,
    x1 = -1e9,
    y0 = 1e9,
    y1 = -1e9;
  for (const [x, y] of dense) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2;
  const P = dense
    .map(([x, y]) => [Math.atan2(y - cy, x - cx), Math.hypot(x - cx, y - cy)])
    .sort((a, b) => a[0] - b[0]);
  const last = P.length - 1;
  return Array.from({ length: N }, (_, i) => {
    let th = (i / N) * TAU;
    if (th > Math.PI) th -= TAU;
    let r;
    if (th <= P[0][0] || th >= P[last][0]) {
      const a = P[last],
        b0 = P[0][0] + TAU,
        tt = th < P[0][0] ? th + TAU : th;
      r = lerp(a[1], P[0][1], (tt - a[0]) / (b0 - a[0] || 1));
    } else {
      let lo = 0,
        hi = last;
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
    return [Math.cos(th) * r, Math.sin(th) * r];
  });
}
export function blob(seed, wobble = 0.17) {
  const rnd = mulberry32(seed);
  const hs = [1, 2, 3, 4, 5].map((k) => ({
    k,
    a: (rnd() * 2 - 1) / k,
    p: rnd() * TAU,
  }));
  const raw = (th) =>
    hs.reduce((s, h) => s + h.a * Math.sin(h.k * th + h.p), 0);
  let peak = 0;
  for (let i = 0; i < 360; i++)
    peak = Math.max(peak, Math.abs(raw((i / 360) * TAU)));
  return normalize(fromPolar((th) => 1 + raw(th) * (wobble / (peak || 1))));
}
export const SHAPES = {
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
        ];
      }),
    ),
  ),
};
export const WORK_SHAPE = normalize(
  fromPolar((th) => superR(th, 4.2, 1, 0.92)),
);
/** Thursday's paints, worn in place of a colour. */
export const PAINTS = {
  rainbow: {
    flow: true,
    colors: [0, 45, 90, 140, 190, 240, 290, 330, 360].map(
      (h) => `oklch(0.77 0.16 ${h})`,
    ),
  },
  duo: { colors: ["#818CF8", "#F472B6"] },
};
export function pathOf(pts) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + "Z";
}
export const EYE = { w: 34, h: 46, n: 2.8, sep: 39, y: -18 };
export const KEYS = [
  "sx",
  "sy",
  "lean",
  "rot",
  "ty",
  "blend",
  "ew",
  "eh",
  "en",
  "bend",
  "gx",
  "gy",
  "dot",
  "dim",
];
export const FAST = new Set(["sx", "sy", "ty"]);
export const BLINKS = new Set([
  "idle",
  "listening",
  "working",
  "asking",
  "walk",
  "talk",
]);
export function poseOf(mood, T, ph, still) {
  const t = T + ph * 7,
    br = still ? 0 : Math.sin((t * TAU) / 3.6);
  const p = {
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
export let BOT_SEQ = 0;
export const Z_PATH = (j) => `M${-7 + j} -7H7L-7 ${7 - j}H${7 + j * 0.5}`;
export class Bot {
  constructor(o) {
    this.color = o.color;
    this.paint = o.paint && PAINTS[o.paint] ? o.paint : null;
    this.shape = o.shape || "b113";
    this.mood = o.mood || "idle";
    this.phase = o.phase ?? Math.random();
    this.dotScale = 1;
    this.mineDot = true;
    this.dirty = true;
    this.gaze = null;
    this.el = document.createElementNS(SVGNS, "g");
    const id = "sb" + ++BOT_SEQ,
      pt = this.paint && PAINTS[this.paint];
    let defs = "";
    if (pt) {
      const stops = pt.colors
        .map(
          (c, i) =>
            `<stop offset="${r3(i / (pt.colors.length - 1))}" stop-color="${c}"/>`,
        )
        .join("");
      defs = pt.flow
        ? `<linearGradient id="${id}-p" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="320" y2="0" spreadMethod="repeat">${stops}</linearGradient>`
        : `<linearGradient id="${id}-p" gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="230" y2="230">${stops}</linearGradient>`;
    }
    this.el.innerHTML = `<defs>${defs}</defs><g class="sb-body"><path class="sb-fill"${pt ? ` style="fill:url(#${id}-p)"` : ""}/><path class="sb-eye"/><path class="sb-eye"/></g><g class="sb-z" style="display:none"><g><path class="sb-zp" d="${Z_PATH(0)}"/></g><g><path class="sb-zp" d="${Z_PATH(1.5)}"/></g></g><g class="sb-dot" style="display:none"><circle class="sb-ring" r="21"/><circle class="sb-dotc" r="16"/><circle class="sb-pulse" r="16"/></g>`;
    if (!pt)
      this.el.style.setProperty(
        "--bot",
        this.color === "system" ? "var(--ink)" : this.color,
      );
    const q = (s) => this.el.querySelector(s);
    this.grad = pt && pt.flow ? q(`#${id}-p`) : null;
    this.path = q(".sb-fill");
    this.body = q(".sb-body");
    this.eyes = [...this.el.querySelectorAll(".sb-eye")];
    this.dot = q(".sb-dot");
    this.pulse = q(".sb-pulse");
    this.zs = q(".sb-z");
    this.zt = [...this.zs.children];
    let maxY = -9,
      minY = 9;
    for (const [, y] of SHAPES[this.shape]) {
      maxY = Math.max(maxY, y);
      minY = Math.min(minY, y);
    }
    this.anchor = maxY * R;
    this.hh = (maxY - minY) / 2;
  }
  setMood(m) {
    if (m !== this.mood) {
      this.mood = m;
      this.dirty = true;
    }
  }
  setMineDot(v) {
    if (v !== this.mineDot) {
      this.mineDot = v;
      this.dot.classList.toggle("other", !v);
      this.dirty = true;
    }
  }
  still(t) {
    if (this.dirty) {
      this.update(t, 1, true);
      this.dirty = false;
    }
  }
  update(t, dt, still = false) {
    still = still || REDUCED;
    const T = REDUCED ? 0 : t;
    const tp = poseOf(this.mood, T, this.phase, still);
    if (this.gaze) {
      tp.gx = this.gaze[0];
      tp.gy = this.gaze[1];
    }
    if (!this.cur) this.cur = { ...tp };
    const c = this.cur,
      a = 1 - Math.exp(-dt * 13),
      af = 1 - Math.exp(-dt * 30);
    for (const k of KEYS) c[k] += (tp[k] - c[k]) * (FAST.has(k) ? af : a);
    let eh = c.eh;
    if (!still && BLINKS.has(this.mood)) {
      const bp = (t + this.phase * 5.3) % 4.3;
      if (bp < 0.17) eh *= 1 - 0.92 * Math.sin((bp / 0.17) * Math.PI);
    }
    const B = this.anchor,
      rad = (c.rot * Math.PI) / 180,
      cs = Math.cos(rad),
      sn = Math.sin(rad);
    const xf = (x, y) => {
      const yy = B + (y - B) * c.sy,
        xx = x * c.sx + c.lean * (B - yy),
        dy = yy - B;
      return [CX + xx * cs - dy * sn, CY + c.ty + B + xx * sn + dy * cs];
    };
    const shape = SHAPES[this.shape],
      pts = new Array(N);
    for (let i = 0; i < N; i++) {
      const p = shape[i],
        q = WORK_SHAPE[i];
      pts[i] = xf(lerp(p[0], q[0], c.blend) * R, lerp(p[1], q[1], c.blend) * R);
    }
    this.path.setAttribute("d", pathOf(pts));
    const look = clamp(c.gx / 12, -1, 1);
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1,
        hw = (EYE.w / 2) * c.ew * (1 - 0.16 * Math.max(0, look * side)),
        hh = Math.max(0.6, (EYE.h / 2) * eh);
      const ex = side * EYE.sep * (1 - 0.05 * Math.abs(look)) + c.gx,
        ey = EYE.y + c.gy,
        n = c.en,
        out = [];
      for (let i = 0; i < 26; i++) {
        const th = (i / 26) * TAU,
          co = Math.cos(th),
          si = Math.sin(th),
          x = Math.sign(co) * Math.abs(co) ** (2 / n) * hw,
          u = x / hw;
        out.push(
          xf(
            ex + x,
            ey +
              Math.sign(si) * Math.abs(si) ** (2 / n) * hh -
              c.bend * (1 - u * u),
          ),
        );
      }
      this.eyes[s].setAttribute("d", pathOf(out));
    }
    const dim = String(r2(c.dim));
    if (dim !== this.dimW) {
      this.dimW = dim;
      this.body.setAttribute("opacity", dim);
    }
    if (this.grad)
      this.grad.setAttribute(
        "gradientTransform",
        `rotate(-35 ${CX} ${CY}) translate(${r1(-(((T / 3.6) % 1) * 320))} 0)`,
      );
    if (c.dot > 0.02) {
      const p = pts[Math.round(N * 0.875) % N],
        dx = p[0] - CX,
        dy = p[1] - CY,
        L = Math.hypot(dx, dy) || 1;
      if (this.dotOff !== false) {
        this.dotOff = false;
        this.dot.style.display = "";
      }
      this.dot.setAttribute(
        "transform",
        `translate(${r1(p[0] + (dx / L) * 2)} ${r1(p[1] + (dy / L) * 2)}) scale(${r2(c.dot * this.dotScale)})`,
      );
      const u = still ? 0.45 : (t * 0.75) % 1;
      this.pulse.setAttribute("r", r1(16 + 14 * u));
      this.pulse.setAttribute("opacity", r2(0.45 * (1 - u)));
    } else if (this.dotOff !== true) {
      this.dotOff = true;
      this.dot.style.display = "none";
    }
    if (this.mood === "sleep") {
      if (this.zOff !== false) {
        this.zOff = false;
        this.zs.style.display = "";
      }
      this.zt.forEach((z, i) => {
        const u = still
            ? 0.3 + i * 0.35
            : ((((t + this.phase * 3 + i * 1.3) / 2.6) % 1) + 1) % 1,
          k = (1.6 + i * 0.6) * (0.7 + 0.5 * u);
        z.setAttribute(
          "transform",
          `translate(${r1(CX + 60 + u * 30 + i * 10)} ${r1(CY - 66 - u * 66 - i * 12)}) rotate(${r1(-8 + 16 * Math.sin(u * 5 + i))}) scale(${r2(k)})`,
        );
        z.setAttribute("opacity", r2(Math.sin(u * Math.PI) * 0.95));
      });
    } else if (this.zOff !== true) {
      this.zOff = true;
      this.zs.style.display = "none";
    }
  }
}
export const live = new Set();
export let io = null;
try {
  io = new IntersectionObserver(
    (es) => {
      for (const e of es) {
        const rec = e.target.__rec;
        if (rec) rec.visible = e.isIntersecting;
      }
    },
    { rootMargin: "120px" },
  );
} catch {}
export function mountBot(host, opts, px) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", "0 0 240 240");
  svg.setAttribute("aria-hidden", "true");
  if (px) {
    svg.setAttribute("width", px);
    svg.setAttribute("height", px);
  }
  const bot = new Bot(opts);
  svg.appendChild(bot.el);
  host.appendChild(svg);
  const rec = { bot, svg, visible: true };
  svg.__rec = rec;
  live.add(rec);
  if (io) io.observe(svg);
  bot.update(performance.now() / 1000, 1);
  return rec;
}
export function unmountBot(rec) {
  if (!rec) return;
  live.delete(rec);
  if (rec.own !== false) {
    if (io) io.unobserve(rec.svg);
    rec.svg.remove();
  }
}

// ====================================================================================
// The sketch: plan units (x across, y back to front, z up) projected 2:1. A line bows a
// little and runs a little past its corners, as a hand draws it; how far it runs is set
// per piece (withOv): the building and big furniture overshoot, small things close neatly.
// A part is wrapped with how it arrives (k-*) and when.
// ====================================================================================

export const WS = 10;
export const at = (x, y, z = 0) => [
  (x - y) * 0.894 * WS,
  (x + y) * 0.447 * WS - z * 0.94 * WS,
];
export const unproject = (sx, sy) => {
  const a = sx / (0.894 * WS),
    b = sy / (0.447 * WS);
  return [(a + b) / 2, (b - a) / 2];
};
export const P = (list) => list.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");
/** Overshoot and bow in drawing units: a few pixels and under one, whatever the zoom. */
export let OV = 4,
  KOV = 1,
  WOB = 0.9;
export const setScale = (s) => {
  OV = 3.6 / s;
  WOB = 0.85 / s;
};
/** Draws at another scale and puts the office's back, for art drawn in screen pixels (the lift's doors). */
export const atScale = (s, f) => {
  const o = OV,
    w = WOB;
  setScale(s);
  try {
    return f();
  } finally {
    OV = o;
    WOB = w;
  }
};
export const withOv = (k, f) => {
  const prev = KOV;
  KOV = k;
  try {
    return f();
  } finally {
    KOV = prev;
  }
};
export const part = (cls, d, s) =>
  `<g class="${cls}" style="--d:${Math.round(d)}ms">${s}</g>`;
/**
 * The same drawing in far fewer elements: neighbouring strokes of one class become one path, and so do
 * neighbouring flat faces of one class (turned the same way round, so they fill as one). The browser
 * pays per element whenever anything near it changes, so thousands of lines cost it on every frame.
 * Faces filled with a gradient are left alone: a gradient spans its own shape's box.
 */
export const MERGE_SKIP = new Set([
  "f-soft",
  "f-floorlight",
  "f-light",
  "f-duskl",
  "f-leaf",
  "f-moon",
]);
export function polyD(points) {
  const n = points
      .trim()
      .split(/[\s,]+/)
      .map(Number),
    xs = [],
    ys = [];
  for (let i = 0; i + 1 < n.length; i += 2) {
    xs.push(n[i]);
    ys.push(n[i + 1]);
  }
  let a = 0;
  for (let i = 0; i < xs.length; i++) {
    const j = (i + 1) % xs.length;
    a += xs[i] * ys[j] - xs[j] * ys[i];
  }
  const idx = xs.map((_, i) => i);
  if (a < 0) idx.reverse();
  return "M" + idx.map((i) => xs[i] + " " + ys[i]).join("L") + "Z";
}
export function merged(svg) {
  const re =
    /<(path|polygon) class="([^"]+)"( pathLength="1")? (?:d|points)="([^"]*)"\/>/g;
  let out = "",
    last = 0,
    run = null;
  const flush = () => {
    if (run)
      out +=
        run.n > 1
          ? `<path class="${run.cls}"${run.pl} d="${run.d}"/>`
          : run.raw;
    run = null;
  };
  for (let m; (m = re.exec(svg)); ) {
    const [raw, tag, cls, pl = "", data] = m,
      gap = svg.slice(last, m.index);
    last = re.lastIndex;
    const line =
        tag === "path" &&
        (cls === "ol" || cls.startsWith("ol ") || cls === "hand-l"),
      face =
        tag === "polygon" &&
        cls.startsWith("f-") &&
        !cls.includes(" ") &&
        !MERGE_SKIP.has(cls);
    const same =
      run &&
      !gap &&
      (line || face) &&
      run.cls === cls &&
      run.pl === pl &&
      run.line === line;
    if (!same) {
      flush();
      out += gap;
    }
    if (!line && !face) {
      out += raw;
      continue;
    }
    const d = face ? polyD(data) : data;
    if (same) {
      run.d += d;
      run.n++;
    } else run = { cls, pl, d, n: 1, raw, line };
  }
  flush();
  return out + svg.slice(last);
}
/** A line as a hand draws it: bowed a little, running a little past its ends. */
export const ln = (a, b, cls = "ol", seed = 0) => stroke(a, b, cls, seed, 1);
export function stroke(a, b, cls, seed, loose) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    L = Math.hypot(dx, dy) || 1,
    ux = dx / L,
    uy = dy / L;
  const h = hash(
    a[0] * 0.37 + a[1] * 1.13 + b[0] * 2.71 + b[1] * 0.53 + seed * 9.1,
  );
  const o = OV * KOV * (0.7 + 0.6 * hash(h * 31.7 + 2.2)) * loose,
    o2 = OV * KOV * (0.7 + 0.6 * hash(h * 17.3 + 5.9)) * loose;
  const x1 = a[0] - ux * o,
    y1 = a[1] - uy * o,
    x2 = b[0] + ux * o2,
    y2 = b[1] + uy * o2;
  const bow = (h - 0.5) * 2 * Math.min(WOB * loose, L * 0.018 * loose);
  if (Math.abs(bow) < 0.06)
    return `<path class="${cls}" pathLength="1" d="M${r1(x1)} ${r1(y1)}L${r1(x2)} ${r1(y2)}"/>`;
  const mx = (x1 + x2) / 2 - uy * bow,
    my = (y1 + y2) / 2 + ux * bow;
  return `<path class="${cls}" pathLength="1" d="M${r1(x1)} ${r1(y1)}Q${r1(mx)} ${r1(my)} ${r1(x2)} ${r1(y2)}"/>`;
}
/** A line drawn twice, the second pass fainter and a hair off, for the building's shell. */
export const ln2 = (a, b, cls = "ol s") =>
  ln(a, b, cls) +
  withOv(KOV * 0.6, () =>
    ln(
      [a[0] + WOB * 0.8, a[1] + WOB * 0.5],
      [b[0] + WOB * 0.6, b[1] + WOB * 0.7],
      "ol g",
      7,
    ),
  );
export const poly = (pts, cls) =>
  `<polygon class="${cls}" points="${P(pts)}"/>`;
export const quad = (q, cls, line = "ol") =>
  poly(q, cls) +
  ln(q[0], q[1], line) +
  ln(q[1], q[2], line) +
  ln(q[2], q[3], line) +
  ln(q[3], q[0], line);
export function box(x0, y0, x1, y1, z0, z1, o = {}) {
  const A = at,
    c = o.line || "ol",
    L = o.double ? ln2 : ln;
  const fr = [A(x0, y1, z0), A(x1, y1, z0), A(x1, y1, z1), A(x0, y1, z1)],
    sd = [A(x1, y0, z0), A(x1, y1, z0), A(x1, y1, z1), A(x1, y0, z1)],
    tp = [A(x0, y0, z1), A(x1, y0, z1), A(x1, y1, z1), A(x0, y1, z1)];
  let s = poly(fr, o.front || "f-front") + poly(sd, o.side || "f-side");
  if (o.hatch !== false) s += poly(sd, "f-hatch");
  s += poly(tp, o.top || "f-top");
  if (o.edges === "leg")
    return (
      s +
      L(A(x0, y1, z0), A(x0, y1, z1), c) +
      L(A(x1, y1, z0), A(x1, y1, z1), c) +
      L(A(x1, y0, z0), A(x1, y0, z1), c)
    );
  s +=
    L(A(x0, y0, z1), A(x1, y0, z1), c) +
    L(A(x0, y0, z1), A(x0, y1, z1), c) +
    L(A(x0, y1, z1), A(x1, y1, z1), c) +
    L(A(x1, y0, z1), A(x1, y1, z1), c);
  s +=
    L(A(x0, y1, z0), A(x0, y1, z1), c) +
    L(A(x1, y1, z0), A(x1, y1, z1), c) +
    L(A(x1, y0, z0), A(x1, y0, z1), c);
  if (o.base !== false)
    s +=
      L(A(x0, y1, z0), A(x1, y1, z0), c) + L(A(x1, y0, z0), A(x1, y1, z0), c);
  return s;
}
export const flat = (x0, y0, x1, y1, z, cls, line = "ol f") =>
  quad([at(x0, y0, z), at(x1, y0, z), at(x1, y1, z), at(x0, y1, z)], cls, line);
/** A matrix laying a local plane (u to the right, v down) at plan point o, u and v given as plan vectors per local unit. */
export function plane(o, u, v) {
  const [e, f] = at(o[0], o[1], o[2]),
    a = at(o[0] + u[0], o[1] + u[1], o[2] + u[2]),
    b = at(o[0] + v[0], o[1] + v[1], o[2] + v[2]);
  return `matrix(${r3(a[0] - e)} ${r3(a[1] - f)} ${r3(b[0] - e)} ${r3(b[1] - f)} ${r1(e)} ${r1(f)})`;
}
export const planeM = (x, y, z) => plane([x, y, z], [1, 0, 0], [0, 0, -1]);
export const wallM = (x, z) => planeM(x, 0.05, z);
export const sideWallM = (y, z) => plane([0.05, y, z], [0, -1, 0], [0, 0, -1]);
export const floorM = (x, y) => plane([x, y, 0], [1, 0, 0], [0, 1, 0]);
export const floorText = (s, x, y, size, cls = "ftext") =>
  `<text class="${cls}" transform="${floorM(x, y)}" font-size="${size}">${esc(s)}</text>`;
export const planeText = (s, x, y, z, size, cls) =>
  `<text class="${cls}" transform="${planeM(x, y, z)}" font-size="${size}">${esc(s)}</text>`;
export const ellipseAt = (x, y, z, rx, ry, cls, extra = "") => {
  const c = at(x, y, z);
  return `<ellipse class="${cls}" cx="${r1(c[0])}" cy="${r1(c[1])}" rx="${r1(rx)}" ry="${r1(ry)}"${extra}/>`;
};
export const wallRect = (x0, z0, x1, z1, cls, y = 0.03, line = "ol") =>
  quad([at(x0, y, z0), at(x1, y, z0), at(x1, y, z1), at(x0, y, z1)], cls, line);
/** A circle of radius r on the ground plane is an ellipse this wide and half as tall. */
export const RX = 0.894 * WS * Math.SQRT2;
/** An upright cylinder (or a tapering one): its side, the top, and one shading stroke on the side away from the light. */
export function cyl(x, y, z0, z1, rb, rt = rb, o = {}) {
  const b = at(x, y, z0),
    t = at(x, y, z1),
    bx = rb * RX,
    by = bx / 2,
    tx = rt * RX,
    ty = tx / 2,
    line = o.line || "ol";
  const side = `M${r1(t[0] - tx)} ${r1(t[1])}L${r1(b[0] - bx)} ${r1(b[1])}A${r1(bx)} ${r1(by)} 0 0 0 ${r1(b[0] + bx)} ${r1(b[1])}L${r1(t[0] + tx)} ${r1(t[1])}A${r1(tx)} ${r1(ty)} 0 0 1 ${r1(t[0] - tx)} ${r1(t[1])}Z`;
  let s = `<path class="${o.side || "f-front"}" d="${side}"/>`;
  if (o.shade !== false)
    s += `<path class="ol f" d="M${r1(t[0] + tx * 0.58)} ${r1(t[1] + ty * 0.8)}L${r1(b[0] + bx * 0.58)} ${r1(b[1] + by * 0.8)}"/>`;
  s += `<path class="${line}" pathLength="1" d="M${r1(t[0] - tx)} ${r1(t[1])}L${r1(b[0] - bx)} ${r1(b[1])}A${r1(bx)} ${r1(by)} 0 0 0 ${r1(b[0] + bx)} ${r1(b[1])}L${r1(t[0] + tx)} ${r1(t[1])}"/>`;
  s += `<ellipse class="${o.top || "f-top"}" cx="${r1(t[0])}" cy="${r1(t[1])}" rx="${r1(tx)}" ry="${r1(ty)}"/><ellipse class="${line}" pathLength="1" cx="${r1(t[0])}" cy="${r1(t[1])}" rx="${r1(tx)}" ry="${r1(ty)}"/>`;
  return s;
}
/** A hand-drawn loop on the floor round a plan box, not quite closing, in two passes. */
export function loopOn(x0, y0, x1, y1, seed) {
  const cx = (x0 + x1) / 2,
    cy = (y0 + y1) / 2,
    rx = (x1 - x0) / 2,
    ry = (y1 - y0) / 2,
    out = [];
  for (let pass = 0; pass < 2; pass++) {
    const pts = [],
      a0 = -2.3 + pass * 0.35 + hash(seed + pass) * 0.3,
      span = TAU * (1.06 + 0.04 * pass);
    for (let i = 0; i <= 28; i++) {
      const a = a0 + (i / 28) * span,
        j =
          1 + (hash(seed * 3 + i * 1.7 + pass * 11) - 0.5) * 0.07 + pass * 0.03;
      pts.push(at(cx + Math.cos(a) * rx * j, cy + Math.sin(a) * ry * j));
    }
    let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const m = [
        (pts[i][0] + pts[i + 1][0]) / 2,
        (pts[i][1] + pts[i + 1][1]) / 2,
      ];
      d += `Q${r1(pts[i][0])} ${r1(pts[i][1])} ${r1(m[0])} ${r1(m[1])}`;
    }
    out.push(
      `<path class="hand-l" pathLength="1"${pass ? ' opacity=".55"' : ""} d="${d}"/>`,
    );
  }
  return out.join("");
}

// ---- leaves, for plants on the floor and on a desk

export function leaf(bx, by, ang, len, wid) {
  const dx = Math.cos(ang),
    dy = Math.sin(ang),
    nx = -dy,
    ny = dx,
    tx = bx + dx * len,
    ty = by + dy * len;
  const c1 = [bx + dx * len * 0.42 + nx * wid, by + dy * len * 0.42 + ny * wid],
    c2 = [bx + dx * len * 0.42 - nx * wid, by + dy * len * 0.42 - ny * wid];
  return `<path class="f-leaf" d="M${r1(bx)} ${r1(by)}Q${r1(c1[0])} ${r1(c1[1])} ${r1(tx)} ${r1(ty)}Q${r1(c2[0])} ${r1(c2[1])} ${r1(bx)} ${r1(by)}Z"/><path class="ol f" d="M${r1(bx + dx * len * 0.14)} ${r1(by + dy * len * 0.14)}Q${r1(bx + dx * len * 0.5 + nx * wid * 0.14)} ${r1(by + dy * len * 0.5 + ny * wid * 0.14)} ${r1(bx + dx * len * 0.8)} ${r1(by + dy * len * 0.8)}"/>`;
}
/** A spray of leaves from a point on screen: wide and low for a leafy plant, upright blades for a tall one. */
export function foliage(top, kind, seed, size = 1) {
  let s = "";
  if (kind === "tall") {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const k = (i - (n - 1) / 2) / ((n - 1) / 2),
        ang = -Math.PI / 2 + k * 0.32 + (hash(seed + i) - 0.5) * 0.12;
      s += leaf(
        top[0] + k * 6 * size,
        top[1] + Math.abs(k) * 2,
        ang,
        (44 + 16 * hash(seed + i * 7) - Math.abs(k) * 10) * size,
        4.6 * size,
      );
    }
    return s;
  }
  const n = kind === "small" ? 5 : 8,
    spread = kind === "small" ? 1.15 : 1.35,
    len = kind === "small" ? 15 : 30,
    wid = kind === "small" ? 4.2 : 7.5;
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => Math.abs(b - (n - 1) / 2) - Math.abs(a - (n - 1) / 2),
  );
  for (const i of order) {
    const k = (i - (n - 1) / 2) / ((n - 1) / 2),
      ang = -Math.PI / 2 + k * spread + (hash(seed + i * 3) - 0.5) * 0.2;
    s += leaf(
      top[0] + k * 2 * size,
      top[1] - Math.abs(Math.cos(ang)) * 2,
      ang,
      len * (0.85 + 0.3 * hash(seed + i * 5)) * size * (1 - Math.abs(k) * 0.12),
      wid * size,
    );
  }
  return s;
}
/** A potted plant on the floor: a tapering pot, then the leaves grow. */
export function plant(x, y, kind = "leafy", t0 = 0) {
  return withOv(0, () => {
    const tall = kind === "tall",
      h = tall ? 4.4 : 3.8,
      rt = tall ? 1.55 : 1.85,
      rb = tall ? 1.15 : 1.35;
    const pot = part(
      "k-drop",
      t0,
      ellipseAt(x, y, 0, rb * RX * 1.6, rb * RX * 0.8, "f-soft") +
        cyl(x, y, 0, h, rb, rt) +
        ellipseAt(
          x,
          y,
          h - 0.15,
          rt * RX * 0.8,
          rt * RX * 0.4,
          "f-ink72",
          ' opacity=".18"',
        ),
    );
    return (
      pot +
      part(
        "k-grow",
        t0 + 280,
        foliage(at(x, y, h - 0.2), kind, x * 0.37 + y * 0.11),
      )
    );
  });
}

// ====================================================================================
// One frame loop for the page: the half-rate frames flip here, the little marks (mountBot)
// breathe on them, and each office running adds its own tick. It stops when nothing is left.
// ====================================================================================

const runners = new Set();
let raf = 0,
  lastT = 0,
  acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  EVEN = !EVEN;
  acc += dt;
  if (EVEN) {
    const t = now / 1000;
    for (const r of live) if (r.visible) r.bot.update(t, acc);
    acc = 0;
  }
  for (const fn of runners) fn(dt, now);
  raf = runners.size ? requestAnimationFrame(frame) : 0;
}
/** Runs `fn(dt, now)` on every frame until the returned function is called. */
export function onFrame(fn) {
  runners.add(fn);
  if (!raf) {
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
  }
  return () => {
    runners.delete(fn);
    if (!runners.size && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
}
