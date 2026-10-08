// The office room's pieces: desks and what stands on them, the commons, the lift, the board, the
// sign on the floor, the building for the way in. Each returns SVG as a string, in plan units
// projected by `at` (core.mjs). Words people read come in from the screen's language.

import {
  at,
  box,
  CX,
  CY,
  cyl,
  EYE,
  ellipseAt,
  esc,
  flat,
  floorM,
  floorText,
  foliage,
  hash,
  hashStr,
  ln,
  P,
  PAINTS,
  part,
  pathOf,
  plane,
  planeM,
  poly,
  quad,
  R,
  RX,
  r1,
  r2,
  r3,
  SHAPES,
  TAU,
  wallM,
  wallRect,
  withOv,
} from "./core.mjs";

/** The company's name where the building and its wall carry it. */
export const BRAND = "CLONE OFFICE";
// ---- the personal desk: three styles; a chair behind it, a laptop, a lamp, a tray of work, one thing of its own

export const DK = { w: 20, d: 10, top: 7.2 };
export const PW = 44,
  PD = 40;
export function podAt(px, py) {
  const x0 = px + 12,
    y0 = py + 15,
    x1 = x0 + DK.w,
    y1 = y0 + DK.d;
  return {
    px,
    py,
    x0,
    y0,
    x1,
    y1,
    seat: [x0 + 7, y0 - 4.2],
    spot: [x1 - 5.5, y1 + 5.2],
  };
}
export const lapGeo = (d) => ({
  x0: d.x0 + 11.2,
  x1: d.x0 + 17.6,
  y0: d.y0 + 3.3,
  y1: d.y0 + 7.5,
  z: DK.top,
});
export const lampGeo = (d) => ({ bx: d.x0 + 1.7, by: d.y0 + 1.6, z: DK.top });
export const trayGeo = (d) => ({
  x0: d.x0 + 1.9,
  x1: d.x0 + 6.5,
  y0: d.y1 - 5.5,
  y1: d.y1 - 0.9,
  z: DK.top,
});
export const itemGeo = (d) => ({ x: d.x1 - 1.8, y: d.y1 - 2.1, z: DK.top });
export const arrive = (t0) => (cls, d, s) =>
  t0 === null ? s : part(cls, t0 + d, s);

