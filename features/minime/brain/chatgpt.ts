// ChatGPT as a brain, on the person's own ChatGPT plan: OpenAI's Sign in with ChatGPT for
// open-source apps that run on the person's computer (developers.openai.com/siwc). The first
// sign-in registers this app for this computer (client_id "dynamic_agent_client", with a host id
// made once and kept), and the client it is issued is used from then on. The person approves in
// their browser; OpenAI sends them back to this app on 127.0.0.1 (only the port may change), the
// code becomes tokens (PKCE, no secret), the ID token is checked against OpenAI's published keys,
// and everything is kept in brain/chatgpt.json for the person alone. Requests then go to the public
// Responses API with the access token, which is renewed under a lock before it runs out.

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { join } from "node:path";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { minimeHome } from "../server/paths.ts";

/** Where OpenAI's sign-in and API are; tests stand in for both. */
export const OPENAI = {
  issuer: "https://auth.openai.com",
  authorize: "https://auth.openai.com/api/accounts/authorize",
  token: "https://auth.openai.com/api/accounts/oauth/token",
  jwks: "https://auth.openai.com/.well-known/jwks.json",
  api: "https://api.openai.com/v1",
};

const SCOPE =
  "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
/** A sign-in started and not finished is let go after this. */
const PENDING_MS = 10 * 60 * 1000;
/** An access token this close to its end is renewed first. */
const MARGIN_MS = 60_000;

/** A failure the page says in the person's language. */
export class ChatGptError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

interface Kept {
  /** This computer, as OpenAI knows it: made once, sent on every sign-in. */
  hostId?: string;
  /** The client issued at the first sign-in, used from then on. */
  clientId?: string;
  /** The sign-in's redirect, the one the tokens are renewed with. */
  redirect?: string;
  idToken?: string;
  account?: { sub: string; email?: string; name?: string };
  tokens?: { access: string; refresh?: string; expires: number };
  /** Sign-ins started and waiting for OpenAI to send the person back, by their state. */
  pending?: Record<
    string,
    {
      verifier: string;
      nonce: string;
      redirect: string;
      client: string;
      at: number;
    }
  >;
}

const keptPath = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "brain", "chatgpt.json");
const lockDir = () => join(/*turbopackIgnore: true*/ minimeHome(), "brain");

async function load(): Promise<Kept> {
  const read = await readText(keptPath());
  try {
    return read.raw ? (JSON.parse(read.raw) as Kept) : {};
  } catch {
    return {};
  }
}

async function change(update: (kept: Kept) => Kept): Promise<Kept> {
  return withLock(lockDir(), async () => {
    const next = update(await load());
    await atomicWrite(keptPath(), JSON.stringify(next, null, 2), {
      mode: 0o600,
    });
    return next;
  });
}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

/**
 * Starts a sign-in and returns where to send the person. `port` is the one this app answers on;
 * OpenAI wants the callback on 127.0.0.1, never "localhost", with only the port varying.
 */
export async function startSignIn(port: number): Promise<string> {
  const redirect = `http://127.0.0.1:${port}/auth/callback`;
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(18));
  const nonce = base64url(randomBytes(18));
  const kept = await change((was) => {
    const pending = Object.fromEntries(
      Object.entries(was.pending ?? {}).filter(
        ([, one]) => Date.now() - one.at < PENDING_MS,
      ),
    );
    const client = was.clientId ?? "dynamic_agent_client";
    return {
      ...was,
      hostId: was.hostId ?? `urn:uuid:${randomUUID()}`,
      pending: {
        ...pending,
        [state]: { verifier, nonce, redirect, client, at: Date.now() },
      },
    };
  });
  const client = kept.clientId ?? "dynamic_agent_client";
  const url = new URL(OPENAI.authorize);
  url.searchParams.set("client_id", client);
  // The name the person sees when approving; sent only while registering.
  if (!kept.clientId) url.searchParams.set("agent_name_hint", "sub-office");
  url.searchParams.set("ext_agent_host_id", kept.hostId as string);
  if (kept.idToken) url.searchParams.set("id_token_hint", kept.idToken);
  if (kept.account?.email)
    url.searchParams.set("login_hint", kept.account.email);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("resource", OPENAI.api);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set(
    "code_challenge",
    base64url(createHash("sha256").update(verifier).digest()),
  );
  return url.toString();
}

