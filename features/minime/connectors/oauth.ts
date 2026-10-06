// Signing in to a service's MCP server, as an MCP client does (the MCP SDK's own steps, as Claude
// Code and Hermes Agent use them): find where the server's sign-in is (its protected-resource
// metadata, then the authorization server's), register this app there when the server lets it
// (dynamic registration) or use the client the team registered (Google), send the person to approve
// in their browser with PKCE, take the code back at this app's callback, and keep the tokens.
// Before each use the access token is refreshed when it has run out, one refresh at a time.

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { withLock } from "../memory/files.ts";
import { CONNECTORS, type Connector, connector } from "./catalog.ts";
import {
  addPending,
  changeKept,
  connectorsDir,
  type Kept,
  loadKept,
  type TeamClient,
  type Tokens,
  takePending,
} from "./store.ts";

/** A failure the page says in the person's language. */
export class ConnectorError extends Error {
  readonly code: string;

  constructor(code: string, message = code) {
    super(message);
    this.code = code;
  }
}

/** Where Google's sign-in is, when its servers do not say. */
const GOOGLE_ACCOUNTS = "https://accounts.google.com";
/** An access token this close to running out is refreshed first. */
const MARGIN_MS = 60_000;

function find(id: string): Connector {
  const found = connector(id);
  if (!found) throw new ConnectorError("connector-unknown");
  return found;
}

const keep = (tokens: OAuthTokens, was?: Tokens): Tokens => ({
  access_token: tokens.access_token,
  // A refresh may leave the refresh token out: the one before still holds.
  ...(tokens.refresh_token
    ? { refresh_token: tokens.refresh_token }
    : was?.refresh_token
      ? { refresh_token: was.refresh_token }
      : {}),
  ...(tokens.token_type ? { token_type: tokens.token_type } : {}),
  ...(tokens.scope ? { scope: tokens.scope } : {}),
  ...(typeof tokens.expires_in === "number"
    ? { expires_at: Date.now() + tokens.expires_in * 1000 }
    : {}),
});

/** Where the service's sign-in is: as its server says, or for Google, Google's own. */
async function signInOf(
  entry: Connector,
): Promise<NonNullable<Kept["server"]>> {
  const google =
    entry.auth.kind === "team-oauth" && entry.auth.provider === "google";
  try {
    const info = await discoverOAuthServerInfo(entry.url);
    if (info.authorizationServerMetadata)
      return {
        authorizationServerUrl: info.authorizationServerUrl,
        metadata: info.authorizationServerMetadata,
        // Google's tokens are not bound to one server; the others are (RFC 8707).
        ...(google
          ? {}
          : { resource: info.resourceMetadata?.resource ?? entry.url }),
      };
  } catch {
    // Not every server says where its sign-in is.
  }
  if (!google) throw new ConnectorError("connector-unreachable");
  const metadata = await discoverAuthorizationServerMetadata(GOOGLE_ACCOUNTS);
  if (!metadata) throw new ConnectorError("connector-unreachable");
  return { authorizationServerUrl: GOOGLE_ACCOUNTS, metadata };
}

/**
 * Starts a sign-in: returns the address to send the person to. `redirect` is this app's callback,
 * as the person's browser reaches it; `team` gives the client the team registered for a vendor
 * that wants one first; `url` stands in for the service's address in tests.
 */
