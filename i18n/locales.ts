// The languages the screen is written in. English is the source: a line missing in another
// language reads in English. To add a language, add messages/<code>.json with every key of
// messages/en.json (the test in i18n/messages.test.ts says which are missing) and its code here.

export const LOCALES = ["en", "ko"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** The cookie that keeps the language the person picked; without it, the browser's languages decide. */
export const LOCALE_COOKIE = "locale";

/** Each language by its own name, as the switcher shows it. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
};

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** The first of the browser's languages (Accept-Language, best first) that the screen is written in. */
export function pickLocale(acceptLanguage: string | null | undefined): Locale {
  const wanted = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const weight = params
        .map((param) => param.trim())
        .find((param) => param.startsWith("q="));
      const q = weight ? Number(weight.slice(2)) : 1;
      return {
        tag: tag.trim().toLowerCase(),
        q: Number.isNaN(q) ? 0 : q,
        index,
      };
    })
    .filter((item) => item.tag && item.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of wanted) {
    const language = tag.split("-")[0];
    if (isLocale(language)) return language;
  }
  return DEFAULT_LOCALE;
}
