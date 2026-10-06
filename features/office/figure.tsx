"use client";

import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";
import { type BotShape, shapeMetrics } from "./bot-shape";
import { at, drawAt, type Pt, r1, r2, r3, screenBox } from "./iso";
import { setHands } from "./pieces";

/** How tall a bot stands, in SVG units, and how high a seat lifts it. */
export const BODY_PX = 116;
export const SEAT_Z = 4;

/** The transform that seats (or stands) a bot's 240-unit mark at a plan point. */
export function botAt(pos: Pt, z: number, shape: BotShape) {
  const [fx, fy] = at(pos[0], pos[1], z);
  const m = shapeMetrics(shape);
  const k = BODY_PX / (2 * m.r * m.hh);
  return `translate(${r1(fx)} ${r1(fy)}) scale(${r3(k)}) translate(${-m.cx} ${r1(-(m.cy + m.anchor))})`;
}

/** The hatch and shade patterns, sized for the scale they are seen at. */
export function Patterns({ id, scale }: { id: string; scale: number }) {
  const hs = r2(3.4 / scale);
  const ss = r2(3 / scale);
  return (
    <defs>
      <pattern
        id={`${id}-h`}
        patternUnits="userSpaceOnUse"
        width={hs}
        height={hs}
        patternTransform="rotate(-38)"
      >
        <line
          className="hl"
          x1="0"
          y1="0"
          x2="0"
          y2={hs}
          strokeWidth={r2(0.7 / scale)}
        />
      </pattern>
      <pattern
        id={`${id}-s`}
        patternUnits="userSpaceOnUse"
        width={ss}
        height={ss}
        patternTransform="rotate(28)"
      >
        <line
          className="hl"
          x1="0"
          y1="0"
          x2="0"
          y2={ss}
          strokeWidth={r2(0.6 / scale)}
        />
      </pattern>
    </defs>
  );
}

export const patternVars = (id: string, scale: number, drop: number) =>
  ({
    "--hatch": `url(#${id}-h)`,
    "--shade": `url(#${id}-s)`,
    "--drop": `${r1(-drop / scale)}px`,
  }) as CSSProperties;

/** Screen pixels per SVG unit as drawn, kept current as the element resizes. */
export function useScale(
  ref: RefObject<Element | null>,
  units: number,
  guess: number,
) {
  const [scale, setScale] = useState(guess);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      if (w <= 0) return;
      const s = w / units;
      setScale((prev) => (Math.abs(prev - s) / prev > 0.15 ? s : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [units]);
  return scale;
}

/** True for `ms` after mount when `on`: while it holds, the pieces assemble themselves. */
export function useAssembly(on: boolean, ms: number) {
  const [asm, setAsm] = useState(on);
  useEffect(() => {
    if (!asm) return;
    const t = setTimeout(() => setAsm(false), ms);
    return () => clearTimeout(t);
  }, []);
  return asm;
}

/** Keeps every clock under `ref` on the time: `fixed`, or now, each second. */
export function useClockHands(ref: RefObject<Element | null>, fixed?: Date) {
  useLayoutEffect(() => {
    if (ref.current) setHands(ref.current, fixed ?? new Date());
  });
  useEffect(() => {
    if (fixed) return;
    const t = setInterval(() => {
      if (ref.current) setHands(ref.current, new Date());
    }, 1000);
    return () => clearInterval(t);
  }, [fixed]);
}

export type Bounds = [
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  z0: number,
  z1: number,
];

export interface FigureProps {
  /** What a screen reader hears. */
  label: string;
  /** Width in pixels; the figure shrinks to fit a narrower container. */
  width: number;
  /** Plays the build-in when it first appears. */
  assemble: boolean;
  /** A fixed time for any clock in it; live when left out. */
  time?: Date;
  className?: string;
}

/**
 * One piece of the office drawn on its own: its box in plan units fitted to `width`, its
 * layers painted bottom to top. A layer is markup from the sketch, or a React node (a bot).
 */
export function Figure({
  label,
  width,
  assemble,
  time,
  className,
  bounds,
  layers,
}: FigureProps & { bounds: Bounds; layers: () => (string | ReactNode)[] }) {
  const id = `of${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<SVGSVGElement>(null);
  const [a0, b0, a1, b1] = screenBox(...bounds);
  const pad = 26;
  const vw = a1 - a0 + pad * 2;
  const vh = b1 - b0 + pad * 2;
  const scale = useScale(ref, vw, width / vw);
  const asm = useAssembly(assemble, 2400);
  useClockHands(ref, time);
  const drawn = drawAt(scale, layers);
  return (
    <svg
      ref={ref}
      viewBox={`${r1(a0 - pad)} ${r1(b0 - pad)} ${r1(vw)} ${r1(vh)}`}
      width={Math.round(width)}
      overflow="visible"
      className={cn("of of-figure", className)}
      style={patternVars(id, scale, 34)}
      role="img"
      aria-label={label}
    >
      <Patterns id={id} scale={scale} />
      <g className={asm ? "asm" : undefined}>
        {drawn.map((layer, i) =>
          typeof layer === "string" ? (
            // biome-ignore lint/security/noDangerouslySetInnerHtml: the sketch's own markup, names escaped
            <g key={i} dangerouslySetInnerHTML={{ __html: layer }} />
          ) : (
            <g key={i}>{layer}</g>
          ),
        )}
      </g>
    </svg>
  );
}
