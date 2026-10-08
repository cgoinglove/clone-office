// The words for what runs with no page open (the person's messenger, their Claude Code), in the
// language their screen last used, else English, made from the same files as the screen's.

import { readFile } from "node:fs/promises";
import { createFormatter, createTranslator } from "next-intl";
import { isLocale, type Locale } from "../../../i18n/locales.ts";
import { loadMessages } from "../../../i18n/messages.ts";
import type english from "../../../messages/en.json";
import { settingsPath } from "./exclude.ts";

async function screenLanguage(): Promise<unknown> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8")).language;
  } catch {
    return undefined;
  }
}

/** The words in the language the person's screen last used, else English. */
export async function words() {
  const tag = await screenLanguage();
  const base = typeof tag === "string" ? tag.split("-")[0] : undefined;
  const locale: Locale = isLocale(base) ? base : "en";
  // Made once per language: a translator keeps what it has parsed.
  let made = wordsMade.get(locale);
  if (!made) {
    made = makeWords(locale);
    wordsMade.set(locale, made);
  }
  return made;
}

export type Words = Awaited<ReturnType<typeof makeWords>>;
const wordsMade = new Map<Locale, Promise<Words>>();

async function makeWords(locale: Locale) {
  const messages = (await loadMessages(locale)) as typeof english;
  return {
    locale,
    t: createTranslator({ locale, messages, namespace: "messenger" }),
    ask: createTranslator({ locale, messages, namespace: "ask" }),
    chat: createTranslator({ locale, messages, namespace: "chat" }),
    flows: createTranslator({ locale, messages, namespace: "flows" }),
    // The person's own clock: the computer's time zone, said, so dates read as theirs.
    format: createFormatter({
      locale,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
    errors: createTranslator({ locale, messages, namespace: "errors" }),
    plugin: createTranslator({ locale, messages, namespace: "plugin" }),
  };
}