export function chairSvg(cx, cy, t0 = 0) {
  return withOv(0, () => {
    let base = "";
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.3;
      base += ln(
        at(cx, cy, 0.55),
        at(cx + Math.cos(a) * 2.4, cy + Math.sin(a) * 2.4, 0.2),
        "ol",
      );
    }
    base += ln(at(cx, cy, 0.55), at(cx, cy, 3.2), "ol s");
    return (
      part("k-grow", t0, base) +
      part(
        "k-drop",
        t0 + 120,
        box(cx - 2.3, cy - 3.3, cx + 2.3, cy - 2.6, 4.2, 10.2) +
          box(cx - 2.5, cy - 2.3, cx + 2.5, cy + 2.3, 3.2, 4),
      )
    );
  });
}
/** Closed when the computer is off; open with its screen toward you, lines typing while the mini-me works. */
export function lapSvg(g, status, working, t0 = null) {
  return withOv(0, () => {
    const { x0, x1, y0, y1, z } = g,
      p = arrive(t0),
      zb = z + 0.32;
    const s = p(
      "k-drop",
      0,
      box(x0, y0, x1, y1, z, zb, { hatch: false }) +
        ln(
          at(x0 + 0.7, y0 + 1.4, zb + 0.01),
          at(x1 - 0.7, y0 + 1.4, zb + 0.01),
          "ol f",
        ) +
        ln(
          at(x0 + 0.7, y0 + 2.3, zb + 0.01),
          at(x1 - 0.7, y0 + 2.3, zb + 0.01),
          "ol f",
        ) +
        flat(
          x0 + 2.1,
          y1 - 1.35,
          x1 - 2.1,
          y1 - 0.45,
          zb + 0.01,
          "f-none",
          "ol f",
        ),
    );
    if (status === "offline")
      return (
        s +
        p(
          "k-drop",
          120,
          box(x0, y0, x1, y1, zb, zb + 0.3, { top: "f-front", hatch: false }),
        )
      );
    const zt = z + 4.9,
      back = 0.8,
      Lh = Math.hypot(zt - zb, back),
      w = x1 - x0,
      pad = 0.4,
      iw = w - pad * 2;
    const lid = [
      at(x0, y0, zb),
      at(x1, y0, zb),
      at(x1, y0 - back, zt),
      at(x0, y0 - back, zt),
    ];
    const M = plane(
      [x0, y0 - back, zt],
      [1, 0, 0],
      [0, back / Lh, -(zt - zb) / Lh],
    );
    const rows = working ? [0.62, 0.46, 0.7, 0.3] : [0.5, 0.3];
    const content =
      (working ? `<g class="typing">` : "<g>") +
      rows
        .map(
          (k, i) =>
            `<rect class="${working ? "f-scr tln" : "f-scrdim"}" x="${r2(pad + 0.35 + (i % 2) * 0.55)}" y="${r2(pad + 0.75 + i * 0.72)}" width="${r2(iw * k)}" height=".3" rx=".12"/>`,
        )
        .join("") +
      (working
        ? `<rect class="f-scr caret" x="${r2(pad + 0.35)}" y="${r2(pad + 0.75 + rows.length * 0.72)}" width=".42" height=".34" rx=".08"/>`
        : "") +
      "</g>";
    const screen = `<g transform="${M}"><rect class="f-screen" x="${r2(pad)}" y="${r2(pad)}" width="${r2(iw)}" height="${r2(Lh - pad * 2)}" rx=".22"/>${content}</g>`;
    return s + p("k-rise", 120, quad(lid, "f-front", "ol") + screen);
  });
}
/** Lit while the person is at their desk; its light pools on the desk, clear of the mini-me's face, warmer at night. */
export function lampSvg(g, on, t0 = null) {
  return withOv(0, () => {
    const { bx, by, z } = g,
      p = arrive(t0);
    const el = at(bx - 0.3, by + 0.1, z + 4.4),
      pv = at(bx + 1.1, by + 1.2, z + 6.6),
      top = at(bx + 1.35, by + 1.5, z + 6.75),
      rim = at(bx + 2.05, by + 2.35, z + 5.1);
    const rx = 8.6,
      ry = 3.6,
      nk = 2.2;
    const cone = `M${r1(top[0] - nk)} ${r1(top[1])}L${r1(rim[0] - rx)} ${r1(rim[1])}A${rx} ${ry} 0 0 0 ${r1(rim[0] + rx)} ${r1(rim[1])}L${r1(top[0] + nk)} ${r1(top[1])}Z`;
    let s = "";
    // on: light drawn as a few short strokes falling from the shade (and a pale pool, which shows on a dark desk)
    if (on)
      s += p(
        "k-fade",
        420,
        ellipseAt(bx + 3.6, by + 4.6, z, 36, 14, "f-lamp", ' opacity=".35"') +
          [
            [-6.5, 3.2, -9.5, 10.5],
            [-0.6, 4.4, -0.8, 13],
            [5.6, 3.4, 8.6, 10.8],
          ]
            .map(([a0, b0, a1, b1]) =>
              ln(
                [rim[0] + a0, rim[1] + b0],
                [rim[0] + a1, rim[1] + b1],
                "ol g",
              ),
            )
            .join(""),
      );
    return (
      s +
      p(
        "k-rise",
        0,
        cyl(bx, by, z, z + 0.3, 0.85, 0.8, { shade: false }) +
          ln(at(bx, by, z + 0.3), el, "ol") +
          ln(el, pv, "ol") +
          `<circle class="f-paper" cx="${r1(el[0])}" cy="${r1(el[1])}" r="1.6"/><circle class="ol" cx="${r1(el[0])}" cy="${r1(el[1])}" r="1.6"/>` +
          `<path class="${on ? "f-paper" : "f-front"}" d="${cone}"/>` +
          `<ellipse class="${on ? "f-lamp" : "f-side"}" cx="${r1(rim[0])}" cy="${r1(rim[1])}" rx="${rx}" ry="${ry}"/>` +
          `<path class="ol" d="${cone}"/><ellipse class="ol" cx="${r1(rim[0])}" cy="${r1(rim[1])}" rx="${rx}" ry="${ry}"/>`,
      )
    );
  });
}
/** One sheet for each piece of work: up to 8 stack by height, past that a count. The newest lands with a bounce. */
export function stackSvg(g, n, seedName, t0 = null, fresh = false) {
  return withOv(0, () => {
    const { x0, x1, y0, y1, z } = g,
      seed = hashStr(seedName) % 97,
      show = Math.min(n, 8);
    let s = box(x0 - 0.35, y0 - 0.35, x1 + 0.35, y1 + 0.35, z, z + 0.42, {
      hatch: false,
      top: "f-front",
    });
    if (t0 !== null) s = part("k-drop", t0, s);
    for (let i = 0; i < show; i++) {
      const zz = z + 0.48 + i * 0.4,
        jx = (hash(i * 3.1 + seed) - 0.5) * 0.7,
        jy = (hash(i * 7.3 + 11) - 0.5) * 0.5;
      let sh = flat(x0 + jx, y0 + jy, x1 + jx, y1 + jy, zz, "f-paper", "ol f");
      if (i === show - 1)
        sh +=
          ln(
            at(x0 + jx + 0.9, y0 + jy + 1.6, zz),
            at(x1 + jx - 0.9, y0 + jy + 1.6, zz),
            "ol f",
          ) +
          ln(
            at(x0 + jx + 0.9, y0 + jy + 2.8, zz),
            at(x1 + jx - 2, y0 + jy + 2.8, zz),
            "ol f",
          );
      if (t0 !== null) sh = part("k-drop", t0 + 140 + i * 70, sh);
      else if (fresh && i === show - 1) sh = `<g class="land">${sh}</g>`;
      s += sh;
    }
    if (n > 8) {
      const c = at(x1 + 0.6, y0, z + 0.48 + show * 0.4 + 1.5),
        w = n > 99 ? 34 : 26;
      const b = `<rect class="badge-c" x="${r1(c[0] - w / 2)}" y="${r1(c[1] - 10)}" width="${w}" height="20" rx="7"/><text class="badge-t" x="${r1(c[0])}" y="${r1(c[1] + 4.6)}" text-anchor="middle">${n}</text>`;
      s +=
        t0 === null
          ? fresh
            ? `<g class="land">${b}</g>`
            : b
          : part("k-grow", t0 + 140 + show * 70 + 80, b);
    }
    return s;
  });
}
export function mugSvg(x, y, z, hot) {
  const h = 1.55,
    r = 0.72,
    top = at(x, y, z + h),
    rx = r * RX;
  return withOv(
    0,
    () =>
      cyl(x, y, z, z + h, r * 0.94, r, { shade: false }) +
      `<path class="ol" d="M${r1(top[0] + rx - 0.6)} ${r1(top[1] + 2.4)}c4.6 -0.4 5 6.4 0 6.6"/>` +
      `<ellipse class="f-ink72" cx="${r1(top[0])}" cy="${r1(top[1])}" rx="${r1(rx * 0.76)}" ry="${r1(rx * 0.38)}" opacity=".5"/>` +
      `<g class="steam${hot ? " on" : ""}">${[-3, 3, 0].map((dx) => `<path d="M${r1(top[0] + dx)} ${r1(top[1] - 3)}c3.5 -4 -3.5 -7 0 -12"/>`).join("")}</g>`,
  );
}
export const ITEMS = ["mug", "plant", "books", "photo"];
export function itemSvg(g, kind, hot, t0 = 0) {
  return withOv(0, () => {
    const { x, y, z } = g;
    if (kind === "mug") return part("k-drop", t0, mugSvg(x, y, z, hot));
    if (kind === "plant")
      return (
        part("k-drop", t0, cyl(x, y, z, z + 1.35, 0.62, 0.78)) +
        part("k-grow", t0 + 200, foliage(at(x, y, z + 1.3), "small", x * 0.3))
      );
    if (kind === "books")
      return part(
        "k-drop",
        t0,
        box(x - 1.8, y - 1, x + 1.6, y + 1.2, z, z + 0.65) +
          box(x - 1.5, y - 0.8, x + 1.4, y + 1, z + 0.65, z + 1.25, {
            top: "f-front",
          }),
      );
    return part(
      "k-drop",
      t0,
      quad(
        [
          at(x - 1.5, y, z),
          at(x + 1.5, y, z),
          at(x + 1.5, y - 0.4, z + 2.7),
          at(x - 1.5, y - 0.4, z + 2.7),
        ],
        "f-top",
      ) +
        quad(
          [
            at(x - 1, y - 0.05, z + 0.5),
            at(x + 1, y - 0.05, z + 0.5),
            at(x + 1, y - 0.33, z + 2.2),
            at(x - 1, y - 0.33, z + 2.2),
          ],
          "f-side",
          "ol f",
        ),
    );
  });
}
/** The desk: its thin frame rises, a drawer unit drops in, its top lands. Things on it are drawn separately. */
export function deskFrame(d, t0 = 0) {
  const zt = DK.top,
    zb = zt - 0.55;
  const s = withOv(0, () => {
    let legs = "";
    for (const [x, y] of [
      [d.x0 + 0.5, d.y0 + 0.5],
      [d.x1 - 1.05, d.y0 + 0.5],
      [d.x0 + 0.5, d.y1 - 1.05],
      [d.x1 - 1.05, d.y1 - 1.05],
    ])
      legs += box(x, y, x + 0.55, y + 0.55, 0, zb, {
        edges: "leg",
        hatch: false,
      });
    legs += ln(
      at(d.x0 + 0.8, d.y0 + 0.8, 1.5),
      at(d.x1 - 0.8, d.y0 + 0.8, 1.5),
      "ol",
    );
    return (
      part("k-rise", t0, legs) +
      part(
        "k-drop",
        t0 + 160,
        box(d.x1 - 7.5, d.y0 + 1.2, d.x1 - 1.5, d.y1 - 1.5, zb - 1.3, zb, {
          hatch: false,
        }) +
          ln(
            at(d.x1 - 5.5, d.y1 - 1.5, zb - 0.65),
            at(d.x1 - 3.5, d.y1 - 1.5, zb - 0.65),
            "ol",
          ),
      )
    );
  });
  return (
    s +
    withOv(0.55, () =>
      part("k-drop", t0 + 240, box(d.x0, d.y0, d.x1, d.y1, zt - 0.42, zt)),
    )
  );
}
/** What the desk throws on the floor: a wide soft shadow and a closer, denser one, dark in either theme. */
export const deskShade = (d) => {
  const cx = (d.x0 + d.x1) / 2 + 1,
    cy = (d.y0 + d.y1) / 2 + 1.2;
  return (
    ellipseAt(cx, cy, 0, 150, 58, "f-soft") +
    ellipseAt(cx + 0.3, cy + 0.3, 0, 98, 36, "f-soft")
  );
};

