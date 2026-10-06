"use client";

import {
  type CSSProperties,
  type ReactNode,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { BotBody } from "./bot";
import type { BotShape, Mood } from "./bot-shape";
import {
  BODY_PX,
  botAt,
  Patterns,
  patternVars,
  SEAT_Z,
  useAssembly,
  useClockHands,
  useScale,
} from "./figure";
import { at, clamp, drawAt, hashStr, r1 } from "./iso";
import type {
  DeskItem,
  DeskStyle,
  ScreenStats,
  Sky,
  Status,
  TeamCounts,
} from "./pieces";
import { skyFor } from "./pieces";
import {
  type Desk,
  depthSort,
  type Floor,
  floorBounds,
  floorSvg,
  floorsOf,
  type Layout,
  type Piece,
  piecesOf,
  slotOf,
  type Teams,
  wallSvg,
} from "./plan";

/** Someone in the office, and how their desk and bot look right now. */
export interface OfficePerson {
  name: string;
  team: string;
  /** At the desk, away (their bot on duty), or computer off. "active" when left out. */
  status?: Status;
  /** Their bot's mood; follows the rest when left out (asleep when off, asking when a decision waits, else free). */
  mood?: Mood;
  /** Pieces of work on their desk. */
  pile?: number;
  /** A request waits on this person's decision: a card goes on the board and the team sign says so. */
  needsDecision?: boolean;
  /** A line their bot is saying, in a bubble over its head. */
  says?: string;
  /** The viewer: their own bot is the ink, their rug darker, their name plate always shown. */
  you?: boolean;
  /** What the bubble calls the bot; "<name>'s bot" when left out. */
  botName?: string;
  botColor?: string;
  botShape?: BotShape;
}

export interface OfficeFloorProps {
  /** Everyone in the office, in team order. Teams fill areas of up to 6, and floors of up to 24. */
  people?: OfficePerson[];
  /**
   * "plaza": team areas in a back and a front row around a wide common with coffee, table tennis
   * and armchairs. "grid": areas on a grid of avenues, commons at the right. "rooms": a glass room
   * with a door for each team. "library": bookshelves between areas, tea and reading chairs.
   */
  layout?: Layout;
  deskStyle?: DeskStyle;
  /** The time of day the windows show; "now" follows the clock. */
  sky?: Sky | "now";
  /** Which floor to show when there are more than 24 people, from 0. */
  floor?: number;
  /** Plays the build-in when it first appears. On unless false. */
  assemble?: boolean;
  /** Name plates: "auto" shows yours, and others' when worth a look (off, working, a pile, a decision); hovering shows any. */
  plates?: "auto" | "all" | "none";
  /** What the office screen shows; the people's moods and statuses fill in what is left out. */
  stats?: Partial<ScreenStats>;
  /** A fixed moment for the clock, calendar and "now" sky; live when left out. */
  now?: Date;
  /** Called with a person's name when their desk, bot or plate is clicked. */
  onSelect?: (name: string) => void;
  label?: string;
  className?: string;
}

const PALETTE = [
  "#10a65a",
  "#8B5CF6",
  "#EC4899",
  "#0098dc",
  "#6366F1",
  "#00a190",
  "#5ca100",
  "#D946EF",
];
const SHAPE_KEYS: BotShape[] = [
  "b7",
  "b23",
  "b41",
  "b58",
  "b77",
  "b90",
  "b7",
  "squircle",
  "heart",
];
const ITEMS: DeskItem[] = ["mug", "plant", "books", "photo"];

/** Everyone else's bot gets a colour and a shape from their name; yours is the ink. */
function looksOf(p: OfficePerson): { color?: string; shape: BotShape } {
  if (p.you) return { color: p.botColor, shape: p.botShape ?? "b113" };
  const h = hashStr(p.name);
  return {
    color: p.botColor ?? PALETTE[h % PALETTE.length],
    shape: p.botShape ?? SHAPE_KEYS[(h >>> 4) % SHAPE_KEYS.length],
  };
}

const moodOf = (p: OfficePerson): Mood =>
  p.mood ??
  (p.status === "offline" ? "sleep" : p.needsDecision ? "asking" : "idle");

function plateOf(p: OfficePerson): [string, string] {
  if (p.needsDecision)
    return [
      p.you ? "needs you" : "waiting on a decision",
      p.you ? "mine" : "on",
    ];
  const more = p.pile ? ` · ${p.pile} on the desk` : "";
  if (p.status === "offline") return [`computer off${more}`, "off"];
  if (moodOf(p) === "working") return [`working${more}`, "on"];
  if (p.status === "away") return [`away, bot on duty${more}`, ""];
  return [`free${more}`, ""];
}

function teamsOf(people: OfficePerson[]): Teams {
  const out = new Map<string, string[]>();
  for (const p of people) {
    const list = out.get(p.team) ?? [];
    list.push(p.name);
    out.set(p.team, list);
  }
  return [...out];
}

/**
 * The office floor: every team's desks with each person's bot in its chair, the commons, and the
 * walls that show what is going on (a live clock, today's calendar, the office screen, the
 * decisions board, a sign per team). It builds itself in when it first appears: the floor draws,
 * walls rise, furniture drops into place, and the bots sit down last.
 */
export function OfficeFloor({
  people = [],
  layout = "plaza",
  deskStyle = "panel",
  sky = "now",
  floor = 0,
  assemble = true,
  plates = "auto",
  stats,
  now,
  onSelect,
  label,
  className,
}: OfficeFloorProps) {
  const id = `of${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const date = now ?? new Date();
  const skyNow = skyFor(sky, date);

  const peopleKey = JSON.stringify(people);
  const byName = useMemo(
    () => new Map(people.map((p) => [p.name, p])),
    [peopleKey],
  );
  const floors = useMemo(
    () => floorsOf(teamsOf(people), layout),
    [peopleKey, layout],
  );
  const fl: Floor = floors[clamp(Math.round(floor), 0, floors.length - 1)];
  const here = useMemo(
    () =>
      fl.desks.flatMap((d) =>
        d.name ? [byName.get(d.name) as OfficePerson] : [],
      ),
    [fl, byName],
  );

  const [vx0, vy0, vx1, vy1] = floorBounds(fl);
  const pad = 30;
  const vb = {
    x: vx0 - pad,
    y: vy0 - pad - 20,
    w: vx1 - vx0 + pad * 2,
    h: vy1 - vy0 + pad * 2 + 20,
  };
  const scale = useScale(wrap, vb.w, 1200 / vb.w);
  const asm = useAssembly(assemble, 4800);
  useClockHands(wrap, now);

  const built = useMemo(() => {
    const countsOf = (team: string): TeamCounts | null => {
      const t = here.filter((p) => p.team === team);
      if (!t.length) return null;
      const working = t.filter((p) => moodOf(p) === "working").length;
      const off = t.filter((p) => p.status === "offline").length;
      return {
        working,
        off,
        free: t.length - working - off,
        waiting: t.filter((p) => p.needsDecision).length,
      };
    };
    const lookOf = (d: Desk) => {
      const p = d.name ? byName.get(d.name) : undefined;
      if (!p)
        return {
          style: deskStyle,
          status: "offline" as Status,
          working: false,
          pile: 0,
          item: "books" as DeskItem,
          mine: false,
        };
      return {
        style: deskStyle,
        status: p.status ?? "active",
        working: moodOf(p) === "working",
        pile: p.pile ?? 0,
        item: p.you ? "photo" : ITEMS[hashStr(p.name) % ITEMS.length],
        mine: !!p.you,
      };
    };
    return drawAt(scale, () => {
      const pieces = depthSort(piecesOf(fl, lookOf, countsOf, true));
      const floorHtml = floorSvg(fl, skyNow, (d) =>
        !d.name ? "open" : byName.get(d.name)?.you ? "mine" : "taken",
      );
      const statsNow: ScreenStats = {
        done: stats?.done ?? 23,
        waiting: stats?.waiting ?? here.filter((p) => p.needsDecision).length,
        working:
          stats?.working ?? here.filter((p) => moodOf(p) === "working").length,
        away:
          stats?.away ??
          here.filter((p) => (p.status ?? "active") !== "active").length,
        hours: stats?.hours ?? [3, 5, 7, 4, 6, 8, 5, 2, 1],
        now: stats?.now ?? 5,
      };
      const cards = here
        .filter((p) => p.needsDecision)
        .map((p) => ({ name: p.name, mine: !!p.you }));
      const wallHtml = wallSvg(fl, skyNow, {
        stats: statsNow,
        cards,
        date,
        liftOpen: 0,
      });
      return {
        pieces,
        html: pieces.map((o) => o.draw(o.t0)),
        floorHtml,
        wallHtml,
      };
    });
    // the date only matters to the day shown, so it is keyed by day
  }, [
    fl,
    byName,
    here,
    deskStyle,
    skyNow,
    Math.round(scale * 50),
    JSON.stringify(stats),
    date.toDateString(),
  ]);

  // bots go in the painted order right after what they sit in front of
  const seats = fl.desks.filter((d) => d.name);
  const bySlot = new Map<number, Desk[]>();
  for (const d of seats) {
    const s = slotOf(built.pieces, d.seat);
    bySlot.set(s, [...(bySlot.get(s) ?? []), d]);
  }
  const seatBot = (d: Desk) => {
    const p = byName.get(d.name as string) as OfficePerson;
    const look = looksOf(p);
    return (
      <g key={`bot-${d.key}`} data-person={p.name} className="bot-g">
        <g
          className="k-grow"
          style={{ "--d": `${Math.round(d.t0 + 1350)}ms` } as CSSProperties}
        >
          <g transform={botAt(d.seat, SEAT_Z, look.shape)}>
            <BotBody
              mood={moodOf(p)}
              color={look.color}
              shape={look.shape}
              phase={(hashStr(p.name) % 1000) / 1000}
              mine={!!p.you}
            />
          </g>
        </g>
      </g>
    );
  };
  const scene: ReactNode[] = [];
  built.pieces.forEach((o: Piece, i) => {
    for (const d of bySlot.get(i) ?? []) scene.push(seatBot(d));
    scene.push(
      <g
        key={`p-${i}`}
        data-person={o.person ?? undefined}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: the sketch's own markup, names escaped
        dangerouslySetInnerHTML={{ __html: built.html[i] }}
      />,
    );
  });
  for (const d of bySlot.get(built.pieces.length) ?? []) scene.push(seatBot(d));

  // name plates and bubbles float over the drawing, at each bot's head
  const detail = BODY_PX * scale >= 54;
  const overlays: ReactNode[] = [];
  for (const d of seats) {
    const p = byName.get(d.name as string) as OfficePerson;
    const [fx, fy] = at(d.seat[0], d.seat[1], SEAT_Z);
    const pos = {
      left: `${r1(((fx - vb.x) / vb.w) * 100)}%`,
      top: `${r1(((fy - BODY_PX - 16 - vb.y) / vb.h) * 100)}%`,
    };
    if (p.says && (detail || p.you)) {
      overlays.push(
        <div
          key={`b-${p.name}`}
          className={cn("bub", p.you && p.needsDecision && "mine")}
          style={pos}
        >
          <span className="who">
            {p.botName ?? (p.you ? "Your bot" : `${p.name}'s bot`)}
          </span>
          {p.says}
        </div>,
      );
      continue;
    }
    const [line, cls] = plateOf(p);
    const notable =
      p.status === "offline" ||
      moodOf(p) === "working" ||
      (p.pile ?? 0) >= 5 ||
      p.needsDecision;
    const show =
      plates !== "none" &&
      (hover === p.name ||
        p.you ||
        plates === "all" ||
        (plates === "auto" && detail && notable));
    if (!show) continue;
    overlays.push(
      <button
        type="button"
        key={`n-${p.name}`}
        className={cn("plate", cls, p.you && "you")}
        style={pos}
        onClick={() => onSelect?.(p.name)}
      >
        <i />
        <b>{p.you ? `${p.name} (you)` : p.name}</b>
        <span>{line}</span>
      </button>,
    );
  }

  const personAt = (e: { target: EventTarget }) =>
    (e.target as Element)
      .closest?.("[data-person]")
      ?.getAttribute("data-person") ?? null;

  return (
    <div
      ref={wrap}
      className={cn("of of-floor", className)}
      onPointerOver={(e) => setHover(personAt(e))}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        const name = personAt(e);
        if (name && onSelect) onSelect(name);
      }}
    >
      <svg
        viewBox={`${r1(vb.x)} ${r1(vb.y)} ${r1(vb.w)} ${r1(vb.h)}`}
        className={cn("of-svg", asm && "asm")}
        style={patternVars(id, scale, 46)}
        role="img"
        aria-label={label ?? `${fl.name} of the office: ${here.length} people`}
      >
        <Patterns id={id} scale={scale} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the sketch's own markup, names escaped */}
        <g dangerouslySetInnerHTML={{ __html: built.floorHtml }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: the sketch's own markup, names escaped */}
        <g dangerouslySetInnerHTML={{ __html: built.wallHtml }} />
        <g>{scene}</g>
      </svg>
      <div className="of-over">{overlays}</div>
    </div>
  );
}

/** How many floors these people fill: 24 seats a floor, a team kept together. */
export function floorCount(people: OfficePerson[]) {
  return floorsOf(teamsOf(people), "plaza").length;
}
