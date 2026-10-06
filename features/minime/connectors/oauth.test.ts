import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { promisify } from "node:util";

const root = mkdtempSync(join(tmpdir(), "minime-connectors-"));
process.env.SUB_OFFICE_HOME = root;
let server: Server;
let base = "";
/** What the stand-in service saw. */
const seen: {
  registered: Record<string, unknown>[];
  authorize: URLSearchParams[];
  token: URLSearchParams[];
  tokenAuth: (string | undefined)[];
} = { registered: [], authorize: [], token: [], tokenAuth: [] };
let challenge = "";

before(async () => {
  // A service with an MCP server and its own sign-in, as the MCP authorization spec has them.
  server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", base);
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    let body = "";
    for await (const chunk of request) body += chunk;
    if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return json(200, {
        resource: `${base}/mcp`,
        authorization_servers: [base],
      });
    if (url.pathname.startsWith("/.well-known/oauth-authorization-server"))
      return json(200, {
        issuer: base,
        authorization_endpoint: `${base}/authorize`,
        token_endpoint: `${base}/token`,
        registration_endpoint: `${base}/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none", "client_secret_post"],
      });
    if (url.pathname === "/register") {
      const asked = JSON.parse(body);
      seen.registered.push(asked);
      return json(201, { ...asked, client_id: "registered-client" });
    }
    if (url.pathname === "/authorize") {
      seen.authorize.push(url.searchParams);
      challenge = url.searchParams.get("code_challenge") ?? "";
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("code", "the-code");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      response.writeHead(302, { location: back.toString() });
      return response.end();
    }
    if (url.pathname === "/token") {
      const form = new URLSearchParams(body);
      seen.token.push(form);
      seen.tokenAuth.push(request.headers.authorization);
      if (form.get("grant_type") === "authorization_code") {
        const verifier = form.get("code_verifier") ?? "";
        const hashed = createHash("sha256")
          .update(verifier)
          .digest("base64url");
        if (hashed !== challenge || form.get("code") !== "the-code")
          return json(400, { error: "invalid_grant" });
        return json(200, {
          access_token: "access-1",
          refresh_token: "refresh-1",
          token_type: "Bearer",
          expires_in: 3600,
        });
      }
      if (form.get("refresh_token") !== "refresh-1")
        return json(400, { error: "invalid_grant" });
      return json(200, {
        access_token: "access-2",
        token_type: "Bearer",
        expires_in: 3600,
      });
    }
    json(404, {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(root, { recursive: true, force: true });
});

const approve = async (address: string) => {
  // The person approves in their browser; the service sends them back to the callback.
  const response = await fetch(address, { redirect: "manual" });
  const back = new URL(response.headers.get("location") ?? "");
  return {
    code: back.searchParams.get("code") ?? "",
    state: back.searchParams.get("state") ?? "",
  };
};

const REDIRECT = "http://127.0.0.1:3000/api/me/connectors/callback";

test("a service that registers this app itself: approve once, keep the tokens for the person alone, refresh when they run out", async () => {
  const oauth = await import("./oauth");
  const { loadKept } = await import("./store");
  const address = await oauth.startConnect("notion", REDIRECT, {
    url: `${base}/mcp`,
  });
  const asked = new URL(address);
  assert.equal(seen.registered.length, 1, "registered itself");
  assert.deepEqual(seen.registered[0].redirect_uris, [REDIRECT]);
  assert.equal(asked.searchParams.get("client_id"), "registered-client");
  assert.equal(asked.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    asked.searchParams.get("resource"),
    `${base}/mcp`,
    "tokens bound to the server",
  );
  const { code, state } = await approve(address);
  assert.equal(await oauth.finishConnect(state, code), "notion");
  await assert.rejects(
    oauth.finishConnect(state, code),
    /connector-expired/,
    "a callback is taken once",
  );
  assert.equal(await oauth.accessToken("notion"), "access-1");
  if (process.platform !== "win32")
    assert.equal(
      statSync(join(root, "connectors", "notion.json")).mode & 0o777,
      0o600,
    );
  // Two hours on, the token has run out: it is refreshed, and the refresh token kept.
  assert.equal(
    await oauth.accessToken("notion", Date.now() + 2 * 3600_000),
    "access-2",
  );
  assert.equal((await loadKept("notion")).tokens?.refresh_token, "refresh-1");
  // Signing in again reuses the registration for the same address.
  await oauth.startConnect("notion", REDIRECT, { url: `${base}/mcp` });
  assert.equal(seen.registered.length, 1);
  await oauth.disconnect("notion");
  await assert.rejects(oauth.accessToken("notion"), /connector-signed-out/);
});

test("a vendor that wants its client registered first uses the team's, with its scopes and a refresh token asked for", async () => {
  const oauth = await import("./oauth");
  await assert.rejects(
    oauth.startConnect("gmail", REDIRECT, {
      url: `${base}/mcp`,
      team: async () => undefined,
    }),
    /connector-needs-client/,
  );
  const before = seen.registered.length;
  const address = await oauth.startConnect("gmail", REDIRECT, {
    url: `${base}/mcp`,
    team: async (provider) =>
      provider === "google"
        ? { client_id: "team-client", client_secret: "team-secret" }
        : undefined,
  });
  const asked = new URL(address);
  assert.equal(seen.registered.length, before, "nothing registered");
  assert.equal(asked.searchParams.get("client_id"), "team-client");
  assert.match(
    asked.searchParams.get("scope") ?? "",
    /gmail\.readonly gmail\.compose|gmail\.readonly https:\/\/www\.googleapis\.com\/auth\/gmail\.compose/,
  );
  assert.equal(asked.searchParams.get("access_type"), "offline");
  assert.equal(asked.searchParams.get("prompt"), "consent");
  assert.equal(
    asked.searchParams.get("resource"),
    null,
    "Google's tokens are not bound to one server",
  );
  const { code, state } = await approve(address);
  await oauth.finishConnect(state, code);
  const exchange = seen.token.at(-1);
  const sentSecret =
    exchange?.get("client_secret") === "team-secret" ||
    Buffer.from((seen.tokenAuth.at(-1) ?? "").replace(/^Basic /, ""), "base64")
      .toString()
      .endsWith(":team-secret");
  assert.ok(sentSecret, "the team's secret goes with the exchange");
  assert.equal(await oauth.accessToken("gmail"), "access-1");
});

test("a personal token is kept as it is; the session's helper hands it over, or nothing when there is none", async () => {
  const oauth = await import("./oauth");
  await assert.rejects(
    oauth.setToken("github", "short"),
    /connector-token-wrong/,
  );
  await oauth.setToken("github", "github_pat_0123456789abcdefghij");
  assert.equal(
    await oauth.accessToken("github"),
    "github_pat_0123456789abcdefghij",
  );
  const run = promisify(execFile);
  const helper = join(import.meta.dirname, "headers.ts");
  const env = { ...process.env, SUB_OFFICE_HOME: root };
  const given = await run(
    process.execPath,
    ["--no-warnings", helper, "github"],
    { env },
  );
  assert.deepEqual(JSON.parse(given.stdout), {
    Authorization: "Bearer github_pat_0123456789abcdefghij",
  });
  const none = await run(
    process.execPath,
    ["--no-warnings", helper, "linear"],
    { env },
  );
  assert.equal(none.stdout, "{}");
});
