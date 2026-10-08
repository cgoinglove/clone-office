// What the person's autonomy mode (Settings › Permissions) lets their clone do on its own, beyond
// the rules they made one by one on cards. `ask` adds nothing. `auto` adds reading (files, never in
// folders left out, which are refused before any of this; web pages; asking a Claude Code or Codex
// conversation, a read-only copy; what only reads in the connected services), acting in those
// services, running commands inside its sandbox, and asking colleagues. Files leaving the computer,
// flows, and work in Claude Code or Codex conversations (and letting a Codex conversation's changes
// into their files) stay asked every time: the tool server asks for files again itself, and none
// of the others is ever named here.

import { connectorOfTool } from "../connectors/catalog.ts";
import { connectedConnectors } from "../connectors/oauth.ts";
import { asClaudeCode, readRule, serviceTools } from "../connectors/tools.ts";
import {
  BASH,
  BROWSER_ALWAYS_ASKED,
  BROWSER_NEVER,
  browserActRules,
  browserTool,
} from "../hands/names.ts";
import { type Autonomy, readPreferences } from "../server/preferences.ts";

const READING = [
  "Read",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "mcp__minime__ask_session",
];

const ACTING = [
  "mcp__minime__ask_colleague",
  "mcp__minime__ask_by_link",
  "mcp__minime__leave_out_folder",
];

/** The rules a session starts with for the mode, as tool names (and connectors' read rules). */
export async function modeRules(mode?: Autonomy): Promise<string[]> {
  const autonomy = mode ?? (await readPreferences()).autonomy;
  if (autonomy !== "auto") return [];
  const services = await connectedConnectors().catch(() => []);
  const rules = [
    ...READING,
    ...services.map((service) => readRule(service.id)),
  ];
  for (const service of services)
    for (const tool of await serviceTools(service.id).catch(() => []))
      rules.push(`mcp__${service.id}__${asClaudeCode(tool.name)}`);
  return [...rules, ...ACTING, ...browserActRules()];
}

/**
 * The mode's rules for a session of the person's own work: a conversation with them or one of their
 * flows. Every other session (a colleague's request, the look at an answer before it leaves, a
 * reading, a look back) starts with none, whatever the mode.
 */
export async function ownModeRules(purpose = "task"): Promise<string[]> {
  if (purpose !== "task" && purpose !== "flow") return [];
  return modeRules();
}

/** Whether a permission the clone asks for is already its own by the person's mode. */
export async function allowedByMode(
  tool: string,
  input: Record<string, unknown>,
  mode?: Autonomy,
): Promise<boolean> {
  const autonomy = mode ?? (await readPreferences()).autonomy;
  if (autonomy !== "auto") return false;
  if (READING.includes(tool) || connectorOfTool(tool)) return true;
  // A command, only inside the sandbox; one that would run outside it is shown every time.
  if (tool === BASH) return input.sandboxed === true;
  // The clone's browser, but uploading a file or running code in a page is asked every time.
  const page = browserTool(tool);
  if (page) return !BROWSER_ALWAYS_ASKED.has(page) && !BROWSER_NEVER.has(page);
  if (!ACTING.includes(tool)) return false;
  // Files that would leave this computer are shown to the person every time.
  return !(Array.isArray(input.files) && input.files.length > 0);
}
