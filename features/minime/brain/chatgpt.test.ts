import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const root = mkdtempSync(join(tmpdir(), "minime-chatgpt-"));
process.env.CLONE_OFFICE_HOME = root;
let server: Server;
let base = "";
let nonce = "";
let challenge = "";
const forms: URLSearchParams[] = [];

before(async () => {
  // OpenAI's sign-in and API, as a local app meets them: keys, tokens, models.
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
  const idToken = async (aud: string) =>
    new SignJWT({ nonce, email: "ana@example.com" })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(base)
      .setAudience(aud)
      .setSubject("user-1")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);
  server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const json = (status: number, data: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(data));
    };
    if (request.url === "/jwks") return json(200, { keys: [jwk] });
    // As OpenAI answers: asked as a recent client, the whole list; asked with no version, a list
    // frozen before the newer models.
    if (request.url?.startsWith("/v1/models"))
      return request.headers.authorization !== "Bearer access-2"
        ? json(401, {})
        : request.url === "/v1/models?client_version=99.0.0"
          ? json(200, {
              models: [
                {
                  slug: "gpt-6.1-sol",
                  display_name: "GPT-6.1 Sol",
                  visibility: "list",
                },
                {
                  slug: "internal",
                  display_name: "Internal",
                  visibility: "hide",
                },
              ],
            })
          : json(200, {
              models: [
                {
                  slug: "gpt-5.6-sol",
                  display_name: "GPT-5.6-Sol",
                  visibility: "list",
                },
              ],
            });
    if (request.url === "/token") {
      const form = new URLSearchParams(body);
      forms.push(form);
      if (form.get("grant_type") === "authorization_code") {
        const hashed = createHash("sha256")
          .update(form.get("code_verifier") ?? "")
          .digest("base64url");
        if (hashed !== challenge || form.get("code") !== "the-code")
          return json(400, { error: "invalid_grant" });
        return json(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          id_token: await idToken(form.get("client_id") ?? ""),
          expires_in: 3600,
        });
      }
      return form.get("refresh_token") === "refresh-1"
        ? json(200, {
            access_token: "access-2",
            refresh_token: "refresh-2",
            expires_in: 3600,
          })
        : json(400, { error: "invalid_grant" });
    }
    json(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const { OPENAI } = await import("./chatgpt");
  Object.assign(OPENAI, {
    issuer: base,
    authorize: `${base}/authorize`,
    token: `${base}/token`,
    jwks: `${base}/jwks`,
    api: `${base}/v1`,
  });
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

test("Sign in with ChatGPT: registers this app for this computer once, checks who signed in, keeps the tokens for the person alone", async () => {
  const chatgpt = await import("./chatgpt");
  const first = new URL(await chatgpt.startSignIn(4417));
  const ask = Object.fromEntries(first.searchParams);
  assert.equal(ask.client_id, "dynamic_agent_client");
  assert.equal(ask.agent_name_hint, "Clone Office");
  assert.match(ask.ext_agent_host_id, /^urn:uuid:[0-9a-f-]{36}$/);
  assert.equal(ask.redirect_uri, "http://127.0.0.1:4417/auth/callback");
  assert.equal(
    ask.scope,
    "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct",
  );
  assert.equal(ask.resource, `${base}/v1`);
  assert.equal(ask.code_challenge_method, "S256");
  nonce = ask.nonce;
  challenge = ask.code_challenge;

  // OpenAI sends the person back with the code and, the first time, the client it issued.
  await assert.rejects(
    chatgpt.finishSignIn(
      new URLSearchParams({ code: "the-code", state: "not-ours" }),
    ),
    { code: "chatgpt-expired" },
  );
  const signed = await chatgpt.finishSignIn(
    new URLSearchParams({
      code: "the-code",
      state: ask.state,
      client_id: "oaiapp_test",
    }),
  );
  assert.equal(signed.email, "ana@example.com");
  assert.equal(forms.at(-1)?.get("client_id"), "oaiapp_test");
  assert.equal(
    forms.at(-1)?.get("redirect_uri"),
    "http://127.0.0.1:4417/auth/callback",
  );
  assert.equal(forms.at(-1)?.get("client_secret"), null, "no secret");
  if (process.platform !== "win32")
    assert.equal(
      statSync(join(root, "brain", "chatgpt.json")).mode & 0o777,
      0o600,
    );

  // Signing in again reuses the client, on whatever port the app has then.
  const again = new URL(await chatgpt.startSignIn(5100));
  assert.equal(again.searchParams.get("client_id"), "oaiapp_test");
  assert.equal(again.searchParams.get("agent_name_hint"), null);
  assert.equal(
    again.searchParams.get("ext_agent_host_id"),
    ask.ext_agent_host_id,
  );
  assert.ok(again.searchParams.get("id_token_hint"));

  // The access token is renewed when it runs out; the plan's models are the listed ones, asked
  // for as a recent client so the newer ones come too.
  assert.equal(await chatgpt.chatGptAccessToken(), "access-1");
  assert.equal(
    await chatgpt.chatGptAccessToken(Date.now() + 2 * 3600_000),
    "access-2",
  );
  assert.equal(forms.at(-1)?.get("grant_type"), "refresh_token");
  assert.deepEqual(await chatgpt.chatGptModels(), [
    { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
  ]);

  // A ChatGPT brain needs a sign-in.
  const { brainProblem } = await import("./choice");
  const choice = {
    kind: "api",
    provider: "chatgpt",
    model: "gpt-6.1-sol",
  } as const;
  assert.equal(await brainProblem(choice), undefined);
  await chatgpt.signOut();
  assert.equal(await chatgpt.chatGptAccount(), undefined);
  assert.equal(await brainProblem(choice), "brain-chatgpt-signed-out");
});

test("a sign-in whose token was not made for it, or names another nonce, is refused", async () => {
  const chatgpt = await import("./chatgpt");
  const url = new URL(await chatgpt.startSignIn(4417));
  challenge = url.searchParams.get("code_challenge") ?? "";
  nonce = "someone else's";
  await assert.rejects(
    chatgpt.finishSignIn(
      new URLSearchParams({
        code: "the-code",
        state: url.searchParams.get("state") ?? "",
      }),
    ),
    { code: "chatgpt-refused" },
  );
  assert.equal(await chatgpt.chatGptAccount(), undefined);
});
