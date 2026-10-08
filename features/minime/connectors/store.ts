// What a mini-me keeps for each service it is connected to, on its person's computer only and
// for their eyes only (connectors/<id>.json, 0600): the client this app registered with the
// service when it registers its own, where the service's sign-in is, and the tokens; or a personal
// token. A sign-in under way waits in connectors/pending.json for its callback, ten minutes at most.
// A team's OAuth client for a vendor that wants one registered first (Google) is in settings.json
// ("connectors.clients"), or comes from the office.

import { chmod, mkdir, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { AuthorizationServerMetadata } from "@modelcontextprotocol/sdk/shared/auth.js";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import {
  open,
  readSecretJson,
  readSecretJsonOr,
  seal,
  writeSecretJson,
} from "../server/secret.ts";

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
  /** The tools its server offers, as it last said (tools.ts), and when, in ms. */
  tools?: ServiceTool[];
  toolsAt?: number;
}

/** One tool of a service's MCP server: its name there, and whether it only reads. */
export interface ServiceTool {
  name: string;
  readOnly: boolean;
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

/** The folder, for its person's eyes only: its files are, and so is the list of them. */
async function ownDir(): Promise<string> {
  const dir = connectorsDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") await chmod(dir, 0o700).catch(() => {});
  return dir;
}

function keptPath(id: string): string {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error("Not a connector id.");
  return join(/*turbopackIgnore: true*/ connectorsDir(), `${id}.json`);
}

const pendingPath = () =>
  join(/*turbopackIgnore: true*/ connectorsDir(), "pending.json");

/** Sealed (server/secret.ts); a file written before sealing began is read as it is. */
export async function loadKept(id: string): Promise<Kept> {
  return readSecretJsonOr<Kept>(keptPath(id), {});
}

/** Changes what is kept for one service, one writer at a time. */
export async function changeKept(
  id: string,
  change: (kept: Kept) => Kept | undefined,
): Promise<Kept | undefined> {
  return withLock(await ownDir(), async () => {
    // Unreadable (another key, a key file in trouble): refused rather than written over or removed.
    const next = change((await readSecretJson<Kept>(keptPath(id))) ?? {});
    if (next) await writeSecretJson(keptPath(id), next);
    else await unlink(keptPath(id)).catch(() => {});
    return next;
  });
}

export async function addPending(
  state: string,
  pending: Pending,
): Promise<void> {
  await withLock(await ownDir(), async () => {
    const all =
      (await readSecretJson<Record<string, Pending>>(pendingPath())) ?? {};
    // Ones left unfinished go after their ten minutes.
    for (const [key, one] of Object.entries(all))
      if (Date.now() - one.at > PENDING_MS) delete all[key];
    all[state] = pending;
    await writeSecretJson(pendingPath(), all);
  });
}

/** The sign-in a callback's state names, taken (once) if it is still waiting. */
export async function takePending(state: string): Promise<Pending | undefined> {
  return withLock(await ownDir(), async () => {
    const all = await readSecretJson<Record<string, Pending>>(pendingPath());
    if (!all) return undefined;
    const found = all[state];
    delete all[state];
    await writeSecretJson(pendingPath(), all);
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
  if (!client?.client_id) return undefined;
  // Its secret is sealed in settings.json (server/secret.ts).
  return client.client_secret
    ? { ...client, client_secret: await open(client.client_secret) }
    : client;
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
    if (client)
      clients[provider] = client.client_secret
        ? { ...client, client_secret: await seal(client.client_secret) }
        : client;
    else delete clients[provider];
    await writeSettings(
      `${JSON.stringify({ ...settings, connectors: { ...connectors, clients } }, null, 2)}\n`,
    );
  });
}