interface TokenAnswer {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

async function tokenRequest(
  form: Record<string, string>,
): Promise<TokenAnswer> {
  const response = await fetch(OPENAI.token, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => undefined);
  if (!response) throw new ChatGptError("chatgpt-unreachable");
  const body = (await response.json().catch(() => ({}))) as TokenAnswer & {
    error?: string;
  };
  if (!response.ok || !body.access_token)
    throw new ChatGptError(
      response.status === 400 || response.status === 401
        ? "chatgpt-refused"
        : "chatgpt-unreachable",
    );
  return body;
}

/** OpenAI sent the person back: the code becomes tokens, and who signed in is checked. */
export async function finishSignIn(query: URLSearchParams): Promise<{
  email?: string;
}> {
  const state = query.get("state") ?? "";
  const code = query.get("code") ?? "";
  if (query.get("error") || !state || !code)
    throw new ChatGptError("chatgpt-declined");
  const kept = await load();
  const pending = kept.pending?.[state];
  if (!pending || Date.now() - pending.at > PENDING_MS)
    throw new ChatGptError("chatgpt-expired");
  // A first sign-in brings the client OpenAI issued for this app on this computer.
  const client = query.get("client_id") || pending.client;
  const answer = await tokenRequest({
    grant_type: "authorization_code",
    client_id: client,
    code,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirect,
    resource: OPENAI.api,
  });
  if (!answer.id_token) throw new ChatGptError("chatgpt-refused");
  const { payload } = await jwtVerify(
    answer.id_token,
    createRemoteJWKSet(new URL(OPENAI.jwks)),
    { issuer: OPENAI.issuer, audience: client },
  ).catch(() => {
    throw new ChatGptError("chatgpt-refused");
  });
  if (payload.nonce !== pending.nonce || typeof payload.sub !== "string")
    throw new ChatGptError("chatgpt-refused");
  const account = {
    sub: payload.sub,
    ...(typeof payload.email === "string" ? { email: payload.email } : {}),
    ...(typeof payload.name === "string" ? { name: payload.name } : {}),
  };
  await change((was) => {
    const { [state]: _taken, ...rest } = was.pending ?? {};
    return {
      ...was,
      clientId: client,
      redirect: pending.redirect,
      idToken: answer.id_token,
      account,
      tokens: {
        access: answer.access_token,
        ...(answer.refresh_token ? { refresh: answer.refresh_token } : {}),
        expires: Date.now() + (answer.expires_in ?? 3600) * 1000,
      },
      pending: rest,
    };
  });
  return { ...(account.email ? { email: account.email } : {}) };
}

/** Who is signed in, if anyone. */
export async function chatGptAccount(): Promise<
  { email?: string; name?: string } | undefined
> {
  const kept = await load();
  return kept.tokens && kept.account
    ? { email: kept.account.email, name: kept.account.name }
    : undefined;
}

/** Forgets the sign-in; this computer's registration stays, for signing in again. */
export async function signOut(): Promise<void> {
  await change(
    ({ tokens: _tokens, idToken: _id, account: _account, ...rest }) => rest,
  );
}

/** The access token to use now, renewed first when it is near its end (one renewal at a time). */
export async function chatGptAccessToken(now = Date.now()): Promise<string> {
  const fresh = (kept: Kept) =>
    kept.tokens && kept.tokens.expires - MARGIN_MS > now
      ? kept.tokens.access
      : undefined;
  const kept = await load();
  const ready = fresh(kept);
  if (ready) return ready;
  if (!kept.tokens?.refresh || !kept.clientId)
    throw new ChatGptError("brain-chatgpt-signed-out");
  return withLock(join(lockDir(), "chatgpt-refresh"), async () => {
    const again = await load();
    const now2 = fresh(again);
    if (now2) return now2;
    if (!again.tokens?.refresh || !again.clientId)
      throw new ChatGptError("brain-chatgpt-signed-out");
    const answer = await tokenRequest({
      grant_type: "refresh_token",
      client_id: again.clientId,
      refresh_token: again.tokens.refresh,
      ...(again.redirect ? { redirect_uri: again.redirect } : {}),
      resource: OPENAI.api,
    }).catch((error: unknown) => {
      if (error instanceof ChatGptError && error.code === "chatgpt-refused")
        throw new ChatGptError("brain-chatgpt-signed-out");
      throw error;
    });
    const next = await change((was) => ({
      ...was,
      ...(answer.id_token ? { idToken: answer.id_token } : {}),
      tokens: {
        access: answer.access_token,
        refresh: answer.refresh_token ?? was.tokens?.refresh,
        expires: Date.now() + (answer.expires_in ?? 3600) * 1000,
      },
    }));
    return next.tokens?.access as string;
  });
}

/** The models the person's plan offers, as OpenAI lists them for this app. */
export async function chatGptModels(): Promise<
  { id: string; label: string }[]
> {
  const response = await fetch(`${OPENAI.api}/models`, {
    headers: { authorization: `Bearer ${await chatGptAccessToken()}` },
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined);
  if (!response?.ok) return [];
  const body = (await response.json().catch(() => ({}))) as {
    models?: { slug?: string; display_name?: string; visibility?: string }[];
  };
  return (body.models ?? [])
    .filter((model) => model.slug && model.visibility === "list")
    .map((model) => ({
      id: model.slug as string,
      label: model.display_name || (model.slug as string),
    }));
}
