// The office room: one floor of the team's office as the confirmed design (v13) draws it, moved by
// what the relay says. Each member sits at a desk with their mini-me. A request walks from the
// asker's desk to the asked one's (or flies there, folded into a plane, when the desk is far), sits
// on their pile until their mini-me takes it up, and comes back answered with a DONE stamp. What
// waits on the viewer shows in ember; the board behind the wall lists everyone.
//
// The drawing is split over sheets so that what moves never touches what stands still: the board
// behind everything, the floor and furniture (redrawn only when something on it changes), and over
// them each mover in a small sheet of its own, with copies of whatever stands in front of it cut to
// its outline (`placeLive`). Lines of one kind are merged into one path (`merged`), a mini-me seen
// from afar is redrawn only when it shows (`restDue`), and what can move at half the rate moves on
// the same even frames. The office stops while it is off screen.

import {
  at,
  atScale,
  Bot,
  box,
  CX,
  CY,
  clamp,
  DROP_FALL,
  DROP_LAND,
  dropAt,
  EVEN,
  easeInOut,
  esc,
  flat,
  floorText,
  hash,
  hashStr,
  leapAt,
  lerp,
  ln,
  loopOn,
  merged,
  mountBot,
  onFrame,
  P,
  part,
  plane,
  plant,
  poly,
  R,
  REDUCED,
  r1,
  r2,
  r3,
  SVGNS,
  setScale,
  sideWallM,
  stepAt,
  unmountBot,
  withOv,
} from "./core.mjs";
import { buildGrid, FXD, findPath, planFloor, WALL_H, ZA } from "./floor.mjs";
import { looksOf } from "./looks.mjs";
import {
  armchairSvg,
  chairSvg,
  coffeeSvg,
  countText,
  DK,
  deskFrame,
  deskLabel,
  deskShade,
  FB,
  flapBoard,
  flapFace,
  ITEMS,
  itemGeo,
  itemSvg,
  LIFT_W,
  LIFT_X,
  lampGeo,
  lampSvg,
  lapGeo,
  lapSvg,
  liftDoors,
  liftH,
  liftMark,
  liftSvg,
  lobbySvg,
  lowTableSvg,
  PD,
  PLANE,
  PW,
  roombaSvg,
  SIGN,
  SM_DEFS,
  scribble,
  segments,
  shelfSvg,
  signWords,
  skyFor,
  sofaSvg,
  stackSvg,
  stampSvg,
  steamAt,
  steamSvg,
  stillMark,
  teamMark,
  trayGeo,
  wallBrand,
} from "./pieces.mjs";

const SEAT_Z = 4,
  FLOOR_CAP = 24,
  BODY_PX = 116,
  PACE = 32,
  STEP = 4.6,
  STOREYS = 5;
const OPEN = new Set(["SUBMITTED", "WORKING"]);
const ANSWERED = new Set(["COMPLETED", "INPUT_REQUIRED", "REJECTED"]);

