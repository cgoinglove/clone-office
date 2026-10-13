import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import type { RoomData } from "../office/room/office.mjs";
import { Accounts } from "./accounts.ts";
import { openDatabase } from "./db.ts";
import { relayHandler } from "./handler.ts";
import { Relay } from "./relay.ts";
import {
  isRoomAsset,
  officeRoomHtml,
  ROOM_PAGE_CSP,
  roomWords,
} from "./room-page.ts";

const cookieOf = (cookies: string[]) =>
  cookies.map((cookie) => cookie.split(";")[0]).join("; ");

/** A relay with people's accounts, listening on a free port of this computer. */
async function served() {
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay);
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    db,
    relay,
    accounts,
    base: `http://127.0.0.1:${port}`,
    port,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await relay.close();
      await db.close();
    },
  };
}

/** A request sent with its path exactly as written, as a browser would never send it. */
function rawGet(port: number, path: string) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const sent = httpRequest(
      { host: "127.0.0.1", port, path, method: "GET" },
      (answer) => {
        let body = "";
        answer.on("data", (chunk) => {
          body += chunk;
        });
        answer.on("end", () =>
          resolve({ status: answer.statusCode ?? 0, body }),
        );
      },
    );
    sent.on("error", reject);
    sent.end();
  });
}

test("the room's files are a fixed list, each with its type, and nothing else is served", async () => {
  const at = await served();
  try {
    for (const [name, type] of [
      ["office.mjs", "text/javascript"],
      ["core.mjs", "text/javascript"],
      ["floor.mjs", "text/javascript"],
      ["looks.mjs", "text/javascript"],
      ["pieces.mjs", "text/javascript"],
      ["room-client.mjs", "text/javascript"],
      ["room.css", "text/css"],
      ["room-page.css", "text/css"],
    ]) {
      const answer = await fetch(`${at.base}/assets/room/${name}`);
      assert.equal(answer.status, 200, name);
      assert.match(answer.headers.get("content-type") ?? "", new RegExp(type));
      assert.equal(answer.headers.get("x-content-type-options"), "nosniff");
      assert.equal(answer.headers.get("cache-control"), "no-cache");
      const etag = answer.headers.get("etag");
      assert.ok(etag, "kept by the browser with its tag");
      assert.ok((await answer.text()).length > 100);
      const again = await fetch(`${at.base}/assets/room/${name}`, {
        headers: { "if-none-match": etag },
      });
      assert.equal(again.status, 304, "asked again, not sent again");
    }
    // The start the page loads imports the drawing beside it.
    assert.match(
      await (await fetch(`${at.base}/assets/room/room-client.mjs`)).text(),
      /from "\.\/office\.mjs"/,
    );
    for (const path of [
      "/assets/room/",
      "/assets/room/unknown.mjs",
      "/assets/room/room-page.ts",
      "/assets/room/office.d.mts",
      "/assets/room/office-room.tsx",
      "/assets/room/room-client.mjs/",
      "/assets/room/__proto__",
      "/assets/room/%2e%2e/room-page.ts",
      "/assets/room/..%2froom-page.ts",
      "/assets/room/../../features/relay/room-page.ts",
      "/assets/room/../room-page.ts",
    ]) {
      const answer = await rawGet(at.port, path);
      assert.equal(answer.status, 404, path);
      assert.doesNotMatch(answer.body, /import|roomRoutes/, path);
    }
    const posted = await fetch(`${at.base}/assets/room/office.mjs`, {
      method: "POST",
    });
    assert.equal(posted.status, 404);
    assert.equal(isRoomAsset("office.mjs"), true);
    assert.equal(isRoomAsset("constructor"), false);
    assert.equal(isRoomAsset("../room-page.ts"), false);
  } finally {
    await at.close();
  }
});

