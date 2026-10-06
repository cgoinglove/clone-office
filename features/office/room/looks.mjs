// How each clone looks in the office and beside a colleague's name: a colour, a shape and sometimes
// one of Thursday's paints. Kept apart from the office itself so a list of colleagues can wear the
// same colours without loading the whole floor.

import { hashStr } from "./core.mjs";

/** Each colleague's mini-me wears a colour of its own; the viewer's is the ink. */
export const PALETTE = [
  "#10a65a",
  "#8B5CF6",
  "#EC4899",
  "#0098dc",
  "#6366F1",
  "#00a190",
  "#5ca100",
  "#D946EF",
  "#14B8A6",
];
export const SHAPE_KEYS = [
  "b7",
  "b23",
  "b41",
  "b58",
  "b77",
  "b90",
  "b7",
  "squircle",
  "b41",
];
/**
 * A colour, a shape and sometimes one of Thursday's paints. The colour goes by place in the relay's
 * list of members, so a small team's are all different and everyone sees the same colour on the
 * same colleague; the viewer's own is the ink.
 */
export function looksOf(p, index = 0) {
  if (p.mine) return { color: "system", shape: "b113", paint: null };
  const h = hashStr(p.id),
    k = h % 13,
    paint = k === 5 ? "rainbow" : k === 9 ? "duo" : null;
  return {
    color: PALETTE[index % PALETTE.length],
    shape:
      paint === "rainbow" && (h >>> 9) % 2
        ? "heart"
        : SHAPE_KEYS[(h >>> 4) % SHAPE_KEYS.length],
    paint,
  };
}
