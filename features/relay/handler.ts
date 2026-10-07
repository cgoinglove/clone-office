// The relay's HTTP side, as one request handler: `server.ts` runs it on its own, and a server of
// one's own can mount the same handler. Every call but the
// link and invite pages carries the member's own token (Authorization: Bearer). Routes:
//   POST /join          {key, card} -> {id, token}; with a token, updates the card
//   GET  /members       -> {members}                    the members of one's office
//   POST /tasks         {to, text, files?} -> {task}    a request to another member
//   POST /tasks/:id     {state?, text?, files?} -> {task}  a message and the request's new state
//   POST /files         the file's bytes, its name in X-File-Name -> {file}  to name on a message
//   GET  /files/:id     the file's bytes, to its owner and the two members of its request
//   GET  /settings/:name -> {setting}                  what the office keeps for all (a vendor's OAuth client)
//   POST /settings/:name {value} -> {ok}               set it, or clear it with null
//   GET  /tasks/:id     -> {task}                       one request, to the one asking or asked
//   GET  /tasks         -> {tasks}                      one's requests, sent and received
//   GET  /inbox?after=N -> {events, next}               waits up to 25 s for what concerns one
//   POST /meetings      {kind, topic?, language?, scheduled?} -> {meeting}   the clones talk together
//   GET  /meetings      -> {meetings}                   the office's latest meetings
//   GET  /meetings/:id  -> {meeting}                    one, with what was said
//   POST /meetings/:id/posts {round, text?, replyTo?} -> {meeting}   one's clone says its piece
//   GET  /a2a/:member/.well-known/agent-card.json      a member as an A2A agent (a2a.ts)
//   POST /a2a/:member   A2A v1.0 JSON-RPC: SendMessage, GetTask, ListTasks, CancelTask
//   POST /links         {name, text} -> {task, link}    a request to someone without a mini-me
//   GET  /r/:token      the link's page (HTML): who asks, what, and a box to answer; no token needed
//   POST /r/:token      the answer, from the page's form
//   GET  /invite        -> {path}                       one's office's invite link
//   GET  /i/:key        the invite page (HTML): what the office is and how to join with the link
//   GET  /sub-office.tgz the app's own package, when the relay serves one (SUB_OFFICE_PACKAGE_FILE)
// With people's accounts (accounts.ts), the invite page makes an account instead, and:
//   POST /i/:key        the account's form -> one's own page, signed in
//   GET|POST /login     signing in;  POST /logout  signing out
//   GET  /home          one's own page: one's office, connecting one's computer, the invite link
//   POST /home/pair     a one-time setup code, shown as the line to run on one's computer
//   GET  /p/:code       what a setup link shows in a browser: the line to run
//   POST /pair/claim    {code} -> {office, member, token, name}   the computer's own token
// An office's owners also, each a page to look at first (GET) and the change (POST):
//   /home/people/remove?user=  /home/people/owner?user=  /home/clones/remove?member=
//   /home/invite/new           POST /home/office/name {name}

import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { A2A_ERRORS, a2aCall, agentCard } from "./a2a.ts";
import { AccountError, type Accounts } from "./accounts.ts";
import {
  isPrivateHost,
  joinCommand,
  osOf,
  PACKAGE_PATH,
  servedPackage,
} from "./install.ts";
import { invitePage, missingPage, pageLanguage, replyPage } from "./page.ts";
import {
  confirmPage,
  connectCommand,
  homePage,
  runPage,
  signInPage,
  signUpPage,
} from "./people-pages.ts";
import {
  FILE_BYTES,
  FILES_PER_MESSAGE,
  type Relay,
  RelayError,
  type TaskState,
} from "./relay.ts";

/** How long an inbox call waits for news before answering with none. */
const INBOX_WAIT_MS = 25_000;

// The link's page is someone's private request: kept out of caches, frames and search, and its
// address (the link's key) is never sent to another site as a referrer. Within this server the
// referrer stays, because a browser told "no-referrer" names a form's origin as "null", and the
// forms here are refused unless they say they come from here.
const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  "referrer-policy": "same-origin",
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