test("the look is the signed-in person's own: strangers and other offices' people are refused", async () => {
  const at = await served();
  try {
    const office = await at.relay.office();
    const ana = await at.accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const other = await at.relay.office("another-office-key");
    const dee = await at.accounts.signUp(other.key, {
      name: "Dee",
      email: "dee@example.com",
      password: "dee's long password",
    });
    const look = (office: string, headers: Record<string, string> = {}) =>
      fetch(
        `${at.base}/home/office/look?office=${encodeURIComponent(office)}`,
        { headers },
      );

    const nobody = await look(office.id);
    assert.equal(nobody.status, 401);
    assert.equal((await nobody.json()).code, "signed-out");
    assert.equal(
      (await look(office.id, { cookie: "better-auth.session_token=made-up" }))
        .status,
      401,
    );
    const stranger = await look(office.id, { cookie: cookieOf(dee.cookies) });
    assert.equal(stranger.status, 403, "another office's person");
    assert.equal((await stranger.json()).code, "not-in-office");
    assert.equal(
      (await look("no-such-office", { cookie: cookieOf(ana.cookies) })).status,
      403,
    );
    const elsewhere = await look(office.id, {
      cookie: cookieOf(ana.cookies),
      "sec-fetch-site": "cross-site",
    });
    assert.equal(elsewhere.status, 403, "another site never reads it");
    const own = await look(office.id, {
      cookie: cookieOf(ana.cookies),
      "sec-fetch-site": "same-origin",
    });
    assert.equal(own.status, 200);
    assert.equal(own.headers.get("cache-control"), "no-store");
    // In the office with no place of her own yet: the room, with nobody hers in it.
    const data = (await own.json()) as RoomData;
    assert.deepEqual(data.people, []);
    assert.deepEqual(data.requests, []);
    assert.equal(
      (await look(other.id, { cookie: cookieOf(dee.cookies) })).status,
      200,
      "Dee's own office",
    );
    // Only GET.
    const posted = await fetch(
      `${at.base}/home/office/look?office=${office.id}`,
      {
        method: "POST",
        headers: {
          cookie: cookieOf(ana.cookies),
          "sec-fetch-site": "same-origin",
        },
      },
    );
    assert.notEqual(posted.status, 200);
  } finally {
    await at.close();
  }
});

test("the look draws everyone in the office and only the requests the viewer is part of", async () => {
  const at = await served();
  try {
    const office = await at.relay.office();
    const person = async (name: string) =>
      at.accounts.signUp(office.key, {
        name,
        email: `${name.toLowerCase()}@example.com`,
        password: `${name}'s long password`,
      });
    const ana = await person("Ana");
    const ben = await person("Ben");
    const cy = await person("Cy");
    // Ana takes part on the web; Ben's and Cy's computers run their clones.
    const anaHere = await at.relay.joinWeb(office.id, ana.person.id, {
      name: "Ana",
      description: "",
    });
    const clone = async (who: typeof ben) => {
      const { code } = await at.accounts.setupCode(who.person.id, office.id);
      const claimed = await at.accounts.claim(code);
      return at.relay.memberByToken(claimed.token);
    };
    const benClone = await clone(ben);
    const cyClone = await clone(cy);
    const asked = await at.relay.send(anaHere, benClone.id, "The Q3 numbers?");
    const askedOfAna = await at.relay.send(
      benClone,
      anaHere.id,
      "Can you sign the order?",
    );
    await at.relay.send(benClone, cyClone.id, "Between Ben and Cy only");
    await at.relay.sendLink(anaHere, "Someone outside", "By a link");
    await at.relay.update(benClone, asked.id, {
      text: "Sent them over.",
      state: "COMPLETED",
    });

    const answer = await fetch(
      `${at.base}/home/office/look?office=${office.id}`,
      { headers: { cookie: cookieOf(ana.cookies) } },
    );
    assert.equal(answer.status, 200);
    const data = (await answer.json()) as RoomData;
    assert.deepEqual(
      data.people.map((one) => [one.name, Boolean(one.mine), one.status]),
      [
        ["Ana", true, "offline"],
        ["Ben", false, "active"],
        ["Cy", false, "active"],
      ],
    );
    assert.equal(data.people[0].onWeb, true, "her desk has no clone");
    assert.deepEqual(
      data.requests.map((one) => one.id).sort(),
      [asked.id, askedOfAna.id].sort(),
      "hers alone, and none asked by a link",
    );
    const done = data.requests.find((one) => one.id === asked.id);
    assert.equal(done?.state, "COMPLETED");
    assert.equal(done?.text, "The Q3 numbers?");
    assert.equal(done?.answer, "Sent them over.");
    assert.equal(done?.from, anaHere.id);
    assert.equal(done?.to, benClone.id);
    assert.equal(data.waiting.count, 1, "Ben's request waits on her");

    // Ben, with a clone, sees his own requests and nothing waiting at the server for him.
    const bens = (await (
      await fetch(`${at.base}/home/office/look?office=${office.id}`, {
        headers: { cookie: cookieOf(ben.cookies) },
      })
    ).json()) as RoomData;
    assert.equal(bens.requests.length, 3);
    assert.equal(bens.waiting.count, 0);
    assert.equal(bens.people.find((one) => one.mine)?.name, "Ben");
    // Without the office named, their first.
    const first = await fetch(`${at.base}/home/office/look`, {
      headers: { cookie: cookieOf(cy.cookies) },
    });
    assert.equal(first.status, 200);
    assert.equal(
      ((await first.json()) as RoomData).requests.length,
      1,
      "Cy's one request",
    );
  } finally {
    await at.close();
  }
});