// ---- rooms and commons

export function shelfSvg(x0, y0, x1, y1, h, face, seed, t0 = 0) {
  let s = withOv(0.35, () =>
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
      let u = 0.5,
        k = 0;
      while (u < len - 0.8) {
        const w = 0.55 + 0.6 * hash(seed + ri * 31 + k),
          bh = 2.2 + 1.1 * hash(seed + ri * 17 + k * 3),
          dark = hash(seed + k * 7 + ri) < 0.16,
          lean = hash(seed + k * 13 + ri) < 0.08;
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
                at(x0 + u + w + (lean ? 0.7 : 0), y1 + 0.03, zb + bh),
                at(x0 + u + (lean ? 0.7 : 0), y1 + 0.03, zb + bh),
              ];
        b += quad(q, dark ? "f-ink72" : "f-book", "ol f");
        u += w + (hash(seed + k * 5 + ri) < 0.15 ? 1.4 : 0.05);
        k++;
      }
      const a =
          face === "x"
            ? at(x1 + 0.03, y0, zb - 0.1)
            : at(x0, y1 + 0.03, zb - 0.1),
        e =
          face === "x"
            ? at(x1 + 0.03, y1, zb - 0.1)
            : at(x1, y1 + 0.03, zb - 0.1);
      b += ln(a, e, "ol");
    });
    return b;
  });
  return s + part("k-fade", t0 + 260, books);
}
export const sofaSvg = (x0, y0, x1, t0 = 0) =>
  withOv(0.25, () =>
    part(
      "k-drop",
      t0,
      ellipseAt((x0 + x1) / 2 + 1, y0 + 4, 0, (x1 - x0) * 6.4, 40, "f-soft") +
        box(x0, y0, x1, y0 + 2.5, 0, 6.2) +
        box(x0, y0 + 2.5, x1, y0 + 6.2, 0, 3.2) +
        box(x0 + 0.8, y0 + 2.6, (x0 + x1) / 2 - 0.2, y0 + 5.8, 3.2, 3.8, {
          hatch: false,
        }) +
        box((x0 + x1) / 2 + 0.2, y0 + 2.6, x1 - 0.8, y0 + 5.8, 3.2, 3.8, {
          hatch: false,
        }) +
        box(x0 - 0.6, y0, x0 + 1, y0 + 6.2, 0, 4.5) +
        box(x1 - 1, y0, x1 + 0.6, y0 + 6.2, 0, 4.5),
    ),
  );
export const armchairSvg = (x, y, t0 = 0) =>
  withOv(0.2, () =>
    part(
      "k-drop",
      t0,
      ellipseAt(x + 0.6, y + 0.8, 0, 52, 22, "f-soft") +
        box(x - 3, y - 3, x + 3, y - 1.4, 0, 6.6) +
        box(x - 3, y - 1.4, x + 3, y + 3, 0, 3.4) +
        box(x - 2.4, y - 1.3, x + 2.4, y + 2.6, 3.4, 4, { hatch: false }) +
        box(x - 3.6, y - 3, x - 2.4, y + 3, 0, 4.6) +
        box(x + 2.4, y - 3, x + 3.6, y + 3, 0, 4.6),
    ),
  );
export function lowTableSvg(x0, y0, x1, y1, t0 = 0) {
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
      part("k-drop", t0 + 160, box(x0, y0, x1, y1, 2.8, 3.4)) +
      part(
        "k-drop",
        t0 + 300,
        box(x0 + 2, y0 + 1.2, x0 + 5.6, y0 + 3.6, 3.4, 3.85, {
          top: "f-paper",
          hatch: false,
        }) + mugSvg(x1 - 3, y0 + 2.4, 3.4, false),
      )
    );
  });
}
/** A coffee counter: against the back wall, or an island with stools; steam rises while it brews. */
/** Where the brew's steam starts, and the steam itself: drawn apart from the counter so it can sit on the moving sheet. */
export const steamAt = (x0, y0, island) =>
  at(x0 + (island ? 8 : 2) + 2, y0 + 1 + 3.85, 8.6);
export const steamSvg = (st) =>
  `<g class="steam" data-steam>${[0, -5, 5].map((dx) => `<path d="M${r1(st[0] + dx)} ${r1(st[1] - 2)}c4.5 -6 -4.5 -10 0 -18"/>`).join("")}</g>`;
export function coffeeSvg(x0, y0, island, t0 = 0, steam = true) {
  const w = island ? 20 : 18,
    d = island ? 6 : 5,
    x1 = x0 + w,
    y1 = y0 + d;
  let s = withOv(0.35, () =>
    part(
      "k-rise",
      t0,
      ellipseAt(
        (x0 + x1) / 2 + 1,
        y0 + d / 2 + 1,
        0,
        w * 7.2,
        w * 2.8,
        "f-soft",
      ) + box(x0, y0, x1, y1, 0, 7.2, { top: "f-top" }),
    ),
  );
  s += withOv(0, () => {
    let doors = "";
    for (let x = x0 + 4.5; x < x1 - 1; x += 4.5)
      doors += ln(at(x, y1, 0.6), at(x, y1, 6.6), "ol f");
    return part("k-fade", t0 + 120, doors);
  });
  const mx = x0 + (island ? 8 : 2),
    my = y0 + 1;
  s += withOv(0, () =>
    part(
      "k-drop",
      t0 + 240,
      box(mx, my, mx + 4, my + 3.2, 7.2, 12.2, { front: "f-front" }) +
        quad(
          [
            at(mx + 0.5, my + 3.21, 8.4),
            at(mx + 3.5, my + 3.21, 8.4),
            at(mx + 3.5, my + 3.21, 11.6),
            at(mx + 0.5, my + 3.21, 11.6),
          ],
          "f-lid",
          "ol f",
        ) +
        box(mx + 1.4, my + 3.2, mx + 2.6, my + 3.9, 9.6, 10.4, {
          hatch: false,
        }) +
        cyl(mx + 2, my + 3.85, 7.2, 8.4, 0.55, 0.62, { shade: false }),
    ),
  );
  s += withOv(0, () =>
    part(
      "k-drop",
      t0 + 360,
      cyl(mx + 6.4, my + 1.6, 7.2, 8.6, 0.55, 0.62, { shade: false }) +
        cyl(mx + 8, my + 2.2, 7.2, 8.6, 0.55, 0.62, { shade: false }) +
        cyl(mx + 7.2, my + 0.9, 7.2, 8.6, 0.55, 0.62, { shade: false }),
    ),
  );
  if (steam) s += steamSvg(steamAt(x0, y0, island));
  if (island)
    s += withOv(0, () =>
      part(
        "k-drop",
        t0 + 480,
        [x0 + 4, x0 + 10, x0 + 16]
          .map(
            (x) =>
              cyl(x, y1 + 3.2, 4.6, 5.2, 1.25, 1.25, { shade: false }) +
              ln(at(x, y1 + 3.2, 0.3), at(x, y1 + 3.2, 4.6), "ol s") +
              ellipseAt(x, y1 + 3.2, 1.6, RX * 0.85, RX * 0.42, "ol f"),
          )
          .join(""),
      ),
    );
  return s;
}
// ---- the walls: the lift, the digital clock, the office board

