// A flow's schedule in the person's language, wherever it is shown: on the page (next-intl's
// translator and formatter) or in their messenger (the same, made on the server).

import type { useFormatter, useTranslations } from "next-intl";
import { cleanWhen, type When } from "./schedule.ts";

/** The "flows" words, and dates in the person's own way: next-intl's, on the page or the server. */
export type FlowWords = ReturnType<typeof useTranslations<"flows">>;
export type DateFormat = ReturnType<typeof useFormatter>;

/**
 * A schedule in the person's language, with their own way of writing days and times. A request
 * flow shows the kind it is for (`kind`, its name when known).
 */
export function whenText(
  t: FlowWords,
  format: DateFormat,
  when: When,
  kind?: string,
): string {
  if (when.kind === "request")
    return when.menu
      ? t("when.request", { kind: kind ?? when.menu.replaceAll("-", " ") })
      : t("when.anyRequest");
  const clock = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return format.dateTime(new Date(2000, 0, 1, hour, minute), {
      hour: "numeric",
      minute: "2-digit",
    });
  };
  if (when.kind === "every")
    return when.minutes % 60 === 0
      ? t("when.hours", { hours: when.minutes / 60 })
      : t("when.minutes", { minutes: when.minutes });
  if (when.kind === "once") {
    const [date, time] = when.at.split("T");
    const [y, m, d] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    return t("when.once", {
      at: format.dateTime(new Date(y, m - 1, d, hour, minute), {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    });
  }
  const time = clock(when.time);
  if (when.days.length === 7) return t("when.daily", { time });
  if (when.days.join(",") === "1,2,3,4,5") return t("when.weekdays", { time });
  // 4 October 2026 was a Sunday: each day's name in the person's language.
  const days = when.days
    .map((day) =>
      format.dateTime(new Date(2026, 9, 4 + day), { weekday: "short" }),
    )
    .join(", ");
  return t("when.days", { days, time });
}

/**
 * The schedule a flow card asks about, as it would be kept (cleanWhen), so the person approves what
 * is saved; one that would be refused says so. A one-off "in N minutes" stays relative.
 */
export function askedWhen(
  t: FlowWords,
  format: DateFormat,
  raw: unknown,
  kind?: string,
  now = new Date(),
): string | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const given = raw as Record<string, unknown>;
  const clean = cleanWhen(given, now);
  if (!clean) return t("when.invalid");
  const minutes = Number(given.in_minutes);
  if (clean.kind === "once" && Number.isInteger(minutes) && minutes > 0)
    return t("when.inMinutes", { minutes });
  try {
    return whenText(t, format, clean, kind);
  } catch {
    return t("when.invalid");
  }
}