export async function startConnect(
  id: string,
  redirect: string,
  options: {
    team?: (provider: string) => Promise<TeamClient | undefined>;
    url?: string;
  } = {},
): Promise<string> {
  const found = find(id);
  const entry = options.url ? { ...found, url: options.url } : found;
  const team = options.team;
  if (entry.auth.kind === "token") throw new ConnectorError("connector-token");
  const server = await signInOf(entry);
  const kept = await loadKept(id);
  let client: NonNullable<Kept["client"]>;
  if (entry.auth.kind === "team-oauth") {
    const registered = await team?.(entry.auth.provider);
    if (!registered) throw new ConnectorError("connector-needs-client");
    client = { ...registered, redirect_uri: redirect };
  } else if (kept.client && kept.client.redirect_uri === redirect)
    client = kept.client;
  else {
    // This app registers itself with the service, for this address to come back to.
    const made = await registerClient(server.authorizationServerUrl, {
      metadata: server.metadata,
      clientMetadata: {
        client_name: "sub-office",
        redirect_uris: [redirect],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    }).catch(() => {
      throw new ConnectorError("connector-refused");
    });
    client = {
      client_id: made.client_id,
      ...(made.client_secret ? { client_secret: made.client_secret } : {}),
      redirect_uri: redirect,
    };
  }
  const state = randomBytes(18).toString("base64url");
  const scope =
    entry.auth.kind === "team-oauth" ? entry.auth.scopes.join(" ") : undefined;
  const { authorizationUrl, codeVerifier } = await startAuthorization(
    server.authorizationServerUrl,
    {
      metadata: server.metadata,
      clientInformation: client,
      redirectUrl: redirect,
      state,
      ...(scope ? { scope } : {}),
      ...(server.resource ? { resource: new URL(server.resource) } : {}),
    },
  );
  // Google gives a refresh token only when asked for one, and asked to show the consent again.
  if (entry.auth.kind === "team-oauth" && entry.auth.provider === "google") {
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("prompt", "consent");
  }
  await changeKept(id, (was) => ({ ...was, client, server }));
  await addPending(state, {
    id,
    verifier: codeVerifier,
    redirect,
    at: Date.now(),
  });
  return authorizationUrl.toString();
}

/** The person came back from approving: the code becomes tokens. Returns the connector's id. */
export async function finishConnect(
  state: string,
  code: string,
): Promise<string> {
  const pending = await takePending(state);
  if (!pending) throw new ConnectorError("connector-expired");
  const kept = await loadKept(pending.id);
  if (!kept.client || !kept.server)
    throw new ConnectorError("connector-expired");
  const tokens = await exchangeAuthorization(
    kept.server.authorizationServerUrl,
    {
      metadata: kept.server.metadata,
      clientInformation: kept.client,
      authorizationCode: code,
      codeVerifier: pending.verifier,
      redirectUri: pending.redirect,
      ...(kept.server.resource
        ? { resource: new URL(kept.server.resource) }
        : {}),
    },
  ).catch(() => {
    throw new ConnectorError("connector-refused");
  });
  await changeKept(pending.id, (was) => ({
    ...was,
    tokens: keep(tokens),
    connected: new Date().toISOString(),
  }));
  return pending.id;
}

/** A personal token for a service that takes one (GitHub). */
export async function setToken(id: string, token: string): Promise<void> {
  const entry = find(id);
  if (entry.auth.kind !== "token")
    throw new ConnectorError("connector-unknown");
  const clean = token.trim();
  if (clean.length < 20) throw new ConnectorError("connector-token-wrong");
  await changeKept(id, () => ({
    token: clean,
    connected: new Date().toISOString(),
  }));
}

/** Forgets a service: its tokens, and the client registered with it. */
export async function disconnect(id: string): Promise<void> {
  find(id);
  await changeKept(id, () => undefined);
}

export function isConnected(kept: Kept): boolean {
  return Boolean(kept.token || kept.tokens?.access_token);
}

/** The services the person connected, for the mini-me's sessions to reach. */
export async function connectedConnectors(): Promise<Connector[]> {
  const out: Connector[] = [];
  for (const entry of CONNECTORS)
    if (isConnected(await loadKept(entry.id))) out.push(entry);
  return out;
}

/** The access token to use now, refreshed first when it has run out. */
export async function accessToken(
  id: string,
  now = Date.now(),
): Promise<string> {
  const fresh = (kept: Kept) =>
    kept.token ??
    (kept.tokens &&
    (!kept.tokens.expires_at || kept.tokens.expires_at - MARGIN_MS > now)
      ? kept.tokens.access_token
      : undefined);
  const kept = await loadKept(id);
  const ready = fresh(kept);
  if (ready) return ready;
  if (!kept.tokens) throw new ConnectorError("connector-signed-out");
  // One refresh at a time: a second waits, then finds the new token.
  return withLock(
    join(/*turbopackIgnore: true*/ connectorsDir(), "refresh", id),
    async () => {
      const again = await loadKept(id);
      const now2 = fresh(again);
      if (now2) return now2;
      if (!again.tokens?.refresh_token || !again.server || !again.client)
        throw new ConnectorError("connector-signed-out");
      const tokens = await refreshAuthorization(
        again.server.authorizationServerUrl,
        {
          metadata: again.server.metadata,
          clientInformation: again.client,
          refreshToken: again.tokens.refresh_token,
          ...(again.server.resource
            ? { resource: new URL(again.server.resource) }
            : {}),
        },
      ).catch(() => {
        throw new ConnectorError("connector-signed-out");
      });
      const next = keep(tokens, again.tokens);
      await changeKept(id, (was) => ({ ...was, tokens: next }));
      return next.access_token;
    },
  );
}
