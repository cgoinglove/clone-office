// The words of one language, with English for any line not yet written in it. The screen loads
// them per request (request.ts); work with no page (the person's messenger) loads them here.

import en from "../messages/en.json";
import es from "../messages/es.json";
import ja from "../messages/ja.json";
import ko from "../messages/ko.json";
import pt from "../messages/pt.json";
import zh from "../messages/zh.json";
import { DEFAULT_LOCALE, type Locale } from "./locales";
import type { InSync } from "./sync";

/** Each language's file, as it is. */
const FILES = { en, ko, zh, ja, es, pt };

/**
 * Every language the screen is written in, each with exactly English's keys: a language listed in
 * locales.ts without its file in FILES, or a line missing or left over in one, is a type error that
 * names it (`pnpm typecheck`, and the package build runs it).
 */
const LANGUAGES: {
  [L in Locale]: InSync<(typeof FILES)[L], typeof en>;
} = FILES;

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
  return withFallback(en, LANGUAGES[locale] as Messages);
}