/** Seven segments in a 20 by 36 cell, as Thursday's scoreboard draws them; those not lit show as a ghost. */
export const SEGS = {
  a: [
    [2.3, 1.7],
    [4, 0],
    [16, 0],
    [17.7, 1.7],
    [16, 3.4],
    [4, 3.4],
  ],
  g: [
    [2.3, 18],
    [4, 16.3],
    [16, 16.3],
    [17.7, 18],
    [16, 19.7],
    [4, 19.7],
  ],
  d: [
    [2.3, 34.3],
    [4, 32.6],
    [16, 32.6],
    [17.7, 34.3],
    [16, 36],
    [4, 36],
  ],
  f: [
    [1.7, 2.3],
    [3.4, 4],
    [3.4, 15.7],
    [1.7, 17.4],
    [0, 15.7],
    [0, 4],
  ],
  e: [
    [1.7, 18.6],
    [3.4, 20.3],
    [3.4, 32],
    [1.7, 33.7],
    [0, 32],
    [0, 20.3],
  ],
  b: [
    [18.3, 2.3],
    [20, 4],
    [20, 15.7],
    [18.3, 17.4],
    [16.6, 15.7],
    [16.6, 4],
  ],
  c: [
    [18.3, 18.6],
    [20, 20.3],
    [20, 32],
    [18.3, 33.7],
    [16.6, 32],
    [16.6, 20.3],
  ],
};
export const DIGITS = [
  "abcdef",
  "bc",
  "abdeg",
  "abcdg",
  "bcfg",
  "acdfg",
  "acdefg",
  "abc",
  "abcdefg",
  "abcdfg",
];
export function segments(text, h) {
  const k = h / 36,
    adv = 24.5 * k,
    colW = 9 * k;
  let x = 0,
    off = "",
    on = "",
    colon = "";
  for (const ch of text) {
    if (ch === ":") {
      const sq = 3.6 * k;
      for (const yy of [10.5, 23])
        colon += `<rect x="${r2(x + 2 * k)}" y="${r2(yy * k)}" width="${r2(sq)}" height="${r2(sq)}" rx="${r2(sq * 0.22)}"/>`;
      x += colW;
      continue;
    }
    const lit = DIGITS[+ch] || "";
    for (const [name, pts] of Object.entries(SEGS)) {
      const pg = `<polygon points="${pts.map(([px, py]) => `${r2(x + px * k)},${r2(py * k)}`).join(" ")}"/>`;
      if (lit.includes(name)) on += pg;
      else off += pg;
    }
    x += adv;
  }
  return { off, on, colon, width: x - 4.5 * k };
}
/**
 * The office board, a departures board standing behind the left wall: the time and each person in
 * rows of flaps (who, status, what they are on, papers on the desk). A flap flips when its letter changes.
 */
export const FB = { w: 940, h: 400, post: 140, cw: 21, gap: 2.6 };
export function flapBoard(matrix, t0 = 0) {
  return (
    `<g class="board-hit" transform="${matrix}">` +
    part(
      "k-fade",
      t0,
      `<rect class="sb-post" x="118" y="${FB.h - 8}" width="3" height="${FB.post}"/><rect class="sb-post" x="${FB.w - 121}" y="${FB.h - 8}" width="3" height="${FB.post}"/><rect class="fb-frame" x="1" y="1" width="${FB.w - 2}" height="${FB.h - 2}" rx="12"/>`,
    ) +
    `<g data-board></g></g>`
  );
}
/** A mini-me's face held still, `size` across, for the scoreboard's list. */
export function stillMark(look, x, y, size) {
  const shape = SHAPES[look.shape] || SHAPES.b113,
    k = size / 240,
    pts = shape.map(([px, py]) => [CX + px * R, CY + py * R]);
  const eye = (side) => {
    const hw = EYE.w / 2,
      hh = EYE.h / 2,
      ex = CX + side * EYE.sep,
      ey = CY + EYE.y,
      out = [];
    for (let i = 0; i < 26; i++) {
      const th = (i / 26) * TAU,
        co = Math.cos(th),
        si = Math.sin(th);
      out.push([
        ex + Math.sign(co) * Math.abs(co) ** (2 / EYE.n) * hw,
        ey + Math.sign(si) * Math.abs(si) ** (2 / EYE.n) * hh,
      ]);
    }
    return pathOf(out);
  };
  const fill = look.paint
    ? `url(#sm-${look.paint})`
    : look.color === "system"
      ? "var(--ink)"
      : look.color;
  return `<g transform="translate(${r1(x)} ${r1(y)}) scale(${r3(k)})"><path d="${pathOf(pts)}" style="fill:${fill}"/><path class="sm-eye" d="${eye(-1)}"/><path class="sm-eye" d="${eye(1)}"/></g>`;
}
export const SM_DEFS = `<defs><linearGradient id="sm-rainbow" x1="0" y1="0" x2="0" y2="1">${PAINTS.rainbow.colors.map((c, i, a) => `<stop offset="${r3(i / (a.length - 1))}" stop-color="${c}"/>`).join("")}</linearGradient><linearGradient id="sm-duo" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PAINTS.duo.colors[0]}"/><stop offset="1" stop-color="${PAINTS.duo.colors[1]}"/></linearGradient></defs>`;
/** A run of flaps: one cell per letter, its split across the middle; letters that changed since `was` flip, one after another. */
export function flaps(
  x,
  y,
  text,
  n,
  cls,
  was = "",
  d0 = 0,
  cw = FB.cw,
  chH = 30,
  fs = 21,
) {
  const t = text.toUpperCase().padEnd(n).slice(0, n),
    w = was.toUpperCase().padEnd(n).slice(0, n),
    step = cw + FB.gap;
  let bg = "",
    split = "",
    letters = "";
  for (let i = 0; i < n; i++) {
    const cx = x + i * step;
    bg += `M${r1(cx)} ${y}h${cw}v${chH}h${-cw}z`;
    split += `M${r1(cx)} ${y + chH / 2}h${cw}`;
    if (t[i] !== " ")
      letters += `<text class="${cls}${t[i] !== w[i] ? " fb-flip" : ""}" x="${r1(cx + cw / 2)}" y="${r1(y + chH / 2 + fs * 0.36)}" font-size="${fs}" text-anchor="middle"${t[i] !== w[i] ? ` style="animation-delay:${Math.round((d0 + i * 32) / 90) * 90}ms"` : ""}>${esc(t[i])}</text>`;
  }
  return `<path class="fb-cell" d="${bg}"/><path class="fb-split" d="${split}"/>${letters}`;
}
/**
 * What the board shows: the floor, the date and time, and the team, those who need a decision first.
 * `was` holds the last rows, to flip what changed. `W` are its words in the screen's language.
 */
