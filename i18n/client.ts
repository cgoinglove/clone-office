"use client";

// The page's side of language: the tag the mini-me works in (the language the person picked for
// the screen, else their browser's own, whatever it is), picking one, and errors read in the
// screen's language.

import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { LOCALE_COOKIE } from "./locales";

/** The language the mini-me works in: the one picked for the screen, else the browser's own. */
export function personTag(): string {
  const picked = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return picked ? decodeURIComponent(picked) : navigator.language || "en";
}

/** Keep the language picked for the screen; the page then renders again in it. */
export function pickLanguage(locale: string): void {
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; path=/; max-age=31536000; samesite=lax`;
}

type ErrorKey = Parameters<ReturnType<typeof useTranslations<"errors">>>[0];

/**
 * An error as the person reads it: the app's routes answer with a code (`claude-missing`,
 * `relay-unreachable`), read here in the screen's language; anything else is shown as it came.
 */
export function useProblem(): (error: string) => string {
  const t = useTranslations("errors");
  return useCallback(
    (error: string) =>
      t.has(error as ErrorKey)
        ? t(error as ErrorKey)
        : t("generic", { detail: error }),
    [t],
  );
}
