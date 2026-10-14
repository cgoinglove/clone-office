// The office drawing on the team server's own pages: the same room the app draws
// (features/office/room/), its files served from here, and fed by a look built as the app builds
// it (features/minime/office/room-data.ts) for the signed-in person's own place in the office.
//
// A page that holds it puts `officeRoomHtml()` where the office goes and answers with
// `ROOM_PAGE_CSP` as its Content-Security-Policy, in place of the one the other pages send:
// scripts from this server alone, never inline, nothing evaluated, and calls only back to here.
// Styles stay allowed inline, as on every page here: the pages keep their own sheet in the page,
// and the drawing writes a few style attributes into its own markup. `roomRoutes()` answers the
// room's files (`/assets/room/<file>`, a fixed list, nothing else) and the look
// (`/home/office/look?office=<id>`). Node runs this file as it is, like the rest of the relay.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AllInSync } from "../../i18n/sync.ts";
import en from "../../messages/en.json" with { type: "json" };
import es from "../../messages/es.json" with { type: "json" };
import ja from "../../messages/ja.json" with { type: "json" };
import ko from "../../messages/ko.json" with { type: "json" };
import pt from "../../messages/pt.json" with { type: "json" };
import zh from "../../messages/zh.json" with { type: "json" };
import { roomData } from "../minime/office/room-data.ts";
import type { Accounts } from "./accounts.ts";
import { escape, type PageLanguage } from "./page.ts";
import { FINAL, type Relay } from "./relay.ts";

/** The page's own lines about the drawing, which the app never says. */
const WORDS = {
  en: {
    needsScript:
      "The office drawing needs JavaScript. Turn it on in your browser to see your team at their desks.",
    unreachable:
      "Can't reach the office right now. Trying again in a few seconds.",
    signedOut: "You're signed out. Sign in again to see the office.",
  },
  ko: {
    needsScript:
      "오피스 그림은 자바스크립트가 켜져 있어야 보여요. 브라우저에서 켜면 팀이 책상에 있는 모습이 보여요.",
    unreachable: "지금 오피스에 닿지 않아요. 몇 초 뒤 다시 해 볼게요.",
    signedOut: "로그아웃됐어요. 다시 로그인하면 오피스가 보여요.",
  },
  zh: {
    needsScript:
      "办公室画面需要 JavaScript。在浏览器中开启后，就能看到团队在各自的座位上。",
    unreachable: "现在连不上办公室。几秒后会再试。",
    signedOut: "你已退出登录。重新登录即可看到办公室。",
  },
  ja: {
    needsScript:
      "オフィスの図には JavaScript が必要です。ブラウザで有効にすると、チームが席にいる様子が見られます。",
    unreachable: "いまオフィスにつながりません。数秒後にもう一度試します。",
    signedOut:
      "ログアウトしています。もう一度ログインするとオフィスが見られます。",
  },
  es: {
    needsScript:
      "El dibujo de la oficina necesita JavaScript. Actívalo en tu navegador para ver a tu equipo en sus escritorios.",
    unreachable:
      "Ahora no se puede llegar a la oficina. Se volverá a intentar en unos segundos.",
    signedOut: "Cerraste sesión. Vuelve a iniciar sesión para ver la oficina.",
  },
  pt: {
    needsScript:
      "O desenho do escritório precisa de JavaScript. Ative-o no navegador para ver sua equipe nas mesas.",
    unreachable:
      "Não dá para chegar ao escritório agora. Vamos tentar de novo em alguns segundos.",
    signedOut: "Você saiu da conta. Entre de novo para ver o escritório.",
  },
};

// Each language says everything English says, and nothing more: a type error names what is not.
const _wordsInStep: AllInSync<typeof WORDS> = WORDS;

/** The app's own words, each language's file as it is (the app keeps them in step, i18n/). */
const MESSAGES: Record<PageLanguage, { office: Record<string, unknown> }> = {
  en,
  ko,
  zh,
  ja,
  es,
  pt,
};

/** The parts of the app's `office` words the room reads (office-room.tsx). */
const ROOM_KEYS = ["team", "yourMiniMe", "miniMe", "state", "room"] as const;

type Tree = Record<string, unknown>;