/** A file's bytes, up to the largest the relay keeps. */
async function bytes(request: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > FILE_BYTES)
      throw new RelayError(413, "The file is too large.", "file-too-large");
    chunks.push(chunk as Buffer);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/** The file ids a message names. */
const fileIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .filter((id): id is string => typeof id === "string")
        .slice(0, FILES_PER_MESSAGE + 1)
    : [];

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
    /** People's accounts: the invite page makes one, and one's own page connects one's computer. */
    accounts?: Accounts;
    /** The address people reach the server at, for the links and lines its pages give. */
    publicUrl?: string;
    /** Run by someone's app: the office is on their computer, so others join from its network. */
    onComputer?: boolean;
  } = {},
) {
  const accounts = options.accounts;
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
    const html = (status: number, page: string, cookies: string[] = []) => {
      response.writeHead(status, {
        ...PAGE_HEADERS,
        ...(cookies.length ? { "set-cookie": cookies } : {}),
      });
      response.end(page);
    };
    const redirect = (location: string, cookies: string[] = []) => {
      response.writeHead(303, {
        location,
        "cache-control": "no-store",
        ...(cookies.length ? { "set-cookie": cookies } : {}),
      });
      response.end();
    };
    /** Where people reach this server: as set, or as this request came (its proxy's scheme kept). */
    const base = () => {
      if (options.publicUrl) return options.publicUrl.replace(/\/+$/, "");
      const proto =
        String(request.headers["x-forwarded-proto"] ?? "").split(",")[0] ||
        "http";
      return `${proto === "https" ? "https" : "http"}://${request.headers.host ?? "relay"}`;
    };
    /**
     * A form posted from this server's own page. Browsers say where a request comes from: Fetch
     * Metadata (Sec-Fetch-Site) first, else the Origin; a caller that names neither (a script or
     * the app's own calls) is not a browser carrying someone's cookie from elsewhere.
     */
    const fromHere = () => {
      const site = request.headers["sec-fetch-site"];
      if (typeof site === "string")
        return site === "same-origin" || site === "none";
      const origin = request.headers.origin;
      if (!origin) return true;
      try {
        return new URL(origin).host === request.headers.host;
      } catch {
        return false;
      }
    };
    const url = new URL(request.url ?? "/", "http://relay");
    const path = url.pathname;
    /** How the invite's page guides someone to set up with its link, on the computer they opened it on. */
    const guide = (key: string, who?: string) => {
      const at = base();
      return {
        os: osOf(request.headers["user-agent"]),
        command: joinCommand({ base: at, key, from: who }),
        local:
          Boolean(options.onComputer) || isPrivateHost(new URL(at).hostname),
      };
    };
    /**
     * The pages and calls of people with accounts. Answers whether it handled the request; an
     * invite's page without accounts is left to the plain invite page.
     */
    const peoplePages = async (key: string | undefined): Promise<boolean> => {
      if (!accounts) return false;
      const lang = pageLanguage(request.headers["accept-language"]);
      const from = address(request);
      const cookie = request.headers.cookie;
      const post = request.method === "POST";
      if (post && !fromHere()) {
        html(403, missingPage(lang));
        return true;
      }
      if (key) {
        if (tries.blocked(from) || !(await relay.knows(key))) {
          tries.miss(from);
          html(404, missingPage(lang));
          return true;
        }
        const who =
          url.searchParams.get("from")?.trim().slice(0, 80) || undefined;
        const link = `${base()}${path}${url.search}`;
        if (!post) {
          // Someone signed in already joins this office too.
          const person = await accounts.person(cookie);
          if (person && (await accounts.enter(key, person.id))) {
            redirect("/home");
            return true;
          }
          html(
            200,
            signUpPage({ lang, from: who, key, link, ...guide(key, who) }),
          );
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        const filled = {
          name: fields.get("name") ?? "",
          email: fields.get("email") ?? "",
          password: fields.get("password") ?? "",
        };
        try {
          const made = await accounts.signUp(key, filled);
          redirect("/home", made.cookies);
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          html(
            400,
            signUpPage({
              lang,
              from: who,
              key,
              link,
              ...guide(key, who),
              error: code,
              name: filled.name,
              email: filled.email,
            }),
          );
        }
        return true;
      }
      if (path === "/login" && (request.method === "GET" || post)) {
        const invited = url.searchParams.get("key") ?? undefined;
        if (!post) {
          html(200, signInPage({ lang, key: invited }));
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        const email = fields.get("email") ?? "";
        if (tries.blocked(from)) {
          html(429, signInPage({ lang, error: "too-many-tries", email }));
          return true;
        }
        try {
          const signed = await accounts.signIn(
            { email, password: fields.get("password") ?? "" },
            fields.get("key") || undefined,
          );
          redirect("/home", signed.cookies);
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          if (code === "sign-in-wrong") tries.miss(from);
          html(
            400,
            signInPage({
              lang,
              key: fields.get("key") || undefined,
              error: code,
              email,
            }),
          );
        }
        return true;
      }
      if (path === "/logout" && post) {
        redirect("/login", await accounts.signOut(cookie));
        return true;
      }
      if (
        (path === "/home" && request.method === "GET") ||
        (path === "/home/pair" && post)
      ) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        const [place] = await accounts.places(person.id);
        const command =
          place && path === "/home/pair"
            ? connectCommand(
                `${base()}/p/${(await accounts.setupCode(person.id, place.office)).code}`,
                base(),
              )
            : undefined;
        const mine = place
          ? await relay.memberOf(place.office, person.id)
          : undefined;
        const people = place ? await accounts.people(place.office) : [];
        const owner =
          people.find((one) => one.id === person.id)?.role === "owner";
        const clones =
          place && owner ? await accounts.keyedClones(place.office) : [];
        const seen = (iso: string) => new Date(iso).toLocaleString(lang);
        const failed = url.searchParams.get("error");
        html(
          200,
          homePage({
            lang,
            name: person.name,
            me: person.id,
            owner,
            people: people.map((one) => ({
              id: one.id,
              name: one.name,
              email: one.email,
              role: one.role,
              ...(one.clone ? { seen: seen(one.clone.seen) } : {}),
            })),
            clones: clones.map((clone) => ({
              ...clone,
              seen: seen(clone.seen),
            })),
            ...(failed && /^[a-z-]{2,40}$/.test(failed)
              ? { error: failed }
              : {}),
            ...(place
              ? {
                  office: {
                    name: place.name,
                    invite: `${base()}/i/${place.key}?from=${encodeURIComponent(person.name)}`,
                  },
                }
              : {}),
            ...(mine
              ? {
                  computer: {
                    name: mine.card.name,
                    seen: new Date(mine.seen).toLocaleString(lang),
                  },
                }
              : {}),
            ...(command ? { command } : {}),
          }),
        );
        return true;
      }
      // An owner's changes to their office: a look first (GET), then the change itself (POST).
      const admin =
        /^\/home\/(people\/remove|people\/owner|clones\/remove|invite\/new|office\/name)$/.exec(
          path,
        );
      if (admin && (request.method === "GET" || post)) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        const [place] = await accounts.places(person.id);
        if (!place) {
          redirect("/home");
          return true;
        }
        const what = admin[1];
        if (!post) {
          const user = url.searchParams.get("user") ?? "";
          const member = url.searchParams.get("member") ?? "";
          const name =
            what === "clones/remove"
              ? (await accounts.keyedClones(place.office)).find(
                  (clone) => clone.id === member,
                )?.name
              : (await accounts.people(place.office)).find(
                  (one) => one.id === user,
                )?.name;
          if (what === "office/name" || (what !== "invite/new" && !name)) {
            redirect("/home");
            return true;
          }
          html(
            200,
            confirmPage({
              lang,
              what:
                what === "people/remove"
                  ? "remove"
                  : what === "people/owner"
                    ? "owner"
                    : what === "clones/remove"
                      ? "clone"
                      : "newLink",
              name,
              action: path,
              fields: what.startsWith("people/")
                ? { user }
                : what === "clones/remove"
                  ? { member }
                  : {},
            }),
          );
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        try {
          if (what === "people/remove")
            await accounts.removePerson(
              person.id,
              place.office,
              fields.get("user") ?? "",
            );
          else if (what === "people/owner")
            await accounts.makeOwner(
              person.id,
              place.office,
              fields.get("user") ?? "",
            );
          else if (what === "clones/remove")
            await accounts.removeClone(
              person.id,
              place.office,
              fields.get("member") ?? "",
            );
          else if (what === "invite/new")
            await accounts.newInvite(person.id, place.office);
          else
            await accounts.renameOffice(
              person.id,
              place.office,
              fields.get("name") ?? "",
            );
          redirect("/home");
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          redirect(`/home?error=${encodeURIComponent(code)}`);
        }
        return true;
      }
      const setup = /^\/p\/([\w-]{16,64})$/.exec(path);
      if (setup && request.method === "GET") {
        html(
          200,
          runPage({
            lang,
            command: connectCommand(`${base()}${path}`, base()),
          }),
        );
        return true;
      }
      if (path === "/pair/claim" && post) {
        if (tries.blocked(from))
          throw new RelayError(429, "Too many tries.", "too-many-tries");
        const input = await body(request);
        try {
          const claimed = await accounts.claim(String(input.code ?? ""));
          send(200, { relay: base(), ...claimed });
        } catch (error) {
          if (error instanceof RelayError && error.code === "setup-expired")
            tries.miss(from);
          throw error;
        }
        return true;
      }
      return false;
    };
    try {
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
      if (accounts && (await peoplePages(invite?.[1]))) return;
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
        const origin = `${proto === "https" ? "https" : "http"}://${host}`;
        response.writeHead(200, PAGE_HEADERS);
        response.end(
          invitePage({
            lang,
            from: who || undefined,
            link: `${origin}${path}${url.search}`,
            os: osOf(request.headers["user-agent"]),
            command: joinCommand({
              base: origin,
              key: invite[1],
              from: who || undefined,
            }),
            local:
              Boolean(options.onComputer) ||
              isPrivateHost(new URL(origin).hostname),
          }),
        );
        return;
      }
      // The app's own package, when this relay serves one: the invite's line takes it from here.
      if (request.method === "GET" && path === PACKAGE_PATH) {
        const file = servedPackage();
        if (!file) return send(404, { error: "Not here.", code: "not-found" });
        const content = await readFile(file).catch(() => undefined);
        if (!content)
          return send(404, { error: "Not here.", code: "not-found" });
        response.writeHead(200, {
          "content-type": "application/gzip",
          "content-length": String(content.byteLength),
          "cache-control": "no-store",
        });
        response.end(content);
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
            fileIds(input.files),
            undefined,
            input.by === "person" ? "person" : undefined,
          ),
        });
      }
      if (request.method === "POST" && path === "/meetings") {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          meeting: await relay.openMeeting(me, {
            kind: String(input.kind ?? ""),
            topic: typeof input.topic === "string" ? input.topic : undefined,
            language:
              typeof input.language === "string" ? input.language : undefined,
            scheduled: input.scheduled === true,
          }),
        });
      }
      if (request.method === "GET" && path === "/meetings") {
        const me = await member(request);
        // A round whose time is up ends here too, where no timer runs.
        await relay.advanceMeetings();
        return send(200, {
          meetings: await relay.meetings(
            me,
            Number(url.searchParams.get("limit") ?? 10) || 10,
          ),
        });
      }
      const meetingPath = /^\/meetings\/([\w-]+)(\/posts)?$/.exec(path);
      if (meetingPath && request.method === "GET" && !meetingPath[2]) {
        const me = await member(request);
        await relay.advanceMeetings();
        return send(200, { meeting: await relay.meeting(me, meetingPath[1]) });
      }
      if (meetingPath && request.method === "POST" && meetingPath[2]) {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          meeting: await relay.postToMeeting(me, meetingPath[1], {
            round: Number(input.round),
            text: typeof input.text === "string" ? input.text : undefined,
            replyTo:
              typeof input.replyTo === "string" ? input.replyTo : undefined,
          }),
        });
      }
      const a2a =
        /^\/a2a\/([\w-]{1,64})(\/\.well-known\/agent(?:-card)?\.json)?\/?$/.exec(
          path,
        );
      if (a2a) {
        // Office members only, the card too: who is in an office is the office's.
        let me: Awaited<ReturnType<typeof member>>;
        try {
          me = await member(request);
        } catch (error) {
          if (a2a[2] || !(error instanceof RelayError)) throw error;
          return send(error.status, {
            jsonrpc: "2.0",
            id: null,
            error: { code: -32050, message: error.message },
          });
        }
        const target = (await relay.members(me.office)).find(
          (one) => one.id === a2a[1],
        );
        const endpoint = `${base()}/a2a/${a2a[1]}`;
        if (a2a[2] && request.method === "GET") {
          if (!target)
            throw new RelayError(404, "No such member.", "not-found");
          return send(200, agentCard(target, endpoint));
        }
        if (!a2a[2] && request.method === "POST") {
          let call: unknown;
          try {
            call = JSON.parse(await raw(request));
          } catch {
            return send(200, {
              jsonrpc: "2.0",
              id: null,
              error: { code: A2A_ERRORS.parse, message: "Not JSON." },
            });
          }
          if (!target)
            return send(200, {
              jsonrpc: "2.0",
              id: (call as { id?: unknown })?.id ?? null,
              error: {
                code: A2A_ERRORS.invalidParams,
                message: "No such member in this office.",
              },
            });
          if (target.id === me.id)
            return send(200, {
              jsonrpc: "2.0",
              id: (call as { id?: unknown })?.id ?? null,
              error: {
                code: A2A_ERRORS.invalidParams,
                message: "A clone does not ask itself.",
              },
            });
          const version = request.headers["a2a-version"];
          return send(
            200,
            await a2aCall(relay, me, target, call, {
              base: base(),
              version: typeof version === "string" ? version : undefined,
            }),
          );
        }
      }
      if (request.method === "POST" && path === "/files") {
        const me = await member(request);
        let name = "file";
        try {
          name = decodeURIComponent(
            String(request.headers["x-file-name"] ?? ""),
          );
        } catch {
          // A name that is not encoded as asked: the file keeps a plain one.
        }
        return send(200, {
          file: await relay.putFile(me, {
            name,
            type: String(request.headers["content-type"] ?? "").split(";")[0],
            bytes: await bytes(request),
          }),
        });
      }
      let setting: RegExpExecArray | null = null;
      if (path.startsWith("/settings/"))
        try {
          setting =
            /^\/settings\/(connector:[a-z0-9-]{1,40}|meeting:standup)$/.exec(
              decodeURIComponent(path),
            );
        } catch {
          setting = null;
        }
      if (setting && request.method === "GET") {
        const me = await member(request);
        return send(200, {
          setting: (await relay.teamSetting(me, setting[1])) ?? null,
        });
      }
      if (setting && request.method === "POST") {
        const me = await member(request);
        const input = await body(request);
        await relay.setTeamSetting(me, setting[1], input.value ?? null);
        return send(200, { ok: true });
      }
      const file = /^\/files\/([\w-]{4,64})$/.exec(path);
      if (request.method === "GET" && file) {
        const { ref, bytes: content } = await relay.file(
          await member(request),
          file[1],
        );
        response.writeHead(200, {
          // Never drawn as a page here: it is for the mini-me that takes it.
          "content-type": "application/octet-stream",
          "content-length": String(content.byteLength),
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
          "x-file-type": ref.type,
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        });
        response.end(content);
        return;
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
            files: fileIds(input.files),
            ...(input.by === "person" ? { by: "person" as const } : {}),
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
