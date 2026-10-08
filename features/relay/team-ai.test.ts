import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { type Database, openDatabase } from "./db";
import { relayHandler } from "./handler";
import { Relay } from "./relay";
import { relaySealKey, TeamAi } from "./team-ai";

let db: Database;
let relay: Relay;
let vendor: Server;
let relayServer: Server;
let at = "";
const folder = mkdtempSync(join(tmpdir(), "relay-team-ai-"));
/** What the stand-in vendor saw: each call's path, its key header and body. */
const seen: { path: string; key: string; body: string }[] = [];

const listen = (server: Server) =>
  new Promise<string>((done) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      done(`http://127.0.0.1:${port}`);
    }),
  );

before(async () => {
  db = await openDatabase(process.env.RELAY_TEST_DATABASE_URL ?? "memory");
  relay = await Relay.open(db);
  // OpenAI as far as the relay can tell: a key it takes, a streamed answer in pieces.
  vendor = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const key = String(request.headers.authorization ?? "");
      seen.push({ path: request.url ?? "", key, body });
      if (key !== "Bearer sk-team-1234") {
        response.writeHead(401, { "content-type": "application/json" });
        return response.end('{"error":"bad key"}');
      }
      if (request.url === "/v1/models") {
        response.writeHead(200, { "content-type": "application/json" });
        return response.end('{"data":[]}');
      }
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: one\n\n");
      setTimeout(() => response.end("data: two\n\n"), 20);
    });
  });
  const vendorAt = await listen(vendor);
  const teamAi = new TeamAi(relay, await relaySealKey(folder, ""), {
    openai: `${vendorAt}/v1`,
  });
  relayServer = createServer(relayHandler(relay, { teamAi }));
  at = await listen(relayServer);
});

after(async () => {
  relayServer.close();
  vendor.close();
  await relay.close();
  await db.close();
  rmSync(folder, { recursive: true, force: true });
});

test("an office's team key is kept sealed, and members think with it without ever holding it", async () => {
  await relay.office("team-ai-office");
  const ana = await relay.join({
    key: "team-ai-office",
    card: { name: "Ana", description: "" },
  });
  const ben = await relay.join({
    key: "team-ai-office",
    card: { name: "Ben", description: "" },
  });
  await relay.office("other-office");
  const outsider = await relay.join({
    key: "other-office",
    card: { name: "Eve", description: "" },
  });
  const call = (token: string, path: string, init: RequestInit = {}) =>
    fetch(`${at}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers as Record<string, string>),
      },
    });

  // A key the vendor refuses is not kept.
  const wrong = await call(ana.token, "/team-ai/openai", {
    method: "POST",
    body: JSON.stringify({ key: "sk-wrong-key" }),
  });
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).code, "brain-key-wrong");

  const set = await call(ana.token, "/team-ai/openai", {
    method: "POST",
    body: JSON.stringify({ key: "sk-team-1234" }),
  });
  assert.equal(set.status, 200);
  const listed = await (await call(ben.token, "/team-ai")).json();
  assert.equal(listed.sealing, true);
  assert.deepEqual(
    listed.keys.map((k: { provider: string; hint: string }) => [
      k.provider,
      k.hint,
    ]),
    [["openai", "1234"]],
  );
  assert.doesNotMatch(
    JSON.stringify(listed),
    /sk-team/,
    "never the key itself",
  );
  const [row] = await db.query<{ value: unknown }>(
    "SELECT value FROM office_settings WHERE name = 'ai:openai'",
  );
  assert.doesNotMatch(JSON.stringify(row.value), /sk-team/, "sealed at rest");
  assert.match(
    readFileSync(join(folder, "secret.key"), "utf8"),
    /^\S{43,44}\n$/,
  );
  // The generic settings never read it back.
  assert.equal((await call(ben.token, "/settings/ai:openai")).status, 404);

  // Ben's clone calls OpenAI through the relay: the vendor sees the team key, not Ben's token,
  // and the answer streams back as it comes.
  seen.length = 0;
  const answer = await call(ben.token, "/ai/openai/chat/completions?x=1", {
    method: "POST",
    body: JSON.stringify({ model: "m", messages: [] }),
  });
  assert.equal(answer.status, 200);
  assert.equal(answer.headers.get("content-type"), "text/event-stream");
  assert.equal(await answer.text(), "data: one\n\ndata: two\n\n");
  assert.deepEqual(seen, [
    {
      path: "/v1/chat/completions?x=1",
      key: "Bearer sk-team-1234",
      body: '{"model":"m","messages":[]}',
    },
  ]);
  const calls = (await (await call(ana.token, "/team-ai")).json()).calls;
  const benId = (await relay.memberByToken(ben.token)).id;
  assert.deepEqual(calls, [{ member: benId, provider: "openai", calls: 1 }]);

  // Not a member of the office, or a path outside the API: refused.
  assert.equal(
    (await call(outsider.token, "/ai/openai/models")).status,
    404,
    "another office has no key here",
  );
  assert.equal((await call("nobody", "/ai/openai/models")).status, 401);
  assert.equal(
    (await call(ben.token, "/ai/openai/../../secret")).status,
    404,
    "no climbing out of the API",
  );

  // Someone else's key is not Ben's to swap for his own, and a body without a key removes nothing.
  const swap = await call(ben.token, "/team-ai/openai", {
    method: "POST",
    body: JSON.stringify({ key: "sk-team-1234" }),
  });
  assert.equal(swap.status, 403);
  assert.equal((await swap.json()).code, "team-key-not-yours");
  const vague = await call(ana.token, "/team-ai/openai", {
    method: "POST",
    body: JSON.stringify({}),
  });
  assert.equal(vague.status, 400);
  assert.equal(
    (await (await call(ben.token, "/team-ai")).json()).keys.length,
    1,
  );

  // Forgotten by whoever added it: nobody thinks with it any more.
  await call(ana.token, "/team-ai/openai", {
    method: "POST",
    body: JSON.stringify({ key: null }),
  });
  assert.equal((await call(ben.token, "/ai/openai/models")).status, 404);
});

test("a relay on a database with no key of its own keeps no team key", async () => {
  assert.equal(await relaySealKey(undefined, ""), undefined);
  assert.equal(await relaySealKey("memory", ""), undefined);
  await assert.rejects(relaySealKey(undefined, "short"), /not a key/);
});
