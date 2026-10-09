// The office room's floor plan: desks in areas of up to six, bookshelves between them, a reading
// corner with tea, and the lift on the back wall. Walking is worked out on a grid of what blocks.

import { clamp, lerp } from "./core.mjs";
import { LIFT_W, LIFT_X, PD, PW, podAt } from "./pieces.mjs";

export const ZA = 44,
  AV = 26,
  AH = 26,
  TOP = 14;
/** How deep a floor is at least: the commons by the lift need this much. */
const COMMONS_D = 92;
/** The walls' height in plan units: the design's middle one. */
export const WALL_H = 28;
/**
 * Each team's people in areas of up to six desks, two to a row, as even as they split: seven people
 * sit four and three rather than six and one. `teams` are [label, ids].
 */
export function areasOf(teams) {
  const areas = [];
  for (const [team, names] of teams) {
    const n = Math.max(1, Math.ceil(names.length / 6)),
      base = Math.floor(names.length / n),
      extra = names.length % n;
    for (let i = 0, at = 0; i < n && at < names.length; i++) {
      const size = base + (i < extra ? 1 : 0),
        chunk = names.slice(at, at + size),
        cols = chunk.length === 1 ? 1 : 2,
        rows = Math.ceil(chunk.length / cols);
      areas.push({
        team,
        names: chunk,
        cols,
        rows,
        w: cols * PW,
        d: rows * PD,
        secondary: i > 0,
      });
      at += size;
    }
  }
  return areas;
}
/**
 * One floor: the team areas on a grid of walkways, a bookshelf beside each area's rows, and on the
 * left by the lift the commons, kept small: a coffee island, then a reading nook (a rug, a shelf, two
 * armchairs and a low table, where the clones meet) and a plant. The floor is no larger than its
 * desks need, so they are drawn as large as the screen allows.
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
    // two to a row until there are more than four: a floor near square rather than a long strip
    gc = n <= 2 ? n : n <= 4 ? 2 : 3,
    gr = Math.ceil(n / gc),
    colW = [],
    rowH = [];
  areas.forEach((a, i) => {
    a.c = i % gc;
    a.r = Math.floor(i / gc);
    colW[a.c] = Math.max(colW[a.c] || 0, a.w);
    rowH[a.r] = Math.max(rowH[a.r] || 0, a.d);
  });
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

  // the commons, in the lane by the lift: clear of the left wall's clock, low enough not to hide it
  fl.things.push({ kind: "tea", x: 12, y: 18 });
  // the nook stands off the wall, so the clones meeting round its table never stand before the clock
  const rx = 22,
    ry = 46;
  fl.floorArt.push({ kind: "rug", x0: rx, y0: ry, x1: rx + 36, y1: ry + 30 });
  fl.things.push({
    kind: "shelf",
    x0: rx + 3,
    y0: ry - 9,
    x1: rx + 33,
    y1: ry - 5.4,
    face: "y",
    h: 9,
  });
  fl.things.push(
    { kind: "armchairs", x: rx + 11, y: ry + 7 },
    { kind: "armchairs", x: rx + 25, y: ry + 7 },
  );
  fl.things.push({
    kind: "lowtable",
    x0: rx + 10,
    y0: ry + 16,
    x1: rx + 26,
    y1: ry + 21.5,
  });
  fl.things.push({ kind: "plant", x: rx - 8, y: ry + 26, p: "tall" });
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
  fl.desks = desks;
  // the floor ends a step past the last desk (and the plant beside one's own): no bare floor round it
  fl.W = Math.max(X0 + 40, ...desks.map((d) => d.x1 + 14));
  fl.D = Math.max(COMMONS_D, ...desks.map((d) => d.y1 + 12));
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
