// Things the person does at a regular time (planning the day on weekday mornings, a weekly report
// on Friday afternoons), found by a learning from when they asked their AI tools. The screen
// offers one when it is about that time; the mini-me suggests, the person decides.

export interface Routine {
  /** Written as the person's request, sent as it is when they tap it. */
  label: string;
  /** 0 is Sunday … 6 is Saturday. */
  days: number[];
  /** The hour it usually starts, in the person's time. */
  hour: number;
  why: string;
}

/** How long after its hour a routine is still offered. */
export const ROUTINE_WINDOW_HOURS = 2;

/** The routine it is about time for, if any. */
export function routineNow(
  routines: Routine[],
  now: Date = new Date(),
): Routine | undefined {
  const hour = now.getHours();
  return routines.find(
    (routine) =>
      routine.days.includes(now.getDay()) &&
      hour >= routine.hour &&
      hour < routine.hour + ROUTINE_WINDOW_HOURS,
  );
}

/** Keep only what a routine can hold. */
export function cleanRoutines(input: unknown): Routine[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((raw) => (raw ?? {}) as Record<string, unknown>)
    .map((raw) => ({
      label: String(raw.label ?? "").trim(),
      days: Array.isArray(raw.days)
        ? [
            ...new Set(
              raw.days
                .map(Number)
                .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
            ),
          ]
        : [],
      hour: Number(raw.hour),
      why: String(raw.why ?? "").trim(),
    }))
    .filter(
      (r) =>
        r.label &&
        r.days.length &&
        Number.isInteger(r.hour) &&
        r.hour >= 0 &&
        r.hour <= 23,
    )
    .slice(0, 3);
}
