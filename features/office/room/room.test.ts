import assert from "node:assert/strict";
import { test } from "node:test";
import { buildGrid, findPath, planFloor } from "./floor.mjs";
import { looksOf } from "./office.mjs";
import { clockFace, fitSize } from "./pieces.mjs";

const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i}`);

// The parts of a planned floor these tests look at (floor.mjs is untyped).
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface Floor {
  W: number;
  D: number;
  areas: { names: string[] }[];
  desks: (Box & { id: string | null; seat: [number, number] })[];
  lift: [number, number];
}
const plan = (n: number) =>
  planFloor([["Team", ids(n)]], 0) as unknown as Floor;

test("a floor gives everyone a desk, in areas of up to six, none overlapping", () => {
  for (const n of [1, 2, 5, 8, 13, 24]) {
    const fl = plan(n);
    const seated = fl.desks.filter((d: { id: string | null }) => d.id);
    assert.equal(seated.length, n, `${n} people`);
    for (const a of fl.areas) assert.ok(a.names.length <= 6);
    const boxes = fl.desks.map(
      (d: { x0: number; y0: number; x1: number; y1: number }) => d,
    );
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        assert.ok(
          a.x1 <= b.x0 || b.x1 <= a.x0 || a.y1 <= b.y0 || b.y1 <= a.y0,
          `desks ${i} and ${j} of ${n} overlap`,
        );
      }
    for (const d of fl.desks) assert.ok(d.x1 <= fl.W && d.y1 <= fl.D);
  }
});

test("a team splits evenly over its areas, on a floor no larger than its desks need", () => {
  assert.deepEqual(
    plan(7).areas.map((a) => a.names.length),
    [4, 3],
  );
  assert.deepEqual(
    plan(13).areas.map((a) => a.names.length),
    [5, 4, 4],
  );
  for (const n of [1, 2, 6, 7, 10, 24]) {
    const fl = plan(n);
    // a step past the furthest desk on either side, and deep enough for the commons by the lift
    assert.equal(fl.W, Math.max(110, ...fl.desks.map((d) => d.x1 + 14)));
    assert.equal(fl.D, Math.max(92, ...fl.desks.map((d) => d.y1 + 12)));
  }
});

test("a walk from the lift to a desk goes round what stands in the way", () => {
  const fl = plan(8);
  const desks = fl.desks.map(
    (d: { x0: number; y0: number; x1: number; y1: number }) => ({
      x0: d.x0,
      y0: d.y0,
      x1: d.x1,
      y1: d.y1,
    }),
  );
  buildGrid(fl, desks);
  const to = fl.desks[7].seat;
  const route = findPath(fl, fl.lift, to);
  assert.deepEqual(route[0], fl.lift);
  assert.deepEqual(route.at(-1), to);
  // every leg, sampled finely, stays off the desks (the ends may sit at a chair)
  for (let i = 1; i < route.length; i++) {
    const [ax, ay] = route[i - 1],
      [bx, by] = route[i];
    for (let k = 1; k < 20; k++) {
      const x = ax + ((bx - ax) * k) / 20,
        y = ay + ((by - ay) * k) / 20;
      const inside = desks.some(
        (d: { x0: number; y0: number; x1: number; y1: number }) =>
          x > d.x0 + 0.5 && x < d.x1 - 0.5 && y > d.y0 + 0.5 && y < d.y1 - 0.5,
      );
      assert.ok(!inside, `leg ${i} crosses a desk at ${x}, ${y}`);
    }
  }
});

test("a small team's mini-mes all wear different colours, the viewer's the ink", () => {
  const colours = ids(9).map((id, i) => looksOf({ id }, i).color);
  assert.equal(new Set(colours).size, 9);
  assert.equal(looksOf({ id: "me", mine: true }).color, "system");
  // the same colleague looks the same whoever is viewing
  assert.deepEqual(looksOf({ id: "m3" }, 3), looksOf({ id: "m3" }, 3));
});

test("words on the floor fit their space, wide scripts given more room", () => {
  assert.equal(fitSize("YOUR TURN", 98, 600), 98);
  assert.ok(fitSize("DU BIST JETZT DRAN", 98, 600) < 98);
  assert.ok(fitSize("내 차례입니다", 98, 300) < fitSize("MY TURN", 98, 300));
});

test("the clock tells the time and who is in, its words as text, never as markup", () => {
  const look = { color: "#000", shape: "b7", paint: null };
  const crew = [
    { in: true, look },
    { in: true, look },
    { in: false, look },
  ];
  const face = clockFace(new Date(2026, 9, 6, 21, 5), crew, {
    in: "<In>",
    twelve: false,
  });
  assert.ok(face.includes("&lt;In&gt;") && !face.includes("<In>"));
  assert.ok(face.includes(">2</tspan>") && face.includes(">/3</tspan>"));
  assert.equal(face.split('class="ck-in"').length - 1, 2);
  // one not in is an outline, without a face's fill or eyes
  assert.equal(face.split('class="sm-ghost"').length - 1, 1);
  // a twelve-hour day: 9 PM, its first digit left dark, the half of the day beside it
  const pm = clockFace(new Date(2026, 9, 6, 21, 5), crew, {
    in: "In",
    twelve: true,
    period: "PM",
    periodFirst: false,
  });
  assert.ok(pm.includes(">PM</text>"));
  // a two-digit hour with its half of the day leaves less room: the faces take two rows, all shown
  const late = clockFace(
    new Date(2026, 9, 6, 22, 1),
    Array.from({ length: 10 }, (_, i) => ({ in: i < 7, look })),
    { in: "In", twelve: true, period: "PM", periodFirst: false },
  );
  assert.equal(late.split('class="ck-in"').length - 1, 7);
  assert.equal(late.split('class="ck-out"').length - 1, 3);
  assert.ok(!/>\+\d+<\/text>/.test(late));
  // a crowd past what fits the row ends in a count
  const many = clockFace(
    new Date(2026, 9, 6, 9, 5),
    Array.from({ length: 24 }, (_, i) => ({ in: i < 20, look })),
    { in: "In", twelve: false },
  );
  assert.ok(/>\+\d+<\/text>/.test(many));
});