test("the page holding the office allows scripts from this server alone", () => {
  const parts = Object.fromEntries(
    ROOM_PAGE_CSP.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
  assert.deepEqual(parts["default-src"], ["'none'"]);
  assert.deepEqual(parts["script-src"], ["'self'"]);
  assert.deepEqual(parts["connect-src"], ["'self'"]);
  assert.deepEqual(parts["img-src"], ["'self'", "data:"]);
  assert.deepEqual(parts["frame-ancestors"], ["'none'"]);
  assert.deepEqual(parts["form-action"], ["'self'"]);
  assert.ok(parts["style-src"].includes("'self'"));
  assert.doesNotMatch(ROOM_PAGE_CSP, /unsafe-eval|\*|https?:/);
});

test("the office's snippet escapes what it is given and carries no inline script", () => {
  const html = officeRoomHtml({
    lang: "en",
    office: `o"><script>alert(1)</script>`,
    answer: "//elsewhere.example/steal",
    nonce: `n"><x`,
  });
  assert.doesNotMatch(html, /<script>alert|"><x/);
  assert.match(
    html,
    /data-look="\/home\/office\/look\?office=o%22%3E%3Cscript%3Ealert\(1\)%3C%2Fscript%3E"/,
  );
  assert.match(
    html,
    /data-answer="\/home\/requests\?office=o%22/,
    "never another site",
  );
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1);
  assert.match(
    scripts[0][0],
    /type="module" src="\/assets\/room\/room-client\.mjs"/,
  );
  assert.equal(scripts[0][1], "", "nothing inline");
  assert.doesNotMatch(html, /\son[a-z]+=/i, "no handlers in attributes");
  // Every file it names is one the server serves.
  for (const [, path] of html.matchAll(
    /(?:href|src)="\/assets\/room\/([^"]+)"/g,
  ))
    assert.ok(isRoomAsset(path), path);
  // Its own sheet comes before the room's, so the room's rules win.
  assert.ok(html.indexOf("room-page.css") < html.indexOf("room.css"));
  // With scripts off, a line in the page's language says why nothing is drawn.
  assert.match(
    officeRoomHtml({ lang: "ko", office: "o-1" }),
    /data-co-room-note[^>]*>오피스 그림은 자바스크립트/,
  );
  assert.match(
    officeRoomHtml({ lang: "en", office: "o-1", answer: "/home/office?x=1" }),
    /data-answer="\/home\/office\?x=1"/,
  );
});

test("the room speaks the page's language with the app's own words, English for what is missing", () => {
  const en = roomWords("en");
  const ko = roomWords("ko");
  const keys = (tree: unknown, prefix = ""): string[] =>
    Object.entries(tree as Record<string, unknown>).flatMap(([key, value]) =>
      value && typeof value === "object"
        ? keys(value, `${prefix}${key}.`)
        : [`${prefix}${key}`],
    );
  for (const lang of ["ko", "zh", "ja", "es", "pt"] as const)
    assert.deepEqual(keys(roomWords(lang)).sort(), keys(en).sort(), lang);
  assert.notEqual(
    (ko.room as { label: string }).label,
    (en.room as { label: string }).label,
  );
  assert.equal(en.yourMiniMe, "Your clone");
  // Every word the app's room reads (office-room.tsx), the page's room reads too, and English has it.
  const read = (file: string) =>
    new Set(
      [
        ...readFileSync(join(import.meta.dirname, file), "utf8").matchAll(
          /"((?:room\.)[\w.]+|team|yourMiniMe|miniMe)"/g,
        ),
      ].map((found) => found[1]),
    );
  const app = read("../office/room/office-room.tsx");
  const page = read("../office/room/room-client.mjs");
  assert.ok(app.size > 60);
  assert.deepEqual([...page].sort(), [...app].sort());
  const flat = new Set(keys(en));
  for (const key of app) assert.ok(flat.has(key), key);
});
