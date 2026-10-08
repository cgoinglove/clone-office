// A colleague's request may read in the services the person connected, as answering one often
// needs (where a ticket stands, what a page says), and never change anything there: only the tools
// a service marks as reading (MCP's readOnlyHint) are offered, every other one is refused. Per
// service, in settings.json `connectors.forColleagues`. The work tools (Notion, Linear, Jira and
// Confluence, GitHub) start on; Google's (mail, calendar, personal files, mixed with private
// things) start off. What the answer then says still passes the look before it leaves
// (office/check.ts).

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import type { Connector } from "./catalog.ts";
import { connectedConnectors } from "./oauth.ts";
import { asClaudeCode, serviceTools } from "./tools.ts";

/** Off until the person turns them on: their mail, calendar and own files. */
export const OFF_AT_FIRST = new Set([
  "gmail",
  "calendar",
  "drive",
  "docs",
  "sheets",
]);

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** For each service the person decided about, whether colleagues' requests read in it. */
async function decided(): Promise<Record<string, boolean>> {
  const connectors = (await readSettings()).connectors as
    | { forColleagues?: Record<string, boolean> }
    | undefined;
  return connectors?.forColleagues ?? {};
}

/** Whether a colleague's request reads in this service. */
export const readsForColleagues = (
  id: string,
  kept: Record<string, boolean>,
): boolean => kept[id] ?? !OFF_AT_FIRST.has(id);

/** Each service's setting as the page shows it. */
export async function forColleagues(ids: string[]) {
  const kept = await decided();
  return Object.fromEntries(
    ids.map((id) => [id, readsForColleagues(id, kept)]),
  );
}

export async function setForColleagues(id: string, on: boolean): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const connectors = (settings.connectors ?? {}) as Record<string, unknown>;
    const forColleagues = {
      ...((connectors.forColleagues as Record<string, boolean>) ?? {}),
      [id]: on,
    };
    await writeSettings(
      `${JSON.stringify({ ...settings, connectors: { ...connectors, forColleagues } }, null, 2)}\n`,
    );
  });
}

/** The connected services a colleague's request reads in. */
export async function colleagueServices(): Promise<Connector[]> {
  const kept = await decided();
  return (await connectedConnectors().catch(() => [])).filter((entry) =>
    readsForColleagues(entry.id, kept),
  );
}

/**
 * A colleague's session's rules for those services, by each tool's name in a session
 * (`mcp__<service>__<tool>`): its reading tools allowed without asking, every other tool refused.
 */
export async function colleagueRules(
  services: Connector[],
): Promise<{ allow: string[]; deny: string[] }> {
  const allow: string[] = [];
  const deny: string[] = [];
  for (const service of services)
    for (const tool of await serviceTools(service.id).catch(() => []))
      (tool.readOnly ? allow : deny).push(
        `mcp__${service.id}__${asClaudeCode(tool.name)}`,
      );
  return { allow, deny };
}
