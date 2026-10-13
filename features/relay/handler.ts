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
//   GET  /team-ai       -> {keys, sealing, calls}       the office's team keys: vendor, hint, who set it
//   POST /team-ai/:vendor {key} -> {ok}                 keep one (checked with its vendor first), or null
//   GET|POST /ai/:vendor/...                            a call to that vendor's API with the team key
//                                                       (team-ai.ts); the member's token rides where its
//                                                       SDK puts the vendor's key
//   GET  /skills        -> {skills}                     the skills the office's members share (skills.ts)
//   POST /skills        {name, category?, files: [{path, data}]} -> {skill}   share one, or its newer version
//   GET  /skills/:name  -> {skill}                      one, with its files (base64), for a clone to add
//   DELETE /skills/:name -> {ok}                        take it out: the one who shared it, or an owner
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
//   GET  /clone-office.tgz the app's own package, when the relay serves one (CLONE_OFFICE_PACKAGE_FILE)
// With people's accounts (accounts.ts), the invite page makes an account instead, and:
//   POST /i/:key        the account's form -> one's own page, signed in
//   GET|POST /login     signing in;  POST /logout  signing out
//   GET  /login/google  signing in with Google (?key= from an invite: an account may be made)
//   GET  /i/:key/google making an account, or signing in, with Google from an invite's page
//   GET  /api/auth/callback/google   Google's way back, answered by Better Auth
//   GET  /home/google   connecting Google to one's account
//   GET  /home/admin    the server's sign-in settings, for its admin: POST /home/admin/password
//                       {on}, /home/admin/google {clientId, secret}, /home/admin/google/on|off,
//                       GET|POST /home/admin/google/off|google/remove|password/off (asked
//                       once first), /home/admin/reset {user} (a link for a forgotten
//                       password), /home/admin/account/remove {user}
//   GET|POST /reset     a new password, with the link the admin made
//   POST /i/:key/join   joining another office, asked once on its invite's page
//   GET  /home          one's own page: one's office, connecting one's computer, the invite link
//   POST /home/pair     a one-time setup code, shown as the line to run on one's computer
//   GET  /home/office/look?office=  what the office drawing draws; GET /assets/room/<file> its files (room-page.ts)
//   GET  /p/:code       what a setup link shows in a browser: the line to run
//   POST /pair/claim    {code} -> {office, member, token, name}   the computer's own token
// An office's owners also, each a page to look at first (GET) and the change (POST):
//   /home/people/remove?user=  /home/people/owner?user=  /home/clones/remove?member=
//   /home/invite/new           POST /home/office/name {name}

import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { isIPv6 } from "node:net";
import { A2A_ERRORS, a2aCall, agentCard } from "./a2a.ts";
import {
  AccountError,
  type Accounts,
  GOOGLE_CALLBACK,
  googleProblem,
} from "./accounts.ts";
import { HOME_CLIENT } from "./home-client.ts";
import {
  isPrivateHost,
  joinCommand,
  type Local,
  osOf,
  PACKAGE_PATH,
  servedPackage,
} from "./install.ts";
import {
  inviteEndedPage,
  invitePage,
  missingPage,
  pageLanguage,
  replyPage,
  tooManyTriesPage,
} from "./page.ts";
import {
  adminLinkEndedPage,
  adminPage,
  chatThread,
  confirmPage,
  connectCommand,
  errorWords,
  homePage,
  newPasswordPage,
  requestsPage,
  resetMadePage,
  runPage,
  setupPage,
  signInPage,
  signUpPage,
} from "./people-pages.ts";
import {
  FILE_BYTES,
  FILES_PER_MESSAGE,
  FINAL,
  INVITE_DAYS,
  PRESENT_MS,
  type Relay,
  RelayError,
  type TaskState,
} from "./relay.ts";
import { officeRoomHtml, roomRoutes } from "./room-page.ts";
import { isTeamProvider, type TeamAi } from "./team-ai.ts";

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
 * The signed-in pages (the person's clone, requests, office): the same, with scripts and calls to
 * this server alone, for the conversation that comes in as it is answered and the office drawing.
 */
const HOME_HEADERS = {
  ...PAGE_HEADERS,
  "content-security-policy":
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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
    const kept = this.recent(from, now);
    // Kept last in the map, so the longest quiet go first should it fill: the count never grows
    // without end, and a miss never walks every address.
    this.seen.delete(from);
    this.seen.set(from, [...kept, now]);
    // One blocked stays blocked: what goes is the longest quiet of those still let try.
    while (this.seen.size > Tries.MOST) {
      let gone = false;
      for (const [address, times] of this.seen)
        if (
          times.filter((at) => now - at < this.windowMs).length < this.limit
        ) {
          this.seen.delete(address);
          gone = true;
          break;
        }
      if (!gone) break;
    }
  }

  /** Lets go of the addresses whose tries are past, now and then rather than on every miss. */
  sweep(now = Date.now()): void {
    for (const address of [...this.seen.keys()]) this.recent(address, now);
  }

  static readonly MOST = 10_000;
}

/**
 * Who a try is counted against: an IPv4 address, or an IPv6 address's /64, which one home or
 * server holds whole (counting each of its addresses apart would let it try without end).
 */