export function flapFace(st, crew, now, was, W) {
  const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let s =
    SM_DEFS +
    `<text class="fb-head" x="32" y="56">${esc(st.label)}</text><text class="fb-sub" x="32" y="84">${esc(W.date(now))} · ${esc(W.in(st.in))}${st.off ? ` · ${esc(W.off(st.off))}` : ""}</text>`;
  s += flaps(
    FB.w - 32 - 5 * 48 - 4 * FB.gap,
    24,
    hm,
    5,
    "fb-clock",
    was.clock || "",
    0,
    48,
    64,
    50,
  );
  const cols = {
    who: 70,
    status: 70 + 7 * (FB.cw + FB.gap) + 18,
    now: 70 + 16 * (FB.cw + FB.gap) + 36,
    desk: FB.w - 32 - 2 * FB.cw - FB.gap,
  };
  s += `<text class="fb-cap" x="${cols.who}" y="118">${esc(W.who)}</text><text class="fb-cap" x="${cols.status}" y="118">${esc(W.status)}</text><text class="fb-cap" x="${cols.now}" y="118">${esc(W.on)}</text><text class="fb-cap" x="${cols.desk}" y="118">${esc(W.desk)}</text>`;
  crew.slice(0, 8).forEach((c, i) => {
    const y = 130 + i * 33,
      w =
        was.rows && was.rows[i]
          ? was.rows[i]
          : { name: "", status: "", now: "", desk: "" },
      hot = c.state === "ask" && c.mine;
    s += stillMark(c.look, 32, y + 1, 28);
    s += flaps(
      cols.who,
      y,
      c.name,
      7,
      c.state === "off" ? "fb-l fb-faint" : "fb-l",
      w.name,
      i * 40,
    );
    s += flaps(
      cols.status,
      y,
      c.status,
      9,
      hot ? "fb-l fb-hot" : c.state === "off" ? "fb-l fb-faint" : "fb-l",
      w.status,
      i * 40 + 60,
    );
    s += flaps(cols.now, y, c.now, 14, "fb-l fb-dim", w.now, i * 40 + 120);
    s += flaps(cols.desk, y, String(c.desk), 2, "fb-l", w.desk, i * 40 + 180);
  });
  return s;
}
/** Roughly how wide a line of capitals is, in ems: wide scripts take a whole em a letter. */
const emsOf = (text) =>
  [...text].reduce(
    (n, ch) =>
      n +
      (/[\u1100-\u11ff\u2e80-\ua4cf\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]/.test(
        ch,
      )
        ? 1
        : ch === " "
          ? 0.3
          : 0.7),
    0,
  );
/** The largest size up to `max` at which `text` fits `width`. */
export const fitSize = (text, max, width) =>
  r1(Math.min(max, width / Math.max(1, emsOf(text))));
/** The office's state painted large on the ground at four o'clock: a boxed sign with chevrons running while
 * the mini-mes are at work, YOUR TURN filled in ember when a decision waits for you, a tick when all is clear. */
export const SIGN = { w: 700, h: 240 };
export function signWords(sign, W) {
  const you = sign === "you";
  let s = `<rect class="gs-box${you ? " e" : ""}" x="12" y="20" width="676" height="200" rx="34"/>`;
  if (sign === "work")
    s += `<g>${[0, 1, 2].map((i) => `<path class="gs-ch" data-ch="${i}" d="M${64 + i * 46} 78l38 42l-38 42"/>`).join("")}</g><text class="gs-word" x="236" y="152" font-size="${fitSize(W.work, 90, 430)}">${esc(W.work)}</text>`;
  else if (you)
    s += `<text class="gs-word e" x="52" y="156" font-size="${fitSize(W.you, 98, 600)}">${esc(W.you)}</text>`;
  else
    s += `<path class="gs-tick" d="M66 124l34 32l66 -72"/><text class="gs-word q" x="206" y="150" font-size="${fitSize(W.quiet, 78, 450)}">${esc(W.quiet)}</text>`;
  return s;
}
export const LIFT_X = 46,
  LIFT_W = 22;
