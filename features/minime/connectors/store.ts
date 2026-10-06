// What a mini-me keeps for each service it is connected to, on its person's computer only and
// for their eyes only (connectors/<id>.json, 0600): the client this app registered with the
// service when it registers its own, where the service's sign-in is, and the tokens; or a personal
// token. A sign-in under way waits in connectors/pending.json for its callback, ten minutes at most.
// A team's OAuth client for a vendor that wants one registered first (Google) is in settings.json
// ("connectors.clients"), or comes from the office.

import { readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";

export interface Tokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  /** When the access token stops working, in ms. */
  expires_at?: number;
}

export interface Kept {
  /** A client this app registered with the service itself (dynamic registration). */
  client?: { client_id: string; client_secret?: string; redirect_uri: string };
  /** Where the service's sign-in is, as it was found. */
  server?: {
    authorizationServerUrl: string;
    metadata?: AuthorizationServerMetadata;
    resource?: string;
  };
  tokens?: Tokens;
  /** A personal token the person made at the service. */
  token?: string;
  connected?: string;
}

/** A sign-in started in the browser, waiting for the service to send the person back. */
export interface Pending {
  id: string;
  verifier: string;
  redirect: string;
  at: number;
}

export const PENDING_MS = 10 * 60 * 1000;

/** A team's OAuth client for a vendor (Google's: a client id and secret). */
export interface TeamClient {
  client_id: string;
  client_secret?: string;
}

export function connectorsDir(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "connectors");
}

function keptPath(id: string): string {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error("Not a connector id.");
  return join(/*turbopackIgnore: true*/ connectorsDir(), `${id}.json`);
}

const pendingPath = () =>
  join(/*turbopackIgnore: true*/ connectorsDir(), "pending.json");

export async function loadKept(id: string): Promise<Kept> {
  try {
    return JSON.parse(await readFile(keptPath(id), "utf8")) as Kept;
  } catch {
    return {};
  }
}

/** Changes what is kept for one service, one writer at a time. */
export async function changeKept(
  id: string,
  change: (kept: Kept) => Kept | undefined,
): Promise<Kept | undefined> {
  return withLock(connectorsDir(), async () => {
    const next = change(await loadKept(id));
    if (next)
      await atomicWrite(keptPath(id), JSON.stringify(next, null, 2), {
        mode: 0o600,
      });
    else await unlink(keptPath(id)).catch(() => {});
    return next;
  });
}

export async function addPending(
  state: string,
  pending: Pending,
): Promise<void> {
  await withLock(connectorsDir(), async () => {
    const read = await readText(pendingPath());
    let all: Record<string, Pending> = {};
    try {
      all = read.raw ? JSON.parse(read.raw) : {};
    } catch {
      all = {};
    }
    // Ones left unfinished go after their ten minutes.
    for (const [key, one] of Object.entries(all))
      if (Date.now() - one.at > PENDING_MS) delete all[key];
    all[state] = pending;
    await atomicWrite(pendingPath(), JSON.stringify(all), { mode: 0o600 });
  });
}

/** The sign-in a callback's state names, taken (once) if it is still waiting. */
export async function takePending(state: string): Promise<Pending | undefined> {
  return withLock(connectorsDir(), async () => {
    const read = await readText(pendingPath());
    let all: Record<string, Pending> = {};
    try {
      all = read.raw ? JSON.parse(read.raw) : {};
    } catch {
      return undefined;
    }
    const found = all[state];
    delete all[state];
    await atomicWrite(pendingPath(), JSON.stringify(all), { mode: 0o600 });
    return found && Date.now() - found.at <= PENDING_MS ? found : undefined;
  });
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** The person's own OAuth client for a vendor, when they registered one themselves. */
export async function ownClient(
  provider: string,
): Promise<TeamClient | undefined> {
  const connectors = (await readSettings()).connectors as
    | { clients?: Record<string, TeamClient> }
    | undefined;
  const client = connectors?.clients?.[provider];
  return client?.client_id ? client : undefined;
}

export async function saveOwnClient(
  provider: string,
  client: TeamClient | undefined,
): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const connectors = (settings.connectors ?? {}) as {
      clients?: Record<string, TeamClient>;
    };
    const clients = { ...(connectors.clients ?? {}) };
    if (client) clients[provider] = client;
    else delete clients[provider];
    await writeSettings(
      `${JSON.stringify({ ...settings, connectors: { ...connectors, clients } }, null, 2)}\n`,
    );
  });
}
