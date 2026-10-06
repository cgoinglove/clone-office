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
//   POST /links         {name, text} -> {task, link}    a request to someone without a mini-me
//   GET  /r/:token      the link's page (HTML): who asks, what, and a box to answer; no token needed
//   POST /r/:token      the answer, from the page's form

import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { parseArgs } from "node:util";
import { missingPage, pageLanguage, replyPage } from "./page.ts";
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

async function raw(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 1_000_000)
      throw new RelayError(413, "Too large.", "bad-request");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function body(
  request: IncomingMessage,
): Promise<Record<string, unknown>> {
  const text = await raw(request);
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new RelayError(400, "Not JSON.", "bad-request");
  }
}

// The link's page is someone's private request: kept out of caches, frames and search, and its
// address (the link's key) is never sent on as a referrer.
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

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
    const page = /^\/r\/([\w-]{20,64})$/.exec(path);
    if (page && (request.method === "GET" || request.method === "POST")) {
      const lang = pageLanguage(request.headers["accept-language"]);
      if (request.method === "POST") {
        const answer = new URLSearchParams(await raw(request)).get("answer");
        try {
          relay.answerLink(page[1], answer ?? "");
        } catch (error) {
          // Answered twice, or closed meanwhile: the page says how it stands.
          if (!(error instanceof RelayError) || error.status === 404)
            throw error;
        }
        response.writeHead(303, {
          location: path,
          "cache-control": "no-store",
        });
        return response.end();
      }
      let shown: ReturnType<typeof relay.link>;
      try {
        shown = relay.link(page[1]);
      } catch {
        response.writeHead(404, PAGE_HEADERS);
        return response.end(missingPage(lang));
      }
      const { task } = shown;
      const answer = task.history.filter((m) => m.role === "agent").at(-1);
      response.writeHead(200, PAGE_HEADERS);
      return response.end(
        replyPage({
          lang,
          asker: shown.asker?.name ?? "",
          name: shown.name,
          request:
            task.history.find((m) => m.role === "user")?.parts[0]?.text ?? "",
          state: shown.open ? "open" : answer ? "answered" : "closed",
          answer: answer?.parts[0]?.text,
        }),
      );
    }
    if (request.method === "POST" && path === "/links") {
      const me = member(request);
      const input = await body(request);
      const { task, token } = relay.sendLink(
        me.id,
        String(input.name ?? ""),
        String(input.text ?? ""),
      );
      return send(200, { task, link: `/r/${token}` });
    }
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
