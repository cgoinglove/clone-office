import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { createTranslator } from "next-intl";
import { LOCALES, pickLocale } from "./locales";

type Tree = { [key: string]: string | Tree };

const dir = join(import.meta.dirname, "..", "messages");
const load = (locale: string): Tree =>
  JSON.parse(readFileSync(join(dir, `${locale}.json`), "utf8"));

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const found = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") found.set(path, value);
    else for (const [k, v] of leaves(value, path)) found.set(k, v);
  }
  return found;
}

/** The values a message takes: {name}, {count, plural, …}. */
const args = (message: string) =>
  new Set(
    [...message.matchAll(/\{\s*([A-Za-z_]\w*)\s*[,}]/g)].map((m) => m[1]),
  );

const english = leaves(load("en"));

test("every language file is listed, and every listed language has a file", () => {
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
    .sort();
  assert.deepEqual(files, [...LOCALES].sort());
});

for (const locale of LOCALES.filter((l) => l !== "en")) {
  test(`${locale} says everything English says, with the same values`, () => {
    const own = leaves(load(locale));
    const missing = [...english.keys()].filter((key) => !own.has(key));
    const extra = [...own.keys()].filter((key) => !english.has(key));
    assert.deepEqual(missing, [], `missing in ${locale}.json`);
    assert.deepEqual(extra, [], `not in en.json`);
    for (const [key, message] of english) {
      assert.deepEqual(
        args(own.get(key) ?? ""),
        args(message),
        `${locale}.json ${key} takes other values than en.json`,
      );
    }
  });
}

test("every message formats in every language", () => {
  const values = {
    count: 2,
    name: "Ana",
    dir: "~/.sub-office/memories",
    home: "~/.sub-office",
    detail: "detail",
    answer: "Yes",
    when: "Oct 6",
  };
  for (const locale of LOCALES) {
    const t = createTranslator({ locale, messages: load(locale) });
    for (const key of english.keys()) {
      const text = t(key as never, values as never);
      assert.ok(text && !text.includes("{"), `${locale} ${key}: ${text}`);
    }
    for (const count of [0, 1, 7])
      assert.ok(t("import.done" as never, { count } as never));
  }
});

test("the screen speaks the first of the browser's languages it is written in, else English", () => {
  assert.equal(pickLocale("ko-KR,ko;q=0.9,en-US;q=0.8"), "ko");
  assert.equal(pickLocale("ja-JP,ja;q=0.9,ko;q=0.8,en;q=0.7"), "ko");
  assert.equal(pickLocale("en-GB,en;q=0.9,ko;q=0.5"), "en");
  assert.equal(pickLocale("fr-FR,de;q=0.8"), "en");
  assert.equal(pickLocale("ko;q=0,en;q=0.5"), "en", "q=0 means not wanted");
  assert.equal(pickLocale(undefined), "en");
});
