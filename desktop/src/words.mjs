// The desktop app's own words (its menus, its tray, its notices): the `desktop` part of each
// messages/<language>.json, gathered by desktop/build.mjs, so they are kept with the screen's and
// checked with them (i18n/messages.test.ts). The language is the one the person picked on the
// screen (its cookie), else the first of the system's that the app is written in, else English, as
// the screen decides it (i18n/locales.ts).

/** The languages the screen is written in (i18n/locales.ts). */
export const LOCALES = ["en", "ko", "zh", "ja", "es", "pt"];

/** The first of `wanted` (a cookie's value, then the system's languages) the app is written in. */
export function pickLocale(wanted = []) {
  for (const tag of wanted) {
    const language = String(tag ?? "")
      .trim()
      .toLowerCase()
      .split(/[-_]/)[0];
    if (LOCALES.includes(language)) return language;
  }
  return "en";
}

/** A line of words in `locale`, English where that language has none, with {values} put in. */
export function translator(all, locale) {
  const own = all[locale] ?? {};
  const english = all.en ?? {};
  return (key, values = {}) => {
    const text = own[key] ?? english[key] ?? key;
    return text.replace(/\{(\w+)\}/g, (whole, name) =>
      name in values ? String(values[name]) : whole,
    );
  };
}