export function triesKey(address: string): string {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return mapped[1];
  if (!isIPv6(address)) return address;
  const [head, tail = ""] = address.split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = address.includes("::") && tail ? tail.split(":") : [];
  const groups = address.includes("::")
    ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => Number.parseInt(group, 16).toString(16))
    .join(":")}::/64`;
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
    /**
     * Behind proxies: how many (true is one), so the address counted is the one the outermost
     * trusted proxy saw.
     */
    trustProxy?: boolean | number;
    /** People's accounts: the invite page makes one, and one's own page connects one's computer. */
    accounts?: Accounts;
    /** The address people reach the server at, for the links and lines its pages give. */
    publicUrl?: string;
    /** Run by someone's app: the office is on their computer, so others join from its network. */
    onComputer?: boolean;
    /** The office's team keys and the calls made with them (team-ai.ts). */
    teamAi?: TeamAi;
  } = {},
) {
  const accounts = options.accounts;
  const tries = new Tries(20, 10 * 60 * 1000);
  setInterval(() => tries.sweep(), 60 * 1000).unref();
  // Behind proxies, the address the outermost trusted one saw: each adds the address it was
  // reached from at the end of the line, so it is that many from the end (the ones before are
  // whatever the caller sent). Tries are counted by it, an IPv6 one by its /64.
  const hops =
    options.trustProxy === true
      ? 1
      : Math.max(0, Number(options.trustProxy) || 0);
  const address = (request: IncomingMessage): string => {
    const line = String(request.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((one) => one.trim())
      .filter(Boolean);
    return triesKey(
      (hops ? (line.at(-hops) ?? line[0]) : "") ||
        request.socket.remoteAddress ||
        "",
    );
  };
  // Opened on someone's computer, or a server reached only inside a private network.
  const where = (at: string): Local | undefined =>
    options.onComputer
      ? "computer"
      : isPrivateHost(new URL(at).hostname)
        ? "network"
        : undefined;
  const member = (request: IncomingMessage) =>
    relay.memberByToken(
      (request.headers.authorization ?? "").replace(/^Bearer\s+/i, ""),
    );

  return async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    // A HEAD (a link preview, a check that the server is up) is answered as its GET is; Node sends
    // no body for it, as it decided when the response was made.
    if (request.method === "HEAD") request.method = "GET";
    const send = (status: number, data: unknown) => {
      // what comes back may be someone's own (their conversation with their clone): never kept
      response.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(JSON.stringify(data));
    };
    const html = (
      status: number,
      page: string,
      cookies: string[] = [],
      headers: Record<string, string> = PAGE_HEADERS,
    ) => {
      response.writeHead(status, {
        ...headers,
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
    /**
     * An office's invite link as people copy it: the inviter's name readable (a space or a mark a
     * link would read as its own is still written as a code).
     */
    // The inviter's name stays readable in any script; everything else is encoded, so the link
    // is safe inside the quotes of the line people run with it.
    const inviteLink = (key: string, from: string) =>
      `${base()}/i/${key}?from=${from.replace(
        /[^\p{L}\p{M}\p{N}._~-]/gu,
        (mark) =>
          encodeURIComponent(mark).replace(
            /[!'()*]/g,
            (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
          ),
      )}`;
    /** One of a person's offices: the one named, else the first they joined. */
    const placeOf = <T extends { office: string }>(
      places: T[],
      chosen: string | null | undefined,
    ) => places.find((place) => place.office === chosen) ?? places[0];
    /** How the invite's page guides someone to set up with its link, on the computer they opened it on. */
    const guide = (key: string, who?: string) => {
      const at = base();
      return {
        os: osOf(request.headers["user-agent"]),
        command: joinCommand({ base: at, key, from: who }),
        local: where(at),
      };
    };
    /**
     * The pages and calls of people with accounts. Answers whether it handled the request; an
     * invite's page without accounts is left to the plain invite page.
     */
    const peoplePages = async (key: string | undefined): Promise<boolean> => {
      if (!accounts) return false;
      // Only the people's own pages and Google's way back: the clones' calls pass straight on.
      if (
        !key &&
        path !== "/" &&
        !/^\/(?:login|logout|home|reset|setup\/|p\/|pair\/|i\/|api\/auth\/)/.test(
          path,
        )
      )
        return false;
      const lang = pageLanguage(request.headers["accept-language"]);
      const from = address(request);
      const cookie = request.headers.cookie;
      const post = request.method === "POST";
      if (post && !fromHere()) {
        html(403, missingPage(lang));
        return true;
      }
      // The admin may have changed how people sign in, in another of the server's processes.
      await accounts.refresh();
      const methods = accounts.methods();
      /** A failure named in the address: one of the pages' own, or Google's way back. */
      const failure = (): string | undefined => {
        const code = url.searchParams.get("error") ?? "";
        if (/^[a-z-]{2,40}$/.test(code)) return code;
        return /^[a-z_]{2,60}$/.test(code) ? googleProblem(code) : undefined;
      };
      if (path === GOOGLE_CALLBACK && request.method === "GET") {
        await accounts.callback(request, response);
        return true;
      }
      // Off to Google: started only from this server's own pages, where it binds its way back.
      const googleInvite = /^\/i\/([\w-]{4,128})\/google$/.exec(path);
      if (
        (googleInvite || path === "/login/google" || path === "/home/google") &&
        request.method === "GET"
      ) {
        if (!fromHere()) {
          html(403, missingPage(lang));
          return true;
        }
        // Started where Google sends people back, so its way back finds the cookie that binds it:
        // reached at another address, the same page there, to start again from it (a start from
        // another site is refused, and a redirect would be one).
        const site = accounts.googleSite();
        if (site && new URL(site).origin !== new URL(base()).origin) {
          const who = url.searchParams.get("from")?.trim().slice(0, 80);
          redirect(
            `${site}${
              googleInvite
                ? `/i/${googleInvite[1]}?${who ? `from=${encodeURIComponent(who)}&` : ""}account#account`
                : path === "/home/google"
                  ? "/home"
                  : `/login${url.search}`
            }`,
          );
          return true;
        }
        if (path === "/home/google" && !(await accounts.person(cookie))) {
          redirect("/login");
          return true;
        }
        const invited =
          googleInvite?.[1] ??
          (/^[\w-]{4,128}$/.test(url.searchParams.get("key") ?? "")
            ? (url.searchParams.get("key") ?? undefined)
            : undefined);
        if (invited && tries.blocked(from)) {
          html(429, tooManyTriesPage(lang));
          return true;
        }
        if (invited && !(await relay.knows(invited))) {
          tries.miss(from);
          html(404, missingPage(lang));
          return true;
        }
        const who =
          url.searchParams.get("from")?.trim().slice(0, 80) || undefined;
        const invitePath = invited
          ? `/i/${invited}${who ? `?from=${encodeURIComponent(who)}` : ""}`
          : undefined;
        const failed =
          path === "/home/google"
            ? "/home"
            : googleInvite
              ? (invitePath as string)
              : invited
                ? `/login?key=${invited}`
                : "/login";
        try {
          const started =
            path === "/home/google"
              ? await accounts.googleLink(cookie)
              : await accounts.googleStart({
                  // Signed in, an invite's page puts them in its office and goes on to their page.
                  back: invitePath ?? "/home",
                  failed,
                  signUp: Boolean(invited),
                });
          redirect(
            started.url,
            // From an invite's page, a mark that this browser came to join that office: an
            // account Google makes lands in it without being asked, as it asked already.
            googleInvite
              ? [
                  ...started.cookies,
                  `sub-office.join=${googleInvite[1]}; Path=/i/; Max-Age=900; HttpOnly; SameSite=Lax`,
                ]
              : started.cookies,
          );
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "google-failed";
          redirect(
            `${failed}${failed.includes("?") ? "&" : "?"}error=${encodeURIComponent(code)}`,
          );
        }
        return true;
      }
      // Joining another office, once asked on its invite's page.
      const joining = /^\/i\/([\w-]{4,128})\/join$/.exec(path);
      if (joining && post) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect(`/login?key=${joining[1]}`);
          return true;
        }
        if (tries.blocked(from)) {
          html(429, tooManyTriesPage(lang));
          return true;
        }
        if (!(await accounts.enter(joining[1], person.id))) {
          tries.miss(from);
          html(404, missingPage(lang));
          return true;
        }
        // on to the office just joined
        const office = await accounts.officeOf(joining[1]);
        redirect(
          office ? `/home?office=${encodeURIComponent(office.id)}` : "/home",
        );
        return true;
      }
      if (key) {
        if (tries.blocked(from)) {
          html(429, tooManyTriesPage(lang));
          return true;
        }
        if (!(await relay.knows(key))) {
          tries.miss(from);
          // an invite that worked once says so, rather than that there is nothing here
          const ended = await relay.inviteEnded(key);
          html(
            ended ? 410 : 404,
            ended ? inviteEndedPage(lang) : missingPage(lang),
          );
          return true;
        }
        const office = await accounts.officeOf(key);
        // An invite already used for an account leaves the page with its guide alone.
        const invite = await relay.invite(key);
        const accountMade = Boolean(invite?.account);
        // Who invited, as the invite keeps it: the link's own "from" can say anything.
        const who =
          invite?.by ||
          url.searchParams.get("from")?.trim().slice(0, 80) ||
          undefined;
        const link = `${base()}${path}${url.search}`;
        if (!post) {
          const person = await accounts.person(cookie);
          if (person) {
            const places = await accounts.places(person.id);
            if (places.some((place) => place.office === office?.id)) {
              redirect(`/home?office=${encodeURIComponent(office?.id ?? "")}`);
              return true;
            }
            // An account Google just made from this very invite lands in its office; anyone
            // else is asked first, as their name and email will show there.
            const cameToJoin = /(?:^|;\s*)sub-office\.join=([\w-]+)/.exec(
              cookie ?? "",
            )?.[1];
            if (
              !places.length &&
              cameToJoin === key &&
              (await accounts.enter(key, person.id))
            ) {
              redirect("/home", [
                "sub-office.join=; Path=/i/; Max-Age=0; HttpOnly; SameSite=Lax",
              ]);
              return true;
            }
            html(
              200,
              confirmPage({
                lang,
                what: "join",
                name: person.name,
                office: office?.name ?? "",
                action: `/i/${key}/join`,
                signOutNext: `/i/${key}?${
                  who
                    ? `from=${encodeURIComponent(who).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}&`
                    : ""
                }account`,
                ...(who ? { invitedBy: who } : {}),
              }),
            );
            return true;
          }
          const failed = failure();
          html(
            200,
            signUpPage({
              lang,
              from: who,
              key,
              link,
              methods,
              ...guide(key, who),
              // Google sent them back here: the page says why at its top.
              ...(failed ? { error: failed, errorAtTop: true } : {}),
              ...(url.searchParams.has("account") ? { openAccount: true } : {}),
              ...(accountMade ? { accountMade } : {}),
            }),
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
              methods,
              ...guide(key, who),
              error: code,
              name: filled.name,
              email: filled.email,
              ...(accountMade ? { accountMade } : {}),
            }),
          );
        }
        return true;
      }
      // The server's admin made with the link its operator has, while it has none.
      const adminSetup = /^\/setup\/([\w-]{16,64})$/.exec(path);
      if (adminSetup && (request.method === "GET" || post)) {
        if (await accounts.hasAdmin()) {
          redirect("/login?done=admin-made");
          return true;
        }
        if (tries.blocked(from)) {
          html(429, tooManyTriesPage(lang));
          return true;
        }
        if (!(await accounts.adminLinkWorks(adminSetup[1]))) {
          tries.miss(from);
          html(410, adminLinkEndedPage(lang));
          return true;
        }
        if (!post) {
          html(200, setupPage({ lang }));
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        const filled = {
          name: fields.get("name") ?? "",
          email: fields.get("email") ?? "",
          password: fields.get("password") ?? "",
        };
        try {
          const made = await accounts.makeAdmin(adminSetup[1], filled);
          redirect("/home/admin?done=welcome", made.cookies);
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          html(
            400,
            setupPage({
              lang,
              error: code,
              name: filled.name,
              email: filled.email,
            }),
          );
        }
        return true;
      }
      // The server's own address, as people type it: their page, or signing in to it.
      if (path === "/" && request.method === "GET") {
        redirect("/home");
        return true;
      }
      if (path === "/login" && (request.method === "GET" || post)) {
        const asked = url.searchParams.get("key") ?? "";
        const invited = /^[\w-]{4,128}$/.test(asked) ? asked : undefined;
        if (!post) {
          // Signed in already: on to one's page, or to the invite it was opened with.
          if (await accounts.person(cookie)) {
            redirect(invited ? `/i/${invited}` : "/home");
            return true;
          }
          const failed = failure();
          html(
            200,
            signInPage({
              lang,
              key: invited,
              methods,
              ...(failed ? { error: failed } : {}),
              ...(url.searchParams.get("done") === "reset"
                ? { done: "reset" as const }
                : url.searchParams.get("done") === "admin-made"
                  ? { done: "admin-made" as const }
                  : {}),
            }),
          );
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        const email = fields.get("email") ?? "";
        if (tries.blocked(from)) {
          html(
            429,
            signInPage({ lang, methods, error: "too-many-tries", email }),
          );
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
              methods,
              error: code,
              email,
            }),
          );
        }
        return true;
      }
      if (path === "/logout" && post) {
        // From the question to join, someone else on this browser goes on to make their own
        // account with that invite.
        const next = new URLSearchParams(await raw(request)).get("next") ?? "";
        redirect(
          /^\/i\/[\w-]{4,128}\?(?:from=[\w.~%-]{1,400}&)?account$/.test(next)
            ? `${next}#account`
            : "/login",
          await accounts.signOut(cookie),
        );
        return true;
      }
      // A person stops a reset link made for them that they did not ask for.
      if (path === "/home/reset/stop" && post) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        await accounts.stopResets(person.id);
        redirect("/home?done=stopped");
        return true;
      }
      if (
        (path === "/home" && request.method === "GET") ||
        (path === "/home/office" && request.method === "GET") ||
        (path === "/home/account" && request.method === "GET") ||
        (path === "/home/pair" && post) ||
        (path === "/home/invite" && post) ||
        (path === "/home/invite/cancel" && post) ||
        (path === "/home/web" && post)
      ) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        const places = await accounts.places(person.id);
        const fields = post
          ? new URLSearchParams(await raw(request))
          : undefined;
        const chosen = fields
          ? fields.get("office")
          : url.searchParams.get("office");
        const place = placeOf(places, chosen);
        if (path === "/home/invite/cancel") {
          // an owner stops one of the office's invites
          if (place?.role === "owner")
            await relay.cancelInvite(place.office, fields?.get("invite") ?? "");
          redirect(
            `/home/office${place ? `?office=${encodeURIComponent(place.office)}` : ""}#invite`,
          );
          return true;
        }
        // Taking part on the web, with no computer connected: on to the requests page.
        if (path === "/home/web") {
          if (place)
            await relay.joinWeb(place.office, person.id, {
              name: person.name,
              description: "",
            });
          redirect(
            place
              ? `/home/requests?office=${encodeURIComponent(place.office)}`
              : "/home",
          );
          return true;
        }
        // An invite for one person, made here by anyone in the office; the page it goes back to
        // shows it once (a short-lived cookie for this browser alone), so a reload makes no other.
        if (path === "/home/invite") {
          if (!place) {
            redirect("/home");
            return true;
          }
          const back = `/home/office?office=${encodeURIComponent(place.office)}`;
          try {
            const made = await relay.makeInvite(place.office, {
              user: person.id,
              name: person.name,
              note: fields?.get("note") ?? "",
              owner: place.role === "owner",
            });
            redirect(`${back}#invite`, [
              `sub-office.invited=${made.token}; Path=/home; Max-Age=120; HttpOnly; SameSite=Strict${options.publicUrl?.startsWith("https:") ? "; Secure" : ""}`,
            ]);
          } catch (error) {
            const code =
              error instanceof RelayError ? error.code : "account-failed";
            redirect(`${back}&error=${encodeURIComponent(code)}#invite`);
          }
          return true;
        }
        const madeToken = /(?:^|;\s*)sub-office\.invited=([\w-]{16,64})/.exec(
          cookie ?? "",
        )?.[1];
        const invited =
          place &&
          madeToken &&
          (await relay.invite(madeToken))?.office === place.office
            ? { token: madeToken }
            : undefined;
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
        // to the minute, as people read a time; seconds say nothing here
        const seen = (iso: string) =>
          new Date(iso).toLocaleString(lang, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        const failed = failure();
        html(
          200,
          homePage({
            lang,
            name: person.name,
            tab:
              path === "/home/office"
                ? "office"
                : path === "/home/account" ||
                    (path === "/home/pair" && fields?.get("tab") === "account")
                  ? "account"
                  : "clone",
            me: person.id,
            owner,
            admin: await accounts.isAdmin(person.id),
            ways: await accounts.ways(person.id),
            methods,
            ...(url.searchParams.get("done") === "stopped"
              ? { done: "stopped" as const }
              : {}),
            events: (await accounts.events(person.id)).map((event) => ({
              ...event,
              at: new Date(event.at).toLocaleDateString(lang, {
                year: "numeric",
                month: "long",
                day: "numeric",
              }),
              // how long it still works, rather than a time of day in the server's own zone
              minutes: Math.max(
                1,
                Math.ceil((Date.parse(event.until) - Date.now()) / 60_000),
              ),
            })),
            people: people.map((one) => ({
              id: one.id,
              name: one.name,
              email: one.email,
              role: one.role,
              ...(one.clone ? { seen: seen(one.clone.seen) } : {}),
              ...(one.web ? { web: true } : {}),
            })),
            clones: clones.map((clone) => ({
              ...clone,
              seen: seen(clone.seen),
            })),
            ...(failed ? { error: failed } : {}),
            ...(place
              ? {
                  office: {
                    id: place.office,
                    name: place.name,
                  },
                  ...(invited
                    ? {
                        invited: {
                          link: inviteLink(invited.token, person.name),
                          days: INVITE_DAYS,
                        },
                      }
                    : {}),
                  ...(owner
                    ? {
                        invites: (await relay.invites(place.office))
                          .filter((one) => one.open)
                          .map((one) => ({
                            id: one.id,
                            by: one.by,
                            note: one.note,
                            created: new Date(one.created).toLocaleString(
                              lang,
                              {
                                month: "long",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              },
                            ),
                            clone: one.clone,
                            account: one.account,
                          })),
                      }
                    : {}),
                  offices: places.map((one) => ({
                    id: one.office,
                    name: one.name,
                  })),
                }
              : {}),
            ...(mine
              ? { place: mine.web ? ("web" as const) : ("clone" as const) }
              : {}),
            // someone on the web has no other sign that something waits on them
            ...(mine?.web && place
              ? {
                  waiting: (
                    await relay.tasks(
                      { id: mine.id, office: place.office, card: mine.card },
                      50,
                    )
                  ).filter(
                    (task) =>
                      task.metadata.to === mine.id &&
                      !FINAL.includes(task.status.state) &&
                      !task.history.some((m) => m.role === "agent"),
                  ).length,
                }
              : {}),
            ...(mine && !mine.web
              ? {
                  computer: {
                    name: mine.card.name,
                    seen: seen(mine.seen),
                  },
                }
              : {}),
            ...(command ? { command } : {}),
            // the office drawn as the app draws it, on its tab (room-page.ts)
            ...(place && path === "/home/office"
              ? { room: officeRoomHtml({ lang, office: place.office }) }
              : {}),
            // their conversation with their own clone, on its tab
            ...(mine && !mine.web && path !== "/home/office"
              ? {
                  chat: {
                    present: Date.now() - Date.parse(mine.seen) < PRESENT_MS,
                    ...(await relay.ownThread(mine.id)),
                  },
                }
              : {}),
          }),
          // shown once: the next look at the page has no link to copy again
          madeToken
            ? [
                "sub-office.invited=; Path=/home; Max-Age=0; HttpOnly; SameSite=Strict",
              ]
            : [],
          HOME_HEADERS,
        );
        return true;
      }
      // Talking to one's own clone from the page (relay.ts `ownSay`): the conversation as it stands,
      // for the page's script; words to it; an answer to its question. A form posts back to the page.
      if (
        (path === "/home/clone/thread" && request.method === "GET") ||
        (path === "/home/clone/say" && post) ||
        (path === "/home/clone/choose" && post) ||
        (path === "/home/clone/pair" && post)
      ) {
        const json =
          !post ||
          /application\/json/.test(String(request.headers.accept ?? ""));
        const person = await accounts.person(cookie);
        if (!person) {
          if (json) send(401, { error: "Sign in first.", code: "signed-out" });
          else redirect("/login");
          return true;
        }
        const fields = post
          ? new URLSearchParams(await raw(request))
          : undefined;
        const place = placeOf(
          await accounts.places(person.id),
          fields ? fields.get("office") : url.searchParams.get("office"),
        );
        const mine = place
          ? await relay.memberOf(place.office, person.id)
          : undefined;
        const back = place
          ? `/home?office=${encodeURIComponent(place.office)}`
          : "/home";
        if (!place || !mine || mine.web) {
          if (json)
            send(409, { error: "No clone to talk to.", code: "no-clone" });
          else redirect(back);
          return true;
        }
        // Its computer answers while its clone waits at its inbox.
        const present = Date.now() - Date.parse(mine.seen) < PRESENT_MS;
        // what the page's script signed with this browser's key, for the clone to check
        const proof =
          fields?.get("key") && fields.get("signed") && fields.get("sig")
            ? {
                key: (fields.get("key") ?? "").slice(0, 200),
                // the words as signed, with JSON's escapes: room for the longest the relay takes
                signed: (fields.get("signed") ?? "").slice(0, 60_000),
                sig: (fields.get("sig") ?? "").slice(0, 200),
              }
            : undefined;
        try {
          if (path === "/home/clone/say")
            await relay.ownSay(mine.id, fields?.get("text") ?? "", proof);
          else if (path === "/home/clone/choose")
            await relay.ownChoose(
              mine.id,
              fields?.get("ask") ?? "",
              fields?.get("value") ?? "",
              proof,
            );
          else if (path === "/home/clone/pair")
            await relay.ownPair(mine.id, fields?.get("key") ?? "");
          if (json) {
            const chat = { present, ...(await relay.ownThread(mine.id)) };
            send(200, { ...chat, ...chatThread(lang, chat, place.office) });
          } else redirect(`${back}#chat`);
        } catch (error) {
          const failed =
            error instanceof RelayError
              ? error
              : new RelayError(500, "It failed.", "account-failed");
          if (json)
            send(failed.status, {
              error: failed.message,
              code: failed.code,
              words: errorWords(lang, failed.code),
            });
          else
            redirect(`${back}&error=${encodeURIComponent(failed.code)}#chat`);
        }
        return true;
      }
      // Requests on the web: what was asked of the person, asking a colleague, and what they asked.
      if (
        (path === "/home/requests" && request.method === "GET") ||
        (path === "/home/requests/ask" && post) ||
        (path === "/home/requests/answer" && post)
      ) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        const places = await accounts.places(person.id);
        const fields = post
          ? new URLSearchParams(await raw(request))
          : undefined;
        const place = placeOf(
          places,
          fields ? fields.get("office") : url.searchParams.get("office"),
        );
        const me = place
          ? await relay.callerFor(place.office, person.id)
          : undefined;
        if (!place || !me) {
          redirect(
            place
              ? `/home?office=${encodeURIComponent(place.office)}#web`
              : "/home",
          );
          return true;
        }
        const back = `/home/requests?office=${encodeURIComponent(place.office)}`;
        const web = Boolean(
          (await relay.memberOf(place.office, person.id))?.web,
        );
        if (fields) {
          try {
            const text = (fields.get("text") ?? "").trim().slice(0, 8000);
            if (!text) throw new AccountError("text-missing");
            if (path === "/home/requests/ask") {
              await relay.send(
                me,
                fields.get("to") ?? "",
                text,
                [],
                undefined,
                "person",
              );
              redirect(`${back}&done=sent`);
            } else {
              // the person on the web answers what was asked of them themselves; a clone answers
              // for one with a computer connected
              if (!web) throw new AccountError("not-on-web");
              await relay.update(me, fields.get("task") ?? "", {
                text,
                state: "COMPLETED",
                by: "person",
              });
              redirect(`${back}&done=answered`);
            }
          } catch (error) {
            const code =
              error instanceof AccountError || error instanceof RelayError
                ? error.code
                : "account-failed";
            redirect(`${back}&error=${encodeURIComponent(code)}`);
          }
          return true;
        }
        if (web)
          await relay.joinWeb(place.office, person.id, {
            name: person.name,
            description: "",
          });
        const members = await relay.members(place.office);
        const nameOf = (id: string) =>
          members.find((one) => one.id === id)?.card.name ?? "";
        const tasks = await relay.tasks(me, 50);
        const shown = (task: (typeof tasks)[number], asked: boolean) => {
          const first = task.history.find((m) => m.role === "user");
          const answer = [...task.history]
            .reverse()
            .find((m) => m.role === "agent");
          const done = ["COMPLETED", "FAILED", "CANCELED", "REJECTED"].includes(
            task.status.state,
          );
          return {
            id: task.id,
            other:
              nameOf(asked ? task.metadata.from : task.metadata.to) ||
              task.metadata.guest ||
              "",
            text: first?.parts.map((part) => part.text ?? "").join("\n") ?? "",
            ...(answer
              ? {
                  answer: answer.parts
                    .map((part) => part.text ?? "")
                    .join("\n"),
                  // whose words: the colleague's own, or their clone's
                  ...((answer.metadata as { by?: string } | undefined)?.by ===
                  "person"
                    ? { byPerson: true }
                    : {}),
                }
              : {}),
            state: (answer ? "answered" : done ? "closed" : "waiting") as
              | "waiting"
              | "answered"
              | "closed",
            when: new Date(task.status.timestamp).toLocaleString(lang, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          };
        };
        const done = url.searchParams.get("done");
        const failed = failure();
        html(
          200,
          requestsPage({
            lang,
            office: { id: place.office, name: place.name },
            web,
            colleagues: members
              .filter((one) => one.id !== me.id)
              .map((one) => ({
                id: one.id,
                name: one.card.name,
                ...(one.web ? { web: true } : {}),
              })),
            asked: tasks
              .filter((task) => task.metadata.to === me.id)
              .map((task) => shown(task, true))
              .sort(
                (a, b) =>
                  Number(b.state === "waiting") - Number(a.state === "waiting"),
              ),
            sent: tasks
              .filter((task) => task.metadata.from === me.id)
              .map((task) => shown(task, false)),
            ...(done === "sent" || done === "answered" ? { done } : {}),
            ...(failed ? { error: failed } : {}),
            band: {
              office: { id: place.office, name: place.name },
              offices: places.map((one) => ({
                id: one.office,
                name: one.name,
              })),
              name: person.name,
              admin: await accounts.isAdmin(person.id),
              // what waits on their own answer, for one on the web
              ...(web
                ? {
                    waiting: tasks.filter(
                      (task) =>
                        task.metadata.to === me.id &&
                        !FINAL.includes(task.status.state) &&
                        !task.history.some((m) => m.role === "agent"),
                    ).length,
                  }
                : {}),
            },
          }),
          [],
          HOME_HEADERS,
        );
        return true;
      }
      // The server's sign-in settings and its people's accounts, for its admin alone.
      const signIn =
        /^\/home\/admin(?:\/(password|password\/off|google|google\/on|google\/off|google\/remove|reset|account\/remove))?$/.exec(
          path,
        );
      if (signIn && (request.method === "GET" || post)) {
        const person = await accounts.person(cookie);
        if (!person) {
          redirect("/login");
          return true;
        }
        if (!(await accounts.isAdmin(person.id))) {
          redirect("/home");
          return true;
        }
        const what = signIn[1];
        const site = base();
        const page = async (extra: {
          error?: string;
          googleError?: string;
          clientId?: string;
          saved?: boolean;
        }) =>
          adminPage({
            lang,
            settings: await accounts.settings(person.id),
            redirect: `${options.publicUrl?.replace(/\/+$/, "") ?? site}${GOOGLE_CALLBACK}`,
            people: await accounts.serverPeople(person.id),
            me: person.id,
            ...extra,
          });
        /** Someone on the server the admin acts on, by the account id in the address or form. */
        const someone = async (id: string) =>
          (await accounts.serverPeople(person.id)).find((one) => one.id === id);
        if (!post) {
          if (
            what === "google/remove" ||
            what === "google/off" ||
            what === "password/off"
          ) {
            const settings = await accounts.settings(person.id);
            // What would refuse turning passwords off, said in place of a button that would fail.
            const blocked =
              what !== "password/off"
                ? undefined
                : !accounts.methods().google
                  ? "google-first"
                  : !settings.mineLinked
                    ? "link-google-first"
                    : undefined;
            html(
              200,
              confirmPage({
                lang,
                what:
                  what === "google/remove"
                    ? "googleRemove"
                    : what === "google/off"
                      ? "googleOff"
                      : "passwordOff",
                count:
                  what === "password/off"
                    ? settings.passwordOnly
                    : settings.googleOnly,
                action: path,
                back: "/home/admin",
                ...(blocked ? { blocked } : {}),
              }),
            );
            return true;
          }
          if (what === "reset" || what === "account/remove") {
            const user = url.searchParams.get("user") ?? "";
            const one = await someone(user);
            if (!one || one.id === person.id) {
              redirect("/home/admin");
              return true;
            }
            html(
              200,
              confirmPage({
                lang,
                what: what === "reset" ? "reset" : "removeAccount",
                name: one.name,
                action: path,
                fields: { user },
                back: "/home/admin",
              }),
            );
            return true;
          }
          if (what) {
            redirect("/home/admin");
            return true;
          }
          const failed = failure();
          const done = url.searchParams.get("done");
          // The Google form's failure, come back to with what was typed (a client ID is public).
          const googleFailed = url.searchParams.get("google") ?? "";
          html(
            200,
            await page({
              ...(failed ? { error: failed } : {}),
              ...(done === "saved" ||
              done === "password-back" ||
              done === "welcome"
                ? { done }
                : {}),
              ...(/^[a-z-]{2,40}$/.test(googleFailed)
                ? {
                    googleError: googleFailed,
                    clientId: (url.searchParams.get("client") ?? "").slice(
                      0,
                      260,
                    ),
                  }
                : {}),
            }),
          );
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        try {
          // turning Google off or mending it may turn passwords back on for everyone: said so
          let passwordBack = false;
          if (what === "password")
            await accounts.setPassword(person.id, fields.get("on") !== "0");
          else if (what === "password/off")
            await accounts.setPassword(person.id, false);
          else if (what === "google")
            ({ passwordBack } = await accounts.saveGoogle(person.id, {
              clientId: fields.get("clientId") ?? "",
              secret: fields.get("secret") ?? "",
              site,
              by: person.name,
            }));
          else if (what === "google/on" || what === "google/off")
            ({ passwordBack } = await accounts.setGoogle(
              person.id,
              what === "google/on",
            ));
          else if (what === "google/remove")
            ({ passwordBack } = await accounts.removeGoogle(person.id));
          else if (what === "reset") {
            const made = await accounts.resetLink(
              person.id,
              fields.get("user") ?? "",
            );
            html(
              200,
              resetMadePage({
                lang,
                name: made.name,
                link: `${options.publicUrl?.replace(/\/+$/, "") ?? site}/reset?token=${encodeURIComponent(made.token)}`,
              }),
            );
            return true;
          } else if (what === "account/remove")
            await accounts.removeAccount(person.id, fields.get("user") ?? "");
          else {
            redirect("/home/admin");
            return true;
          }
          redirect(
            `/home/admin?done=${passwordBack ? "password-back" : "saved"}`,
          );
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          // The Google form comes back as it was typed (never the secret), its fold open, the
          // failure said under the field at fault.
          if (what === "google")
            redirect(
              `/home/admin?google=${encodeURIComponent(code)}&client=${encodeURIComponent((fields.get("clientId") ?? "").slice(0, 260))}#google`,
            );
          else redirect(`/home/admin?error=${encodeURIComponent(code)}`);
        }
        return true;
      }
      // A forgotten password, changed with the link the admin made.
      if (path === "/reset" && (request.method === "GET" || post)) {
        const token = post ? undefined : (url.searchParams.get("token") ?? "");
        if (!post) {
          if (!/^[\w-]{10,128}$/.test(token ?? "")) {
            redirect("/login?error=reset-expired");
            return true;
          }
          const name = await accounts.resetFor(token as string);
          html(
            name ? 200 : 410,
            newPasswordPage({
              lang,
              token: token as string,
              ...(name ? { name } : {}),
            }),
          );
          return true;
        }
        const fields = new URLSearchParams(await raw(request));
        const given = fields.get("token") ?? "";
        if (tries.blocked(from)) {
          html(
            429,
            newPasswordPage({ lang, token: given, error: "too-many-tries" }),
          );
          return true;
        }
        try {
          await accounts.resetPassword(given, fields.get("password") ?? "");
          redirect("/login?done=reset");
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          if (code === "reset-expired") tries.miss(from);
          const name = await accounts.resetFor(given);
          html(
            400,
            newPasswordPage({
              lang,
              token: given,
              error: code,
              ...(name ? { name } : {}),
            }),
          );
        }
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
        // the office the change is about: named by the page it came from, else the first
        const fields = post
          ? new URLSearchParams(await raw(request))
          : url.searchParams;
        const place = placeOf(
          await accounts.places(person.id),
          fields.get("office"),
        );
        if (!place) {
          redirect("/home");
          return true;
        }
        // these are the office's: back to its tab
        const home = `/home/office?office=${encodeURIComponent(place.office)}`;
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
            redirect(home);
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
              back: home,
              fields: {
                office: place.office,
                ...(what.startsWith("people/")
                  ? { user }
                  : what === "clones/remove"
                    ? { member }
                    : {}),
              },
            }),
          );
          return true;
        }
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
          redirect(home);
        } catch (error) {
          const code =
            error instanceof AccountError ? error.code : "account-failed";
          redirect(`${home}&error=${encodeURIComponent(code)}`);
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
          const claimed = await accounts.claim(
            String(input.code ?? ""),
            typeof input.token === "string" ? input.token : undefined,
          );
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
      // The signed-in pages' own script (home-client.ts).
      if (request.method === "GET" && path === "/assets/home.mjs") {
        response.writeHead(200, {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "no-cache",
          "x-content-type-options": "nosniff",
        });
        response.end(HOME_CLIENT);
        return;
      }
      // The office drawing on the people's pages: its files, and the look it draws (room-page.ts).
      if (await roomRoutes({ request, response, path, url, relay, accounts }))
        return;
      const invite = /^\/i\/([\w-]{4,128})$/.exec(path);
      if (accounts && (await peoplePages(invite?.[1]))) return;
      if (invite && request.method === "GET") {
        const lang = pageLanguage(request.headers["accept-language"]);
        const from = address(request);
        // Asked to wait, never told a link is gone, and a visit while waiting is not one more miss.
        if (tries.blocked(from)) {
          response.writeHead(429, PAGE_HEADERS);
          response.end(tooManyTriesPage(lang));
          return;
        }
        if (!(await relay.knows(invite[1]))) {
          tries.miss(from);
          const ended = await relay.inviteEnded(invite[1]);
          response.writeHead(ended ? 410 : 404, PAGE_HEADERS);
          response.end(ended ? inviteEndedPage(lang) : missingPage(lang));
          return;
        }
        // Who invited, as the invite keeps it: the link's own "from" can say anything.
        const who =
          (await relay.invite(invite[1]))?.by ||
          url.searchParams.get("from")?.trim().slice(0, 80);
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
            local: where(origin),
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
      // An invite for one person, which a member's app copies for them (each call makes one).
      if (request.method === "GET" && path === "/invite") {
        const me = await member(request);
        const made = await relay.makeInvite(me.office, {
          member: me.id,
          name: me.card.name,
          owner: await relay.ownsOffice(me),
        });
        return send(200, {
          path: `/i/${made.token}`,
          expires: made.expires,
          days: INVITE_DAYS,
        });
      }
      // Where a member's app opens the team server's pages for its person: the link that makes
      // the server's admin, for the app that runs the office (it holds its key) while there is
      // none; a link to make their own account, when their clone has none there; else sign-in.
      if (request.method === "POST" && path === "/server-link") {
        const me = await member(request);
        if (!accounts) return send(200, { path: "/" });
        const input = await body(request);
        const key = typeof input.key === "string" ? input.key : "";
        // Only an office run by someone's app, asked from that same computer: a server's operator
        // has the link in its log, and the office's key was in links people were sent before.
        const here = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
          request.socket.remoteAddress ?? "",
        );
        if (key && options.onComputer && here && !(await accounts.hasAdmin())) {
          const [first] = await relay.officesByAge(1);
          if (first?.id === me.office && first.key === key) {
            const token = await accounts.adminLink();
            if (token) return send(200, { path: `/setup/${token}` });
          }
        }
        if (!me.user) {
          const made = await relay.makeInvite(me.office, {
            member: me.id,
            name: me.card.name,
            forMember: me.id,
          });
          return send(200, { path: `/i/${made.token}?account#account` });
        }
        return send(200, { path: "/login" });
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
      // The clone's side of its person talking to it from their page (relay.ts `ownSay`).
      if (request.method === "POST" && path === "/own/allow") {
        const me = await member(request);
        const input = await body(request);
        await relay.ownAllow(
          me,
          input.on === true,
          Array.isArray(input.keys) ? input.keys.map(String) : [],
        );
        return send(200, { on: input.on === true });
      }
      if (request.method === "POST" && path === "/own/answer") {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          message: await relay.ownAnswer(me, {
            replyTo:
              typeof input.replyTo === "string" ? input.replyTo : undefined,
            text: typeof input.text === "string" ? input.text : undefined,
            code: typeof input.code === "string" ? input.code : undefined,
          }),
        });
      }
      if (request.method === "POST" && path === "/own/ask") {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          message: await relay.ownAsk(me, {
            text: typeof input.text === "string" ? input.text : undefined,
            choices: input.choices,
          }),
        });
      }
      const ownTaken = /^\/own\/(o-[\w-]{6,40})\/take$/.exec(path);
      if (request.method === "POST" && ownTaken) {
        await relay.ownTake(await member(request), ownTaken[1]);
        return send(200, { ok: true });
      }
      const ownSettled = /^\/own\/ask\/(o-[\w-]{6,40})\/settle$/.exec(path);
      if (request.method === "POST" && ownSettled) {
        await relay.ownSettle(await member(request), ownSettled[1]);
        return send(200, { ok: true });
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
      const teamAi = options.teamAi;
      if (path === "/team-ai" && request.method === "GET") {
        if (!teamAi) return send(200, { keys: [], sealing: false, calls: [] });
        return send(200, await teamAi.list(await member(request)));
      }
      const teamKey = /^\/team-ai\/([a-z]{2,20})$/.exec(path);
      if (teamKey && request.method === "POST") {
        if (!teamAi || !isTeamProvider(teamKey[1]))
          throw new RelayError(404, "No such vendor.", "not-found");
        const me = await member(request);
        const input = await body(request);
        // A key, or null to remove it, said outright: anything else removes nothing.
        if (
          !("key" in input) ||
          (input.key !== null && typeof input.key !== "string")
        )
          throw new RelayError(
            400,
            "Send {key} or {key: null}.",
            "bad-request",
          );
        await teamAi.set(
          me,
          teamKey[1],
          typeof input.key === "string" ? input.key : null,
        );
        return send(200, { ok: true });
      }
      const call = /^\/ai\/([a-z]{2,20})(\/.*)$/.exec(path);
      if (call) {
        if (!teamAi || !isTeamProvider(call[1]))
          throw new RelayError(404, "No such vendor.", "not-found");
        return await teamAi.pass(
          request,
          response,
          call[1],
          call[2],
          url.search,
        );
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
      if (path === "/skills" && request.method === "GET")
        return send(200, {
          skills: await relay.sharedSkills(await member(request)),
        });
      if (path === "/skills" && request.method === "POST") {
        const me = await member(request);
        const input = await body(request);
        return send(200, {
          skill: await relay.shareSkill(me, {
            name: input.name,
            category: input.category,
            files: input.files,
          }),
        });
      }
      const skill = /^\/skills\/([a-z0-9][a-z0-9._-]{0,63})$/.exec(path);
      if (skill && request.method === "GET")
        return send(200, {
          skill: await relay.sharedSkill(await member(request), skill[1]),
        });
      if (skill && request.method === "DELETE") {
        await relay.unshareSkill(await member(request), skill[1]);
        return send(200, { ok: true });
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
      // A streamed answer already under way: it ends where it stopped.
      if (response.headersSent) {
        response.end();
        return;
      }
      if (error instanceof RelayError)
        return send(error.status, { error: error.message, code: error.code });
      console.error(error);
      send(500, { error: "The relay failed.", code: "relay-failed" });
    }
  };
}
