// Folders the person keeps out of everything the mini-me reads, such as a company's work. They
// live in ~/.sub-office/settings.json as {"exclude": ["client-*", "~/work/private"]} and apply to
// the first transplant, the conversation index and its search alike.
// A pattern with a slash is a path (a leading "~" is the home folder) and excludes everything
// under it; a pattern without one matches any single folder name in a path. "*" matches any run
// of characters inside one name.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { atomicWrite } from "../memory/files.ts";
import { minimeHome } from "./paths.ts";

export function settingsPath(): string {
  return join(minimeHome(), "settings.json");
}

/** Writes settings.json for its person's eyes only: it keeps tokens and keys (a bot's, an office's). */
export async function writeSettings(content: string): Promise<void> {
  await atomicWrite(settingsPath(), content, { mode: 0o600 });
}

/** The person's exclude patterns; none when the settings file is missing or unreadable. */
export function loadExcludes(): string[] {
  try {
    const parsed = JSON.parse(readFileSync(settingsPath(), "utf8"));
    return Array.isArray(parsed?.exclude)
      ? parsed.exclude.filter(
          (p: unknown): p is string => typeof p === "string" && p.trim() !== "",
        )
      : [];
  } catch {
    return [];
  }
}

function nameMatcher(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`, "i");
}

/** True when `path` falls under one of the patterns. */
export function isExcluded(
  path: string | undefined,
  patterns: readonly string[],
): boolean {
  if (!path || !patterns.length) return false;
  const normalized = path.replaceAll("\\", "/");
  const names = normalized.split("/").filter(Boolean);
  for (const raw of patterns) {
    const pattern = raw.trim().replaceAll("\\", "/");
    if (pattern.includes("/")) {
      const base = (
        pattern.startsWith("~")
          ? homedir().replaceAll(sep, "/") + pattern.slice(1)
          : pattern
      ).replace(/\/+$/, "");
      if (normalized === base || normalized.startsWith(`${base}/`)) return true;
      continue;
    }
    const matcher = nameMatcher(pattern);
    if (names.some((name) => matcher.test(name))) return true;
  }
  return false;
}