export const liftH = (wallH) => Math.min(wallH - 3.6, 21);
/** The lift lobby: a frame standing out from the wall, two doors, the floor in seven segments above, a call panel beside. */
export function liftSvg(lx, open, floorNo, wallH, doors = true) {
  const h = liftH(wallH),
    w = LIFT_W;
  let s = withOv(0.5, () =>
    box(lx - 1.4, -0.8, lx + w + 1.4, 0, 0, h + 1.4, {
      front: "f-front",
      side: "f-side",
      top: "f-top",
      hatch: false,
      line: "ol s",
    }),
  );
  if (doors) s += `<g data-liftdoors>${liftDoors(lx, open, h)}</g>`;
  const cx = lx + w / 2;
  if (h + 6.6 <= wallH) {
    s += withOv(0, () =>
      wallRect(cx - 5, h + 2.4, cx + 5, h + 6.2, "f-screen", 0.06, "ol f"),
    );
    s += `<g transform="${planeM(cx - 1.2, 0.09, h + 5.7)}"><g class="lift-seg" transform="skewX(-7)">${segments(String(floorNo), 2.9).on}</g></g>`;
    s += `<g transform="${planeM(cx - 4, 0.09, h + 5.6)}"><path class="lift-arr" d="M0 1.2L.9 0L1.8 1.2ZM0 1.9L.9 3.1L1.8 1.9Z"/></g>`;
  } else
    s += `<text class="wtext" transform="${wallM(cx - 1.6, h + 0.95)}" font-size="1">${floorNo}F</text>`;
  s += withOv(0, () =>
    wallRect(lx + w + 2.8, 6.4, lx + w + 5, 11, "f-paper", 0.05, "ol f"),
  );
  s += `<g transform="${planeM(lx + w + 3.9, 0.08, 10.2)}"><circle class="lift-btn" cx="0" cy="0" r=".55"/><circle class="lift-btn" cx="0" cy="2.4" r=".55"/></g>`;
  return s;
}
export function liftDoors(lx, open, h) {
  return withOv(0, () => {
    const w = LIFT_W,
      half = (w - 1) / 2,
      g = (half - 0.3) * open,
      y = 0.06,
      a = lx + 0.5,
      b = lx + w - 0.5;
    const l = [
        at(a, y, 0),
        at(a + half - g, y, 0),
        at(a + half - g, y, h),
        at(a, y, h),
      ],
      r = [
        at(b - half + g, y, 0),
        at(b, y, 0),
        at(b, y, h),
        at(b - half + g, y, h),
      ];
    let s = "";
    if (open > 0.02)
      s +=
        poly(
          [
            at(a + half - g, y, 0),
            at(b - half + g, y, 0),
            at(b - half + g, y, h),
            at(a + half - g, y, h),
          ],
          "f-ink72",
        ) +
        poly(
          [
            at(a + half - g, y + 0.01, h - 1.2),
            at(b - half + g, y + 0.01, h - 1.2),
            at(b - half + g, y + 0.01, h - 0.6),
            at(a + half - g, y + 0.01, h - 0.6),
          ],
          "f-lamp",
        );
    s +=
      poly(l, "f-side") +
      poly(r, "f-side") +
      ln(l[1], l[2], "ol f") +
      ln(r[0], r[3], "ol f");
    s +=
      ln(
        at(a + (half - g) / 2, y + 0.01, h * 0.45),
        at(a + (half - g) / 2, y + 0.01, h * 0.55),
        "ol g",
      ) +
      ln(
        at(b - (half - g) / 2, y + 0.01, h * 0.45),
        at(b - (half - g) / 2, y + 0.01, h * 0.55),
        "ol g",
      );
    return s;
  });
}
/** The way in, marked on the floor in front of the lift: a wide mat, the word, and arrows out and in. */
export function liftMark(lx, word) {
  const x0 = lx - 2.5,
    x1 = lx + LIFT_W + 2.5,
    q = [at(x0, 0.6), at(x1, 0.6), at(x1, 12), at(x0, 12)];
  const arrow = (x, out) => {
    const [y0, y1] = out ? [6.2, 10] : [10, 6.2];
    return `<path class="lmark-l" d="M${P([at(x, y0)])}L${P([at(x, y1)])}M${P([at(x - 1.4, y1 + (out ? -1.5 : 1.5))])}L${P([at(x, y1)])}L${P([at(x + 1.4, y1 + (out ? -1.5 : 1.5))])}"/>`;
  };
  return (
    poly(q, "lmark") +
    withOv(
      0,
      () =>
        ln(q[0], q[1], "ol c") +
        ln(q[1], q[2], "ol c") +
        ln(q[2], q[3], "ol c") +
        ln(q[3], q[0], "ol c"),
    ) +
    floorText(
      word,
      lx + 1,
      5,
      Math.min(2.6, 12 / Math.max(1, emsOf(word))),
      "lmark-t",
    ) +
    arrow(lx + LIFT_W - 6, true) +
    arrow(lx + LIFT_W - 2, false)
  );
}
/** The company's name painted big on the back wall, when the wall is tall enough to carry it. */
export function wallBrand(x0, wallH) {
  const size = Math.min(14, (wallH - 12) * 0.62);
  if (size < 7) return "";
  return `<text class="tname brand" transform="${wallM(x0, wallH * 0.5 + size * 0.36)}" font-size="${r2(size)}">${BRAND}</text>`;
}
/**
 * The company's building, for the opening: storeys stacking up from the ground one after another,
 * a roof with the name standing on it, windows coming on. Ours is the top storey, its floor at z 0,
 * so when the roof lifts away the office below is the one the app runs in.
 */
export function towerSvg(W, D, H, N) {
  const z00 = -(N - 1) * H,
    bays = (len) => Math.max(3, Math.round(len / 10)),
    nb = bays(W),
    nd = bays(D),
    top = H;
  let s =
    `<g class="tw-ground">` +
    withOv(
      0,
      () =>
        ln(at(-60, D, z00), at(W + 60, D, z00), "ol c") +
        ln(at(W, -60, z00), at(W, D + 60, z00), "ol c") +
        ln(at(-60, 0, z00), at(0, 0, z00), "ol c") +
        ln(at(0, D, z00), at(0, D + 60, z00), "ol c"),
    ) +
    ellipseAt(
      W / 2 + 6,
      D / 2 + 6,
      z00,
      (W + D) * 5.2,
      (W + D) * 2.4,
      "f-soft",
    ) +
    `</g>`;
  for (let k = 0; k < N; k++) {
    const z0 = z00 + k * H,
      z1 = z0 + H,
      d = 160 + k * 170,
      last = k === N - 1;
    const slab = withOv(0.5, () =>
      box(0, 0, W, D, z0, z0 + 1.4, {
        top: "f-top",
        front: "f-front",
        side: "f-side",
        hatch: false,
        line: "ol s",
      }),
    );
    const front = [
        at(0, D, z0 + 1.4),
        at(W, D, z0 + 1.4),
        at(W, D, z1),
        at(0, D, z1),
      ],
      side = [
        at(W, 0, z0 + 1.4),
        at(W, D, z0 + 1.4),
        at(W, D, z1),
        at(W, 0, z1),
      ];
    let glass = poly(front, "tw-glass") + poly(side, "tw-glass s");
    for (let i = 0; i < nb; i++)
      if (hash(i * 3.17 + k * 7.71) < 0.38)
        glass += `<polygon class="tw-lit" style="--d:${1250 + Math.round(hash(i + k * 9) * 700)}ms" points="${P([at((W * i) / nb + 0.7, D, z0 + 2.4), at((W * (i + 1)) / nb - 0.7, D, z0 + 2.4), at((W * (i + 1)) / nb - 0.7, D, z1 - 1.8), at((W * i) / nb + 0.7, D, z1 - 1.8)])}"/>`;
    for (let i = 0; i < nd; i++)
      if (hash(i * 5.3 + k * 2.9 + 1) < 0.38)
        glass += `<polygon class="tw-lit" style="--d:${1250 + Math.round(hash(i * 2 + k) * 700)}ms" points="${P([at(W, (D * i) / nd + 0.7, z0 + 2.4), at(W, (D * (i + 1)) / nd - 0.7, z0 + 2.4), at(W, (D * (i + 1)) / nd - 0.7, z1 - 1.8), at(W, (D * i) / nd + 0.7, z1 - 1.8)])}"/>`;
    glass += withOv(0, () => {
      let m =
        ln(at(0, D, z1 - 1), at(W, D, z1 - 1), "ol f") +
        ln(at(W, 0, z1 - 1), at(W, D, z1 - 1), "ol f") +
        ln(at(0, D, z0 + 1.4), at(0, D, z1), "ol s") +
        ln(at(W, D, z0 + 1.4), at(W, D, z1), "ol s") +
        ln(at(W, 0, z0 + 1.4), at(W, 0, z1), "ol s");
      for (let i = 1; i < nb; i++) {
        const x = (W * i) / nb;
        m += ln(at(x, D, z0 + 1.4), at(x, D, z1), "ol f");
      }
      for (let i = 1; i < nd; i++) {
        const y = (D * i) / nd;
        m += ln(at(W, y, z0 + 1.4), at(W, y, z1), "ol f");
      }
      return m;
    });
    s += `<g class="tw-st${last ? " tw-top" : ""}" style="--d:${d}ms">${slab}<g class="tw-cut">${glass}</g></g>`;
  }
  const zr = top,
    size = Math.min(26, W * 0.07);
  let roof = withOv(0.5, () =>
    box(-0.8, -0.8, W + 0.8, D + 0.8, zr, zr + 1.8, {
      top: "f-top",
      front: "f-front",
      side: "f-side",
      hatch: false,
      line: "ol s",
    }),
  );
  roof += withOv(
    0.4,
    () =>
      box(
        W * 0.62,
        D * 0.18,
        W * 0.62 + 22,
        D * 0.18 + 14,
        zr + 1.8,
        zr + 7.5,
        { hatch: false },
      ) +
      box(W * 0.2, D * 0.24, W * 0.2 + 10, D * 0.24 + 10, zr + 1.8, zr + 4.5, {
        hatch: false,
      }),
  );
  roof += `<g class="tw-sign"><text class="tw-name" transform="${plane([W * 0.06, D - 3, zr + 1.8 + size * 0.74], [1, 0, 0], [0, 0, -1])}" font-size="${r2(size)}">${BRAND}</text></g>`;
  s += `<g class="tw-roof" style="--d:${160 + N * 170}ms">${roof}</g>`;
  // the rush of it: lines running up past the building as it climbs
  let gust = "";
  for (let i = 0; i < 7; i++) {
    const right = i % 2 === 0,
      off = 14 + hash(i * 4.4) * 30,
      t = 140 + i * 150,
      z1 = z00 + (zr - z00) * (0.5 + hash(i * 2.2) * 0.5);
    const a = right
        ? at(W + off, D * (0.25 + hash(i) * 0.6), z00 + 4)
        : at(W * (0.2 + hash(i + 3) * 0.6), D + off, z00 + 4),
      b = right
        ? at(W + off, D * (0.25 + hash(i) * 0.6), z1)
        : at(W * (0.2 + hash(i + 3) * 0.6), D + off, z1);
    gust += `<path class="tw-gust" style="--d:${t}ms" pathLength="1" d="M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}"/>`;
  }
  return `<g class="tw">${s}${gust}</g>`;
}
/**
 * The way in, for the sign-in screen: the same building with its street. A door and a canopy on the ground
 * floor, a pavement with a few trees, little mini-mes hopping along it and in at the door, and a note
 * pointing at the top storey, which is ours. `walkers` are looks: { color, shape, paint }.
 */