function withFallback(base: Tree, own: Tree): Tree {
  const merged: Tree = { ...base };
  for (const [key, value] of Object.entries(own)) {
    const under = base[key];
    merged[key] =
      value && typeof value === "object" && under && typeof under === "object"
        ? withFallback(under as Tree, value as Tree)
        : value;
  }
  return merged;
}

/** The room's words in a language, English for any line not written in it, as the app reads them. */
export function roomWords(lang: PageLanguage): Tree {
  const pick = (office: Tree) =>
    Object.fromEntries(
      ROOM_KEYS.filter((key) => key in office).map((key) => [key, office[key]]),
    );
  const base = pick(MESSAGES.en.office);
  return lang === "en"
    ? base
    : withFallback(base, pick(MESSAGES[lang]?.office ?? {}));
}

/**
 * The policy the page holding the office sends, in place of the other pages' own: everything the
 * page loads comes from this server, scripts only as files (no inline script, no eval), the look
 * fetched from here, no frames, forms only to here. Styles keep 'unsafe-inline', as the other pages
 * do: the page's own sheet is inline, and the drawing writes style attributes in its markup.
 */
export const ROOM_PAGE_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
].join("; ");

/** Where the room's files are served. */
export const ROOM_ASSETS = "/assets/room/";

const SCRIPT = "text/javascript; charset=utf-8";
const STYLE = "text/css; charset=utf-8";

/**
 * Every file served under /assets/room/, and nothing else: the drawing's modules and sheet as the
 * app loads them, and this page's own start (room-client.mjs) and sheet (room-page.css), all in
 * features/office/room/. In the package they lie in dist/room/, beside the bundled relay.
 */
const ASSETS: Record<string, string> = {
  "office.mjs": SCRIPT,
  "core.mjs": SCRIPT,
  "floor.mjs": SCRIPT,
  "looks.mjs": SCRIPT,
  "pieces.mjs": SCRIPT,
  "room-client.mjs": SCRIPT,
  "room.css": STYLE,
  "room-page.css": STYLE,
};

/** The modules the start loads, fetched at once rather than one after another. */
const MODULES = [
  "office.mjs",
  "core.mjs",
  "floor.mjs",
  "pieces.mjs",
  "looks.mjs",
];

/** The places a file is looked for: the package's dist/room/, else the repository's own folder. */
const PLACES = ["./room/", "../office/room/"];

const loaded = new Map<string, Promise<{ body: Buffer; etag: string }>>();

/** A file's content and its tag, read once per process. */
function asset(name: string): Promise<{ body: Buffer; etag: string }> {
  let found = loaded.get(name);
  if (!found) {
    found = (async () => {
      for (const place of PLACES) {
        const body = await readFile(
          new URL(`${place}${name}`, import.meta.url),
        ).catch(() => undefined);
        if (body)
          return {
            body,
            etag: `"${createHash("sha256").update(body).digest("base64url").slice(0, 22)}"`,
          };
      }
      throw new Error(`The office room's ${name} is missing.`);
    })();
    // a file missing now is looked for again next time
    found.catch(() => loaded.delete(name));
    loaded.set(name, found);
  }
  return found;
}

/** Whether a name is one of the room's files: the list, never a path made from the request. */
export function isRoomAsset(name: string): boolean {
  return Object.hasOwn(ASSETS, name);
}

/** A same-site path, or nothing: never another site's address, nor one that leaves this server. */
function samePath(path: string | undefined): string | undefined {
  return path && /^\/(?![/\\])/.test(path) ? path : undefined;
}

/**
 * The office on a page: its sheets, a box the drawing fills, the line said while it cannot be drawn
 * (with scripts off, until it starts), and the start, a module from this server. Everything it
 * needs travels in data attributes, so the page carries no inline script. `answer` is where the
 * viewer goes to answer what waits on them (the requests page by default); `nonce`, when the page
 * uses one, goes on its tags.
 */
