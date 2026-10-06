// The pieces every settings section is laid out with, so each reads the same way: groups split by
// space, each under a short title and a line saying what it is for.

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** The sections' rhythm: a group 32px from the next, its title 12px above what it holds. */
export function Groups({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-8 text-sm">{children}</div>;
}

export function Group({
  title,
  hint,
  action,
  children,
  className,
  tone,
}: {
  title: ReactNode;
  hint?: ReactNode;
  /** A control beside the title (a count, a button). */
  action?: ReactNode;
  children?: ReactNode;
  className?: string;
  tone?: "danger";
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h3
            className={cn(
              "text-sm font-medium",
              tone === "danger" && "text-destructive",
            )}
          >
            {title}
          </h3>
          {hint && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {hint}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** A framed list: rows split by hairlines, as a list's rows are. */
export function Rows({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-border [&>li]:border-b [&>li]:border-border/70 [&>li:last-child]:border-b-0",
        className,
      )}
    >
      {children}
    </ul>
  );
}

/** One empty state, the same in every section: a mark, a line, and what to do. */
export function Empty({
  icon,
  children,
  action,
}: {
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">
      {icon}
      <p className="leading-relaxed">{children}</p>
      {action}
    </div>
  );
}
