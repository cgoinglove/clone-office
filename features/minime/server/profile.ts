// What the person told the app about themselves on the first steps: what to call them and what
// they do. It names their desk while they are in no office, and fills in the card when they open
// or join one; once they are in an office, their card there is what colleagues see.

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "./exclude.ts";
import { minimeHome } from "./paths.ts";

export interface Profile {
  name?: string;
  role?: string;
}

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

export async function readProfile(): Promise<Profile> {
  try {
    const settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    const profile = settings?.profile ?? {};
    return {
      ...(clean(profile.name, 80) ? { name: clean(profile.name, 80) } : {}),
      ...(clean(profile.role, 200) ? { role: clean(profile.role, 200) } : {}),
    };
  } catch {
    return {};
  }
}

export async function writeProfile(next: Profile): Promise<Profile> {
  const profile = {
    ...(clean(next.name, 80) ? { name: clean(next.name, 80) } : {}),
    ...(clean(next.role, 200) ? { role: clean(next.role, 200) } : {}),
  };
  await withLock(minimeHome(), async () => {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    } catch {
      settings = {};
    }
    await writeSettings(
      `${JSON.stringify({ ...settings, profile }, null, 2)}\n`,
    );
  });
  return profile;
}
