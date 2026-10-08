// A colleague's request may read in the services the person connected, as answering one often
// needs (where a ticket stands, what a page says), and never change anything there: only the tools
// a service marks as reading (MCP's readOnlyHint) in its last list are offered; every other one,
// a new one included, is refused (fail closed). Per service, in settings.json
// `connectors.forColleagues`, each off until the person turns it on: what a colleague's clone may
// get read for it is theirs to decide. What the answer then says still passes the look before it
// leaves (office/check.ts).

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import type { Connector } from "./catalog.ts";
import { connectedConnectors } from "./oauth.ts";
import { asClaudeCode, serviceTools } from "./tools.ts";

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
): boolean => kept[id] === true;

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
 * A colleague's session's rules for those services. `allow` and `deny` name each tool as Claude
 * Code does (`mcp__<service>__<tool>`): the reading ones allowed without asking, the known others
 * refused. `reads` is each service's reading tools by their own names, for the app's own loop to
 * offer those alone. A tool in neither (added since the last list, or a list that could not be had)
 * is refused too: the loop never offers it, and Claude Code's prompt refuses the service's tools
 * outright (`services`, gate/tools.ts).
 */
export async function colleagueRules(services: Connector[]): Promise<{
  allow: string[];
  deny: string[];
  reads: Map<string, Set<string>>;
  services: string[];
}> {
  const allow: string[] = [];
  const deny: string[] = [];
  const reads = new Map<string, Set<string>>();
  for (const service of services) {
    const own = new Set<string>();
    for (const tool of await serviceTools(service.id).catch(() => [])) {
      (tool.readOnly ? allow : deny).push(
        `mcp__${service.id}__${asClaudeCode(tool.name)}`,
      );
      if (tool.readOnly) own.add(tool.name);
    }
    reads.set(service.id, own);
  }
  return { allow, deny, reads, services: services.map((entry) => entry.id) };
}
