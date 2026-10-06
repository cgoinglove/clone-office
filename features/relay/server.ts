// Run a relay for an office:
//   node features/relay/server.ts [--port 3200] [--host 127.0.0.1] [--db relay.db] [--key KEY]
// Without --key (or RELAY_KEY) a key is made and printed: it is what lets a mini-me join. Every
// other call carries the member's own token (Authorization: Bearer). Routes:
//   POST /join          {key, card} -> {id, token}; with a token, updates the card
//   GET  /members       -> {members}
//   POST /tasks         {to, text} -> {task}            a request to another member
//   POST /tasks/:id     {state?, text?} -> {task}       a message and the request's new state
//   GET  /tasks/:id     -> {task}                       one request, to the one asking or asked
//   GET  /tasks         -> {tasks}                      one's requests, sent and received
//   GET  /inbox?after=N -> {events, next}               waits up to 25 s for what concerns one

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { parseArgs } from "node:util";
import { Relay, RelayError, type TaskState } from "./relay.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "3200" },
    host: { type: "string", default: "127.0.0.1" },
    db: { type: "string", default: "relay.db" },
    key: { type: "string" },
  },
});

const key =
  values.key ?? process.env.RELAY_KEY ?? randomBytes(9).toString("base64url");
const relay = new Relay(values.db as string, key);

async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000)
      throw new RelayError(413, "Too large.", "bad-request");
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RelayError(400, "Not JSON.", "bad-request");
  }
}

function member(request: IncomingMessage) {
  const auth = request.headers.authorization ?? "";
  return relay.memberByToken(auth.replace(/^Bearer\s+/i, ""));
}

const server = createServer(async (request, response) => {
  const send = (status: number, data: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(data));
  };
  try {
    const url = new URL(request.url ?? "/", "http://relay");
    const path = url.pathname;
    if (request.method === "POST" && path === "/join") {
      const input = await body(request);
      const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "");
      return send(
        200,
        relay.join({
          key: typeof input.key === "string" ? input.key : undefined,
          token: auth || undefined,
          card: input.card as never,
        }),
      );
    }
    if (request.method === "GET" && path === "/members") {
      member(request);
      return send(200, { members: relay.members() });
    }
    if (request.method === "POST" && path === "/tasks") {
      const me = member(request);
      const input = await body(request);
      return send(200, {
        task: relay.send(
          me.id,
          String(input.to ?? ""),
          String(input.text ?? ""),
        ),
      });
    }
    const one = /^\/tasks\/([\w-]+)$/.exec(path);
    if (request.method === "GET" && one) {
      return send(200, { task: relay.taskFor(member(request).id, one[1]) });
    }
    if (request.method === "POST" && one) {
      const me = member(request);
      const input = await body(request);
      return send(200, {
        task: relay.update(me.id, one[1], {
          state:
            typeof input.state === "string"
              ? (input.state as TaskState)
              : undefined,
          text: typeof input.text === "string" ? input.text : undefined,
        }),
      });
    }
    if (request.method === "GET" && path === "/tasks") {
      return send(200, { tasks: relay.tasks(member(request).id) });
    }
    if (request.method === "GET" && path === "/inbox") {
      const me = member(request);
      const after = Number(url.searchParams.get("after") ?? 0) || 0;
      const events = await relay.inbox(me.id, after, 25_000);
      return send(200, { events, next: events.at(-1)?.seq ?? after });
    }
    send(404, { error: "Not here.", code: "not-found" });
  } catch (error) {
    if (error instanceof RelayError)
      return send(error.status, { error: error.message, code: error.code });
    send(500, { error: (error as Error).message });
  }
});

server.listen(Number(values.port), values.host as string, () => {
  // The port it got, also when asked for any (--port 0)
  const { port } = server.address() as { port: number };
  console.log(`relay on http://${values.host}:${port}`);
  console.log(`office key: ${key}`);
});
