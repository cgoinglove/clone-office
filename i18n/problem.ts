// A failure's code as the screen and the phone read it. Most codes are a word alone
// ("claude-missing"); a plan's usage limit also says when it lifts, "brain-limit@1791890400" (unix
// seconds), so the person reads that time in their own language and zone.

/** The code for a model whose plan reached its usage limit, with when it lifts when that is known. */
export function limitProblem(resetsAt?: number): string {
  return resetsAt && Number.isFinite(resetsAt) && resetsAt > 0
    ? `brain-limit@${Math.floor(resetsAt)}`
    : "brain-limit";
}

/** A code and the time it carries, if any. */
export function splitProblem(error: string): { code: string; until?: Date } {
  const match = /^([a-z][a-z-]*)@(\d{9,12})$/.exec(error);
  return match
    ? { code: match[1], until: new Date(Number(match[2]) * 1000) }
    : { code: error };
}

/** When something lifts, as short as is clear: the time today, else the day and the time. */
export function untilWords(
  until: Date,
  locale: string,
  now: Date = new Date(),
): string {
  const time: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const sameDay = until.toDateString() === now.toDateString();
  const withinWeek = until.getTime() - now.getTime() < 6 * 86_400_000;
  return new Intl.DateTimeFormat(
    locale,
    sameDay
      ? time
      : withinWeek
        ? { ...time, weekday: "short" }
        : { ...time, month: "short", day: "numeric" },
  ).format(until);
}

/** The few calls of a next-intl translator of "errors" this needs. */
export interface ErrorWords {
  has(key: string): boolean;
  (key: string, values?: Record<string, string>): string;
}

/**
 * A failure in the person's language: its code's words (with the time it lifts, for a limit), or
 * nothing when the app has no words for it.
 */
export function problemWords(
  words: ErrorWords,
  error: string,
  locale: string,
): string | undefined {
  const { code, until } = splitProblem(error);
  if (code === "brain-limit" && until && words.has("brain-limit-until"))
    return words("brain-limit-until", { time: untilWords(until, locale) });
  return words.has(code) ? words(code) : undefined;
}
