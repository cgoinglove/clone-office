"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { MARKS, type Mark, type MarkId } from "./marks";

/**
 * A service's or AI vendor's own mark, at the size of the text around it unless a class says
 * otherwise. Decorative by default: the name beside it is what is read out.
 */
export function BrandMark({
  id,
  className,
  label,
}: {
  id: MarkId;
  className?: string;
  /** What a screen reader hears when the mark stands alone. */
  label?: string;
}) {
  // Gradient ids are made per mark on the page, so two of the same never share a definition.
  const prefix = useId().replace(/:/g, "");
  const mark: Mark = MARKS[id];
  const gradients = mark.gradients;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      className={cn("size-4 shrink-0", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {gradients && (
        <defs>
          {gradients.map((g, index) => (
            <linearGradient
              key={index}
              id={`${prefix}-${index}`}
              gradientUnits={g.box ? "objectBoundingBox" : "userSpaceOnUse"}
              x1={g.x1}
              y1={g.y1}
              x2={g.x2}
              y2={g.y2}
            >
              {g.stops.map((stop) => (
                <stop
                  key={`${stop.offset}-${stop.color}`}
                  offset={stop.offset}
                  stopColor={stop.color}
                  stopOpacity={stop.opacity}
                />
              ))}
            </linearGradient>
          ))}
        </defs>
      )}
      {mark.parts.map((part, index) => (
        <path
          key={index}
          d={part.d}
          fill={
            part.gradient !== undefined
              ? `url(#${prefix}-${part.gradient})`
              : part.fill
          }
          fillOpacity={part.opacity}
        />
      ))}
    </svg>
  );
}

export type { MarkId };
