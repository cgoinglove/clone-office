// The office room's floor plan: desks in areas of up to six, bookshelves between them, a reading
// corner with tea, and the lift on the back wall. Walking is worked out on a grid of what blocks.

import { clamp, lerp, r1 } from "./core.mjs";
import { LIFT_W, LIFT_X, PD, PW, podAt } from "./pieces.mjs";

export const ZA = 44,
  AV = 26,
  AH = 26,
  TOP = 22;
/** The walls' height in plan units: the design's middle one. */
export const WALL_H = 28;
/** Each team's people in areas of up to six desks, two to a row. `teams` are [label, ids]. */
export function areasOf(teams) {
  const areas = [];
  for (const [team, names] of teams)
    for (let i = 0; i < names.length; i += 6) {
      const chunk = names.slice(i, i + 6),
        n = chunk.length,
        cols = n === 1 ? 1 : 2,
        rows = Math.ceil(n / cols);
      areas.push({
        team,
        names: chunk,
        cols,
        rows,
        w: cols * PW,
        d: rows * PD,
        secondary: i > 0,
      });
    }
  return areas;
}
/**
 * One floor: the team areas on a grid of walkways, the shared corner as one more cell at the end
 * (so the grid has no hole), bookshelves beside each area's rows, and in the corner a tea island,
 * a rug with a shelf, two armchairs and a low table, and plants.
 */
export function planFloor(teams, fi) {
  const areas = areasOf(teams);
  const fl = {
    index: fi,
    name: "",
    areas,
    things: [],
    floorArt: [],
    spots: {},
  };
  const X0 = ZA + 26;
  const n = areas.length,
    cells = n + 1,
    gc = cells <= 3 ? cells : cells <= 4 ? 2 : 3,
    gr = Math.ceil(cells / gc),
    colW = [],
    rowH = [];
  areas.forEach((a, i) => {
    a.c = i % gc;
    a.r = Math.floor(i / gc);
    colW[a.c] = Math.max(colW[a.c] || 0, a.w);
    rowH[a.r] = Math.max(rowH[a.r] || 0, a.d);
  });
  const cc = n % gc,
    cr = Math.floor(n / gc),
    CMW = 76,
    CMD = 62;
  let span = 0;
  for (let c = cc; c < gc; c++) span += (colW[c] || 0) + (c > cc ? AV : 0);
  if (span < CMW) colW[gc - 1] = (colW[gc - 1] || 0) + CMW - span;
  rowH[cr] = Math.max(rowH[cr] || 0, CMD);
  const colX = [],
    rowY = [];
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
    a.x0 = colX[a.c];
    a.y0 = rowY[a.r];
  }
  fl.W = x - AV + 26;
  fl.D = Math.max(120, y - AH + 24);
  // the corner is only as deep as what stands in it, centred in a deeper cell
  const x0 = colX[cc],
    x1 = x - AV,
    w = x1 - x0,
    y0 = rowY[cr] + Math.max(0, (rowH[cr] - CMD) / 2),
    y1 = y0 + CMD,
    wide = w >= 160;
  fl.floorArt.push({
    kind: "plaza",
    x0: x0 - 5,
    y0: y0 - 5,
    x1: x1 + 5,
    y1: y1 + 3,
  });
  fl.things.push({ kind: "tea", x: x0 + 6, y: y0 + 6, island: true });
  fl.things.push({ kind: "plant", x: x1 - 5, y: y1 - 5, p: "tall" });
  for (const a of areas)
    for (let r = 0; r < a.rows; r++)
      fl.things.push({
        kind: "shelf",
        x0: a.x0 - 4.6,
        y0: a.y0 + r * PD + 6,
        x1: a.x0 - 1.8,
        y1: a.y0 + r * PD + 27,
        face: "x",
        h: 13,
      });
  const rx = wide ? x0 + w * 0.42 : x0 + 32,
    ry = y0 + 18;
  fl.floorArt.push({ kind: "rug", x0: rx, y0: ry, x1: rx + 36, y1: ry + 30 });
  fl.things.push({
    kind: "shelf",
    x0: rx + 2,
    y0: ry - 9,
    x1: rx + 32,
    y1: ry - 5.4,
    face: "y",
    h: 13,
  });
  fl.things.push(
    { kind: "armchairs", x: rx + 11, y: ry + 7 },
    { kind: "armchairs", x: rx + 22, y: ry + 7 },
  );
  fl.things.push({
    kind: "lowtable",
    x0: rx + 9,
    y0: ry + 16,
    x1: rx + 24,
    y1: ry + 21.5,
  });
  fl.things.push({ kind: "plant", x: x0 + 8, y: y1 - 6, p: "leafy" });
  if (wide)
    fl.things.push(
      { kind: "sofa", x0: x1 - 34, y: y0 + 26, x1: x1 - 12 },
      { kind: "plant", x: x1 - 8, y: y0 + 8, p: "leafy" },
    );
  const desks = [];
  for (const a of areas) {
    a.x1 = a.x0 + a.w;
    a.y1 = a.y0 + a.d;
    for (let k = 0; k < a.cols * a.rows; k++) {
      const col = k % a.cols,
        row = Math.floor(k / a.cols),
        d = podAt(a.x0 + col * PW, a.y0 + row * PD);
      Object.assign(d, {
        id: a.names[k] || null,
        key: `d${fi}-${desks.length}`,
        area: a,
        row,
        col,
      });
      desks.push(d);
    }
  }
  fl.floorArt.push({ kind: "rug", x0: 5, y0: 58, x1: 40, y1: 90 });
  fl.desks = desks;
  fl.lift = [LIFT_X + LIFT_W / 2, 8];
  fl.door = [LIFT_X + LIFT_W / 2, 1.3];
  return fl;
}

