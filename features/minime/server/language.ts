// The person's language, as their screen last told the app. A page sends its language tag with
// each call; work that runs with no page open (the office answering a colleague after a restart)
// uses the last one kept, so the mini-me never guesses which language to ask its person in.

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "./exclude.ts";
import { languageName } from "./ndjson.ts";
import { minimeHome } from "./paths.ts";

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** The language to work in, by name: the page's when it sent one (kept for later), else the last kept. */
export async function personLanguage(
  tag?: string | null,
): Promise<string | undefined> {
  const name = languageName(tag ?? undefined);
  const settings = await readSettings();
  const kept =
    typeof settings.language === "string" ? settings.language : undefined;
  if (!tag || !name) return languageName(kept);
  if (tag !== kept)
    await withLock(minimeHome(), async () => {
      const fresh = await readSettings();
      await writeSettings(
        `${JSON.stringify({ ...fresh, language: tag }, null, 2)}\n`,
      );
    });
  return name;
}
