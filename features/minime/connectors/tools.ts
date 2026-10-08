// What a connected service's MCP server offers, as it says itself: each tool, and whether it only
// reads (MCP's readOnlyHint, which the vendors' own servers set). Kept with the service's sign-in
// and asked again once a day. With it the person can let their mini-me read in a service without
// asking ("connector:<id>:read", one rule for all its reading tools), while each change it would
// make there is still asked.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { connector, connectorOfTool } from "./catalog.ts";
import { accessToken, isConnected } from "./oauth.ts";
import { changeKept, loadKept, type ServiceTool } from "./store.ts";

const DAY_MS = 24 * 3600_000;
/** How long a list may take: a card or a session's start waits for it. */
const LIST_MS = 8_000;
const READ_RULE = /^connector:([a-z0-9-]{1,40}):read$/;

/** The rule that lets the mini-me read in a service without asking. */
export const readRule = (id: string) => `connector:${id}:read`;

/** The service a reading rule is for. */
export const readRuleService = (rule: string) => {
  const id = READ_RULE.exec(rule)?.[1];
  return id ? connector(id) : undefined;
};

/** A tool's name as Claude Code writes it after mcp__<server>__. */
/** A service's tool name as Claude Code names it in a session (`mcp__<service>__<tool>`). */
export const asClaudeCode = (name: string) =>
  name.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Asks the service's server for its tools now, and keeps them. `url` stands in for it in tests. */
export async function listTools(
  id: string,
  options: { url?: string } = {},
): Promise<ServiceTool[]> {
  const entry = connector(id);
  if (!entry) return [];
  const token = await accessToken(id);
  const client = new Client({ name: "clone-office", version: "1" });
  const transport = new StreamableHTTPClientTransport(
    new URL(options.url ?? entry.url),
    { requestInit: { headers: { Authorization: `Bearer ${token}` } } },
  );
  try {
    await client.connect(transport, { timeout: LIST_MS });
    const tools: ServiceTool[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {}, {
        timeout: LIST_MS,
      });
      for (const tool of page.tools)
        tools.push({
          name: tool.name,
          readOnly: tool.annotations?.readOnlyHint === true,
        });
      cursor = page.nextCursor;
    } while (cursor && tools.length < 1000);
    // Kept only while still connected: a service let go meanwhile stays let go.
    await changeKept(id, (was) =>
      isConnected(was)
        ? { ...was, tools, toolsAt: Date.now() }
        : Object.keys(was).length
          ? was
          : undefined,
    );
    return tools;
  } finally {
    await client.close().catch(() => {});
  }
}

/** The tools as last listed, listed again when a day old (when that fails, the old list holds). */
export async function serviceTools(
  id: string,
  now = Date.now(),
): Promise<ServiceTool[]> {
  const kept = await loadKept(id);
  if (!isConnected(kept)) return [];
  if (kept.tools && kept.toolsAt && now - kept.toolsAt < DAY_MS)
    return kept.tools;
  return listTools(id).catch(() => kept.tools ?? []);
}

/** Whether a connected service's tool only reads, as its server says. */
export async function readsOnly(tool: string): Promise<boolean> {
  const service = connectorOfTool(tool);
  if (!service) return false;
  const tools = await serviceTools(service.connector.id).catch(() => []);
  return tools.some(
    (one) => one.readOnly && asClaudeCode(one.name) === service.tool,
  );
}

/** The person's rules as a session takes them: reading in a service becomes its reading tools. */
export async function sessionRules(rules: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const rule of rules) {
    const service = readRuleService(rule);
    if (!service) {
      out.push(rule);
      continue;
    }
    for (const tool of await serviceTools(service.id).catch(() => []))
      if (tool.readOnly)
        out.push(`mcp__${service.id}__${asClaudeCode(tool.name)}`);
  }
  return out;
}