export function lobbySvg(W, D, H, N, walkers, words) {
  const z00 = -(N - 1) * H,
    cx = W * 0.5;
  // the pavement and the kerb, drawn on the ground before anything stands on it
  let g = withOv(
    0,
    () =>
      ln(at(-80, D + 9, z00), at(W + 30, D + 9, z00), "ol c") +
      ln(at(-80, D + 24, z00), at(W + 80, D + 24, z00), "ol f") +
      ln(at(W + 9, -80, z00), at(W + 9, D + 9, z00), "ol c") +
      ln(at(W + 24, -80, z00), at(W + 24, D + 24, z00), "ol f"),
  );
  for (let x = -70; x < W + 70; x += 16)
    g += withOv(0, () =>
      ln(at(x, D + 24, z00), at(x + 1.6, D + 28, z00), "ol g"),
    );
  for (let y = -70; y < D + 20; y += 16)
    g += withOv(0, () =>
      ln(at(W + 24, y, z00), at(W + 28, y + 1.6, z00), "ol g"),
    );
  // our floor, the top one, warmly marked once the building stands
  const zt0 = 1.4,
    zt1 = H,
    band = (q) => `<polygon class="tw-ours" points="${P(q)}"/>`;
  const ours =
    band([at(0, D, zt0), at(W, D, zt0), at(W, D, zt1), at(0, D, zt1)]) +
    band([at(W, 0, zt0), at(W, D, zt0), at(W, D, zt1), at(W, 0, zt1)]);
  // the door: a canopy over two glass leaves, lit from inside, the building's name over it
  const dw = 12,
    dz = z00 + 1.4,
    dh = Math.min(H * 0.7, 21);
  let door = withOv(0.4, () =>
    box(cx - dw - 3, D, cx + dw + 3, D + 7, dz + dh + 0.6, dz + dh + 2.4, {
      hatch: false,
      line: "ol s",
    }),
  );
  door += poly(
    [
      at(cx - dw, D + 0.05, dz),
      at(cx + dw, D + 0.05, dz),
      at(cx + dw, D + 0.05, dz + dh),
      at(cx - dw, D + 0.05, dz + dh),
    ],
    "f-ink72",
  );
  door += `<polygon class="tw-doorlit" points="${P([at(cx - dw + 0.7, D + 0.06, dz), at(cx + dw - 0.7, D + 0.06, dz), at(cx + dw - 0.7, D + 0.06, dz + dh - 0.7), at(cx - dw + 0.7, D + 0.06, dz + dh - 0.7)])}"/>`;
  door += withOv(
    0,
    () =>
      ln(at(cx, D + 0.07, dz), at(cx, D + 0.07, dz + dh - 0.7), "ol s") +
      ln(at(cx - dw, D + 0.07, dz), at(cx - dw, D + 0.07, dz + dh), "ol s") +
      ln(at(cx + dw, D + 0.07, dz), at(cx + dw, D + 0.07, dz + dh), "ol s"),
  );
  door += `<text class="tw-door-t" transform="${plane([cx - dw + 0.5, D + 7.05, dz + dh + 1.05], [1, 0, 0], [0, 0, -1])}" font-size="1.5">${BRAND}  ·  ${esc(words.floors(N))}</text>`;
  // trees along the kerb and down the side street, in front of the building
  const tree = (x, y, k) => {
    const c = at(x, y, z00 + 24 * k),
      r = 105 * k;
    let o = withOv(
      0.3,
      () =>
        ellipseAt(x + 1, y + 1.4, z00, 120 * k, 44 * k, "f-soft") +
        cyl(x, y, z00, z00 + 15 * k, 0.9 * k, 0.7 * k, { shade: false }),
    );
    o += `<circle class="f-top" cx="${r1(c[0])}" cy="${r1(c[1])}" r="${r1(r)}"/>`;
    for (let i = 0; i < 10; i++) {
      const a0 = (i / 10) * TAU + hash(x + i) * 0.4,
        a1 = a0 + TAU / 10 + 0.14;
      o += `<path class="ol" d="M${r1(c[0] + Math.cos(a0) * r)} ${r1(c[1] + Math.sin(a0) * r)}Q${r1(c[0] + Math.cos((a0 + a1) / 2) * r * 1.18)} ${r1(c[1] + Math.sin((a0 + a1) / 2) * r * 1.18)} ${r1(c[0] + Math.cos(a1) * r)} ${r1(c[1] + Math.sin(a1) * r)}"/>`;
    }
    o += `<path class="ol f" d="M${r1(c[0] - r * 0.35)} ${r1(c[1] + r * 0.1)}q${r1(r * 0.2)} ${r1(-r * 0.25)} ${r1(r * 0.42)} ${r1(-r * 0.08)}M${r1(c[0] + r * 0.05)} ${r1(c[1] + r * 0.42)}q${r1(r * 0.18)} ${r1(-r * 0.2)} ${r1(r * 0.36)} ${r1(-r * 0.04)}"/>`;
    return o;
  };
  let trees = "";
  for (const [x, y, k] of [
    [-30, D + 16.5, 0.95],
    [W * 0.17, D + 16.5, 1],
    [W * 0.8, D + 16.5, 1.08],
    [W + 16.5, D * 0.32, 1],
    [W + 16.5, D * 0.74, 0.92],
  ])
    trees += tree(x, y, k);
  // people coming to work: along the pavement from either end, a hop each step, and in at the door
  let walk = "";
  walkers.slice(0, 5).forEach((look, i) => {
    const fromLeft = i % 2 === 0,
      y = D + 13 + (i % 3) * 1.8,
      x0 = fromLeft ? -80 : W + 70,
      a = at(x0, y, z00),
      b = at(cx + (fromLeft ? -4 : 4), y, z00),
      c = at(cx, D + 1, z00),
      T = 6.4 + (i % 3) * 0.9;
    walk += `<g class="cm" style="--x0:${r1(a[0])}px;--y0:${r1(a[1])}px;--x1:${r1(b[0])}px;--y1:${r1(b[1])}px;--x2:${r1(c[0])}px;--y2:${r1(c[1])}px;--T:${T}s;--d:${(1.5 + i * 1.3).toFixed(2)}s"><g class="cm-hop">${ellipseAt(0, 0, 0, 80, 26, "f-soft")}${stillMark(look, -110, -228, 220)}</g></g>`;
  });
  const note = scribble(
    words.yourFloor,
    at(W * 0.05, D, H * 0.6),
    -720,
    30,
    170,
  );
  return `<g class="lobby-art"><g class="lb-ground">${g}</g>${towerSvg(W, D, H, N)}<g class="tw-door" style="--d:160ms">${door}</g><g class="lb-ours">${ours}</g><g class="lb-trees">${trees}</g><g class="lb-walk">${SM_DEFS}${walk}</g><g class="lb-note">${note}</g></g>`;
}
/** The office's robot vacuum, drawn at the origin and moved about whole: a low disc, a bumper, a light. */
export function roombaSvg() {
  const top = at(0.6, -0.4, 1.05);
  return (
    withOv(
      0,
      () =>
        ellipseAt(0.3, 0.4, 0, 30, 12, "f-soft") +
        cyl(0, 0, 0, 0.95, 2.4, 2.3) +
        cyl(0, 0, 0.95, 1.05, 1.5, 1.45, { side: "f-side" }),
    ) + `<circle class="rb-led" cx="${r1(top[0])}" cy="${r1(top[1])}" r="1.4"/>`
  );
}
/** DONE thumped on the floor like a rubber stamp, by the desk whose request is answered. */
export const stampSvg = (x, y, word) =>
  `<g transform="${floorM(x, y)}"><g transform="rotate(-8)"><g class="stamp"><rect class="stamp-r" x="-1.1" y="-5.9" width="19.6" height="7.8" rx="1.4"/><text class="stamp-t" x="1.1" y="0" font-size="${fitSize(word, 5, 15)}">${esc(word)}</text></g></g></g>`;
