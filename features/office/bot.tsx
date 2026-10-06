"use client";

import { type CSSProperties, useEffect, useMemo, useRef } from "react";
import { watchOnScreen } from "@/hooks/use-on-screen";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import {
  BOT_VIEW,
  type BotFrame,
  BotMotion,
  type BotShape,
  type Mood,
} from "./bot-shape";
import type { Pt } from "./iso";

// One clock for every bot on the page: a single frame loop, each bot drawing only while it is in
// the window. The loop stops when no bot is left.

type Tick = (t: number, dt: number) => void;
const ticking = new Set<Tick>();
let raf = 0;
let last = 0;

function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const tick of ticking) tick(now / 1000, dt);
  raf = ticking.size ? requestAnimationFrame(loop) : 0;
}

function onFrame(tick: Tick) {
  ticking.add(tick);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(loop);
  }
  return () => {
    ticking.delete(tick);
  };
}

interface Parts {
  body: SVGGElement | null;
  fill: SVGPathElement | null;
  eyes: (SVGPathElement | null)[];
  z: SVGGElement | null;
  zt: (SVGTextElement | null)[];
  dot: SVGGElement | null;
  pulse: SVGCircleElement | null;
}

function apply(p: Parts, f: BotFrame) {
  p.fill?.setAttribute("d", f.body);
  p.eyes[0]?.setAttribute("d", f.eyes[0]);
  p.eyes[1]?.setAttribute("d", f.eyes[1]);
  p.body?.setAttribute("opacity", String(f.opacity));
  if (p.dot) {
    p.dot.style.display = f.dot ? "" : "none";
    if (f.dot) {
      p.dot.setAttribute("transform", f.dot.transform);
      p.pulse?.setAttribute("r", String(f.dot.pulseR));
      p.pulse?.setAttribute("opacity", String(f.dot.pulseOpacity));
    }
  }
  if (p.z) {
    p.z.style.display = f.zs ? "" : "none";
    f.zs?.forEach((z, i) => {
      const el = p.zt[i];
      if (!el) return;
      el.setAttribute("x", String(z.x));
      el.setAttribute("y", String(z.y));
      el.setAttribute("font-size", String(z.size));
      el.setAttribute("opacity", String(z.opacity));
    });
  }
}

export interface BotBodyProps {
  mood?: Mood;
  shape?: BotShape;
  /** Any CSS colour; the ink when left out, which is how your own bot looks. */
  color?: string;
  /** Offsets this bot's breathing and blinking from its neighbours', 0 to 1. */
  phase?: number;
  /** Where the eyes look, in the mark's units (about ±12 across, ±6 down); free when left out. */
  gaze?: Pt;
  /** Holds the pose without moving. */
  still?: boolean;
  /** The "needs you" dot is red when the call is yours, grey when it is someone else's. */
  mine?: boolean;
}

/** The mark as an SVG group in its own 240-unit box, for placing inside a larger drawing. */
export function BotBody({
  mood = "idle",
  shape = "b113",
  color,
  phase = 0,
  gaze,
  still = false,
  mine = true,
}: BotBodyProps) {
  const reduced = useReducedMotion();
  const motion = useMemo(
    () => new BotMotion(shape, mood, phase),
    [shape, phase],
  );
  motion.mood = mood;
  motion.gaze = gaze ?? null;
  const first = useMemo(
    () => new BotMotion(shape, mood, phase).frame(0, 1, true),
    [shape, mood, phase],
  );

  const root = useRef<SVGGElement>(null);
  const parts = useRef<Parts>({
    body: null,
    fill: null,
    eyes: [],
    z: null,
    zt: [],
    dot: null,
    pulse: null,
  });

  useEffect(() => {
    const g = root.current;
    if (!g) return;
    const q = <T extends Element>(s: string) => g.querySelector<T>(s);
    parts.current = {
      body: q(".sb-body"),
      fill: q(".sb-fill"),
      eyes: [...g.querySelectorAll<SVGPathElement>(".sb-eye")],
      z: q(".sb-z"),
      zt: [...g.querySelectorAll<SVGTextElement>(".sb-z text")],
      dot: q(".sb-dot"),
      pulse: q(".sb-pulse"),
    };
    const hold = still || reduced;
    apply(
      parts.current,
      motion.frame(performance.now() / 1000, hold ? 1 : 0.016, hold),
    );
    if (hold) return;
    const owner = g.ownerSVGElement ?? g;
    let visible = true;
    const unwatch = watchOnScreen(owner, (on) => {
      visible = on;
    });
    const stop = onFrame((t, dt) => {
      if (visible) apply(parts.current, motion.frame(t, dt, false));
    });
    return () => {
      stop();
      unwatch();
    };
  }, [motion, still, reduced, mood]);

  const zs = first.zs;
  return (
    <g
      ref={root}
      className="sb"
      style={{ "--bot": color ?? "var(--ink)" } as CSSProperties}
    >
      <g className="sb-body" opacity={first.opacity}>
        <path className="sb-fill" d={first.body} />
        <path className="sb-eye" d={first.eyes[0]} />
        <path className="sb-eye" d={first.eyes[1]} />
      </g>
      <g className="sb-z" style={{ display: zs ? undefined : "none" }}>
        {[0, 1].map((i) => (
          <text
            key={i}
            x={zs?.[i].x}
            y={zs?.[i].y}
            fontSize={zs?.[i].size}
            opacity={zs?.[i].opacity}
          >
            z
          </text>
        ))}
      </g>
      <g
        className={cn("sb-dot", !mine && "other")}
        style={{ display: first.dot ? undefined : "none" }}
        transform={first.dot?.transform}
      >
        <circle className="sb-ring" r="21" />
        <circle className="sb-dotc" r="16" />
        <circle
          className="sb-pulse"
          r={first.dot?.pulseR ?? 16}
          opacity={first.dot?.pulseOpacity}
        />
      </g>
    </g>
  );
}

export interface BotProps extends BotBodyProps {
  /** Width and height in pixels. */
  size?: number;
  /** What a screen reader hears; the bot is decorative when left out. */
  label?: string;
  className?: string;
}

/**
 * A person's bot: Thursday's mark, simple on purpose, with a mood for each thing it can be
 * doing. Free looks around and blinks; working squints and types; asking tilts its head and
 * shows a dot; happy hops; sleep is a computer turned off.
 */
export function Bot({ size = 96, label, className, ...body }: BotProps) {
  return (
    <svg
      viewBox={`0 0 ${BOT_VIEW} ${BOT_VIEW}`}
      width={size}
      height={size}
      overflow="visible"
      className={cn("of of-bot", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <BotBody {...body} />
    </svg>
  );
}
