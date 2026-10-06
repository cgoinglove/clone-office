// The screen's language for one request (next-intl, without language prefixes in the address:
// this app runs on the person's own computer): the one they picked, kept in a cookie, else the
// first of their browser's languages the screen is written in, else English. A line not yet in
// their language reads in English.

import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { isLocale, LOCALE_COOKIE, pickLocale } from "./locales";
import { loadMessages } from "./messages";

export default getRequestConfig(async () => {
  const chosen = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(chosen)
    ? chosen
    : pickLocale((await headers()).get("accept-language"));
  return { locale, messages: await loadMessages(locale) };
});
