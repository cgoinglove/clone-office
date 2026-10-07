// When a flow runs: on some days at a time ("weekdays at 9"), every so many minutes, once, or when a
// colleague's request of a kind comes in (then its request is how the person wants those handled,
// and it is read while answering, never on a clock). The mini-me turns the person's words into
// this shape (the code never reads their words), and times are the person's own, by this
// computer's clock. A run missed while the computer slept or the app was closed is made up once,
// as Hermes Agent makes up missed runs: on days at a time up to 12 hours late, every so many
// minutes within half the period (2 hours at most), once within 2 minutes; later than that, it is
// noted as missed and the flow waits for its next time. Resuming a paused flow keeps where it was,
// so a time passed while it was paused follows the same rule.

export type When =
  /** 0 is Sunday, 6 is Saturday; time is "HH:MM". Every day is all seven. */
  | { kind: "weekly"; days: number[]; time: string }
  | { kind: "every"; minutes: number }
  /** Local date and time, "YYYY-MM-DDTHH:MM". */
  | { kind: "once"; at: string }
  /** A colleague's request of this menu kind comes in; any request when there is none. */
  | { kind: "request"; menu?: string };

/** Each run costs the person's AI usage: nothing more often than this. */
export const MIN_EVERY = 30;
const MAX_EVERY = 7 * 24 * 60;
const MINUTE = 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** A local time as "YYYY-MM-DDTHH:MM". */
export function localStamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocal(stamp: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(stamp);
  if (!match) return undefined;
  const [, y, mo, d, h, mi] = match.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  return date.getMonth() === mo - 1 && date.getDate() === d ? date : undefined;
}

function cleanTime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [hour, minute] = [Number(match[1]), Number(match[2])];
  return hour < 24 && minute < 60 ? `${pad(hour)}:${pad(minute)}` : undefined;
}

/**
 * A schedule from what the mini-me wrote, or undefined when it is not one. A one-off may be given
 * as a local time (`at`) or as minutes from now (`in_minutes`), so a reminder never depends on the
 * model working out the clock.
 */
export function cleanWhen(value: unknown, now = new Date()): When | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.kind === "weekly") {
    const days = Array.isArray(raw.days)
      ? [
          ...new Set(
            raw.days.filter(
              (day): day is number =>
                Number.isInteger(day) && day >= 0 && day <= 6,
            ),
          ),
        ].sort()
      : [];
    const time = cleanTime(raw.time);
    return days.length && time ? { kind: "weekly", days, time } : undefined;
  }
  if (raw.kind === "every") {
    const minutes = Number(raw.minutes);
    return Number.isInteger(minutes) &&
      minutes >= MIN_EVERY &&
      minutes <= MAX_EVERY
      ? { kind: "every", minutes }
      : undefined;
  }
  if (raw.kind === "request") {
    const menu = typeof raw.menu === "string" ? raw.menu.trim() : "";
    return menu ? { kind: "request", menu } : { kind: "request" };
  }
  if (raw.kind === "once") {
    const after = Number(raw.in_minutes);
    if (Number.isInteger(after) && after > 0 && after <= 366 * 24 * 60)
      return {
        kind: "once",
        at: localStamp(new Date(now.getTime() + after * MINUTE)),
      };
    if (typeof raw.at === "string") {
      const at = parseLocal(raw.at.trim().slice(0, 16));
      return at && at > now ? { kind: "once", at: localStamp(at) } : undefined;
    }
  }
  return undefined;
}

/**
 * The first time the flow runs after `after`. An "every" flow counts its periods from when it was
 * made (`anchor`), so its times do not drift with when it last ran.
 */
export function nextRun(
  when: When,
  after: Date,
  anchor: Date = after,
): Date | undefined {
  if (when.kind === "request") return undefined;
  if (when.kind === "once") {
    const at = parseLocal(when.at);
    return at && at > after ? at : undefined;
  }
  if (when.kind === "every") {
    const period = when.minutes * MINUTE;
    const passed = Math.max(
      0,
      Math.floor((after.getTime() - anchor.getTime()) / period) + 1,
    );
    return new Date(anchor.getTime() + passed * period);
  }
  const [hour, minute] = when.time.split(":").map(Number);
  for (let day = 0; day <= 7; day++) {
    const candidate = new Date(
      after.getFullYear(),
      after.getMonth(),
      after.getDate() + day,
      hour,
      minute,
    );
    if (candidate > after && when.days.includes(candidate.getDay()))
      return candidate;
  }
  return undefined;
}

/** How late a missed run may still be made up: half its period, between 2 minutes and 2 hours. */
export function catchUpMs(when: When): number {
  if (when.kind === "once" || when.kind === "request") return 2 * MINUTE;
  // On days at a time, the day's run is still made up to 12 hours late (a morning briefing when
  // the laptop opens at eleven); every so many minutes, within half the period.
  const window =
    when.kind === "every"
      ? Math.min(120 * MINUTE, (when.minutes * MINUTE) / 2)
      : 12 * 60 * MINUTE;
  return Math.max(2 * MINUTE, window);
}

export type Decision =
  | { run: false }
  /** `slot` is the scheduled time this is about; `missed` when it is too late to make up. */
  | { run: true; slot: Date }
  | { run: false; missed: Date };

/**
 * What to do now: the latest scheduled time since the one last handled (`seen`, or when the flow
 * was made), run when it is recent enough, noted as missed when not.
 */
export function decide(
  when: When,
  made: Date,
  seen: Date | undefined,
  now: Date,
): Decision {
  let slot = nextRun(when, seen ?? made, made);
  if (!slot || slot > now) return { run: false };
  // A long sleep can pass many slots: only the latest counts.
  for (let i = 0; i < 100_000; i++) {
    const next = nextRun(when, slot, made);
    if (!next || next > now) break;
    slot = next;
  }
  return now.getTime() - slot.getTime() <= catchUpMs(when)
    ? { run: true, slot }
    : { run: false, missed: slot };
}
