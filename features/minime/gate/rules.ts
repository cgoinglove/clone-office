// What the person lets their mini-me do without asking, in Claude Code's own permission-rule
// syntax, kept in settings.json as {"trust": {"allow": ["Read(~/Documents/**)", ...]}}. A rule is
// added when they answer a question with "from now on"; they take one back by removing its line.
// The folders they keep out become rules the mini-me may never break.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, sep } from "node:path";
import { atomicWrite, withLock } from "../memory/files.ts";
import { settingsPath } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";

/** Tools a mini-me uses alone from the start: searching the web reads, and keeps nothing. */
export const TRUSTED_FROM_START = ["WebSearch"];

/** Tools a mini-me may ask to use in a conversation: reading only, never writing or running. */
export const ASKABLE_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function loadTrust(): Promise<string[]> {
  const settings = await readSettings();
  const allow = (settings.trust as { allow?: unknown } | undefined)?.allow;
  return Array.isArray(allow)
    ? allow.filter((rule): rule is string => typeof rule === "string")
    : [];
}

export async function addTrust(rule: string): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const trust = (settings.trust ?? {}) as { allow?: string[] };
    const allow = new Set(Array.isArray(trust.allow) ? trust.allow : []);
    allow.add(rule);
    await atomicWrite(
      settingsPath(),
      `${JSON.stringify({ ...settings, trust: { ...trust, allow: [...allow] } }, null, 2)}\n`,
    );
  });
}

/** A path as a permission rule writes it: home-relative with "~/", absolute with "//". */
export function pathRule(path: string): string {
  const home = homedir();
  const clean = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const base = home.replaceAll("\\", "/");
  if (clean === base) return "~";
  if (clean.startsWith(`${base}/`)) return `~/${clean.slice(base.length + 1)}`;
  return `/${clean.startsWith("/") ? clean : `/${clean}`}`;
}

/** The rule that lets a tool do this kind of thing from now on: a folder, a site, or the tool. */
export function ruleFor(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  if (tool === "Read" && typeof input.file_path === "string")
    return `Read(${pathRule(dirname(input.file_path))}/**)`;
  if ((tool === "Glob" || tool === "Grep") && typeof input.path === "string")
    return `Read(${pathRule(input.path)}/**)`;
  if (tool === "WebFetch" && typeof input.url === "string") {
    try {
      return `WebFetch(domain:${new URL(input.url).hostname})`;
    } catch {
      return undefined;
    }
  }
  if (tool === "WebSearch") return "WebSearch";
  // Changing files: from now on in that folder. A command is asked every time.
  if (
    (tool === "Edit" || tool === "Write" || tool === "NotebookEdit") &&
    typeof (input.file_path ?? input.notebook_path) === "string"
  )
    return `Edit(${pathRule(dirname(String(input.file_path ?? input.notebook_path)))}/**)`;
  // The mini-me's own tools that reach out, such as asking a colleague: the tool itself.
  if (tool.startsWith("mcp__minime__")) return tool;
  return undefined;
}

/** The folders kept out (the ones written as paths) as rules no answer can override. */
export function denyRules(excludes: readonly string[]): string[] {
  return excludes
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.includes("/") || pattern.includes(sep))
    .map((pattern) =>
      pattern.startsWith("~")
        ? `${homedir()}${pattern.slice(1)}`
        : isAbsolute(pattern)
          ? pattern
          : "",
    )
    .filter(Boolean)
    .flatMap((path) => [
      `Read(${pathRule(path)}/**)`,
      `Edit(${pathRule(path)}/**)`,
    ]);
}
