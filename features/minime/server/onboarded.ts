// Whether the person has set up their clone: they went through the first steps (/start), or were
// using it before those steps existed (it read their records, keeps something, or they talked with
// it). The app's front door sends a new person to the first steps and everyone else to their clone.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "./exclude.ts";
import { minimeHome } from "./paths.ts";

export function isOnboarded(): boolean {
  try {
    if (JSON.parse(readFileSync(settingsPath(), "utf8"))?.onboarded)
      return true;
  } catch {
    // No settings yet: a new person, unless something below says otherwise.
  }
  const home = minimeHome();
  if (existsSync(join(/*turbopackIgnore: true*/ home, "learn.json")))
    return true;
  try {
    if (
      readdirSync(join(/*turbopackIgnore: true*/ home, "chats")).some((name) =>
        name.endsWith(".jsonl"),
      )
    )
      return true;
  } catch {
    // No conversations yet.
  }
  for (const file of ["USER.md", "MEMORY.md"])
    try {
      if (
        readFileSync(
          join(/*turbopackIgnore: true*/ home, "memories", file),
          "utf8",
        ).trim()
      )
        return true;
    } catch {
      // Nothing kept there.
    }
  return false;
}

/** The first steps are done (or set aside): the front door opens the clone from now on. */
export async function setOnboarded(): Promise<void> {
  await withLock(minimeHome(), async () => {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    } catch {
      settings = {};
    }
    await writeSettings(
      `${JSON.stringify({ ...settings, onboarded: true }, null, 2)}\n`,
    );
  });
}