export function officeRoomHtml(input: {
  lang: PageLanguage;
  office: string;
  nonce?: string;
  answer?: string;
}): string {
  const lang = input.lang in WORDS ? input.lang : "en";
  const words = WORDS[lang];
  const office = encodeURIComponent(input.office);
  const nonce = input.nonce ? ` nonce="${escape(input.nonce)}"` : "";
  const answer = samePath(input.answer) ?? `/home/requests?office=${office}`;
  const attr = (name: string, value: string) =>
    ` data-${name}="${escape(value)}"`;
  return [
    // the page's sheet first, so the room's own rules, after it, always win
    `<link rel="stylesheet" href="${ROOM_ASSETS}room-page.css"${nonce}>`,
    `<link rel="stylesheet" href="${ROOM_ASSETS}room.css"${nonce}>`,
    ...MODULES.map(
      (name) =>
        `<link rel="modulepreload" href="${ROOM_ASSETS}${name}"${nonce}>`,
    ),
    `<div class="co-room" data-co-room${attr("lang", lang)}${attr("look", `/home/office/look?office=${office}`)}${attr("answer", answer)}${attr("words", JSON.stringify(roomWords(lang)))}${attr("unreachable", words.unreachable)}${attr("signed-out", words.signedOut)}>`,
    `<p class="co-room-note" data-co-room-note role="status">${escape(words.needsScript)}</p>`,
    `<div class="co-room-stage of-full of-pane" data-co-room-stage></div>`,
    "</div>",
    `<script type="module" src="${ROOM_ASSETS}room-client.mjs"${nonce}></script>`,
  ].join("\n");
}

/** How many of a viewer's requests the room looks at, as the app's look (GET /tasks) does. */
const TASKS = 50;

/**
 * The room's files and the look for the office's page. Answers whether it handled the request;
 * anything else is left to the rest of the handler.
 */
export async function roomRoutes(input: {
  request: IncomingMessage;
  response: ServerResponse;
  path: string;
  url: URL;
  relay: Relay;
  accounts?: Accounts;
}): Promise<boolean> {
  const { request, response, path, url, relay, accounts } = input;
  const reading = request.method === "GET" || request.method === "HEAD";
  if (path.startsWith(ROOM_ASSETS)) {
    const name = path.slice(ROOM_ASSETS.length);
    if (!reading || !isRoomAsset(name)) {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "x-content-type-options": "nosniff",
      });
      response.end("Not here.");
      return true;
    }
    const { body, etag } = await asset(name);
    const headers = {
      "content-type": ASSETS[name],
      "x-content-type-options": "nosniff",
      "cross-origin-resource-policy": "same-origin",
      // kept, and asked about again each time: a server updated in place is never read stale
      "cache-control": "no-cache",
      etag,
    };
    if (request.headers["if-none-match"] === etag) {
      response.writeHead(304, headers);
      response.end();
      return true;
    }
    response.writeHead(200, {
      ...headers,
      "content-length": String(body.byteLength),
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return true;
  }
  if (path !== "/home/office/look" || !accounts) return false;
  const send = (status: number, data: unknown) => {
    response.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    response.end(JSON.stringify(data));
  };
  if (request.method !== "GET") {
    send(405, { error: "Not here.", code: "not-found" });
    return true;
  }
  // The page's own call: another site never reads someone's office with their cookie.
  const site = request.headers["sec-fetch-site"];
  if (typeof site === "string" && site !== "same-origin") {
    send(403, { error: "Not from here.", code: "not-from-here" });
    return true;
  }
  const person = await accounts.person(request.headers.cookie);
  if (!person) {
    send(401, { error: "Sign in first.", code: "signed-out" });
    return true;
  }
  const places = await accounts.places(person.id);
  const asked = url.searchParams.get("office");
  const place = asked ? places.find((one) => one.office === asked) : places[0];
  if (!place) {
    send(403, { error: "Not in this office.", code: "not-in-office" });
    return true;
  }
  const office = place.office;
  // The viewer: their own place in the office, their clone's or on the web; none yet, and they see
  // their colleagues alone.
  const mine = await relay.memberOf(office, person.id);
  const viewer = mine
    ? { id: mine.id, office, card: mine.card, user: person.id }
    : undefined;
  const [members, tasks] = await Promise.all([
    relay.members(office),
    viewer ? relay.tasks(viewer, TASKS) : Promise.resolve([]),
  ]);
  // Someone on the web has no clone to ask them: what was asked of them and not yet answered waits
  // on them, as their page counts it. A clone's questions wait on its own computer.
  const waiting = mine?.web
    ? tasks.filter(
        (task) =>
          task.metadata.to === mine.id &&
          !FINAL.includes(task.status.state) &&
          !task.history.some((message) => message.role === "agent"),
      ).length
    : 0;
  send(
    200,
    roomData(
      { me: mine ? { id: mine.id } : undefined, members, tasks },
      waiting,
    ),
  );
  return true;
}