/** A request folded into a paper plane, nose to the right. */
export const PLANE = `<path d="M15 0L-13 -7.5L-7 0L-13 9Z"/><path class="fold" d="M15 0L-7 0"/>`;
export function skyFor(mode) {
  if (mode !== "now") return mode;
  const h = new Date().getHours();
  return h >= 7 && h < 17
    ? "day"
    : (h >= 17 && h < 20) || h === 6
      ? "evening"
      : "night";
}

// ---- lettering on the floor: each team's name painted big in the walkway in front of it, who is in, and people's names at their desks

export function teamMark(a, x, y, t0, mine) {
  const size = Math.min(6.4, 34 / (a.team.length * 0.7));
  return (
    part(
      "k-draw",
      t0,
      `<text class="tname${mine ? " mine" : ""}" transform="${floorM(x, y)}" font-size="${r2(size)}">${esc(a.team.toUpperCase())}</text>`,
    ) +
    part(
      "k-fade",
      t0 + 200,
      `<g data-count="${esc(a.team)}" data-at="${r2(x + 0.3)},${r2(y + 2.9)}"></g>`,
    )
  );
}
export const countText = (x, y, t, W) =>
  `<text class="tcount" transform="${floorM(x, y)}" font-size="1.5">${esc(W.in(t.n - t.off))}${t.off ? ` · ${esc(W.off(t.off))}` : ""}${t.ask ? `<tspan class="on"> · ${esc(W.waiting(t.ask))}</tspan>` : ""}</text>`;
/** A person's name on the floor at the front of their desk; when their computer is off, an OFF tag beside it. */
export function deskLabel(d, name, off, offWord) {
  const x = d.x0 + 0.4,
    y = d.y1 + 4.6,
    size = 2,
    w = emsOf(name.toUpperCase()) * size * 0.86 + name.length * 0.12,
    tag = Math.max(2.5, emsOf(offWord) * 0.86 + 0.8);
  let s = `<text class="dname${off ? " off" : ""}" transform="${floorM(x, y)}" font-size="${size}">${esc(name.toUpperCase())}</text>`;
  if (off)
    s += `<g transform="${floorM(x + w + 0.9, y)}"><rect class="offc" x="0" y="${r2(-size * 1.02)}" width="${r2(size * tag)}" height="${r2(size * 1.3)}" rx="${r2(size * 0.32)}"/><text class="offt" x="${r2(size * 0.42)}" y="${r2(-size * 0.07)}" font-size="${r2(size * 0.8)}">${esc(offWord)}</text></g>`;
  return s;
}
/** A note written by hand beside a point, with an arrow drawn to it. */
export function scribble(text, p, dx, dy, size = 24, arrow = true) {
  const tx = p[0] + dx,
    ty = p[1] + dy,
    w = text.length * size * 0.36,
    k = Math.max(1, size / 24);
  let s = `<text class="hand" x="${r1(tx)}" y="${r1(ty)}" font-size="${size}">${esc(text)}</text>`;
  if (arrow) {
    const sx = dx > 0 ? tx - 6 * k : tx + w + 6 * k,
      sy = ty - size * 0.3,
      ex = p[0] + (dx > 0 ? 10 : -10) * k,
      ey = p[1] - 4 * k;
    const mx = (sx + ex) / 2 + (dy > 0 ? -1 : 1) * 14 * k,
      my = (sy + ey) / 2 - 10 * k;
    const ang = Math.atan2(ey - my, ex - mx),
      hl = 8 * k;
    s += `<path class="hand-l" pathLength="1" d="M${r1(sx)} ${r1(sy)}Q${r1(mx)} ${r1(my)} ${r1(ex)} ${r1(ey)}"/><path class="hand-l" d="M${r1(ex - Math.cos(ang - 0.45) * hl)} ${r1(ey - Math.sin(ang - 0.45) * hl)}L${r1(ex)} ${r1(ey)}L${r1(ex - Math.cos(ang + 0.5) * hl)} ${r1(ey - Math.sin(ang + 0.5) * hl)}"/>`;
  }
  return s;
}
