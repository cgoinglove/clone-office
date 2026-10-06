// The words of one language, with English for any line not yet written in it. The screen loads
// them per request (request.ts); work with no page (the person's messenger) loads them here.

import en from "../messages/en.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";

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
