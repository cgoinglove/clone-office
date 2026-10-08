// What the person lets their mini-me do without asking, in Claude Code's own permission-rule
// syntax, kept in settings.json as {"trust": {"allow": ["Read(~/Documents/**)", ...]}}. A rule is
// added when they answer a question with "from now on"; they take one back on their page.
// The folders they keep out become rules the mini-me may never break.

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, sep } from "node:path";
import { connectorOfTool } from "../connectors/catalog.ts";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
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

/**
 * The clone's own tools asked every time, whatever was answered before: making or changing a flow,
 * and work in a Claude Code conversation. "From now on" is never offered for them (Hermes Agent
 * offers no lasting scope on a gate that asks every time either).
 */
export const ALWAYS_ASKED = new Set([
  "mcp__minime__flow_manage",
  "mcp__minime__work_session",
]);

export async function loadTrust(): Promise<string[]> {
  const settings = await readSettings();
  const allow = (settings.trust as { allow?: unknown } | undefined)?.allow;
  return Array.isArray(allow)
    ? allow.filter(
        (rule): rule is string =>
          typeof rule === "string" && !ALWAYS_ASKED.has(rule),
      )
    : [];
}

export async function addTrust(rule: string): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const trust = (settings.trust ?? {}) as { allow?: string[] };
    const allow = new Set(Array.isArray(trust.allow) ? trust.allow : []);
    allow.add(rule);
    await writeSettings(
      `${JSON.stringify({ ...settings, trust: { ...trust, allow: [...allow] } }, null, 2)}\n`,
    );
  });
}

/** Takes back something allowed "from now on": the mini-me asks first again. */
export async function removeTrust(rule: string): Promise<boolean> {
  return withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const trust = (settings.trust ?? {}) as { allow?: string[] };
    const allow = Array.isArray(trust.allow) ? trust.allow : [];
    if (!allow.includes(rule)) return false;
    await writeSettings(
      `${JSON.stringify({ ...settings, trust: { ...trust, allow: allow.filter((kept) => kept !== rule) } }, null, 2)}\n`,
    );
    return true;
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
  if (ALWAYS_ASKED.has(tool)) return undefined;
  // A folder rule is never the whole home folder or the whole disk: a file there is asked each time.
  const folder = (path: string) => {
    const rule = pathRule(path);
    return rule === "~" || rule === "//" || rule === "/" ? undefined : rule;
  };
  if (tool === "Read" && typeof input.file_path === "string") {
    const at = folder(dirname(input.file_path));
    return at ? `Read(${at}/**)` : undefined;
  }
  if ((tool === "Glob" || tool === "Grep") && typeof input.path === "string") {
    const at = folder(input.path);
    return at ? `Read(${at}/**)` : undefined;
  }
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
  ) {
    const at = folder(dirname(String(input.file_path ?? input.notebook_path)));
    return at ? `Edit(${at}/**)` : undefined;
  }
  // The mini-me's own tools that reach out, such as asking a colleague: the tool itself. Files
  // leaving this computer are asked every time.
  if (Array.isArray(input.files) && input.files.length) return undefined;
  // A connected service's tool, one at a time (as Paperclip allows each action of a connection).
  if (tool.startsWith("mcp__minime__") || connectorOfTool(tool)) return tool;
  return undefined;
}

/** The folders kept out (the ones written as paths) as rules no answer can override. */
export function denyRules(excludes: readonly string[]): string[] {
  return [...appSecretRules(), ...excludedRules(excludes)];
}

/**
 * The clone's own secrets, out of its reach whatever it is told: the key that opens them and the
 * sealed files (server/secret.ts). Together they would give the keys back in the clear.
 */
function appSecretRules(): string[] {
  const home = pathRule(minimeHome());
  return [
    `Read(${home}/secret.key)`,
    `Read(${home}/brain/keys.json)`,
    `Read(${home}/brain/chatgpt.json)`,
    `Read(${home}/connectors/**)`,
    `Edit(${home}/secret.key)`,
    `Edit(${home}/brain/**)`,
    `Edit(${home}/connectors/**)`,
  ];
}

function excludedRules(excludes: readonly string[]): string[] {
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
