// What the person's autonomy mode (Settings › Preferences) lets their clone do on its own, beyond
// the rules they made one by one on cards. `ask` adds nothing. `reads` adds reading: files (never
// in folders left out, which are refused before any of this), web pages, asking a Claude Code
// conversation (a read-only copy), and what only reads in the services it is connected to. `auto`
// adds acting in those services and asking colleagues. Files leaving the computer, flows, and work
// in Claude Code conversations stay asked every time: the tool server asks for files again itself,
// and none of the others is ever named here.

import { connectorOfTool } from "../connectors/catalog.ts";
import { connectedConnectors } from "../connectors/oauth.ts";
import {
  asClaudeCode,
  readRule,
  readsOnly,
  serviceTools,
} from "../connectors/tools.ts";
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
  if (autonomy === "ask") return [];
  const services = await connectedConnectors().catch(() => []);
  const rules = [
    ...READING,
    ...services.map((service) => readRule(service.id)),
  ];
  if (autonomy !== "auto") return rules;
  for (const service of services)
    for (const tool of await serviceTools(service.id).catch(() => []))
      rules.push(`mcp__${service.id}__${asClaudeCode(tool.name)}`);
  return [...rules, ...ACTING];
}

/**
 * The mode's rules for a session of the person's own work; a colleague's request (and the look at
 * an answer before it leaves) starts with none, whatever the mode.
 */
export async function ownModeRules(purpose?: string): Promise<string[]> {
  if (purpose === "request" || purpose === "check" || purpose === "card")
    return [];
  return modeRules();
}

/** Whether a permission the clone asks for is already its own by the person's mode. */
export async function allowedByMode(
  tool: string,
  input: Record<string, unknown>,
  mode?: Autonomy,
): Promise<boolean> {
  const autonomy = mode ?? (await readPreferences()).autonomy;
  if (autonomy === "ask") return false;
  if (READING.includes(tool)) return true;
  if (connectorOfTool(tool))
    return autonomy === "auto" || (await readsOnly(tool).catch(() => false));
  if (autonomy !== "auto" || !ACTING.includes(tool)) return false;
  // Files that would leave this computer are shown to the person every time.
  return !(Array.isArray(input.files) && input.files.length > 0);
}
