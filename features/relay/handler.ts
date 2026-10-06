// The relay's HTTP side, as one request handler: `server.ts` runs it on its own, and a server of
// one's own can mount the same handler. Every call but the
// link and invite pages carries the member's own token (Authorization: Bearer). Routes:
//   POST /join          {key, card} -> {id, token}; with a token, updates the card
//   GET  /members       -> {members}                    the members of one's office
//   POST /tasks         {to, text} -> {task}            a request to another member
//   POST /tasks/:id     {state?, text?} -> {task}       a message and the request's new state
//   GET  /tasks/:id     -> {task}                       one request, to the one asking or asked
//   GET  /tasks         -> {tasks}                      one's requests, sent and received
//   GET  /inbox?after=N -> {events, next}               waits up to 25 s for what concerns one
//   POST /links         {name, text} -> {task, link}    a request to someone without a mini-me
//   GET  /r/:token      the link's page (HTML): who asks, what, and a box to answer; no token needed
//   POST /r/:token      the answer, from the page's form
//   GET  /invite        -> {path}                       one's office's invite link
//   GET  /i/:key        the invite page (HTML): what the office is and how to join with the link

import type { IncomingMessage, ServerResponse } from "node:http";
import { invitePage, missingPage, pageLanguage, replyPage } from "./page.ts";
import { type Relay, RelayError, type TaskState } from "./relay.ts";

/** How long an inbox call waits for news before answering with none. */
const INBOX_WAIT_MS = 25_000;

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

/**
 * Wrong office keys from one address, counted over a window: past the limit that address waits,
 * so a key cannot be guessed by trying, even one a person chose short.
 */
class Tries {
  private seen = new Map<string, number[]>();
  private limit: number;
  private windowMs: number;

  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  private recent(from: string, now: number): number[] {
    const kept = (this.seen.get(from) ?? []).filter(
      (at) => now - at < this.windowMs,
    );
    if (kept.length) this.seen.set(from, kept);
    else this.seen.delete(from);
    return kept;
  }

  blocked(from: string, now = Date.now()): boolean {
    return this.recent(from, now).length >= this.limit;
  }

  miss(from: string, now = Date.now()): void {
    this.seen.set(from, [...this.recent(from, now), now]);
  }
}

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

export function relayHandler(
  relay: Relay,
  options: {
    /** Behind a proxy of one's own: take the caller's address from X-Forwarded-For. */
    trustProxy?: boolean;
  } = {},
) {
  const tries = new Tries(20, 10 * 60 * 1000);
  const address = (request: IncomingMessage): string =>
    (options.trustProxy
      ? String(request.headers["x-forwarded-for"] ?? "")
          .split(",")[0]
          ?.trim()
      : "") ||
    request.socket.remoteAddress ||
    "";
  const member = (request: IncomingMessage) =>
    relay.memberByToken(
      (request.headers.authorization ?? "").replace(/^Bearer\s+/i, ""),
    );

  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
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
            await relay.answerLink(page[1], answer ?? "");
          } catch (error) {
            // Answered twice, or closed meanwhile: the page says how it stands.
            if (!(error instanceof RelayError) || error.status === 404)
              throw error;
          }
          response.writeHead(303, {
            location: path,
            "cache-control": "no-store",
          });
          response.end();
          return;
        }
        let shown: Awaited<ReturnType<typeof relay.link>>;
        try {
          shown = await relay.link(page[1]);
        } catch {
          response.writeHead(404, PAGE_HEADERS);
          response.end(missingPage(lang));
          return;
        }
        const { task } = shown;
        const answer = task.history.filter((m) => m.role === "agent").at(-1);
        response.writeHead(200, PAGE_HEADERS);
        response.end(
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
        return;
      }
      const invite = /^\/i\/([\w-]{4,128})$/.exec(path);
      if (invite && request.method === "GET") {
        const lang = pageLanguage(request.headers["accept-language"]);
        const from = address(request);
        if (tries.blocked(from) || !(await relay.knows(invite[1]))) {
          tries.miss(from);
          response.writeHead(404, PAGE_HEADERS);
          response.end(missingPage(lang));
          return;
        }
        const who = url.searchParams.get("from")?.trim().slice(0, 80);
        const host = request.headers.host ?? "relay";
        // Behind a proxy that ends HTTPS, the link keeps the address people reach.
        const proto =
          String(request.headers["x-forwarded-proto"] ?? "").split(",")[0] ||
          "http";
        response.writeHead(200, PAGE_HEADERS);
        response.end(
          invitePage({
            lang,
            from: who || undefined,
            link: `${proto === "https" ? "https" : "http"}://${host}${path}${url.search}`,
          }),
        );
        return;
      }
      if (request.method === "GET" && path === "/invite") {
        const me = await member(request);
        return send(200, { path: `/i/${await relay.officeKey(me.office)}` });
      }
      if (request.method === "POST" && path === "/links") {
        const me = await member(request);
        const input = await body(request);
        const { task, token } = await relay.sendLink(
          me,
          String(input.name ?? ""),
          String(input.text ?? ""),
        );
        return send(200, { task, link: `/r/${token}` });
      }
      if (request.method === "POST" && path === "/join") {
        const input = await body(request);
        const auth = request.headers.authorization?.replace(/^Bearer\s+/i, "");
        const from = address(request);
        if (!auth && tries.blocked(from))
          throw new RelayError(429, "Too many tries.", "too-many-tries");
        try {
          return send(
            200,
            await relay.join({
              key: typeof input.key === "string" ? input.key : undefined,
              token: auth || undefined,
              card: input.card as never,
            }),
          );
        } catch (error) {
          if (error instanceof RelayError && error.code === "office-key-wrong")
            tries.miss(from);
          throw error;
        }
      }
      if (request.method === "GET" && path === "/members") {
        const me = await member(request);
        return send(200, { members: await relay.members(me.office) });
      }
      if (request.method === "POST" && path === "/tasks") {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          task: await relay.send(
            me,
            String(input.to ?? ""),
            String(input.text ?? ""),
          ),
        });
      }
      const one = /^\/tasks\/([\w-]+)$/.exec(path);
      if (request.method === "GET" && one) {
        return send(200, {
          task: await relay.taskFor(await member(request), one[1]),
        });
      }
      if (request.method === "POST" && one) {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          task: await relay.update(me, one[1], {
            state:
              typeof input.state === "string"
                ? (input.state as TaskState)
                : undefined,
            text: typeof input.text === "string" ? input.text : undefined,
          }),
        });
      }
      if (request.method === "GET" && path === "/tasks") {
        return send(200, { tasks: await relay.tasks(await member(request)) });
      }
      if (request.method === "GET" && path === "/inbox") {
        const me = await member(request);
        const after = Number(url.searchParams.get("after") ?? 0) || 0;
        const events = await relay.inbox(me, after, INBOX_WAIT_MS);
        return send(200, { events, next: events.at(-1)?.seq ?? after });
      }
      send(404, { error: "Not here.", code: "not-found" });
    } catch (error) {
      if (error instanceof RelayError)
        return send(error.status, { error: error.message, code: error.code });
      console.error(error);
      send(500, { error: "The relay failed.", code: "relay-failed" });
    }
  };
}