const clip = (s, n) => {
  const t = String(s || "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const ICON = {
  minus:
    '<svg viewBox="0 0 14 14"><path d="M2.5 7h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 14 14"><path d="M2.5 7h9M7 2.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  close:
    '<svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  send: '<svg viewBox="0 0 16 16"><path d="M8 13.5V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

/** The stage's own markup: the sheets and their shared patterns, what floats over them, the controls. */
function template(W, composer, lobby) {
  return `<svg class="of-s" data-of="back" aria-hidden="true"><g data-of="g-back"></g></svg>
<svg class="of-s" data-of="svg" role="img" aria-label="${esc(W.label)}"><defs>
<pattern id="of-hatch" patternUnits="userSpaceOnUse" width="3.4" height="3.4" patternTransform="rotate(-38)"><line data-of="hatch-l" class="hl" x1="0" y1="0" x2="0" y2="3.4" stroke-width=".7"/></pattern>
<pattern id="of-dots" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="matrix(8.94 4.47 -8.94 4.47 0 0)"><circle class="dot-c" cx="3" cy="3" r=".17"/></pattern>
<radialGradient id="of-soft"><stop offset="0" class="sh-stop sh-0"/><stop offset=".55" class="sh-stop sh-1"/><stop offset="1" class="sh-stop" stop-opacity="0"/></radialGradient>
<linearGradient id="of-floorlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="dk-stop" stop-opacity=".05"/><stop offset=".5" class="dk-stop" stop-opacity=".014"/><stop offset="1" class="dk-stop" stop-opacity="0"/></linearGradient>
</defs><g data-of="g-floor"></g><g data-of="g-walls"></g><g data-of="g-scene"></g><g data-of="g-notes"></g><g data-of="g-intro"></g></svg>
<svg class="of-s" data-of="mid" aria-hidden="true"><g data-of="g-under"></g></svg>
<div class="live" data-of="g-live"></div>
<svg class="of-s" data-of="top" aria-hidden="true"><g data-of="g-fly"></g><g data-of="g-fx"></g></svg>
<div class="over" data-of="plates"></div>
<div class="over" data-of="bubbles"></div>
<div class="hud tl" data-of="hud-tl"></div>
<div class="hud tr" data-of="hud-tr"></div>
<div class="hud bl"><div class="seg" data-of="views" role="group" aria-label="${esc(W.views.label)}"><button type="button" data-view="desk" aria-pressed="false">${esc(W.views.desk)}</button><button type="button" data-view="board" aria-pressed="false">${esc(W.views.board)}</button><button type="button" data-view="office" aria-pressed="true">${esc(W.views.office)}</button></div><div class="zoom"><button type="button" data-of="z-out" aria-label="${esc(W.views.zoomOut)}">${ICON.minus}</button><button type="button" data-of="z-in" aria-label="${esc(W.views.zoomIn)}">${ICON.plus}</button></div></div>
${composer ? `<div class="composer" data-of="composer"><div class="sugs" data-of="sugs"></div><form class="box" data-of="ask-form" autocomplete="off"><span class="me" data-of="me-mark"></span><input data-of="ask-input" type="text" placeholder="${esc(W.composer.placeholder)}" aria-label="${esc(W.composer.placeholder)}"><button type="submit" class="send" aria-label="${esc(W.composer.send)}">${ICON.send}</button></form></div>` : ""}
<aside class="panel" data-of="panel" hidden></aside>${lobby ? lobbyMarkup(W) : ""}`;
}

const ARROW =
  '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9.5M8.5 3.5 13 8l-4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let LOBBY_N = 0;
/** The way in: a card over the building to clock in, and the lift ride that follows. */
function lobbyMarkup(W) {
  const id = `of-lb-${++LOBBY_N}`;
  return `<div class="lobby" data-of="lobby" hidden><div class="lb-card" role="group" aria-labelledby="${id}"><div class="lb-brand"><span class="mk" data-of="lb-mark"></span>Clone Office<small data-of="lb-time"></small></div><h2 id="${id}" data-of="lb-h"></h2><p data-of="lb-sub"></p><div class="lb-acct"><span class="me" data-of="lb-me"></span><div><b data-of="lb-name"></b><span data-of="lb-role"></span></div><span class="tick" aria-hidden="true"><svg viewBox="0 0 10 10"><path d="M2 5.2l2 2L8 3" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div><ul class="lb-facts"><li data-of="lb-in-row"><span class="lb-faces" data-of="lb-faces"></span><span data-of="lb-in"></span></li><li class="hot" data-of="lb-wait-row"><i></i><span data-of="lb-wait"></span></li></ul><button type="button" class="lb-go" data-of="lb-go">${esc(W.lobby.clockIn)}${ARROW}<kbd>${esc(W.lobby.enter)}</kbd></button><p class="lb-foot">${esc(W.lobby.foot)}</p></div></div>
<div class="liftx" data-of="liftx" hidden aria-hidden="true"><div class="door l"></div><div class="door r"></div><div class="lx-ding"></div><div class="lx-head"><svg class="lx-arr" viewBox="0 0 12 12"><path d="M6 1.5 11 9.5H1z"/></svg><svg class="lx-num" data-of="lx-num"></svg></div></div>`;
}

/**
 * Draws the office in `root` and returns its handle: `update(data)` with the relay's latest look,
 * `destroy()` when it leaves the page. `words` are the screen's language; `onAnswer` opens what
 * waits for the viewer, `onAsk(text)` hands a request to their mini-me.
 */
export { looksOf };

export function createOffice(
  root,
  {
    words,
    locale,
    onAnswer,
    onAsk,
    lobby = false,
    onClockIn,
    onPanel,
    fps = 60,
  },
) {
  const W = words,
    HALF = fps === 30;
  root.classList.add("of-wrap");
  root.innerHTML = template(W, !!onAsk, lobby);
  const $ = (name) => root.querySelector(`[data-of="${name}"]`);
  const wrap = root,
    svg = $("svg"),
    backSvg = $("back"),
    liveSvg = $("mid"),
    topSvg = $("top");
  const gBack = $("g-back"),
    gFloor = $("g-floor"),
    gWalls = $("g-walls"),
    gScene = $("g-scene"),
    gNotes = $("g-notes"),
    gUnder = $("g-under"),
    gLive = $("g-live"),
    gFly = $("g-fly"),
    gFx = $("g-fx");
  const sheets = new Set([backSvg, svg, liveSvg, topSvg]);
  const oPlates = $("plates"),
    oBubbles = $("bubbles"),
    hudTL = $("hud-tl"),
    hudTR = $("hud-tr"),
    panel = $("panel"),
    viewSeg = $("views");
  const hatchP = root.querySelector("#of-hatch"),
    hatchL = $("hatch-l");
  const ac = new AbortController(),
    on = (el, type, fn, o = {}) =>
      el?.addEventListener(type, fn, { ...o, signal: ac.signal });
  const dateText = (() => {
    try {
      const f = new Intl.DateTimeFormat(locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      return (d) => f.format(d).toUpperCase();
    } catch {
      return (d) => d.toDateString().toUpperCase();
    }
  })();

  let floors = [],
    people = new Map(),
    plan = null,
    me = null,
    data = null,
    rosterKey = "",
    known = new Map(),
    destroyed = false,
    opened = false;
  let lobbyOn = false,
    entering = false,
    wantLobby = lobby,
    lbMark = null,
    lbMe = null;
  const gIntro = $("g-intro"),
    lobbyEl = $("lobby"),
    liftx = $("liftx");
  let cam = { x: 0, y: 0, w: 100, h: 100 },
    cw = 1,
    ch = 1,
    sc = 1,
    anim = null,
    rebuildAt = 0,
    built = null;
  let simT = 0,
    GEN = 0,
    inView = true,
    focus = null,
    panelRec = null,
    panelKey = "",
    hover = null,
    userMoved = false,
    boardOn = false,
    /** Room kept clear at the sides for what the page lays over the office (a panel, a column). */
    insetR = 0,
    insetL = 0,
    panelShown = false;
  let staticObjs = [],
    sceneOrder = [],
    decision = null,
    liftOpen = 0,
    asmUntil = 0,
    asmT0 = 0,
    lastMin = -1,
    dataKey = "",
    dataTick = 0,
    BASE_FLOOR = STOREYS;
  let liftUntil = -10,
    oacc = 0,
    meMark = null;
  const refs = {
    board: null,
    sign: null,
    signWas: "",
    flapWas: {},
    counts: new Map(),
    dnames: new Map(),
    steam: null,
  };
  const boardM = (B) => plane([B.x, B.y, B.z], [0, -0.1, 0], [0, 0, -0.1]);
  const signM = (G) => plane([G.x, G.y, -2.6], [0, -0.1, 0], [0.1, 0, 0]);
  const timers = [],
    fliers = [],
    bubbles = new Map(),
    fxs = [],
    chains = new Map();

  // ---- the floors: everyone in one team, the viewer first, areas of up to six, floors of up to 24
  function floorsOf(roster) {
    const groups = [];
    for (let i = 0; i < roster.length; i += FLOOR_CAP)
      groups.push(roster.slice(i, i + FLOOR_CAP).map((p) => p.id));
    if (!groups.length) groups.push([]);
    const fls = groups.map((ids, i) => planFloor([[W.team, ids]], i));
    // Thursday's places: the board behind the left wall at ten o'clock, the sign on the ground at four
    for (const f of fls) {
      f.board = {
        x: -9,
        y: clamp(f.D * 0.5 + 48, 98, f.D - 6),
        z: WALL_H + 34,
      };
      f.sign = { x: f.W + 9, y: f.D * 0.45 + 35 };
    }
    return fls;
  }

  // ---- what stands on the floor: plan footprint (depth and walking), screen box (culling), when it arrives
  function piecesOf(fl) {
    const out = [],
      blockers = [],
      maxK = fl.W + fl.D;
    const when = (x, y) => 700 + ((x + y) / maxK) * 1900;
    const add = (x0, y0, x1, y1, z1, t0, draw, o = {}) => {
      let a0 = Infinity,
        a1 = -Infinity,
        c0 = Infinity,
        c1 = -Infinity;
      for (const x of [x0, x1])
        for (const y of [y0, y1])
          for (const z of [0, z1]) {
            const [u, v] = at(x, y, z);
            a0 = Math.min(a0, u);
            a1 = Math.max(a1, u);
            c0 = Math.min(c0, v);
            c1 = Math.max(c1, v);
          }
      out.push({
        x0,
        y0,
        x1,
        y1,
        box: [a0 - 40, c0 - 60, a1 + 40, c1 + 20],
        tb: [a0 - 6, c0 - 8, a1 + 6, c1 + 4],
        t0,
        draw,
        person: o.person || null,
      });
      if (o.block !== false)
        blockers.push({
          x0: o.bx0 ?? x0,
          y0: o.by0 ?? y0,
          x1: o.bx1 ?? x1,
          y1: o.by1 ?? y1,
          pad: o.pad,
        });
    };
    for (const d of fl.desks) {
      const t0 = when(d.px, d.py),
        p = d.id ? people.get(d.id) : null;
      d.t0 = t0;
      const [cx, cy] = d.seat;
      add(
        cx - 2.6,
        cy - 3.5,
        cx + 2.6,
        cy + 2.6,
        11,
        t0 + 560,
        (t) => chairSvg(cx, cy, t),
        { block: false },
      );
      add(
        d.x0,
        d.y0,
        d.x1,
        d.y1,
        DK.top + 9,
        t0,
        (t) =>
          deskFrame(d, t) +
          `<g data-item="${d.key}" style="--d:${Math.round(t + 860)}ms"></g><g data-lamp="${d.key}" style="--d:${Math.round(t + 620)}ms"></g><g data-lap="${d.key}" style="--d:${Math.round(t + 700)}ms"></g><g data-stk="${d.key}" style="--d:${Math.round(t + 780)}ms"></g>`,
        { person: d.id },
      );
      if (p?.mine)
        add(
          d.x1 + 2.6,
          d.y0 + 0.6,
          d.x1 + 6.6,
          d.y0 + 4.6,
          12,
          t0 + 900,
          (t) => plant(d.x1 + 4.6, d.y0 + 2.6, "leafy", t),
          { pad: 0.4 },
        );
    }
    const D = fl.D,
      a0 = 500;
    // the lounge by the way in, on the left
    add(7.4, 64, 30.6, 70.2, 6.2, a0 + 300, (t) => sofaSvg(8, 64, 30, t));
    add(11, 76, 27, 81, 4, a0 + 420, (t) => lowTableSvg(11, 76, 27, 81, t));
    add(
      34.6,
      64.6,
      39.4,
      69.4,
      12,
      a0 + 520,
      (t) => plant(37, 67, "leafy", t),
      { pad: 0.4 },
    );
    add(
      ZA - 9,
      D - 13,
      ZA - 4.4,
      D - 8.4,
      14,
      a0 + 700,
      (t) => plant(ZA - 6.7, D - 10.7, "tall", t),
      { pad: 0.4 },
    );
    for (const th of fl.things) {
      const t0 = when(th.x ?? th.x0, th.y ?? th.y0);
      if (th.kind === "tea") {
        const w = 20,
          d = 6;
        add(th.x, th.y, th.x + w, th.y + d, 12.5, t0, (t) =>
          coffeeSvg(th.x, th.y, true, t, false),
        );
        fl.steamAt = steamAt(th.x, th.y, true);
        add(
          th.x + 2.6,
          th.y + d + 2,
          th.x + 17.4,
          th.y + d + 4.6,
          5.2,
          t0 + 480,
          () => "",
          { pad: 0.6 },
        );
        fl.spots.tea = [th.x + 10, th.y + d + 8.5];
        fl.teaAt = [th.x + 10, th.y + 2, 12.4];
      } else if (th.kind === "shelf")
        add(th.x0, th.y0, th.x1, th.y1, th.h || 15, t0, (t) =>
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
      else if (th.kind === "armchairs")
        add(th.x - 3.6, th.y - 3, th.x + 3.6, th.y + 3, 6.6, t0, (t) =>
          armchairSvg(th.x, th.y, t),
        );
      else if (th.kind === "sofa")
        add(th.x0 - 0.6, th.y, th.x1 + 0.6, th.y + 6.2, 6.2, t0, (t) =>
          sofaSvg(th.x0, th.y, th.x1, t),
        );
      else if (th.kind === "lowtable") {
        add(th.x0, th.y0, th.x1, th.y1, 4, t0, (t) =>
          lowTableSvg(th.x0, th.y0, th.x1, th.y1, t),
        );
        // the reading corner's low table is where a meeting of the mini-mes gathers
        fl.meetAt = [(th.x0 + th.x1) / 2, (th.y0 + th.y1) / 2];
      } else if (th.kind === "plant")
        add(
          th.x - 2.4,
          th.y - 2.4,
          th.x + 2.4,
          th.y + 2.4,
          14,
          t0,
          (t) => plant(th.x, th.y, th.p, t),
          { pad: 0.4 },
        );
    }
    buildGrid(fl, blockers);
    return out;
  }
  const inFront = (b, a) => b.x0 >= a.x1 - 0.01 || b.y0 >= a.y1 - 0.01;
  const meets = (a, b) =>
    a.box[0] < b.box[2] &&
    b.box[0] < a.box[2] &&
    a.box[1] < b.box[3] &&
    b.box[1] < a.box[3];
  function depthSort(list) {
    const n = list.length,
      after = list.map(() => []),
      deg = new Array(n).fill(0),
      key = (o) => o.x0 + o.x1 + o.y0 + o.y1;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i === j || !meets(list[i], list[j])) continue;
        if (inFront(list[j], list[i]) && !inFront(list[i], list[j])) {
          after[i].push(j);
          deg[j]++;
        }
      }
    const ready = [],
      out = [];
    for (let i = 0; i < n; i++) if (!deg[i]) ready.push(i);
    while (ready.length) {
      ready.sort((a, b) => key(list[a]) - key(list[b]));
      const i = ready.shift();
      out.push(list[i]);
      for (const j of after[i]) if (--deg[j] === 0) ready.push(j);
    }
    if (out.length < n) for (const o of list) if (!out.includes(o)) out.push(o);
    return out;
  }

  // ---- the floor and the walls; with `intro` everything is sketched in on CSS alone
  function floorSvg(fl, sky) {
    const { W: FW, D } = fl,
      all = [at(0, 0), at(FW, 0), at(FW, D), at(0, D)];
    let f = part(
      "k-draw",
      0,
      withOv(
        0,
        () =>
          ln(at(-30, D), at(FW + 30, D), "ol c") +
          ln(at(FW, -30), at(FW, D + 30), "ol c") +
          ln(at(-30, 0), at(-1.2, 0), "ol c") +
          ln(at(0, D), at(0, D + 30), "ol c"),
      ),
    );
    f += part("k-draw", 60, boxFloor(FW, D));
    f += part("k-fade", 280, poly(all, "f-dots") + poly(all, "f-floorlight"));
    if (sky === "night") f += poly(all, "f-veil");
    else if (sky === "evening") f += poly(all, "f-duskveil");
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
          poly(q, "f-plaza") + withOv(0, () => flatLine(art)),
        );
      else f += part("k-fade", 700, poly(q, "f-rug"));
    }
    for (const d of fl.desks) {
      const p = d.id ? people.get(d.id) : null;
      let s2 = "";
      if (!d.id)
        s2 +=
          poly(
            [
              at(d.px + 5, d.py + 5),
              at(d.px + 39, d.py + 5),
              at(d.px + 39, d.py + 35),
              at(d.px + 5, d.py + 35),
            ],
            "f-open",
          ) + floorText(W.openSeat, d.px + 9, d.py + 33.4, 2.1, "ftext faint");
      else if (p?.mine)
        s2 += poly(
          [
            at(d.px + 4, d.py + 4),
            at(d.px + 40, d.py + 4),
            at(d.px + 40, d.py + 36),
            at(d.px + 4, d.py + 36),
          ],
          "f-myrug",
        );
      s2 += deskShade(d);
      if (d.id) s2 += `<g data-dname="${d.key}"></g>`;
      f += part("k-fade", (d.t0 || 0) - 80, s2);
      if (p?.mine)
        f += part(
          "k-draw",
          (d.t0 || 0) + 1500,
          loopOn(d.x0 - 5.5, d.seat[1] - 5, d.x1 + 6.5, d.y1 + 6, 7),
        );
    }
    for (const a of fl.areas)
      if (!a.secondary) {
        const [x, y] = [a.x0 + 2, a.y1 + 9];
        f += teamMark(
          a,
          x,
          y,
          ((a.x0 + a.y0) / (fl.W + fl.D)) * 1900 + 1100,
          me && a.names.includes(me.id),
        );
      }
    f += part("k-fade", 1100, liftMark(LIFT_X, W.lift));
    return f;
  }
  const boxFloor = (FW, D) =>
    box(0, 0, FW, D, -2.6, 0, { top: "f-floor", line: "ol s", double: true });
  const flatLine = (art) =>
    flat(
      art.x0 + 2.5,
      art.y0 + 2.5,
      art.x1 - 2.5,
      art.y1 - 2.5,
      0.02,
      "f-none",
      "ol c",
    );
  function wallSvg(fl) {
    const { W: FW, D } = fl;
    let w = part(
      "k-draw",
      150,
      box(0, -1.2, FW, 0, 0, WALL_H, {
        front: "f-wall",
        hatch: false,
        line: "ol s",
        double: true,
      }) +
        box(-1.2, -1.2, 0, D, 0, WALL_H, {
          side: "f-front",
          hatch: false,
          line: "ol s",
          double: true,
        }),
    );
    w += part(
      "k-fade",
      900,
      liftSvg(LIFT_X, liftOpen, BASE_FLOOR + fl.index, WALL_H, false),
    );
    w += part("k-draw", 1100, wallBrand(LIFT_X + LIFT_W + 14, WALL_H));
    w += part(
      "k-fade",
      1000,
      `<text class="wtext" transform="${sideWallM(D - 12, Math.min(13.5, WALL_H - 2.5))}" font-size="2.2">${esc(fl.name.toUpperCase())}</text>`,
    );
    return w;
  }
  function notesSvg(fl) {
    let s = "";
    if (me && me.home === fl.index) {
      const d = me.desk;
      s += scribble(W.notes.myDesk, at(d.x1 + 6, d.y1 + 6.5), 26, 40, 25);
    }
    if (fl.teaAt)
      s += scribble(
        W.notes.tea,
        at(fl.teaAt[0], fl.teaAt[1], fl.teaAt[2] + 1.5),
        30,
        -26,
        23,
      );
    s += scribble(W.notes.lift, at(LIFT_X + 15.5, 6), 30, 30, 22);
    return s;
  }
  function buildScene(intro = false, toward = null) {
    if (!plan || destroyed) return;
    const s = toward ? cw / toward.w : sc,
      sky = skyFor("now");
    setScale(s);
    const hs = 3.4 / s;
    hatchP.setAttribute("width", r2(hs));
    hatchP.setAttribute("height", r2(hs));
    hatchL.setAttribute("y2", r2(hs));
    hatchL.setAttribute("stroke-width", r2(0.7 / s));
    svg.classList.toggle("asm", intro);
    backSvg.classList.toggle("asm", intro);
    svg.style.setProperty("--drop", `${r1(-46 / s)}px`);
    if (intro) asmT0 = simT;
    gFloor.innerHTML = merged(floorSvg(plan, sky));
    gBack.innerHTML = merged(flapBoard(boardM(plan.board), 900));
    gWalls.innerHTML = merged(wallSvg(plan));
    gNotes.innerHTML = merged(part("k-fade", 3400, notesSvg(plan)));
    gUnder.innerHTML =
      `<g data-liftdoors>${merged(liftDoors(LIFT_X, easeInOut(liftOpen), liftH(WALL_H)))}</g>` +
      (plan.steamAt ? steamSvg(plan.steamAt) : "") +
      `<g transform="${signM(plan.sign)}" data-sign></g><g data-marks></g>`;
    refs.board = gBack.querySelector("[data-board]");
    refs.sign = gUnder.querySelector("[data-sign]");
    refs.signWas = "";
    refs.boardKey = "";
    refs.boardAt = 0;
    refs.doors = gUnder.querySelector("[data-liftdoors]");
    refs.marks = gUnder.querySelector("[data-marks]");
    refs.counts = new Map(
      [...gFloor.querySelectorAll("[data-count]")].map((g) => [
        g.dataset.count,
        g,
      ]),
    );
    refs.dnames = new Map(
      [...gFloor.querySelectorAll("[data-dname]")].map((g) => [
        g.dataset.dname,
        g,
      ]),
    );
    lastMin = -1;
    dataKey = "";
    const c2 = toward || cam,
      ux0 = Math.min(cam.x, c2.x),
      uy0 = Math.min(cam.y, c2.y),
      ux1 = Math.max(cam.x + cam.w, c2.x + c2.w),
      uy1 = Math.max(cam.y + cam.h, c2.y + c2.h);
    const mx = (ux1 - ux0) * 0.5,
      my = (uy1 - uy0) * 0.5,
      view = [ux0 - mx, uy0 - my, ux1 + mx, uy1 + my];
    built = toward
      ? null
      : [
          cam.x - mx * 0.8,
          cam.y - my * 0.8,
          cam.x + cam.w + mx * 0.8,
          cam.y + cam.h + my * 0.8,
        ];
    const shown = staticObjs.filter(
      (o) =>
        o.box[2] > view[0] &&
        o.box[0] < view[2] &&
        o.box[3] > view[1] &&
        o.box[1] < view[3],
    );
    gScene.innerHTML = shown
      .map(
        (o) =>
          `<g${o.person ? ` data-person="${esc(o.person)}"` : ""}>${merged(o.draw(o.t0))}</g>`,
      )
      .join("");
    const nodes = [...gScene.children];
    shown.forEach((o, i) => {
      o.node = nodes[i];
    });
    sceneOrder = shown;
    for (const d of plan.desks) {
      const lampG = gScene.querySelector(`[data-lamp="${d.key}"]`);
      if (!lampG) continue;
      const lapG = gScene.querySelector(`[data-lap="${d.key}"]`),
        stkG = gScene.querySelector(`[data-stk="${d.key}"]`),
        itemG = gScene.querySelector(`[data-item="${d.key}"]`),
        p = d.id ? people.get(d.id) : null,
        at0 = (g) =>
          intro ? parseFloat(g.style.getPropertyValue("--d")) : null;
      if (p) {
        p.lampG = lampG;
        p.lapG = lapG;
        p.stkG = stkG;
        p.itemG = itemG;
      }
      lampG.innerHTML = merged(
        lampSvg(
          lampGeo(d),
          !!p && p.present && p.status === "active",
          at0(lampG),
        ),
      );
      lapG.innerHTML = merged(
        lapSvg(
          lapGeo(d),
          p?.present ? p.status : "offline",
          !!p && p.mood === "working",
          at0(lapG),
        ),
      );
      stkG.innerHTML = merged(
        stackSvg(trayGeo(d), p ? p.stack : 0, d.key, at0(stkG)),
      );
      itemG.innerHTML = merged(
        itemSvg(
          itemGeo(d),
          itemOf(p),
          !!p && p.mood === "working",
          intro ? parseFloat(itemG.style.getPropertyValue("--d")) : 0,
        ),
      );
    }
    refs.steam = gUnder.querySelector("[data-steam]");
    for (const a of [...people.values(), vac]) {
      a.slot = -2;
      a.occKey = null;
      if (a.cl) {
        a.cl.replaceChildren();
        a.copies = null;
      }
    }
  }
  const itemOf = (p) =>
    !p ? "books" : p.mine ? "mug" : ITEMS[hashStr(p.id) % ITEMS.length];
  function redraw(p, what, fresh = false) {
    if (!plan || p.floor !== plan.index) return;
    const g =
      what === "stack"
        ? p.stkG
        : what === "lap"
          ? p.lapG
          : what === "item"
            ? p.itemG
            : p.lampG;
    if (!g?.isConnected) return;
    const d = p.desk;
    if (what === "stack")
      g.innerHTML = merged(stackSvg(trayGeo(d), p.stack, d.key, null, fresh));
    else if (what === "lap")
      g.innerHTML = merged(
        lapSvg(
          lapGeo(d),
          p.present ? p.status : "offline",
          p.mood === "working",
        ),
      );
    else if (what === "item")
      g.innerHTML = merged(
        itemSvg(itemGeo(d), itemOf(p), p.mood === "working", 0).replace(
          /k-drop|k-grow/g,
          "",
        ),
      );
    else
      g.innerHTML = merged(
        lampSvg(lampGeo(d), p.present && p.status === "active"),
      );
    for (const a of [...people.values(), vac])
      if (a.occ?.some((o) => o.node?.contains(g))) {
        a.occKey = null;
        if (a.cl) {
          a.cl.replaceChildren();
          a.copies = null;
        }
      }
  }

  // ---- what the board, the sign and the floor's words say
  const asking = (p) => (p.mine ? !!decision : p.deciding);
  const stateOf = (p) =>
    asking(p)
      ? "ask"
      : p.status === "offline"
        ? "off"
        : p.status === "away"
          ? "away"
          : p.mood === "working" ||
              p.doing?.kind === "ask" ||
              p.doing?.kind === "answer" ||
              p.doing?.kind === "meeting"
            ? "work"
            : "free";
  const RANK = { ask: 0, work: 1, free: 2, away: 3, off: 4 };
  /** What someone is on, for the board: the colleague a request is going to, the request being worked on, the one waited on. */
  const nowOf = (p) => {
    const d = p.doing;
    if (d && (d.kind === "ask" || d.kind === "answer"))
      return W.board.to(d.who.name);
    if (d?.kind === "meeting") return W.meeting.on;
    if (p.task) return p.task;
    if (p.waitOn) return W.board.wait(p.waitOn);
    return "";
  };
  /** The wall and floor marks that show what is going on: the clock each minute, the rest when something changes. */
  function updateData() {
    const now = new Date();
    lastMin = now.getHours() * 60 + now.getMinutes();
    const everyone = [...people.values()],
      all = everyone.filter((p) => p.home === plan.index);
    const st = {
      in: everyone.filter(
        (p) => p.status !== "offline" && (p.present || p.inLift),
      ).length,
      off: everyone.filter((p) => p.status === "offline").length,
      moving: data ? data.requests.filter((r) => OPEN.has(r.state)).length : 0,
    };
    const teams = new Map();
    for (const p of all) {
      const t = teams.get(p.team) || { n: 0, off: 0, ask: 0 };
      t.n++;
      if (p.status === "offline") t.off++;
      if (asking(p)) t.ask++;
      teams.set(p.team, t);
    }
    const crew = all
      .map((p) => {
        const state = stateOf(p);
        return {
          name: p.mine ? W.board.you : p.name,
          mine: p.mine,
          look: p.look,
          state,
          status:
            state === "ask"
              ? p.mine
                ? W.board.states.ask
                : W.board.states.deciding
              : W.board.states[state],
          now: state === "off" ? "" : nowOf(p),
          desk: p.stack,
        };
      })
      .sort(
        (a, b) =>
          RANK[a.state] - RANK[b.state] ||
          b.desk - a.desk ||
          a.name.localeCompare(b.name),
      );
    const sign = decision ? "you" : st.moving ? "work" : "quiet";
    const key = JSON.stringify([crew, sign, [...teams], lastMin]);
    if (key === dataKey) return;
    dataKey = key;
    // The board turns over at most every 2 s, close up with its flaps clacking over. From across the floor it is a
    // hand's width on screen and its letters a few pixels: there it changes every 4 s, letters swapped in place.
    const bkey = JSON.stringify([crew, lastMin, st.in, st.off]);
    if (refs.board?.isConnected && bkey !== refs.boardKey) {
      const near = FB.w * 0.1 * 8.94 * sc >= 420,
        wait = (near ? 2000 : 4000) - (performance.now() - (refs.boardAt || 0));
      if (wait > 0) {
        if (!refs.boardLater)
          refs.boardLater = setTimeout(() => {
            refs.boardLater = 0;
            dataKey = "";
          }, wait + 20);
      } else {
        const was = {
          clock: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
          rows: crew.slice(0, 8).map((c) => ({
            name: c.name,
            status: c.status,
            now: c.now,
            desk: String(c.desk),
          })),
        };
        refs.boardAt = performance.now();
        refs.boardKey = bkey;
        refs.board.innerHTML = flapFace(
          { label: plan.name, in: st.in, off: st.off },
          crew,
          now,
          near ? refs.flapWas : was,
          { ...W.board, date: dateText, in: W.counts.in, off: W.counts.off },
        );
        refs.flapWas = was;
      }
    }
    if (refs.sign?.isConnected && sign !== refs.signWas) {
      refs.signWas = sign;
      refs.sign.innerHTML = `<g class="gs-in">${signWords(sign, W.sign)}</g>`;
    }
    for (const [team, g] of refs.counts) {
      const t = teams.get(team);
      if (!t || !g.isConnected) continue;
      const [x, y] = g.dataset.at.split(",").map(Number),
        html = countText(x, y, t, W.counts);
      if (g.__html !== html) {
        g.__html = html;
        g.innerHTML = html;
      }
    }
    for (const [key2, g] of refs.dnames) {
      const p = [...people.values()].find((q) => q.desk.key === key2);
      if (!p || !g.isConnected) continue;
      const html = deskLabel(p.desk, p.name, p.status === "offline", W.offTag);
      if (g.__html !== html) {
        g.__html = html;
        g.innerHTML = html;
      }
    }
  }
  /**
   * Seen from across the floor a mini-me at rest is a few dozen pixels tall and a breath moves it by less than one,
   * so it is redrawn only when something shows: a blink, a glance and a moment after, a change of mood, a breath
   * every half second, the eyes of one at work ten times a second. Close up it moves on every other frame.
   */
  function restDue(p) {
    const b = p.bot;
    if (b.mood !== p.lodMood) {
      p.lodMood = b.mood;
      p.moodT = simT;
    }
    if (simT - (p.moodT || 0) < 0.7) return EVEN;
    if ((simT + b.phase * 5.3) % 4.3 < 0.24) return EVEN;
    if (b.mood === "working") return simT - (p.lastUpd || 0) > 0.095;
    if (b.mood === "idle") {
      const k = Math.floor((simT + b.phase * 7) / 2.4);
      if (k !== p.gk) {
        p.gk = k;
        p.gazeT = simT;
      }
      if (simT - p.gazeT < 0.5) return EVEN;
    }
    return simT - (p.lastUpd || 0) > 0.5;
  }
  /** The sign's chevrons running and the vacuum's light, stepped by hand on the half-rate frames rather than by CSS on every frame. */
  function runLights() {
    if (REDUCED) return;
    if (refs.signWas === "work" && refs.sign?.isConnected) {
      const ph = (simT % 1.1) / 1.1;
      for (const el of refs.sign.querySelectorAll("[data-ch]")) {
        const d = (((ph - Number(el.dataset.ch) * 0.2) % 1) + 1) % 1,
          o = d < 0.4 ? "1" : "0.2";
        if (el.getAttribute("opacity") !== o) el.setAttribute("opacity", o);
      }
    }
    if (vac.led) {
      const o = Math.floor(simT / 0.7) % 2 ? "0.35" : "1";
      if (vac.ledO !== o) {
        vac.ledO = o;
        vac.led.setAttribute("opacity", o);
      }
    }
  }

  // ---- people and their mini-mes
  function buildPeople(roster) {
    for (const p of people.values()) liveOff(p);
    people = new Map();
    oPlates.innerHTML = "";
    const byId = new Map(roster.map((r) => [r.id, r]));
    floors.forEach((fl, fi) => {
      for (const d of fl.desks) {
        const r = d.id && byId.get(d.id);
        if (!r) continue;
        const look = looksOf(r, r.index),
          mood = r.status === "offline" ? "sleep" : "idle";
        const bot = new Bot({
          color: look.color,
          shape: look.shape,
          paint: look.paint,
          phase: (hashStr(r.id) % 1000) / 1000,
          mood,
        });
        const g = document.createElementNS(SVGNS, "g");
        g.setAttribute("class", "bot-g");
        g.setAttribute("data-person", r.id);
        g.innerHTML = `<ellipse class="shadow-e" rx="34" ry="11" style="display:none"/><g class="bscale"></g><g class="carry" style="display:none"><g class="sheetg"><rect class="sheet" x="-12" y="-15" width="24" height="30" rx="2.5"/><path class="ln" d="M-7 -8H7M-7 -3H7M-7 2H2"/><path class="tick" d="M-4.5 8.5L-1 11.6L5.5 4.6" style="display:none"/></g><g class="mug"><path d="M-8 -8h14v13a5 5 0 0 1 -5 5h-4a5 5 0 0 1 -5 -5z"/><path d="M6 -4a4 4 0 0 1 0 8" style="fill:none"/></g></g>`;
        g.querySelector(".bscale").appendChild(bot.el);
        const plate = document.createElement("div");
        plate.className = "plate";
        plate.dataset.person = r.id;
        plate.hidden = true;
        oPlates.appendChild(plate);
        people.set(r.id, {
          id: r.id,
          name: r.name,
          team: d.area.team,
          desk: d,
          floor: fi,
          home: fi,
          bot,
          g,
          plate,
          plateKey: "",
          k: BODY_PX / (2 * R * bot.hh),
          shadow: g.querySelector(".shadow-e"),
          carryG: g.querySelector(".carry"),
          tickG: g.querySelector(".tick"),
          bscale: g.querySelector(".bscale"),
          look,
          mine: !!r.mine,
          botName: r.mine ? W.yourMiniMe : W.miniMe(r.name),
          status: r.status,
          stack: 0,
          want: 0,
          pos: [...d.seat],
          z: SEAT_Z,
          seated: true,
          walk: null,
          leap: null,
          carry: null,
          busy: false,
          inLift: false,
          present: r.status !== "offline",
          fade: null,
          popAt: 0,
          mood,
          slot: -2,
          doing: null,
          step: 0,
          stepN: 0,
          dir: 0,
          sweatAt: 0,
          working: false,
          deciding: false,
          task: "",
          waitOn: "",
        });
      }
    });
    me = [...people.values()].find((p) => p.mine) || null;
  }
  /** How a mini-me rests when nothing is moving it: asleep when its computer is off, asking while its person decides, at work on a request. */
  const restMood = (p) =>
    p.status === "offline"
      ? "sleep"
      : asking(p)
        ? "asking"
        : p.working
          ? "working"
          : "idle";
  function refreshMood(p) {
    const b = bubbles.get(p.id);
    p.bot.setMood(
      p.walk
        ? "walk"
        : b && b.kind.startsWith("say") && p.mood === "idle"
          ? "talk"
          : p.mood,
    );
  }
  function setMood(p, m) {
    const was = p.mood;
    p.mood = m;
    refreshMood(p);
    if ((was === "working") !== (m === "working")) {
      redraw(p, "lap");
      redraw(p, "item");
    }
  }
  function lookAt(p, q) {
    const dx = q.pos[0] - p.pos[0],
      dy = q.pos[1] - p.pos[1],
      sx = (dx - dy) * 0.894,
      sy = (dx + dy) * 0.447,
      L = Math.hypot(sx, sy) || 1;
    p.bot.gaze = [(sx / L) * 11, (sy / L) * 6];
  }
  /** Brings someone in line with the relay once nothing is moving them: their pile, their mood, their lamp. */
  function settle(p) {
    if (p.busy || destroyed) return;
    // in or out as the computer is, through the lift when it can be seen
    if (!p.coming && (p.status === "offline") === p.present) {
      if (lively() && plan && p.home === plan.index) {
        if (p.present) spawn(() => goOut(p));
        else
          spawn(async () => {
            openLift(1.2);
            await wait(420);
            await comeIn(p, true);
          });
        return;
      }
      p.present = p.status !== "offline";
      p.floor = p.home;
      p.pos = [...p.desk.seat];
      p.seated = true;
      redraw(p, "lap");
      redraw(p, "lamp");
      dataKey = "";
    }
    if (p.stack !== p.want) {
      const more = p.want > p.stack;
      p.stack = p.want;
      redraw(p, "stack", more);
    }
    p.bot.setMineDot(p.mine);
    const m = restMood(p);
    if (p.mood !== m) setMood(p, m);
    // a word over the head may have taken the place of the question: it comes back
    if (p.mine && decision && !bubbles.has(p.id)) showDecision(decision.text);
  }
  /** Whether a change can play out on the floor now, rather than just be so. */
  const lively = () => opened && inView && !REDUCED;

  // ---- the robot vacuum: rests a moment, then wanders off somewhere on the floor
  const vac = {
    g: null,
    pos: [16, 100],
    walk: null,
    rest: 0,
    slot: -2,
    floor: -1,
  };
  function vacHome() {
    vac.floor = plan.index;
    vac.pos = [16, Math.min(plan.D - 20, 100)];
    vac.walk = null;
    vac.rest = simT + 5;
    vac.slot = -2;
    if (!vac.g) {
      vac.g = document.createElementNS(SVGNS, "g");
      vac.g.setAttribute("class", "vac");
    }
    vac.g.innerHTML = roombaSvg();
    vac.led = vac.g.querySelector(".rb-led");
    vac.ledO = "";
  }
  function moveVac() {
    if (!vac.g || vac.floor !== plan.index) {
      liveOff(vac);
      return;
    }
    if (vac.walk) {
      const w = vac.walk,
        u = clamp((simT - w.t0) / w.dur, 0, 1),
        q = along(w.r, u, w.L);
      vac.pos = [q[0], q[1]];
      if (u >= 1) {
        vac.walk = null;
        vac.rest = simT + 2 + Math.random() * 4;
      }
    } else if (simT > vac.rest && !asmUntil) {
      const r = rounded(
          findPath(plan, vac.pos, [
            10 + Math.random() * (plan.W - 20),
            10 + Math.random() * (plan.D - 20),
          ]),
        ),
        L = lenOf(r);
      if (L > 14) vac.walk = { r, L, t0: simT, dur: L / 6.5 };
      else vac.rest = simT + 1;
    }
    const [vx, vy] = at(vac.pos[0], vac.pos[1], 0),
      t = `translate(${r1(vx)} ${r1(vy)})`;
    if (t !== vac.t) {
      vac.t = t;
      vac.g.setAttribute("transform", t);
    }
    placeLive(vac, [vx - 34, vy - 26, vx + 34, vy + 16], t);
  }

  // ---- the clock scenes run on: simulated time, so a scene waits while the office is off screen
  class Stop extends Error {}
  const wait = (ms) => {
    const g = GEN;
    return new Promise((res, rej) =>
      timers.push({ at: simT + ms / 1000, res, rej, g }),
    );
  };
  const until = async (ok) => {
    while (!ok()) await wait(300);
  };
  function runTimers() {
    for (let i = timers.length - 1; i >= 0; i--) {
      const tm = timers[i];
      if (tm.g !== GEN) {
        timers.splice(i, 1);
        tm.rej(new Stop());
      } else if (simT >= tm.at) {
        timers.splice(i, 1);
        tm.res();
      }
    }
  }
  const spawn = (fn) => {
    fn().catch((e) => {
      if (!(e instanceof Stop)) console.error(e);
    });
  };
  /** One request's scenes play in order, each when the one before has finished. */
  const queue = (id, fn) => {
    const c = (chains.get(id) || Promise.resolve()).then(fn).catch((e) => {
      if (!(e instanceof Stop)) console.error(e);
    });
    chains.set(id, c);
  };
  const FILLET = 3.4;
  function rounded(route) {
    if (route.length < 3) return route;
    const out = [route[0]];
    for (let i = 1; i < route.length - 1; i++) {
      const [ax, ay] = route[i - 1],
        [bx, by] = route[i],
        [cx, cy] = route[i + 1];
      const l1 = Math.hypot(bx - ax, by - ay),
        l2 = Math.hypot(cx - bx, cy - by),
        r = Math.min(FILLET, l1 / 2, l2 / 2);
      if (r < 0.3) {
        out.push(route[i]);
        continue;
      }
      const p0 = [bx - ((bx - ax) / l1) * r, by - ((by - ay) / l1) * r],
        p2 = [bx + ((cx - bx) / l2) * r, by + ((cy - by) / l2) * r];
      for (let k = 0; k <= 6; k++) {
        const q = k / 6;
        out.push([
          (1 - q) ** 2 * p0[0] + 2 * (1 - q) * q * bx + q * q * p2[0],
          (1 - q) ** 2 * p0[1] + 2 * (1 - q) * q * by + q * q * p2[1],
        ]);
      }
    }
    out.push(route[route.length - 1]);
    return out;
  }
  /** Where along a route a share `u` of its length lands, and which way it is heading there. */
  function along(r, u, total) {
    let left = clamp(u, 0, 1) * total;
    for (let i = 1; i < r.length; i++) {
      const L = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
      if (left <= L || i === r.length - 1) {
        const k = L ? Math.min(1, left / L) : 0;
        return [
          lerp(r[i - 1][0], r[i][0], k),
          lerp(r[i - 1][1], r[i][1], k),
          r[i][0] - r[i - 1][0],
          r[i][1] - r[i - 1][1],
        ];
      }
      left -= L;
    }
    return [...r[r.length - 1], 0, 0];
  }
  const lenOf = (r) => {
    let L = 0;
    for (let i = 1; i < r.length; i++)
      L += Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]);
    return L;
  };
  function paced(p, time) {
    const EI = 0.22,
      EO = 0.28,
      t = clamp(p, 0, 1) * time,
      v = 1 / (time - (EI + EO) / 2);
    if (t < EI) return (v * t * t) / (2 * EI);
    if (t > time - EO) return 1 - (v * (time - t) ** 2) / (2 * EO);
    return (v * EI) / 2 + v * (t - EI);
  }
  function walkTo(p, target, carry = null, trail = false) {
    const g = GEN,
      fl = floors[p.floor];
    return new Promise((res, rej) => {
      const r = rounded(findPath(fl, p.pos, target)),
        L = lenOf(r),
        dur = Math.max(0.8, L / PACE + 0.35);
      if (p.seated) leap(p, "tap");
      p.walk = {
        r,
        L,
        t0: simT,
        dur,
        res,
        rej,
        g,
        trail: trail && p.floor === plan.index ? drawTrail(r) : null,
      };
      p.carry = carry;
      p.seated = false;
      p.bot.gaze = null;
      p.stepN = 0;
      refreshMood(p);
    });
  }
  /** A walk's way drawn as a dotted line on the floor, rubbed out as it is walked. */
  function drawTrail(r) {
    const el = document.createElementNS(SVGNS, "path");
    el.setAttribute("class", "trail");
    el.setAttribute("d", `M${r.map((q) => P([at(q[0], q[1])])).join("L")}`);
    (refs.marks || gUnder).appendChild(el);
    return el;
  }
  function flyPlane(from, to, ms) {
    const g = GEN;
    return new Promise((res, rej) =>
      fliers.push({
        plane: true,
        from,
        to,
        t0: simT,
        dur: ms / 1000,
        res,
        rej,
        g,
        el: null,
        wake: null,
        pts: [],
      }),
    );
  }
  /** Folded and thrown: the plane arcs high over the floor, trailing dots, and lands on the other's tray. */
  async function throwPlane(a, b, pile = true) {
    lookAt(a, b);
    leap(a, "hop");
    await wait(260);
    const from = carryAt(a),
      to = trayOf(b),
      dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    a.carry = null;
    await flyPlane(from, to, clamp(dist * 0.9, 800, 1600));
    if (pile) {
      b.stack++;
      redraw(b, "stack", true);
    }
    fx("ticks", null, {
      at: [to[0], to[1] - 4],
      anim: "pop",
      dur: 0.55,
      scale: 0.8,
    });
  }
  const farOff = (a, b) =>
    a.floor === b.floor &&
    Math.hypot(a.desk.px - b.desk.px, a.desk.py - b.desk.py) > 110;
  function fly(from, to, kind, ms = 380, arc = 28) {
    const g = GEN;
    return new Promise((res, rej) =>
      fliers.push({
        from,
        to,
        t0: simT,
        dur: ms / 1000,
        kind,
        arc,
        res,
        rej,
        g,
        el: null,
      }),
    );
  }
  const carryAt = (p) => {
    const s = at(p.pos[0], p.pos[1], p.z);
    return [s[0] + p.dir * 12 * boost, s[1] - BODY_PX * 0.3 * boost];
  };
  const trayOf = (p) => {
    const g = trayGeo(p.desk);
    return at(
      (g.x0 + g.x1) / 2,
      (g.y0 + g.y1) / 2,
      g.z + 0.6 + Math.min(p.stack, 8) * 0.4,
    );
  };
  const lapOf = (p) => {
    const g = lapGeo(p.desk);
    return at((g.x0 + g.x1) / 2, g.y1 - 0.6, g.z + 0.4);
  };
  const leap = (p, kind) => {
    p.leap = { kind, t0: simT };
  };
  /** Hands what it carries over: the sheet goes from in front of it onto the other's tray, lands, and the pile grows. */
  async function place(p, to, kind, pile = true) {
    const from = carryAt(p);
    p.carry = null;
    await fly(from, trayOf(to), kind, 460, 22);
    if (pile) {
      to.stack++;
      redraw(to, "stack", true);
    }
    const tp = trayOf(to);
    fx("ticks", null, {
      at: [tp[0], tp[1] - 4],
      anim: "pop",
      dur: 0.55,
      scale: 0.8,
    });
  }

  // ---- doodles that pop up around a mini-me
  const headOfWorld = (p) => {
    const [fx0, fy0] = at(p.pos[0], p.pos[1], p.z);
    return [fx0, fy0 - (p.lift || 0) - BODY_PX * 0.96 * boost];
  };
  const FX_SPOTS = {
    bang: [0.36, 0.06],
    ask: [0.4, 0.08],
    drip: [-0.36, 0.3],
    heart: [0.3, 0.02],
  };
  function fx(kind, p, o = {}) {
    if (REDUCED || !inView) return;
    if (p && p.floor !== plan.index) return;
    const el = document.createElementNS(SVGNS, "g");
    el.setAttribute("class", `fx-${o.anim || "pop"}${o.ember ? " fx-e" : ""}`);
    const dur = o.dur || 0.95;
    el.style.setProperty("--dur", `${dur}s`);
    el.innerHTML = `<g class="fx-in"${o.delay ? ` style="animation-delay:${o.delay}s"` : ""}><g class="boil"><g>${FXD[kind](0)}</g><g>${FXD[kind](1)}</g></g></g>`;
    gFx.appendChild(el);
    const spot = FX_SPOTS[kind] || [0, 0];
    fxs.push({
      el,
      p,
      at: o.at,
      dx: o.dx ?? spot[0] * BODY_PX,
      dy: o.dy ?? spot[1] * BODY_PX,
      t0: simT,
      dur: dur + (o.delay || 0),
      scale: o.scale || 1,
      gen: GEN,
    });
  }
  const sparkle = (p) => {
    fx("spark", p, {
      anim: "twinkle",
      dx: -0.5 * BODY_PX,
      dy: -0.12 * BODY_PX,
      dur: 1.1,
      scale: 0.8,
    });
    fx("spark", p, {
      anim: "twinkle",
      dx: 0.46 * BODY_PX,
      dy: -0.22 * BODY_PX,
      dur: 1.2,
      delay: 0.15,
    });
    fx("spark", p, {
      anim: "twinkle",
      dx: 0.62 * BODY_PX,
      dy: 0.3 * BODY_PX,
      dur: 1,
      delay: 0.3,
      scale: 0.65,
    });
  };
  function drawFx() {
    for (let i = fxs.length - 1; i >= 0; i--) {
      const f = fxs[i];
      if (
        f.gen !== GEN ||
        simT - f.t0 > f.dur + 0.05 ||
        (f.p && f.p.floor !== plan.index)
      ) {
        f.el.remove();
        fxs.splice(i, 1);
        continue;
      }
      const [x, y] = f.p ? headOfWorld(f.p) : f.at;
      f.el.setAttribute(
        "transform",
        `translate(${r1(x + f.dx * boost)} ${r1(y + f.dy * boost)}) scale(${r2(f.scale * boost)})`,
      );
    }
  }

  // ---- words above heads
  function say(p, text, ms = 2600, kind = "say") {
    const old = bubbles.get(p.id);
    if (old) old.el.remove();
    const el = document.createElement("div");
    el.className = `bub ${kind}`;
    el.innerHTML = `<span class="who">${esc(kind === "human" ? (p.mine ? W.plate.youShort : p.name) : p.botName)}</span><span class="txt"></span>`;
    oBubbles.appendChild(el);
    const b = {
      p,
      el,
      txt: el.querySelector(".txt"),
      full: text,
      until: ms ? simT + ms / 1000 : Infinity,
      kind,
      typed: kind.startsWith("say") ? 0 : 1e9,
    };
    if (!kind.startsWith("say")) b.txt.textContent = text;
    bubbles.set(p.id, b);
    refreshMood(p);
    return b;
  }
  function unsay(p) {
    const b = bubbles.get(p.id);
    if (!b) return;
    b.el.classList.add("out");
    const el = b.el;
    setTimeout(() => el.remove(), 240);
    bubbles.delete(p.id);
    refreshMood(p);
  }
  /** What waits for the viewer: their mini-me asks, in ember, over its head, with a way to answer. */
  function showDecision(text) {
    if (!me) return;
    const fresh = !decision;
    decision = { text };
    if (fresh) {
      me.bot.gaze = null;
      setMood(me, "asking");
      fx("ask", me, { ember: true, dur: 1.6 });
    }
    const cur = bubbles.get(me.id);
    if (cur?.kind === "ask mine" && cur.full === text) return;
    const b = say(me, text, 0, "ask mine");
    b.el.insertAdjacentHTML(
      "beforeend",
      `<div class="acts"><button type="button" class="solid" data-a="answer">${esc(W.answer)}</button></div>`,
    );
    b.el.addEventListener("click", (e) => {
      if (e.target.closest("[data-a]")) onAnswer?.();
    });
    dataKey = "";
  }
  function clearDecision() {
    if (!decision || !me) return;
    decision = null;
    const cur = bubbles.get(me.id);
    if (cur?.kind.startsWith("ask")) unsay(me);
    settle(me);
    dataKey = "";
  }

  // ---- comings and goings: the lift is the way in and out
  const openLift = (sec) => {
    liftUntil = Math.max(liftUntil, simT + sec);
  };
  async function liftRide(p, toFloor) {
    if (p.floor === plan.index) openLift(1.3);
    await wait(500);
    p.inLift = true;
    await wait(1700);
    p.floor = toFloor;
    p.pos = [...floors[toFloor].lift];
    if (toFloor === plan.index) openLift(1.3);
    await wait(350);
    p.inLift = false;
  }
  /** Computer on: the mini-me steps out of the lift with a hop and goes to its desk; the laptop opens, the lamp comes on. */
  async function comeIn(p, solo = false) {
    p.busy = true;
    try {
      const fl = floors[p.home];
      p.floor = p.home;
      p.pos = [...fl.door];
      p.z = 0;
      p.seated = false;
      p.present = true;
      p.carry = null;
      p.popAt = simT - 9;
      p.fade = { t0: simT, dur: 0.32 };
      leap(p, "hop");
      dataKey = "";
      await wait(260);
      if (solo) say(p, W.say.isIn(p.name), 1500, "say small");
      await walkTo(p, p.desk.seat);
      p.seated = true;
      p.pos = [...p.desk.seat];
      leap(p, "tap");
      redraw(p, "lap");
      redraw(p, "lamp");
    } finally {
      p.busy = false;
      settle(p);
    }
  }
  /** Computer off: the laptop shuts, the lamp goes out, and the mini-me walks into the lift and is gone. */
  async function goOut(p) {
    p.busy = true;
    try {
      redraw(p, "lap");
      redraw(p, "lamp");
      dataKey = "";
      say(p, W.say.bye(p.name), 1700, "say small");
      await wait(1100);
      const fl = floors[p.floor];
      await walkTo(p, fl.lift);
      openLift(1.4);
      await wait(420);
      await walkTo(p, fl.door);
      p.fade = { t0: simT, dur: 0.3, out: true };
      await wait(320);
      p.present = false;
      p.seated = true;
      p.pos = [...p.desk.seat];
      p.fade = null;
      dataKey = "";
    } finally {
      p.busy = false;
      settle(p);
    }
  }
  /** As the office opens, a few come in through the lift: a short queue out of the doors, each to their own desk. */
  async function opening(list, after) {
    if (!list.length) return;
    await wait(after);
    const gap = list.length > 8 ? 260 : 380;
    openLift((list.length * gap) / 1000 + 1);
    await wait(420);
    for (const p of list) {
      p.coming = false;
      if (p.status !== "offline") spawn(() => comeIn(p));
      else settle(p);
      await wait(gap);
    }
  }
  async function goTo(p, to, carry) {
    if (p.floor !== to.floor) {
      await walkTo(p, floors[p.floor].lift, carry);
      await liftRide(p, to.floor);
    }
    await walkTo(p, to.desk.spot, carry, true);
  }
  async function goHome(p) {
    if (p.floor !== p.home) {
      await walkTo(p, floors[p.floor].lift);
      await liftRide(p, p.home);
    }
    await walkTo(p, p.desk.seat);
    p.seated = true;
    p.pos = [...p.desk.seat];
    p.carry = null;
    leap(p, "tap");
  }
  /** Whether someone can be moved now: in, on the floor shown, not on another errand. */
  const here = (p) => p.present && !p.inLift && p.floor === plan.index;
  const latest = (id) => data?.requests.find((r) => r.id === id);

  // ---- a request's life, as the relay reports it
  /** Asked: the asker's mini-me carries it over (or throws it, folded, when the desk is far) and it lands on the pile. */
  async function handOver(r) {
    const a = people.get(r.from),
      b = people.get(r.to);
    if (!a || !b || a === b) return;
    await until(() => !a.busy && !b.busy);
    if (!here(a) || (!here(b) && b.present)) {
      settle(a);
      settle(b);
      return;
    }
    a.busy = b.busy = true;
    a.doing = { kind: "ask", who: b };
    dataKey = "";
    const far = farOff(a, b),
      what = clip(r.text, 70);
    const home = () => (far ? Promise.resolve() : goHome(a));
    try {
      if (a.seated) await wait(220);
      if (far) {
        lookAt(a, b);
        say(a, W.say.bring(b.name, a.name, what), 2400, "say small");
        await wait(900);
        await throwPlane(a, b);
      } else {
        await goTo(a, b, "sheet");
        lookAt(a, b);
        say(a, W.say.bring(b.name, a.name, what), 3000);
        await wait(1500);
        leap(a, "tap");
        await wait(140);
        await place(a, b, "sheet");
      }
      if (!b.present || b.status === "offline") {
        await wait(420);
        say(a, W.say.leftOnDesk(b.name), 2800);
        await wait(2400);
        await home();
        return;
      }
      lookAt(b, a);
      fx("bang", b);
      leap(b, "flip");
      setMood(b, "surprised");
      await wait(820);
      say(b, W.say.gotIt, 1800);
      await wait(1400);
      b.bot.gaze = null;
      const back = home();
      if (latest(r.id)?.state !== "SUBMITTED") {
        await wait(500);
        await takeUp(b);
      }
      await back;
    } finally {
      a.busy = b.busy = false;
      a.doing = null;
      dataKey = "";
      settle(a);
      settle(b);
    }
  }
  /** Taken up: the sheet goes from the pile onto the laptop and the mini-me gets to work. */
  async function takeUp(b) {
    if (b.stack > 0) {
      b.stack--;
      redraw(b, "stack");
    }
    await fly(trayOf(b), lapOf(b), "sheet", 300, 12);
    b.working = true;
    setMood(b, "working");
  }
  async function pickUp(r) {
    const b = people.get(r.to);
    if (!b) return;
    await until(() => !b.busy);
    if (!here(b)) {
      settle(b);
      return;
    }
    b.busy = true;
    try {
      await takeUp(b);
    } finally {
      b.busy = false;
      settle(b);
    }
  }
  /** Answered: the answer comes back to the asker's desk. Done is stamped on the floor; when more is needed, the asker is asked. */
  async function answerBack(r) {
    const a = people.get(r.from),
      b = people.get(r.to);
    if (!a || !b || a === b) return;
    await until(() => !a.busy && !b.busy);
    if (!here(a) || !here(b)) {
      settle(a);
      settle(b);
      return;
    }
    a.busy = b.busy = true;
    b.doing = { kind: "answer", who: a };
    dataKey = "";
    const far = farOff(a, b),
      done = r.state === "COMPLETED",
      text = clip(r.answer, 90);
    try {
      leap(b, "tap");
      await wait(200);
      if (far) {
        lookAt(b, a);
        if (text) say(b, text, 2600, "say small");
        await wait(800);
        await throwPlane(b, a, false);
      } else {
        await goTo(b, a, "done");
        lookAt(b, a);
        lookAt(a, b);
        if (text) say(b, text, 2800);
        await wait(1500);
        leap(b, "tap");
        await wait(140);
        await place(b, a, "done", false);
      }
      if (done) {
        leap(a, "hop");
        setMood(a, "happy");
        sparkle(a);
        stamp(a);
        say(a, W.say.thanks(b.name), 1800);
      } else {
        lookAt(a, b);
        fx("ask", a, { ember: a.mine, dur: 1.4 });
        leap(a, "tap");
      }
      await wait(1300);
      const homeB = far ? Promise.resolve() : goHome(b);
      await wait(900);
      a.bot.gaze = null;
      await homeB;
    } finally {
      a.busy = b.busy = false;
      b.doing = null;
      dataKey = "";
      settle(a);
      settle(b);
    }
  }
  /** DONE thumped on the floor by the desk whose request came back answered. */
  function stamp(p) {
    if (REDUCED || p.floor !== plan.index) return;
    const g = document.createElementNS(SVGNS, "g");
    g.innerHTML = stampSvg(p.desk.x0 + 1, p.desk.y1 + 10, W.done);
    (refs.marks || gUnder).appendChild(g);
    setTimeout(() => g.remove(), 3600);
  }

  // ---- the office between requests: now and then someone free goes for tea
  async function teaRun(p) {
    const fl = floors[p.floor],
      spot = fl.spots.tea;
    if (!spot) return;
    p.busy = true;
    p.doing = { kind: "tea" };
    try {
      await walkTo(p, spot);
      p.bot.gaze = [-4, -6];
      if (refs.steam?.isConnected) refs.steam.classList.add("on");
      await wait(2600);
      if (refs.steam) refs.steam.classList.remove("on");
      leap(p, "bounce");
      setMood(p, "happy");
      fx("heart", p, { dur: 1.1, scale: 0.75 });
      await wait(560);
      await walkTo(p, p.desk.seat, "cup");
      p.seated = true;
      p.pos = [...p.desk.seat];
      p.carry = null;
      leap(p, "tap");
    } finally {
      p.busy = false;
      p.doing = null;
      p.bot.gaze = null;
      settle(p);
    }
  }
  async function life() {
    await wait(14000);
    for (;;) {
      await wait(9000 + Math.random() * 9000);
      const free = [...people.values()].filter(
        (p) =>
          !p.busy &&
          !p.mine &&
          p.status === "active" &&
          here(p) &&
          p.seated &&
          restMood(p) === "idle",
      );
      if (free.length)
        spawn(() => teaRun(free[Math.floor(Math.random() * free.length)]));
    }
  }

  // ---- a meeting of the mini-mes: those in it gather round the reading corner's low table, each
  // says its piece over its head as it comes in, and they go back to their desks once it is over
  let meet = null;
  /** Places round the low table for `n` mini-mes, on the side away from the shelf. */
  function meetSeats(fl, n) {
    const c = fl.meetAt;
    if (!c) return [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const ring = Math.floor(i / 8),
        inRing = Math.min(8, n - ring * 8),
        a = -0.12 * Math.PI + (1.24 * Math.PI * ((i % 8) + 0.5)) / inRing;
      out.push([
        c[0] + Math.cos(a) * (12 + ring * 6),
        c[1] + Math.sin(a) * (8 + ring * 5),
      ]);
    }
    return out;
  }
  async function joinMeeting(p, seat, center) {
    await until(() => !p.busy);
    if (!meet?.open || !meet.members.has(p.id) || !here(p)) return;
    p.busy = true;
    p.doing = { kind: "meeting" };
    meet.going.add(p.id);
    try {
      if (p.seated) await wait(200);
      await walkTo(p, seat);
      lookAt(p, { pos: center });
      meet.at.add(p.id);
      const said = meet.waiting.get(p.id);
      if (said) {
        meet.waiting.delete(p.id);
        speak(p, said);
      }
      if (!meet.open) await leaveMeeting(p);
    } catch (e) {
      p.busy = false;
      p.doing = null;
      throw e;
    }
  }
  async function leaveMeeting(p) {
    if (p.doing?.kind !== "meeting") return;
    try {
      await wait(400 + Math.random() * 900);
      await walkTo(p, p.desk.seat);
      p.seated = true;
      p.pos = [...p.desk.seat];
      leap(p, "tap");
    } finally {
      p.busy = false;
      p.doing = null;
      p.bot.gaze = null;
      settle(p);
    }
  }
  /**
   * One post said over its mini-me's head. The meeting has one floor: each waits for the one
   * before to be read, as people take turns, and an answer looks at whom it answers.
   */
  function speak(p, post) {
    const m = meet;
    if (!m) return;
    m.queue.push([p, post]);
    if (!m.speaking)
      spawn(async () => {
        m.speaking = true;
        try {
          while (m.queue.length) {
            const [who, said] = m.queue.shift();
            const to = said.replyTo && m.posts.get(said.replyTo);
            const other = to && people.get(to.from);
            if (other && other !== who && here(other)) lookAt(who, other);
            leap(who, "bounce");
            const ms = 5500 + Math.min(4500, said.text.length * 28);
            say(who, clip(said.text, 96), ms, "say meet");
            await wait(ms - 400);
          }
        } finally {
          m.speaking = false;
        }
      });
  }
  /** Brings the floor in line with the office's meeting: who gathers, who speaks, when they go back. */
  function syncMeeting(m) {
    if (!m) {
      if (meet?.open) endMeeting();
      meet = null;
      return;
    }
    if (!meet || meet.id !== m.id) {
      if (meet?.open) endMeeting();
      // what was said before this view saw the meeting is not said again, but its last words are
      const before = new Set(m.posts.slice(0, -1).map((post) => post.id));
      meet = {
        id: m.id,
        open: false,
        members: new Set(m.members),
        going: new Set(),
        at: new Set(),
        said: before,
        waiting: new Map(),
        posts: new Map(),
        queue: [],
        speaking: false,
      };
    }
    for (const post of m.posts) meet.posts.set(post.id, post);
    if (m.state === "open" && !meet.open && plan) {
      meet.open = true;
      const fl = floors[plan.index],
        center = fl.meetAt,
        gathering = m.members
          .map((id) => people.get(id))
          .filter(
            (p) =>
              p &&
              p.present &&
              p.floor === plan.index &&
              !(p.mine && m.mineOut),
          ),
        seats = meetSeats(fl, gathering.length);
      if (center)
        gathering.forEach((p, i) =>
          spawn(() => joinMeeting(p, seats[i], center)),
        );
    }
    for (const post of m.posts) {
      if (meet.said.has(post.id)) continue;
      meet.said.add(post.id);
      const p = people.get(post.from);
      if (!p || !post.text.trim() || !here(p)) continue;
      // one still on its way says it once it sits down
      if (meet.going.has(p.id) && !meet.at.has(p.id))
        meet.waiting.set(p.id, post);
      else speak(p, post);
    }
    if (m.state === "closed" && meet.open) endMeeting();
  }
  function endMeeting() {
    const m = meet;
    if (!m) return;
    m.open = false;
    // everyone stays until the last word is read, then goes back to their desk
    spawn(async () => {
      await until(() => !m.speaking && !m.queue.length);
      await wait(1200);
      for (const id of m.at) {
        const p = people.get(id);
        if (p) spawn(() => leaveMeeting(p));
      }
    });
  }

  // ---- camera
  function screenBounds(bx) {
    let a0 = Infinity,
      a1 = -Infinity,
      c0 = Infinity,
      c1 = -Infinity;
    for (const x of [bx[0], bx[2]])
      for (const y of [bx[1], bx[3]])
        for (const z of [bx[4], bx[5]]) {
          const [u, v] = at(x, y, z);
          a0 = Math.min(a0, u);
          a1 = Math.max(a1, u);
          c0 = Math.min(c0, v);
          c1 = Math.max(c1, v);
        }
    return [a0, c0, a1, c1];
  }
  function fitRect([a0, c0, a1, c1], ins = {}, maxS = 2.2) {
    const i = { l: 28, r: 28, t: 60, b: 96, ...ins },
      aw = Math.max(80, cw - i.l - i.r),
      ah = Math.max(80, ch - i.t - i.b);
    const s = Math.min(aw / (a1 - a0), ah / (c1 - c0), maxS);
    return {
      x: a0 - (i.l + (aw - (a1 - a0) * s) / 2) / s,
      y: c0 - (i.t + (ah - (c1 - c0) * s) / 2) / s,
      w: cw / s,
      h: ch / s,
    };
  }
  const viewFor = (bx, ins, maxS) => fitRect(screenBounds(bx), ins, maxS);
  const union = (a, b) => [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
  const rectOf = (pts) => [
    Math.min(...pts.map((q) => q[0])),
    Math.min(...pts.map((q) => q[1])),
    Math.max(...pts.map((q) => q[0])),
    Math.max(...pts.map((q) => q[1])),
  ];
  const boardBounds = (fl) => {
    const B = fl.board,
      pts = [];
    for (const lx of [0, FB.w])
      for (const ly of [0, FB.h])
        pts.push(at(B.x, B.y - lx * 0.1, B.z - ly * 0.1));
    return rectOf(pts);
  };
  const signBounds = (fl) => {
    const G = fl.sign,
      pts = [];
    for (const lx of [0, SIGN.w])
      for (const ly of [0, SIGN.h])
        pts.push(at(G.x + ly * 0.1, G.y - lx * 0.1, -2.6));
    return rectOf(pts);
  };
  /** Mini-mes are never drawn smaller than this on screen, as Thursday keeps its bots. */
  let boost = 1;
  function setCam(v) {
    cam = v;
    sc = cw / v.w;
    boost = Math.max(1, 36 / (BODY_PX * sc));
    const vb = `${r1(v.x)} ${r1(v.y)} ${r1(v.w)} ${r1(v.h)}`;
    for (const el of sheets) el.setAttribute("viewBox", vb);
  }
  function glide(v, ms = 1000) {
    if (REDUCED) {
      setCam(v);
      buildScene();
      return;
    }
    if (!asmUntil) buildScene(false, v);
    anim = { from: { ...cam }, to: v, t0: performance.now(), ms };
  }
  const narrow = () => cw < 760;
  const floorView = () =>
    fitRect(
      union(
        union(
          screenBounds([-6, -6, plan.W + 4, plan.D + 4, -2.6, WALL_H]),
          boardBounds(plan),
        ),
        signBounds(plan),
      ),
      narrow()
        ? { t: 48, b: onAsk ? 140 : 70, l: 10, r: 10 }
        : { t: 44, b: 84, l: 16 + insetL, r: 16 + insetR },
    );
  /** The scoreboard, as large as it fits. */
  const boardView = () => {
    const r = boardBounds(plan);
    return fitRect(
      [r[0] - 30, r[1] - 30, r[2] + 30, r[3] + 10],
      narrow()
        ? { t: 56, b: onAsk ? 150 : 80, l: 8, r: 8 }
        : { t: 56, b: 96, l: 40 + insetL, r: 40 + insetR },
      2.6,
    );
  };
  const deskView = (p) => {
    const d = p.desk;
    return viewFor(
      [d.px, d.py, d.px + PW, d.py + PD, 0, 24],
      !narrow()
        ? { r: Math.max(360, insetR + 40), t: 70, b: 110 }
        : { b: Math.round(ch * 0.56) + 20 },
      1.5,
    );
  };

  // ---- the panel beside the office for one person
  function openPanel(p) {
    panel.hidden = false;
    if (!panelShown) {
      panelShown = true;
      onPanel?.(true);
    }
    panelKey = "";
    unmountBot(panelRec);
    panel.innerHTML = `<header><span class="pb"></span><div><b></b><span></span></div><button type="button" class="x" aria-label="${esc(W.panel.close)}">${ICON.close}</button></header><div class="pbody"></div>`;
    const look = p.look;
    panelRec = mountBot(
      panel.querySelector(".pb"),
      {
        color: look.color,
        shape: look.shape,
        paint: look.paint,
        mood: p.bot.mood,
        phase: p.bot.phase,
      },
      52,
    );
    panelRec.follow = p;
    panel.querySelector(".x").addEventListener("click", () => closeFocus());
    renderPanel();
  }
  function closePanel() {
    panel.hidden = true;
    if (panelShown) {
      panelShown = false;
      onPanel?.(false);
    }
    unmountBot(panelRec);
    panelRec = null;
  }
  function closeFocus() {
    focus = null;
    boardOn = false;
    closePanel();
    setViewSeg("office");
    if (plan) glide(floorView());
  }
  const statusWord = (p) =>
    p.status === "offline"
      ? W.panel.off
      : p.status === "away"
        ? W.panel.away
        : W.panel.atDesk;
  const nameOf = (id) =>
    id === me?.id ? W.plate.youShort : people.get(id)?.name || "";
  function renderPanel() {
    const p = focus;
    if (!p || panel.hidden) return;
    let body = "";
    if (asking(p))
      body += p.mine
        ? `<div class="decide"><small>${esc(W.panel.needsYou)}</small><p>${esc(decision?.text || "")}</p><div class="acts"><button type="button" class="btn solid" data-pa="answer">${esc(W.answer)}</button></div></div>`
        : `<div class="decide other"><small>${esc(W.panel.waitingOn(p.name))}</small></div>`;
    body += `<div class="stats"><div><b>${p.stack}</b><span>${esc(W.panel.onDesk)}</span></div><div><b>${p.doneToday || 0}</b><span>${esc(W.panel.doneToday)}</span></div><div><b>${p.out || 0}</b><span>${esc(W.panel.asked)}</span></div></div>`;
    const d = p.doing,
      now =
        d && (d.kind === "ask" || d.kind === "answer")
          ? W.plate.goingTo(d.who.name)
          : d?.kind === "meeting"
            ? W.meeting.on
            : p.taskFull
              ? W.panel.workingOn(p.taskFull)
              : p.waitOn
                ? W.panel.waitingFor(p.waitOn)
                : "";
    body += `<div class="pblock"><small>${esc(W.panel.now)}</small><ul class="rows">${now ? `<li><i></i>${esc(now)}</li>` : `<li class="none">${esc(p.status === "offline" ? W.panel.notIn(p.name) : W.panel.free)}</li>`}</ul></div>`;
    if (!p.mine && p.ways?.length)
      body += `<div class="pblock"><small>${esc(W.panel.ways(p.name))}</small><ul class="rows">${p.ways
        .slice(0, 4)
        .map((w) => `<li><i class="past"></i>${esc(clip(w, 140))}</li>`)
        .join("")}</ul></div>`;
    if (p.menu?.length)
      body += `<div class="pblock"><small>${esc(p.mine ? W.panel.myMenu : W.panel.menu(p.name))}</small><div class="tags">${p.menu
        .slice(0, 6)
        .map((m) => `<span>${esc(clip(m, 60))}</span>`)
        .join("")}</div></div>`;
    const past = (data?.requests || [])
      .filter((r) => r.from === p.id || r.to === p.id)
      .slice(0, 4);
    body += `<div class="pblock"><small>${esc(W.panel.earlier)}</small><ul class="rows">${past.length ? past.map((r) => `<li><i class="past"></i><span>${esc(clip(r.text, 80))}<em>${esc(`${nameOf(r.from)} → ${nameOf(r.to)} · ${W.requestState(r.state)}`)}</em></span></li>`).join("") : `<li class="none">${esc(W.panel.nothingYet)}</li>`}</ul></div>`;
    const key = p.id + body + p.status;
    if (key === panelKey) return;
    panelKey = key;
    panel.querySelector("header b").textContent = p.botName;
    // the viewer's own panel names them; a colleague's says what they do and where they are
    panel.querySelector("header div span").textContent = (
      p.mine ? [p.name, p.role] : [p.role, statusWord(p)]
    )
      .filter(Boolean)
      .join(" · ");
    panel.querySelector(".pbody").innerHTML = body;
  }
  on(panel, "click", (e) => {
    if (e.target.closest("[data-pa]")) onAnswer?.();
  });
  on(panel, "pointerdown", (e) => e.stopPropagation());
  function focusOn(id) {
    const p = people.get(id);
    if (!p || !plan) return;
    const fi = p.inLift ? p.home : p.floor;
    if (fi !== plan.index) switchFloor(fi);
    focus = p;
    setViewSeg(p.mine ? "desk" : "");
    openPanel(p);
    userMoved = true;
    glide(deskView(p), 850);
  }
  function showBoard() {
    focus = null;
    closePanel();
    boardOn = true;
    userMoved = true;
    setViewSeg("board");
    glide(boardView(), 900);
  }
  function setViewSeg(v) {
    for (const b of viewSeg.children)
      b.setAttribute("aria-pressed", String(b.dataset.view === v));
  }

  // ---- what is drawn each frame
  function moveBot(p, dt) {
    if (p.walk) {
      const w = p.walk,
        u = clamp((simT - w.t0) / w.dur, 0, 1),
        pr = paced(u, w.dur),
        [x, y, dx, dy] = along(w.r, pr, w.L);
      p.pos = [x, y];
      p.z = lerp(p.z, 0, 1 - Math.exp(-dt * 14));
      p.step = (w.L * pr) / STEP;
      const n = Math.floor(p.step);
      if (n !== p.stepN && u < 0.98) {
        p.stepN = n;
        if (n % 4 === 0 && p.floor === plan.index)
          fx("puff", null, {
            at: at(x, y, 0),
            anim: "ring",
            dur: 0.5,
            scale: 0.7,
          });
      }
      const sx = (dx - dy) * 0.894,
        sy = (dx + dy) * 0.447,
        L = Math.hypot(sx, sy);
      if (L > 0.001) {
        p.bot.gaze = [(sx / L) * 11, (sy / L) * 5 - 1];
        p.dir = lerp(p.dir, sx / L, 1 - Math.exp(-dt * 10));
      }
      if (w.trail) {
        w.trail.setAttribute("opacity", r2(1 - pr));
        if (u >= 1) w.trail.remove();
      }
      if (u >= 1) {
        p.walk = null;
        p.bot.gaze = null;
        refreshMood(p);
        if (w.g === GEN) w.res();
      }
    } else {
      p.z = lerp(p.z, p.seated ? SEAT_Z : 0, 1 - Math.exp(-dt * 10));
      p.dir = lerp(p.dir, 0, 1 - Math.exp(-dt * 4));
    }
  }
  function drawBot(p) {
    const [fx0, fy0] = at(p.pos[0], p.pos[1], p.z);
    let lift = 0,
      spin = 0,
      sx = 1,
      sy = 1,
      tilt = 0,
      alpha = 1;
    if (p.walk) {
      const s = stepAt(p.step % 1);
      lift = s.lift * BODY_PX * boost;
      sx = s.sx;
      sy = s.sy;
      tilt = 5 * p.dir + 1.6 * Math.sin(p.step * Math.PI);
    }
    if (p.leap) {
      const l = leapAt(p.leap.kind, simT - p.leap.t0);
      if (l.done) p.leap = null;
      else {
        lift += l.lift * BODY_PX * boost;
        spin = l.spin;
        sx *= l.sx;
        sy *= l.sy;
      }
    }
    const pu = simT - p.popAt;
    if (p.fade) {
      const u = clamp((simT - p.fade.t0) / p.fade.dur, 0, 1);
      alpha = p.fade.out ? 1 - u : u;
      if (u >= 1 && !p.fade.out) p.fade = null;
    }
    if (pu < 0) alpha = 0;
    else if (pu < DROP_FALL + DROP_LAND) {
      const d = dropAt(pu);
      lift += d.lift * BODY_PX * boost;
      sx *= d.sx;
      sy *= d.sy;
      alpha = d.alpha;
      if (!p.landed && pu > DROP_FALL) {
        p.landed = true;
        fx("puff", null, { at: [fx0, fy0], anim: "ring", dur: 0.55 });
      }
    }
    p.lift = lift;
    const k = p.k * boost,
      H = 2 * R * p.bot.hh;
    const op = alpha < 1 ? String(r2(alpha)) : "";
    if (op !== p.op) {
      p.op = op;
      p.g.style.opacity = op;
    }
    const bt = `translate(${r1(fx0)} ${r1(fy0 - lift)}) rotate(${r1(tilt)}) scale(${r3(k * sx)} ${r3(k * sy)}) translate(0 ${r1(-H / 2)}) rotate(${r1(spin)}) translate(${-CX} ${r1(-(CY + p.bot.anchor) + H / 2)})`;
    if (bt !== p.bt) {
      p.bt = bt;
      p.bscale.setAttribute("transform", bt);
    }
    if (p.cl && alpha < 0.05 !== !!p.clHid) {
      p.clHid = alpha < 0.05;
      p.cl.style.display = p.clHid ? "none" : "";
    }
    const standing = !p.seated || p.walk;
    const shOn = standing && alpha > 0;
    if (shOn !== p.shOn) {
      p.shOn = shOn;
      p.shadow.style.display = shOn ? "" : "none";
    }
    if (shOn) {
      const fs = at(p.pos[0], p.pos[1], 0),
        k2 = clamp(1 - lift / 90, 0.45, 1),
        sk = `${r1(fs[0])} ${r1(fs[1])} ${r1(38 * k2 * boost)} ${r1(13 * k2 * boost)}`;
      if (sk !== p.shK) {
        p.shK = sk;
        const [a, b, c, d] = sk.split(" ");
        p.shadow.setAttribute("cx", a);
        p.shadow.setAttribute("cy", b);
        p.shadow.setAttribute("rx", c);
        p.shadow.setAttribute("ry", d);
      }
    }
    const ck = p.carry || "";
    if (ck !== p.ck) {
      p.ck = ck;
      p.carryG.style.display = ck ? "" : "none";
      p.carryG.setAttribute("class", `carry${ck === "cup" ? " cup" : ""}`);
      p.tickG.style.display = ck === "done" ? "" : "none";
    }
    if (ck) {
      const [cx, cy] = carryAt(p);
      p.carryG.setAttribute(
        "transform",
        `translate(${r1(cx)} ${r1(cy - lift)}) rotate(${r1(-5 + tilt * 0.8 + 3 * Math.sin(p.step * Math.PI * 2))}) scale(${r2(boost)})`,
      );
    }
  }
  function slotOf(p) {
    const bx = p.pos[0],
      by = p.pos[1],
      self = { x0: bx - 0.4, y0: by - 0.4, x1: bx + 0.4, y1: by + 0.4 };
    let lastBehind = -1,
      firstFront = sceneOrder.length;
    for (let i = 0; i < sceneOrder.length; i++) {
      const o = sceneOrder[i],
        fr = inFront(self, o),
        bk = inFront(o, self);
      let front = fr;
      if (fr === bk)
        front = bx + by > (fr ? o.x1 + o.y0 : (o.x0 + o.x1 + o.y0 + o.y1) / 2);
      if (front) lastBehind = i;
      else if (i < firstFront) firstFront = i;
    }
    return Math.min(lastBehind + 1, firstFront);
  }
  /**
   * Whatever moves sits on the top sheet, over the still drawing. To stay behind what stands in front of it,
   * each one carries copies of those pieces, cut to its own outline: inside the outline the copies cover it
   * as the pieces would, outside it nothing is drawn twice. The still drawing is then never touched by a
   * walk, and the browser repaints a few hundred elements a frame instead of thousands.
   */
  let LIVE_N = 0;
  const sheetEl = (cls) => {
    const el = document.createElementNS(SVGNS, "svg");
    el.setAttribute("class", `of-s ${cls}`);
    el.setAttribute("aria-hidden", "true");
    el.setAttribute("viewBox", liveSvg.getAttribute("viewBox") || "0 0 1 1");
    sheets.add(el);
    return el;
  };
  /**
   * Each mover gets two small sheets of its own: one for itself, one above it for the copies, so a mini-me
   * breathing at its desk repaints a handful of shapes and nothing else. The copies are cut to the mover's
   * outline, grown a little so a breath or a hop stays inside, and that outline is only renewed when the
   * mover goes somewhere or changes its pose.
   */
  function liveOf(a) {
    if (a.sv) return a;
    const n = ++LIVE_N;
    a.sv = sheetEl("act");
    a.sv.appendChild(a.g);
    a.cv = sheetEl("cov");
    a.cv.innerHTML = `<defs><clipPath id="of-lc${n}">${a.bot ? "<path/><ellipse/>" : `<ellipse rx="27" ry="15" cy="-5"/>`}</clipPath></defs><g class="cl" clip-path="url(#of-lc${n})"></g>`;
    a.cl = a.cv.lastChild;
    a.clipP = a.cv.querySelector("clipPath").firstChild;
    a.clipE = a.cv.querySelector("ellipse");
    a.occKey = null;
    a.occ = [];
    a.near = null;
    a.clipT = "";
    a.clipAt = -9;
    a.clipMood = "";
    return a;
  }
  const liveOn = (a) => a.sv && a.sv.parentNode === gLive;
  function liveOff(a) {
    if (a.sv?.parentNode) {
      a.sv.remove();
      a.cv.remove();
    }
    a.slot = -2;
  }
  /** A piece is copied once it has finished arriving, so a copy never shows it whole while the drawing is still sketching it in. */
  const settled = (o) => !asmUntil || simT >= asmT0 + (o.t0 + 1500) / 1000;
  const placed = [];
  function placeLive(a, rect, clipT) {
    liveOf(a);
    if (a.sv.parentNode !== gLive) gLive.append(a.sv, a.cv);
    const s = slotOf(a),
      n = a.near;
    if (
      a.occKey === null ||
      s !== a.slot ||
      asmUntil ||
      !n ||
      rect[0] < n[0] ||
      rect[1] < n[1] ||
      rect[2] > n[2] ||
      rect[3] > n[3]
    ) {
      // the box the copies are chosen for, a little larger than the mover, kept while it stays inside
      const m = (rect[2] - rect[0]) * 0.15,
        nb = [rect[0] - m, rect[1] - m, rect[2] + m, rect[3] + m],
        list = [];
      let key = "";
      for (let i = Math.max(0, s); i < sceneOrder.length; i++) {
        const o = sceneOrder[i],
          b = o.tb;
        if (
          b[0] < nb[2] &&
          nb[0] < b[2] &&
          b[1] < nb[3] &&
          nb[1] < b[3] &&
          o.node &&
          settled(o)
        ) {
          list.push(o);
          key += `${i},`;
        }
      }
      a.near = nb;
      a.slot = s;
      if (key !== a.occKey) {
        // keep the copies still wanted, add the new ones in drawing order, drop the rest: a walk past a row of desks adds one desk at a time
        const had = a.copies || new Map(),
          next = new Map(),
          wanted = new Set(list);
        let at0 = a.cl.firstChild;
        for (const o of list) {
          let c = had.get(o);
          if (c && c.parentNode === a.cl) {
            while (at0 && at0 !== c) {
              const nx = at0.nextSibling;
              if (!wanted.has(at0.__o)) at0.remove();
              at0 = nx;
            }
            at0 = c.nextSibling;
          } else {
            c = o.node.cloneNode(true);
            c.__o = o;
            a.cl.insertBefore(c, at0);
          }
          next.set(o, c);
        }
        while (at0) {
          const nx = at0.nextSibling;
          at0.remove();
          at0 = nx;
        }
        a.copies = next;
        a.occKey = key;
        a.occ = list;
      }
    }
    if (!a.bot) {
      if (clipT !== a.clipT) {
        a.clipT = clipT;
        a.clipE.setAttribute("transform", clipT);
      }
    } else if (
      a.occ.length &&
      (clipT !== a.clipT ||
        a.bot.mood !== a.clipMood ||
        simT - a.clipAt > (simT - a.moodAt < 0.6 ? 0 : 0.8) ||
        a.clipN !== a.occKey)
    ) {
      a.clipN = a.occKey;
      if (a.bot.mood !== a.clipMood) {
        a.clipMood = a.bot.mood;
        a.moodAt = simT;
      }
      a.clipT = clipT;
      a.clipAt = simT;
      const ay = r1(CY + a.bot.anchor),
        d = a.bot.path.getAttribute("d") || "";
      if (d !== a.clipD) {
        a.clipD = d;
        a.clipP.setAttribute("d", d);
      }
      a.clipP.setAttribute(
        "transform",
        `${clipT} translate(${CX} ${ay}) scale(1.05 1.08) translate(${-CX} ${-ay})`,
      );
      const sh = a.shadow;
      if (sh.style.display === "none") a.clipE.setAttribute("rx", "0");
      else
        for (const k of ["cx", "cy", "rx", "ry"])
          a.clipE.setAttribute(k, sh.getAttribute(k));
    }
    placed.push(a);
  }
  /** Back to front on the top sheet as in the drawing: by place among the pieces, then by depth. */
  function orderLive() {
    placed.sort(
      (a, b) => a.slot - b.slot || a.pos[0] + a.pos[1] - (b.pos[0] + b.pos[1]),
    );
    let ref = gLive.firstChild;
    for (const a of placed) {
      if (ref === a.sv) {
        ref = a.cv.nextSibling;
        continue;
      }
      gLive.insertBefore(a.sv, ref);
      gLive.insertBefore(a.cv, ref);
    }
    placed.length = 0;
  }
  const SHEET = (kind) =>
    `<rect class="sheet" x="-12" y="-15" width="24" height="30" rx="2.5"/><path class="ln" d="M-7 -8H7M-7 -3H7M-7 2H2"/>${kind === "done" ? `<path class="tick" d="M-4.5 8.5L-1 11.6L5.5 4.6"/>` : ""}`;
  function drawFliers() {
    for (let i = fliers.length - 1; i >= 0; i--) {
      const f = fliers[i];
      if (f.g !== GEN) {
        if (f.el) f.el.remove();
        if (f.wake) f.wake.remove();
        fliers.splice(i, 1);
        continue;
      }
      if (f.plane) {
        if (!f.el) {
          f.el = document.createElementNS(SVGNS, "g");
          f.el.setAttribute("class", "plane");
          f.el.innerHTML = PLANE;
          f.wake = document.createElementNS(SVGNS, "path");
          f.wake.setAttribute("class", "wake");
          gFly.appendChild(f.wake);
          gFly.appendChild(f.el);
        }
        const u = clamp((simT - f.t0) / f.dur, 0, 1),
          d = Math.hypot(f.to[0] - f.from[0], f.to[1] - f.from[1]),
          hgt = clamp(d * 0.32, 60, 230) * Math.min(boost, 2);
        const pos = (k) => {
          const e = easeInOut(k);
          return [
            lerp(f.from[0], f.to[0], e),
            lerp(f.from[1], f.to[1], e) - Math.sin(k * Math.PI) * hgt,
          ];
        };
        const [x, y] = pos(u),
          [x2, y2] = pos(Math.min(1, u + 0.02)),
          ang = (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI;
        f.pts.push([x, y]);
        f.wake.setAttribute(
          "d",
          `M${f.pts.map((q) => `${r1(q[0])} ${r1(q[1])}`).join("L")}`,
        );
        f.el.setAttribute(
          "transform",
          `translate(${r1(x)} ${r1(y)}) rotate(${r1(ang)}) scale(${r2((1 - 0.3 * u) * boost)})`,
        );
        if (u >= 1) {
          f.el.remove();
          const w = f.wake;
          w.style.opacity = "0";
          setTimeout(() => w.remove(), 700);
          fliers.splice(i, 1);
          f.res();
        }
        continue;
      }
      if (!f.el) {
        f.el = document.createElementNS(SVGNS, "g");
        f.el.setAttribute("class", "carry");
        f.el.innerHTML = SHEET(f.kind);
        gFly.appendChild(f.el);
      }
      const u = clamp((simT - f.t0) / f.dur, 0, 1),
        e = easeInOut(u),
        x = lerp(f.from[0], f.to[0], e),
        y = lerp(f.from[1], f.to[1], e) - Math.sin(u * Math.PI) * f.arc;
      f.el.setAttribute(
        "transform",
        `translate(${r1(x)} ${r1(y)}) rotate(${r1(-5 + 40 * e)}) scale(${r2((1 - 0.35 * e) * boost)} ${r2((1 - 0.62 * e) * boost)})`,
      );
      if (u >= 1) {
        f.el.remove();
        fliers.splice(i, 1);
        f.res();
      }
    }
  }
  const toScreen = (wx, wy) => [(wx - cam.x) * sc, (wy - cam.y) * sc];
  function headOf(p) {
    const [hx, hy] = headOfWorld(p);
    return toScreen(hx, hy - 18);
  }
  function plateOf(p) {
    if (asking(p))
      return [
        p.mine ? W.plate.needsYou : W.plate.deciding,
        p.mine ? "mine" : "on",
      ];
    const n = p.stack,
      more = n ? ` · ${W.plate.onDesk(n)}` : "";
    if (p.status === "offline") return [`${W.plate.computerOff}${more}`, "off"];
    const d = p.doing;
    if (d && (d.kind === "ask" || d.kind === "answer"))
      return [W.plate.goingTo(d.who.name), "on"];
    if (d?.kind === "meeting") return [W.meeting.on, "on"];
    if (p.mood === "working") return [`${W.plate.working}${more}`, "on"];
    if (p.status === "away") return [`${W.plate.away}${more}`, ""];
    return [`${W.plate.free}${more}`, ""];
  }
  function updateOverlays() {
    const detail = BODY_PX * sc >= 58;
    for (const p of people.values()) {
      const onFloor = p.floor === plan.index && !p.inLift && p.present,
        b = bubbles.get(p.id);
      const [hx, hy] = onFloor ? headOf(p) : [-9999, -9999];
      const inside = hx > -160 && hx < cw + 160 && hy > -80 && hy < ch + 240;
      if (b) {
        if (b.typed < b.full.length && EVEN) {
          b.typed += 3.4;
          b.txt.textContent = b.full.slice(0, Math.ceil(b.typed));
        }
        if (simT > b.until) unsay(p);
        const show =
          onFloor &&
          inside &&
          simT >= p.popAt + 0.6 &&
          // a meeting is watched from afar too: what the mini-mes say there always shows
          (detail ||
            p.mine ||
            b.kind.includes("mine") ||
            b.kind.includes("meet"));
        if (b.el.hidden === show) b.el.hidden = !show;
        if (show)
          b.el.style.transform = `translate(${r1(hx)}px, ${r1(hy - 4)}px) translate(-50%, -100%)`;
      }
      const showPlate =
        onFloor &&
        inside &&
        !bubbles.has(p.id) &&
        simT >= p.popAt + 0.9 &&
        (hover === p.id ||
          focus === p ||
          p.mine ||
          (detail && (p.status === "offline" || p.stack >= 8 || asking(p))));
      if (!showPlate) {
        if (!p.plate.hidden) p.plate.hidden = true;
        continue;
      }
      const [label, cls] = plateOf(p),
        key = label + cls;
      if (key !== p.plateKey) {
        p.plateKey = key;
        p.plate.className = `plate${cls ? ` ${cls}` : ""}${p.mine ? " you" : ""}`;
        p.plate.innerHTML = `<i></i><b>${esc(p.mine ? W.plate.you(p.name) : p.name)}</b><span>${esc(label)}</span>`;
      }
      if (p.plate.hidden) p.plate.hidden = false;
      p.plate.style.transform = `translate(${r1(hx)}px, ${r1(hy)}px) translate(-50%, -100%)`;
    }
    const k = decision ? "1" : "0";
    if (hudTR.dataset.k !== k) {
      hudTR.dataset.k = k;
      hudTR.innerHTML = decision
        ? `<button type="button" class="chip need" data-need><span class="dot"></span>${esc(W.needsYouChip)}</button>`
        : "";
    }
    const mine = [...people.values()].filter((p) => p.home === plan.index),
      inNow = mine.filter((p) => p.status !== "offline" && p.present).length;
    const tl = `${plan.index}|${mine.length}|${inNow}|${floors.length}`;
    if (hudTL.dataset.k !== tl) {
      hudTL.dataset.k = tl;
      hudTL.innerHTML =
        (floors.length > 1
          ? `<div class="floors" role="group" aria-label="${esc(W.floorGroup)}">${floors.map((_f, i) => `<button type="button" data-f="${i}" aria-pressed="${i === plan.index}">${BASE_FLOOR + i}F</button>`).join("")}</div>`
          : "") +
        `<span class="note"><b>${esc(plan.name)}</b> · ${esc(W.people(mine.length))}</span>`;
    }
  }
  function switchFloor(i) {
    if (i === plan.index) return;
    plan = floors[i];
    staticObjs = depthSort(piecesOf(plan));
    for (const p of people.values()) {
      liveOff(p);
      p.occKey = null;
      p.lampG = p.lapG = p.stkG = p.itemG = null;
    }
    anim = null;
    vacHome();
    buildScene();
  }

  // ---- input
  let drag = null;
  on(wrap, "pointerdown", (e) => {
    if (e.button !== 0) return;
    drag = {
      x: e.clientX,
      y: e.clientY,
      cam: { ...cam },
      moved: false,
      target: e.target,
      id: e.pointerId,
    };
  });
  on(window, "pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x,
      dy = e.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) > 4) {
      drag.moved = true;
      wrap.classList.add("dragging");
      anim = null;
      userMoved = true;
    }
    if (drag.moved)
      setCam({ ...drag.cam, x: drag.cam.x - dx / sc, y: drag.cam.y - dy / sc });
  });
  on(window, "pointerup", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    wrap.classList.remove("dragging");
    if (d.moved) {
      rebuildAt = performance.now() + 80;
      return;
    }
    const t = d.target?.closest ? d.target.closest("[data-person]") : null;
    if (t?.dataset.person) {
      const pp = people.get(t.dataset.person);
      if (pp && here(pp) && !pp.walk) {
        leap(pp, "hop");
        fx("heart", pp, { dur: 1, scale: 0.85 });
      }
      boardOn = false;
      focusOn(t.dataset.person);
    } else if (d.target?.closest?.(".board-hit")) showBoard();
  });
  on(window, "pointercancel", () => {
    drag = null;
    wrap.classList.remove("dragging");
  });
  function zoomBy(k, px = cw / 2, py = ch / 2) {
    if (!plan) return;
    const wx = cam.x + px / sc,
      wy = cam.y + py / sc,
      w = clamp(cam.w * k, cw / 1.8, floorView().w * 1.25),
      h = (w * ch) / cw;
    anim = null;
    userMoved = true;
    setCam({ x: wx - px * (w / cw), y: wy - py * (h / ch), w, h });
    rebuildAt = performance.now() + 160;
  }
  on(
    wrap,
    "wheel",
    (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      zoomBy(
        Math.exp(clamp(e.deltaY, -60, 60) * 0.01),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    },
    { passive: false },
  );
  on($("z-in"), "click", () => zoomBy(1 / 1.35));
  on($("z-out"), "click", () => zoomBy(1.35));
  for (const el of [
    $("z-in"),
    $("z-out"),
    viewSeg,
    hudTR,
    hudTL,
    oBubbles,
    $("composer"),
  ])
    on(el, "pointerdown", (e) => e.stopPropagation());
  for (const el of [svg, gLive]) {
    on(el, "pointerover", (e) => {
      const t = e.target.closest?.("[data-person]");
      hover = t ? t.dataset.person : null;
    });
    on(el, "pointerleave", () => {
      hover = null;
    });
  }
  on(oPlates, "pointerdown", (e) => {
    const t = e.target.closest("[data-person]");
    if (t) {
      e.stopPropagation();
      focusOn(t.dataset.person);
    }
  });
  on(hudTR, "click", (e) => {
    if (e.target.closest("[data-need]")) onAnswer?.();
  });
  on(hudTL, "click", (e) => {
    const b = e.target.closest("[data-f]");
    if (b) {
      switchFloor(Number(b.dataset.f));
      setCam(floorView());
      buildScene();
    }
  });
  on(viewSeg, "click", (e) => {
    const b = e.target.closest("button");
    if (!b || !plan) return;
    if (b.dataset.view === "desk") {
      boardOn = false;
      if (me) focusOn(me.id);
    } else if (b.dataset.view === "board") showBoard();
    else {
      focus = null;
      boardOn = false;
      closePanel();
      setViewSeg("office");
      if (me && me.home !== plan.index) switchFloor(me.home);
      glide(floorView());
    }
  });
  on($("sugs"), "click", (e) => {
    const b = e.target.closest("[data-text]");
    if (b) ask(b.dataset.text);
  });
  on($("ask-form"), "submit", (e) => {
    e.preventDefault();
    const input = $("ask-input"),
      v = input.value.trim();
    if (!v) return;
    input.value = "";
    ask(v);
  });
  /** Hands a request to the viewer's mini-me: it hears it over its desk, and the conversation takes it from there. */
  function ask(text) {
    onAsk?.(text);
    if (!me || !here(me)) return;
    say(me, text, 2200, "human");
    if (!decision && !me.busy) {
      setMood(me, "listening");
      spawn(async () => {
        await wait(1800);
        if (me.mood === "listening") {
          leap(me, "tap");
          settle(me);
        }
      });
    }
  }
  on(document, "keydown", (e) => {
    if (e.key === "Escape" && (focus || boardOn) && inView) closeFocus();
  });

  // ---- the way in: the company's building and a card to clock in; clocking in rides the lift up to our floor
  const lobbyView = () => {
    const H = WALL_H + 2,
      z00 = -(STOREYS - 1) * H;
    return fitRect(
      screenBounds([-70, -50, plan.W + 30, plan.D + 30, z00, H + 30]),
      narrow()
        ? { t: 16, b: Math.min(400, ch * 0.6), l: 8, r: 8 }
        : { t: 34, b: 30, l: 30, r: Math.min(460, cw * 0.42) },
      3,
    );
  };
  const liftView = () =>
    viewFor(
      [LIFT_X - 20, -4, LIFT_X + LIFT_W + 20, 22, 0, WALL_H + 2],
      narrow()
        ? { t: 40, b: 120, l: 10, r: 10 }
        : { t: 40, b: 60, l: 40, r: 40 },
      2.2,
    );
  const hhmm = (d) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  /** The card says who you are, who is already in, and what waits for you, from the same people the office will show. */
  function fillCard() {
    if (!lobbyEl || !plan) return;
    const now = new Date(),
      others = [...people.values()].filter(
        (p) => p.home === plan.index && !p.mine,
      ),
      inNow = others.filter((p) => p.status !== "offline"),
      waiting = (me ? me.want : 0) + (data ? data.waiting.count : 0);
    $("lb-h").textContent = W.lobby.greeting(now.getHours(), me ? me.name : "");
    $("lb-sub").textContent = plan.name;
    $("lb-time").textContent = hhmm(now);
    $("lb-name").textContent = me ? me.name : "";
    $("lb-role").textContent = [me?.role, W.yourMiniMe]
      .filter(Boolean)
      .join(" · ");
    $("lb-faces").innerHTML = inNow
      .slice(0, 5)
      .map(
        (p) =>
          `<svg viewBox="0 0 22 22" aria-hidden="true">${SM_DEFS}${stillMark(p.look, 0, 0, 22)}</svg>`,
      )
      .join("");
    $("lb-in").textContent = others.length
      ? W.lobby.in(inNow.length, others.length)
      : W.lobby.alone;
    $("lb-wait-row").hidden = !waiting;
    $("lb-wait").textContent = W.lobby.waiting(waiting);
  }
  function showLobby() {
    if (!lobbyEl || !plan) return;
    lobbyOn = true;
    entering = false;
    for (const g of [gBack, gFloor, gWalls, gScene, gNotes, gUnder, gFly, gFx])
      g.innerHTML = "";
    for (const a of [...people.values(), vac]) liveOff(a);
    const walkers = [...people.values()]
      .filter((p) => !p.mine && p.status !== "offline")
      .slice(0, 5)
      .map((p) => p.look);
    setScale(cw / lobbyView().w);
    gIntro.innerHTML = merged(
      lobbySvg(plan.W, plan.D, WALL_H + 2, STOREYS, walkers, W.lobby),
    );
    setCam(lobbyView());
    wrap.classList.add("at-lobby");
    fillCard();
    if (!lbMark)
      lbMark = mountBot(
        $("lb-mark"),
        { color: "system", shape: "b113", phase: 0.4 },
        22,
      );
    if (!lbMe)
      lbMe = mountBot(
        $("lb-me"),
        { color: "system", shape: "b113", phase: 0.1 },
        40,
      );
    lobbyEl.hidden = false;
    lobbyEl.classList.remove("go", "in");
    liftx.hidden = true;
    liftx.className = "liftx";
    const g = GEN;
    setTimeout(
      () => {
        if (g === GEN && lobbyOn) lobbyEl.classList.add("in");
      },
      REDUCED ? 0 : 450,
    );
  }
  function leaveLobby() {
    lobbyOn = false;
    gIntro.innerHTML = "";
    if (lobbyEl) lobbyEl.hidden = true;
    wrap.classList.remove("at-lobby");
  }
  /** The lift's doors, drawn like everything else: a panel with a frame, a few strokes of brushed steel, the edge where they meet. */
  function doorArt(w, h, left) {
    const art = atScale(1, () => {
      const m = Math.min(26, w * 0.08),
        e = left ? w - 1 : 1;
      let out =
        `<rect class="f-front" width="${r1(w)}" height="${r1(h)}"/>` +
        withOv(
          0.6,
          () =>
            ln([m, m], [w - m, m], "ol f") +
            ln([w - m, m], [w - m, h - m], "ol f") +
            ln([w - m, h - m], [m, h - m], "ol f") +
            ln([m, h - m], [m, m], "ol f"),
        );
      for (let i = 1; i < 8; i++) {
        const x =
          m +
          ((w - 2 * m) * i) / 8 +
          (hash(i * 3.1 + (left ? 0 : 9)) - 0.5) * 6;
        out += withOv(0.3, () => ln([x, m + 14], [x, h - m - 14], "ol c", i));
      }
      return (
        out +
        ln([e, -4], [e, h + 4], "ol s") +
        ln([left ? w - 7 : 7, h * 0.47], [left ? w - 7 : 7, h * 0.53], "ol s")
      );
    });
    return `<svg class="of-s" viewBox="0 0 ${r1(w)} ${r1(h)}" preserveAspectRatio="none" aria-hidden="true">${art}</svg>`;
  }
  function floorNo(n) {
    const sg = segments(String(n), 30),
      el = $("lx-num");
    el.setAttribute("viewBox", `0 0 ${r1(sg.width)} 30`);
    el.setAttribute("width", r1(sg.width));
    el.innerHTML = `<g class="seg-o">${sg.off}</g><g class="seg-l">${sg.on}</g>`;
  }
  /** Clock in: the card goes, the doors close over the street, the floors count up, a ding, and they open on our floor with our mini-me stepping out. */
  async function clockIn() {
    if (!lobbyOn || entering) return;
    entering = true;
    wantLobby = false;
    onClockIn?.();
    const g = GEN;
    lobbyEl.classList.add("go");
    gIntro.firstElementChild?.classList.add("enter");
    if (REDUCED) {
      leaveLobby();
      openOffice("lift");
      return;
    }
    const [dl, dr] = liftx.querySelectorAll(".door");
    dl.innerHTML = doorArt(cw / 2 + 1, ch, true);
    dr.innerHTML = doorArt(cw / 2 + 1, ch, false);
    floorNo(1);
    liftx.hidden = false;
    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r)),
    );
    if (g !== GEN || destroyed) return;
    liftx.classList.add("shut");
    await wait(480);
    // behind the closed doors the floor is laid out, already drawn, the camera at the lift
    leaveLobby();
    openOffice("lift");
    const top = BASE_FLOOR + plan.index;
    for (let n = 2; n <= top; n++) {
      await wait(n === top ? 260 : 150);
      floorNo(n);
    }
    liftx.classList.add("ding");
    await wait(320);
    liftx.classList.remove("shut");
    liftx.classList.add("open");
    openLift(2.6);
    anim = {
      from: { ...cam },
      to: floorView(),
      t0: performance.now() + 220,
      ms: 1900,
    };
    await wait(700);
    liftx.hidden = true;
    liftx.className = "liftx";
  }
  on($("lb-go"), "click", () => spawn(clockIn));
  on(lobbyEl, "pointerdown", (e) => e.stopPropagation());
  on(document, "keydown", (e) => {
    if (
      e.key === "Enter" &&
      lobbyOn &&
      !entering &&
      inView &&
      !e.target?.closest?.(
        "input, textarea, select, button, a, [contenteditable]",
      )
    ) {
      e.preventDefault();
      spawn(clockIn);
    }
  });

  // ---- lifecycle
  function measure() {
    const r = wrap.getBoundingClientRect();
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
  }
  /** The office as the relay has it: who sits where (a new member re-plans the floor), then the rest. */
  function reset(roster) {
    GEN++;
    runTimers();
    for (const b of bubbles.values()) b.el.remove();
    bubbles.clear();
    decision = null;
    gFly.innerHTML = "";
    fliers.length = 0;
    gFx.innerHTML = "";
    fxs.length = 0;
    chains.clear();
    floors = floorsOf(roster);
    BASE_FLOOR = STOREYS - floors.length + 1;
    for (const f of floors) f.name = W.floor(BASE_FLOOR + f.index);
    buildPeople(roster);
    plan = floors[me ? me.home : 0];
    vacHome();
    for (const fl of floors) if (fl !== plan) piecesOf(fl);
    staticObjs = depthSort(piecesOf(plan));
    focus = null;
    boardOn = false;
    closePanel();
    setViewSeg("office");
    liftUntil = -10;
    liftOpen = 0;
    refs.flapWas = {};
    userMoved = false;
    opened = false;
    leaveLobby();
    entering = false;
    if (liftx) {
      liftx.hidden = true;
      liftx.className = "liftx";
    }
    applyData();
    begin();
  }
  /** Opens at the lobby or straight at the office, once the office is on screen at a size. */
  function begin() {
    if (opened || lobbyOn || !plan) return;
    measure();
    if (!inView || cw <= 1 || ch <= 1) return;
    if (wantLobby) showLobby();
    else openOffice();
  }
  /**
   * The day starts: the office sketches itself in, the mini-mes drop into their chairs, and a few come
   * in through the lift. It waits until the office is on screen, so the drawing is seen.
   */
  function openOffice(via = "") {
    if (opened || !plan) return;
    opened = true;
    const lift = via === "lift" && !REDUCED;
    setCam(lift ? liftView() : floorView());
    for (const p of people.values()) {
      p.popAt = lift
        ? simT - 9
        : simT + (REDUCED ? 0 : ((p.desk.t0 || 0) + 1250) / 1000);
      p.landed = REDUCED || lift;
    }
    const coming = REDUCED
      ? []
      : [...people.values()]
          .filter(
            (p) => p.home === plan.index && !p.mine && p.present && !p.busy,
          )
          .sort(() => Math.random() - 0.5)
          .slice(0, 3);
    for (const p of coming) {
      p.present = false;
      p.coming = true;
    }
    if (lift && me) {
      // the floor is laid out behind the closed doors, already drawn; we come out of the lift
      me.present = false;
      me.coming = true;
      buildScene(false, floorView());
      asmUntil = 0;
      spawn(async () => {
        await wait(1100);
        openLift(2.4);
        me.coming = false;
        if (me.status !== "offline") await comeIn(me);
        else settle(me);
      });
    } else {
      buildScene(!REDUCED);
      asmUntil = REDUCED ? 0 : simT + 4.4;
    }
    spawn(() => opening(coming, lift ? 7000 : 3000));
    spawn(life);
  }
  /** The relay's latest look, laid on the people: status, piles, what they work on, who waits for whom. */
  function applyData() {
    if (!data) return;
    const reqs = data.requests;
    const byId = new Map(data.people.map((r) => [r.id, r]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const p of people.values()) {
      const r = byId.get(p.id);
      if (!r) continue;
      p.name = r.name;
      p.role = r.role || "";
      p.ways = r.ways || [];
      p.menu = r.menu || [];
      p.botName = p.mine ? W.yourMiniMe : W.miniMe(p.name);
      const to = reqs.filter((q) => q.to === p.id),
        from = reqs.filter((q) => q.from === p.id);
      p.want = to.filter(
        (q) => q.state === "SUBMITTED" || (q.state === "WORKING" && q.held),
      ).length;
      const work = to.find((q) => q.state === "WORKING" && !q.held);
      p.working = !!work;
      p.task = work ? clip(work.text, 40) : "";
      p.taskFull = work ? clip(work.text, 120) : "";
      p.deciding = to.some((q) => q.state === "WORKING" && q.held);
      const waiting = from.find((q) => OPEN.has(q.state));
      p.waitOn = waiting ? nameOf(waiting.to) : "";
      p.out = from.filter((q) => OPEN.has(q.state)).length;
      p.doneToday = to.filter(
        (q) => q.state === "COMPLETED" && q.at >= today.getTime(),
      ).length;
      const was = p.status;
      p.status = r.status;
      // comings and goings play out when it settles, below
      if (was !== p.status) {
        redraw(p, "lap");
        redraw(p, "lamp");
      }
    }
    if (data.waiting.count > 0)
      showDecision(data.waiting.text || W.needsYouChip);
    else clearDecision();
    for (const p of people.values()) settle(p);
    dataKey = "";
  }
  /** Takes the relay's latest look. What changed since the one before plays out on the floor; the first is laid as it is. */
  function update(next) {
    if (destroyed) return;
    const roster = next.people
      .map((p, index) => ({ ...p, index }))
      .sort((a, b) => Number(!!b.mine) - Number(!!a.mine));
    const key = roster.map((p) => p.id).join("|");
    const before = data;
    data = next;
    if (key !== rosterKey) {
      rosterKey = key;
      known = new Map(
        next.requests.map((r) => [r.id, r.state + (r.held ? "+" : "")]),
      );
      reset(roster);
      meet = null;
      syncMeeting(next.meeting);
      return;
    }
    const animate = !!before && inView && opened && !REDUCED;
    for (const r of next.requests) {
      const was = known.get(r.id),
        now = r.state + (r.held ? "+" : "");
      known.set(r.id, now);
      if (was === now || !animate) continue;
      if (was === undefined) {
        if (OPEN.has(r.state)) queue(r.id, () => handOver(r));
        else if (ANSWERED.has(r.state))
          queue(r.id, async () => {
            await handOver(r);
            await answerBack(r);
          });
      } else if (was === "SUBMITTED" && r.state === "WORKING" && !r.held)
        queue(r.id, () => pickUp(r));
      else if (ANSWERED.has(r.state) && !ANSWERED.has(was))
        queue(r.id, () => answerBack(r));
    }
    applyData();
    syncMeeting(next.meeting);
    if (lobbyOn) fillCard();
  }
  function tick(dt, now) {
    if (!plan || !inView || (!opened && !lobbyOn)) return;
    simT += dt;
    runTimers();
    if (asmUntil && simT > asmUntil) {
      asmUntil = 0;
      svg.classList.remove("asm");
      backSvg.classList.remove("asm");
      for (const p of people.values()) p.occKey = null;
      vac.occKey = null;
    }
    if (anim) {
      const u = clamp((now - anim.t0) / anim.ms, 0, 1),
        e = easeInOut(u),
        f = anim.from,
        to = anim.to;
      const w = f.w * (to.w / f.w) ** e,
        h = (w * ch) / cw,
        cx = lerp(f.x + f.w / 2, to.x + to.w / 2, e),
        cy = lerp(f.y + f.h / 2, to.y + to.h / 2, e);
      setCam({ x: cx - w / 2, y: cy - h / 2, w, h });
      if (u >= 1) {
        anim = null;
        if (lobbyOn) {
        } else if (!asmUntil) buildScene();
        else rebuildAt = performance.now() + (asmUntil - simT) * 1000 + 50;
      }
    }
    if (lobbyOn) return;
    if (rebuildAt && now > rebuildAt && !asmUntil) {
      rebuildAt = 0;
      buildScene();
    } else if (
      built &&
      !anim &&
      !rebuildAt &&
      !asmUntil &&
      (cam.x < built[0] ||
        cam.y < built[1] ||
        cam.x + cam.w > built[2] ||
        cam.y + cam.h > built[3])
    )
      buildScene();
    const lo =
      simT < liftUntil
        ? Math.min(1, liftOpen + dt / 0.4)
        : Math.max(0, liftOpen - dt / 0.5);
    if (lo !== liftOpen) {
      liftOpen = lo;
      if (refs.doors?.isConnected)
        refs.doors.innerHTML = merged(
          liftDoors(LIFT_X, easeInOut(lo), liftH(WALL_H)),
        );
    }
    const v = [
        cam.x - 200,
        cam.y - 260,
        cam.x + cam.w + 200,
        cam.y + cam.h + 220,
      ],
      moving = !!anim || !!drag?.moved,
      close = BODY_PX * sc * boost >= 90;
    for (const p of people.values()) {
      moveBot(p, dt);
      const onFloor = p.floor === plan.index && !p.inLift && p.present;
      if (!onFloor) {
        if (liveOn(p)) liveOff(p);
        continue;
      }
      const [fx0, fy0] = at(p.pos[0], p.pos[1], p.z),
        visible = fx0 > v[0] && fx0 < v[2] && fy0 > v[1] && fy0 < v[3];
      if (!visible) continue;
      p.udt = (p.udt || 0) + dt;
      // a mini-me sitting still breathes and blinks just as well at half the rate
      const still =
        !p.walk &&
        !p.leap &&
        !p.fade &&
        !p.carry &&
        simT - p.popAt > DROP_FALL + DROP_LAND + 0.2 &&
        !bubbles.has(p.id) &&
        !moving &&
        liveOn(p);
      if (still && !(close ? EVEN : restDue(p))) {
        placed.push(p);
        continue;
      }
      p.lastUpd = simT;
      drawBot(p);
      const hb = BODY_PX * boost;
      placeLive(
        p,
        [
          fx0 - hb * 0.78,
          fy0 - p.lift - hb * 1.3,
          fx0 + hb * 0.78,
          fy0 + hb * 0.22,
        ],
        p.bt,
      );
      p.bot.dotScale = clamp(52 / (BODY_PX * sc), 1, 2.4);
      // walking, it goes where it goes every frame; its face and breath change slowly enough to be drawn every other frame
      if (REDUCED) p.bot.still(simT);
      else if (
        EVEN ||
        close ||
        p.leap ||
        simT - p.popAt < DROP_FALL + DROP_LAND + 0.2
      ) {
        p.bot.update(simT, p.udt);
        p.udt = 0;
      }
      if (
        p.seated &&
        !p.busy &&
        p.status === "active" &&
        p.stack >= 8 &&
        simT > p.sweatAt &&
        simT > p.popAt + 3
      ) {
        p.sweatAt = simT + 4 + Math.random() * 3;
        fx("drip", p, { anim: "drip", dur: 1.6, scale: 0.85 });
      }
    }
    if (panelRec?.follow) {
      const m = panelRec.follow.bot.mood;
      panelRec.bot.setMood(m === "walk" ? "idle" : m);
    }
    moveVac();
    orderLive();
    drawFliers();
    drawFx();
    if (dataKey === "" || (EVEN && ++dataTick % 3 === 0)) updateData();
    if (EVEN) runLights();
    updateOverlays();
    renderPanel();
  }
  // at thirty frames a second the office ticks on the same frames as the page's little marks, so the frames between stay empty; a drag or a glide stays at sixty
  const stopFrames = onFrame((dt, now) => {
    oacc += dt;
    if (!HALF || EVEN || anim || drag?.moved) {
      tick(oacc, now);
      oacc = 0;
    }
  });

  const seen = new IntersectionObserver(
    (es) => {
      inView = es[es.length - 1].isIntersecting;
      if (inView) begin();
    },
    { rootMargin: "60px" },
  );
  seen.observe(wrap);
  const sized = new ResizeObserver(() => {
    const w0 = cw,
      h0 = ch;
    measure();
    if (!plan || (Math.abs(cw - w0) < 1 && Math.abs(ch - h0) < 1)) return;
    if (lobbyOn) {
      if (!entering) showLobby();
      return;
    }
    if (!opened) {
      begin();
      return;
    }
    anim = null;
    setCam(
      focus
        ? deskView(focus)
        : userMoved
          ? { ...cam, w: cw / sc, h: ch / sc }
          : floorView(),
    );
    if (!asmUntil) buildScene();
  });
  sized.observe(wrap);
  if (onAsk)
    meMark = mountBot(
      $("me-mark"),
      { color: "system", shape: "b113", phase: 0.2 },
      24,
    );

  /** The colleagues' menus as quick asks over the box: one from each, those in first. */
  function suggest(list) {
    const el = $("sugs");
    if (!el) return;
    const out = [];
    for (const p of [...list].sort(
      (a, b) => Number(a.status === "offline") - Number(b.status === "offline"),
    )) {
      if (p.mine || !p.menu?.length) continue;
      out.push(
        `<button type="button" data-text="${esc(W.composer.askText(p.name, p.menu[0]))}">${esc(W.composer.askFor(p.name, clip(p.menu[0], 40)))}</button>`,
      );
      if (out.length >= 3) break;
    }
    const html = out.join("");
    if (el.__html !== html) {
      el.__html = html;
      el.innerHTML = html;
    }
  }

  return {
    update(next) {
      update(next);
      suggest(next.people);
    },
    setInset(right, left = 0) {
      const nextR = Math.max(0, Math.round(right || 0)),
        nextL = Math.max(0, Math.round(left || 0));
      if (nextR === insetR && nextL === insetL) return;
      insetR = nextR;
      insetL = nextL;
      if (!plan || lobbyOn || !opened || destroyed) return;
      glide(focus ? deskView(focus) : boardOn ? boardView() : floorView(), 650);
    },
    closePanel() {
      if (panel.hidden) return;
      closeFocus();
    },
    destroy() {
      destroyed = true;
      GEN++;
      stopFrames();
      seen.disconnect();
      sized.disconnect();
      ac.abort();
      clearTimeout(refs.boardLater);
      for (const rec of [panelRec, meMark, lbMark, lbMe]) unmountBot(rec);
      panelRec = meMark = lbMark = lbMe = null;
      root.innerHTML = "";
      root.classList.remove("of-wrap", "dragging");
    },
  };
}
