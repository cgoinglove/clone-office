// The screen's language for one request (next-intl, without language prefixes in the address:
// this app runs on the person's own computer): the one they picked, kept in a cookie, else the
// first of their browser's languages the screen is written in, else English. A line not yet in
// their language reads in English.

import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import en from "../messages/en.json";
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  type Locale,
  pickLocale,
} from "./locales";

type Messages = Record<string, unknown>;

function withFallback(base: Messages, own: Messages): Messages {
  const merged: Messages = { ...base };
  for (const [key, value] of Object.entries(own)) {
    const under = base[key];
    merged[key] =
      value && typeof value === "object" && under && typeof under === "object"
        ? withFallback(under as Messages, value as Messages)
        : value;
  }
  return merged;
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === DEFAULT_LOCALE) return en;
  const own = (await import(`../messages/${locale}.json`)).default as Messages;
  return withFallback(en, own);
}

export default getRequestConfig(async () => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(chosen)
    ? chosen
    : pickLocale((await headers()).get("accept-language"));
  return { locale, messages: await loadMessages(locale) };
});
