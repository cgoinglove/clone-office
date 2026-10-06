// Asking in batches (product 2.4): questions kept for later do not call the person the moment they
// are kept; they are brought together at a few moments of the day (by default 10, 14 and 17
// o'clock, the person's own time), so the person is interrupted three times a day rather than
// for each one (Fitz et al. 2019: people who got notifications in three batches a day were more
// focused and less stressed). A question waiting now is still shown at once.

export const BATCH_HOURS = [10, 14, 17];

/** When a question kept at `kept` is brought to the person: the next batch moment after it. */
export function dueAt(kept: Date, hours: number[] = BATCH_HOURS): Date {
  const sorted = [...hours].sort((a, b) => a - b);
  for (let day = 0; day < 2; day++)
    for (const hour of sorted) {
      const moment = new Date(
        kept.getFullYear(),
        kept.getMonth(),
        kept.getDate() + day,
        hour,
      );
      if (moment > kept) return moment;
    }
  return kept;
}