// ---- walking: a grid of what blocks, A* across it, then the corners cut and rounded
export function buildGrid(fl, blockers) {
  const G = 1.5,
    nx = Math.ceil(fl.W / G) + 1,
    ny = Math.ceil(fl.D / G) + 1,
    blocked = new Uint8Array(nx * ny);
  const mark = (x0, y0, x1, y1, pad) => {
    const i0 = Math.max(0, Math.floor((x0 - pad) / G)),
      i1 = Math.min(nx - 1, Math.ceil((x1 + pad) / G)),
      j0 = Math.max(0, Math.floor((y0 - pad) / G)),
      j1 = Math.min(ny - 1, Math.ceil((y1 + pad) / G));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) blocked[j * nx + i] = 1;
  };
  for (const b of blockers) mark(b.x0, b.y0, b.x1, b.y1, b.pad ?? 1.2);
  for (let i = 0; i < nx; i++) {
    blocked[i] = 1;
    blocked[(ny - 1) * nx + i] = 1;
  }
  for (let j = 0; j < ny; j++) {
    blocked[j * nx] = 1;
    blocked[j * nx + nx - 1] = 1;
  }
  fl.grid = { G, nx, ny, blocked };
}
export function findPath(fl, from, to) {
  const { G, nx, ny, blocked } = fl.grid;
  const cell = ([x, y]) => [
    clamp(Math.round(x / G), 0, nx - 1),
    clamp(Math.round(y / G), 0, ny - 1),
  ];
  const free = (i, j) =>
    i >= 0 && j >= 0 && i < nx && j < ny && !blocked[j * nx + i];
  const near = ([i, j]) => {
    if (free(i, j)) return [i, j];
    for (let r = 1; r < 14; r++)
      for (let dj = -r; dj <= r; dj++)
        for (let di = -r; di <= r; di++)
          if (
            Math.max(Math.abs(di), Math.abs(dj)) === r &&
            free(i + di, j + dj)
          )
            return [i + di, j + dj];
    return [i, j];
  };
  const s = near(cell(from)),
    t = near(cell(to)),
    N2 = nx * ny,
    gS = new Float32Array(N2).fill(Infinity),
    came = new Int32Array(N2).fill(-1),
    closed = new Uint8Array(N2);
  const heap = [],
    push = (f, k) => {
      heap.push([f, k]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
  const pop = () => {
    const top = heap[0],
      last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const hEst = (i, j) => {
    const dx = Math.abs(i - t[0]),
      dy = Math.abs(j - t[1]);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  const sk = s[1] * nx + s[0],
    tk = t[1] * nx + t[0];
  gS[sk] = 0;
  push(hEst(s[0], s[1]), sk);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  let found = false;
  while (heap.length) {
    const [, k] = pop();
    if (closed[k]) continue;
    if (k === tk) {
      found = true;
      break;
    }
    closed[k] = 1;
    const i = k % nx,
      j = (k / nx) | 0;
    for (const [di, dj, c] of dirs) {
      const ni = i + di,
        nj = j + dj;
      if (!free(ni, nj) || (di && dj && (!free(i + di, j) || !free(i, j + dj))))
        continue;
      const nk = nj * nx + ni,
        g = gS[k] + c;
      if (g < gS[nk]) {
        gS[nk] = g;
        came[nk] = k;
        push(g + hEst(ni, nj), nk);
      }
    }
  }
  if (!found) return [from, to];
  const cells = [];
  for (let k = tk; k !== -1; k = came[k])
    cells.push([(k % nx) * G, ((k / nx) | 0) * G]);
  cells.reverse();
  const pts = [from, ...cells.slice(1, -1), to];
  const clear = (a, b) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]),
      n = Math.ceil(L / (G * 0.5));
    for (let q = 1; q < n; q++) {
      const x = lerp(a[0], b[0], q / n),
        y = lerp(a[1], b[1], q / n),
        i = Math.round(x / G),
        j = Math.round(y / G);
      if (!free(i, j)) return false;
    }
    return true;
  };
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !clear(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

// ====================================================================================
// Doodles that come and go around the mini-mes: each drawn twice, shown in turn, so it trembles like ink
// ====================================================================================

export const FXD = {
  bang: (j) =>
    `<path class="fx-i" d="M${r1(-2 + j * 0.4)} -25L${r1(2.1 + j * 0.5)} -24.4L${r1(0.9)} -7.4L${r1(-0.8)} -7.6Z"/><circle class="fx-i" cx="${r1(0.1 + j * 0.3)}" cy="-2.5" r="2"/><path class="fx-l" d="M-8 ${r1(-19.5 + j)}L-12.5 ${r1(-24 + j)}M8 ${r1(-20 - j)}L12.6 ${r1(-24.6 - j * 0.5)}M-9.2 ${r1(-11.2 + j * 0.5)}L-14 -11.8"/>`,
  ask: (j) =>
    `<path class="fx-l" d="M-5.6 ${r1(-18 + j * 0.4)}C${r1(-5.6 + j * 0.3)} -26 6.4 -26.4 6.2 -18.6C6 -13.4 ${r1(0.4 + j * 0.4)} -13.2 0.4 -7.8"/><circle class="fx-i" cx="${r1(0.4 + j * 0.3)}" cy="-2.6" r="1.9"/>`,
  spark: (j) =>
    `<path class="fx-i" d="M0 ${r1(-9 - j * 0.4)}Q${r1(1.1 + j * 0.2)} -1.1 9 0Q1.1 1.1 0 9Q-1.1 1.1 ${r1(-9 + j * 0.4)} 0Q-1.1 -1.1 0 ${r1(-9 - j * 0.4)}Z"/>`,
  puff: (j) =>
    `<ellipse class="fx-l" cx="${r1(j * 0.4)}" cy="0" rx="${r1(11 + j)}" ry="${r1(3.6 + j * 0.3)}"/>`,
  drip: (j) =>
    `<path class="fx-l fx-p" d="M0 ${r1(-11 - j * 0.4)}Q6 -2.6 0 1.8Q-6 -2.6 0 ${r1(-11 - j * 0.4)}Z"/>`,
  ticks: (j) =>
    `<path class="fx-l" d="M-12 ${r1(-3 + j)}L-17.5 -7.5M0 -7.5L${r1(j * 0.5)} -13.5M12 ${r1(-3 - j)}L17.5 -7.5"/>`,
  heart: (j) =>
    `<path class="fx-i" d="M0 ${r1(6 + j * 0.3)}C-9.5 0 -11 -6.8 -5.8 -8.8C-3 -9.9 -0.8 -7.9 0 -6.2C0.8 -7.9 3 -9.9 5.8 -8.8C11 -6.8 9.5 0 0 ${r1(6 + j * 0.3)}Z"/>`,
};
