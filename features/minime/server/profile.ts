// What the person told the app about themselves: what to call them, what they do, what they look
// after and the tools they work in. The first reading suggests the last three from their records
// (`learn.ts` `about`) and the person settles them on the first steps or the clone's screen. It
// names their desk while they are in no office and fills in the card when they open or join one
// (their card there is what colleagues see), and every session of the clone starts with it
// (`session.ts` `systemPrompt`), so the clone knows whose work it does. It is what the person
// confirmed, not memory: they change it whenever it stops being true.

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "./exclude.ts";
import { minimeHome } from "./paths.ts";

export interface Profile {
  name?: string;
  role?: string;
  /** What they look after, that colleagues come to them for: a system, an area, a kind of work. */
  owns?: string[];
  /** The tools they work in every day, by name. */
  tools?: string[];
}

/** What a reading suggests for the profile; the person keeps it or changes it. */
export type About = Required<Pick<Profile, "role" | "owns" | "tools">>;

export const LIMITS = { role: 200, owns: 4, own: 80, tools: 6, tool: 40 };

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : undefined;

/** A list as it should be kept: strings only, trimmed, cut, without repeats or empties. */
export function cleanList(
  value: unknown,
  count: number,
  max: number,
): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = clean(item, max);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === count) break;
  }
  return out;
}

/** A reading's suggestion as the model gave it, or none when it says nothing. */
export function cleanAbout(value: unknown): About | undefined {
  const raw = value as Partial<Record<keyof About, unknown>> | undefined;
  const about = {
    role: clean(raw?.role, LIMITS.role) ?? "",
    owns: cleanList(raw?.owns, LIMITS.owns, LIMITS.own),
    tools: cleanList(raw?.tools, LIMITS.tools, LIMITS.tool),
  };
  return about.role || about.owns.length || about.tools.length
    ? about
    : undefined;
}

function shape(raw: Profile | undefined): Profile {
  const name = clean(raw?.name, 80);
  const role = clean(raw?.role, LIMITS.role);
  const owns = cleanList(raw?.owns, LIMITS.owns, LIMITS.own);
  const tools = cleanList(raw?.tools, LIMITS.tools, LIMITS.tool);
  return {
    ...(name ? { name } : {}),
    ...(role ? { role } : {}),
    ...(owns.length ? { owns } : {}),
    ...(tools.length ? { tools } : {}),
  };
}

export async function readProfile(): Promise<Profile> {
  try {
    const settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    return shape(settings?.profile ?? {});
  } catch {
    return {};
  }
}

/** Keeps what is given; a field left out stays as it was, and an empty one is cleared. */
export async function writeProfile(next: Profile): Promise<Profile> {
  let profile: Profile = {};
  await withLock(minimeHome(), async () => {
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(await readFile(settingsPath(), "utf8"));
    } catch {
      settings = {};
    }
    profile = shape({
      ...((settings.profile as Profile | undefined) ?? {}),
      ...next,
    });
    await writeSettings(
      `${JSON.stringify({ ...settings, profile }, null, 2)}\n`,
    );
  });
  return profile;
}

/** The profile as the clone reads it at the start of every session, or nothing when it is empty. */
export function profileBlock(profile: Profile): string {
  const lines = [
    profile.name && `Name: ${profile.name}`,
    profile.role && `What they do: ${profile.role}`,
    profile.owns?.length && `What they look after: ${profile.owns.join("; ")}`,
    profile.tools?.length && `Tools they work in: ${profile.tools.join(", ")}`,
  ].filter(Boolean);
  if (!lines.length) return "";
  return [
    "## Your person",
    "They set this themselves. It says whose work you do; when something current matters, look it up rather than relying on it.",
    ...lines,
  ].join("\n");
}
