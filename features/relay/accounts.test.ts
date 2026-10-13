import assert from "node:assert/strict";
import { test } from "node:test";
import { Accounts } from "./accounts.ts";
import { openDatabase } from "./db.ts";
import { Relay } from "./relay.ts";

const cookieOf = (cookies: string[]) =>
  cookies.map((cookie) => cookie.split(";")[0]).join("; ");

test("an invite makes an account; its own page gives a one-time code that connects a computer's mini-me", async () => {
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  try {
    const accounts = await Accounts.open(db, relay);
    const office = await relay.office();
    await assert.rejects(
      accounts.signUp("not-a-key", {
        name: "Ana",
        email: "ana@example.com",
        password: "a long password",
      }),
      /invite-wrong/,
    );
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    assert.equal(ana.person.name, "Ana");
    assert.ok(ana.cookies.length, "signed in at once");
    const cookie = cookieOf(ana.cookies);
    assert.equal((await accounts.person(cookie))?.email, "ana@example.com");
    assert.deepEqual(
      (await accounts.places(ana.person.id)).map((p) => [p.office, p.role]),
      [[office.id, "owner"]],
      "the first in an office owns it",
    );
    await assert.rejects(
      accounts.signUp(office.key, {
        name: "Ana 2",
        email: "ana@example.com",
        password: "another password",
      }),
      /account-exists/,
    );
    await assert.rejects(
      accounts.signUp(office.key, {
        name: "Ben",
        email: "ben@example.com",
        password: "short",
      }),
      /password-short/,
    );
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    assert.equal((await accounts.places(ben.person.id))[0].role, "member");
    // An office opened on someone's computer is theirs: its first account is a member of it.
    const hosted = await relay.office("hosted-office-key");
    await relay.join({
      key: hosted.key,
      card: { name: "Host", description: "" },
    });
    const guest = await accounts.signUp(hosted.key, {
      name: "Cy",
      email: "cy@example.com",
      password: "cy's long password",
    });
    assert.equal((await accounts.places(guest.person.id))[0].role, "member");

    // Ana's computer claims her code: its mini-me is hers in the office, with its own token.
    const { code } = await accounts.setupCode(ana.person.id, office.id);
    const first = await accounts.claim(code);
    assert.equal(first.name, "Ana");
    assert.equal(first.moved, false);
    assert.equal((await relay.memberByToken(first.token)).id, first.member);
    await assert.rejects(
      accounts.claim(code),
      { code: "setup-expired" },
      "a code works once",
    );
    // Another computer moves her mini-me: the old token stops working.
    const again = await accounts.claim(
      (await accounts.setupCode(ana.person.id, office.id)).code,
    );
    assert.equal(again.member, first.member);
    assert.equal(again.moved, true);
    await assert.rejects(relay.memberByToken(first.token), {
      code: "office-member-unknown",
    });
    assert.equal(
      (await relay.memberOf(office.id, ana.person.id))?.card.name,
      "Ana",
    );

    // Signing in again; signing out ends the session.
    const back = await accounts.signIn({
      email: "ben@example.com",
      password: "ben's long password",
    });
    assert.equal(back.person.name, "Ben");
    await assert.rejects(
      accounts.signIn({ email: "ben@example.com", password: "wrong password" }),
      /sign-in-wrong/,
    );
    const out = await accounts.signOut(cookieOf(back.cookies));
    assert.ok(out.length);
    assert.equal(await accounts.person(cookieOf(back.cookies)), undefined);
  } finally {
    await relay.close();
    await db.close();
  }
});

test("from the invite link to a connected computer, as a person does it: sign up, make the line, run it", async () => {
  const { createServer } = await import("node:http");
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { mkdtempSync, readFileSync, rmSync, statSync } = await import(
    "node:fs"
  );
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay);
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const home = mkdtempSync(join(tmpdir(), "minime-connect-"));
  try {
    const page = await fetch(`${base}/i/${office.key}?from=Ana`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Ana invites you[\s\S]*name="password"/);

    // A form from another site is refused.
    const forged = await fetch(`${base}/i/${office.key}`, {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=X&email=x%40example.com&password=xxxxxxxxxx",
      redirect: "manual",
    });
    assert.equal(forged.status, 403);
    // So is one a browser marks as from another site, whatever its Origin says.
    const crossSite = await fetch(`${base}/i/${office.key}`, {
      method: "POST",
      headers: {
        "sec-fetch-site": "cross-site",
        origin: "null",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "name=X&email=x%40example.com&password=xxxxxxxxxx",
      redirect: "manual",
    });
    assert.equal(crossSite.status, 403);
    // The page keeps its address from other sites, but not from its own forms.
    assert.equal(page.headers.get("referrer-policy"), "same-origin");
    // A browser posting the page's own form says so: it is let in.
    const fromPage = await fetch(`${base}/i/${office.key}`, {
      method: "POST",
      headers: {
        "sec-fetch-site": "same-origin",
        origin: base,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        name: "Cy",
        email: "cy@example.com",
        password: "a long password",
      }),
      redirect: "manual",
    });
    assert.equal(fromPage.status, 303);

    const made = await fetch(`${base}/i/${office.key}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        name: "Ben",
        email: "ben@example.com",
        password: "a long password",
      }),
      redirect: "manual",
    });
    assert.equal(made.status, 303);
    assert.equal(made.headers.get("location"), "/home");
    const cookie = cookieOf(made.headers.getSetCookie());
    const own = await (
      await fetch(`${base}/home`, { headers: { cookie } })
    ).text();
    assert.match(own, /Hi Ben[\s\S]*No computer is connected yet/);
    assert.match(
      own,
      new RegExp(`/i/${office.key}\\?from=Ben`),
      "the team's invite link",
    );

    const paired = await (
      await fetch(`${base}/home/pair`, { method: "POST", headers: { cookie } })
    ).text();
    const line = /npx -y clone-office connect (http:\/\/[^\s<]+)/.exec(paired);
    assert.ok(line, "the line to run");
    const link = line[1];
    assert.match(await (await fetch(link)).text(), /Run this on your computer/);

    // The person runs the line on their computer.
    const run = promisify(execFile);
    const env = { ...process.env, CLONE_OFFICE_HOME: home };
    const bin = join(
      import.meta.dirname,
      "..",
      "..",
      "bin",
      "clone-office.mjs",
    );
    const done = await run(
      process.execPath,
      [bin, "connect", link, "--no-start"],
      { env },
    );
    assert.match(done.stdout, /Connected: your clone is Ben/);
    const settings = JSON.parse(
      readFileSync(join(home, "settings.json"), "utf8"),
    );
    assert.equal(settings.office.relay, base);
    if (process.platform !== "win32")
      assert.equal(statSync(join(home, "settings.json")).mode & 0o777, 0o600);
    const members = await fetch(`${base}/members`, {
      headers: { authorization: `Bearer ${settings.office.token}` },
    });
    assert.equal(members.status, 200, "the computer's own token works");
    assert.match(
      await (await fetch(`${base}/home`, { headers: { cookie } })).text(),
      /Connected: Ben/,
    );
    await assert.rejects(
      run(process.execPath, [bin, "connect", link, "--no-start"], { env }),
      /used already or is more than 10 minutes old/,
    );

    // Signing out, then in.
    const out = await fetch(`${base}/logout`, {
      method: "POST",
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(out.headers.get("location"), "/login");
    const noLonger = await fetch(`${base}/home`, {
      headers: { cookie },
      redirect: "manual",
    });
    assert.equal(noLonger.headers.get("location"), "/login");
    const wrong = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=ben%40example.com&password=nope-nope-nope",
    });
    assert.equal(wrong.status, 400);
    assert.match(await wrong.text(), /The email or the password is wrong/);
    const back = await fetch(`${base}/login`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "email=ben%40example.com&password=a+long+password",
      redirect: "manual",
    });
    assert.equal(back.headers.get("location"), "/home");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("an office's owner decides who is in: removes people and keyed clones, adds owners, renames, makes a new link", async () => {
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  try {
    const accounts = await Accounts.open(db, relay);
    const office = await relay.office();
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    // Ben's computer is connected; Cy joined from an app with the key, with no account.
    const { code } = await accounts.setupCode(ben.person.id, office.id);
    const benClone = await accounts.claim(code);
    const cy = await relay.join({
      key: office.key,
      card: { name: "Cy", description: "" },
    });

    const people = await accounts.people(office.id);
    assert.deepEqual(
      people.map((one) => [one.name, one.role, Boolean(one.clone)]),
      [
        ["Ana", "owner", false],
        ["Ben", "member", true],
      ],
    );
    assert.deepEqual(
      (await accounts.keyedClones(office.id)).map((clone) => clone.name),
      ["Cy"],
    );

    // Only an owner changes the office.
    await assert.rejects(
      accounts.removePerson(ben.person.id, office.id, ana.person.id),
      /not-owner/,
    );
    await assert.rejects(
      accounts.newInvite(ben.person.id, office.id),
      /not-owner/,
    );
    await assert.rejects(
      accounts.removePerson(ana.person.id, office.id, ana.person.id),
      /not-yourself/,
    );

    await accounts.renameOffice(ana.person.id, office.id, "  Acme  ");
    assert.equal((await accounts.places(ana.person.id))[0].name, "Acme");

    // A new link: the old key no longer lets anyone in; those in stay in.
    const key = await accounts.newInvite(ana.person.id, office.id);
    assert.notEqual(key, office.key);
    await assert.rejects(
      relay.join({ key: office.key, card: { name: "Dee", description: "" } }),
      /office-key-wrong|key/i,
    );
    assert.equal((await relay.members(office.id)).length, 2);

    // Removing someone ends their clone's place at once; a keyed clone can be removed too.
    await accounts.removePerson(ana.person.id, office.id, ben.person.id);
    assert.deepEqual(
      (await accounts.people(office.id)).map((one) => one.name),
      ["Ana"],
    );
    assert.ok(
      !(await relay.members(office.id)).some((m) => m.id === benClone.member),
      "Ben's clone is out",
    );
    await accounts.removeClone(ana.person.id, office.id, cy.id);
    assert.equal((await relay.members(office.id)).length, 0);
    await assert.rejects(
      accounts.setupCode(ben.person.id, office.id),
      /not-in-office/,
    );
  } finally {
    await db.close();
  }
});

const GOOGLE = {
  clientId: "1234-abcd.apps.googleusercontent.com",
  secret: "GOCSPX-a-test-client-secret",
};

/** A Google identity on an account, as connecting Google from one's page leaves it. */
async function googleOn(
  db: Awaited<ReturnType<typeof openDatabase>>,
  user: string,
) {
  await db.query(
    'INSERT INTO auth_accounts (id, "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ($1, $2, \'google\', $3, now(), now())',
    [`g-${user}`, `google-${user}`, user],
  );
}

test("the server's admin sets how people sign in: Google's secret sealed, one way always on, nobody else", async () => {
  const { keyFrom, newKeyText, isSealed } = await import("../../lib/seal.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const sealKey = keyFrom(newKeyText());
  try {
    const accounts = await Accounts.open(db, relay, { sealKey });
    const office = await relay.office();
    const [secretRow] = await db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'auth-secret'",
    );
    assert.ok(isSealed(secretRow.value), "the session secret is sealed");
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    assert.equal(await accounts.isAdmin(ana.person.id), true);
    assert.equal(await accounts.isAdmin(ben.person.id), false);
    // An owner of another office on the server is not its admin.
    const other = await relay.office("another-office-key");
    const cy = await accounts.signUp(other.key, {
      name: "Cy",
      email: "cy@example.com",
      password: "cy's long password",
    });
    assert.equal((await accounts.places(cy.person.id))[0].role, "owner");
    assert.equal(await accounts.isAdmin(cy.person.id), false);
    const site = "http://localhost:3200";
    await assert.rejects(
      accounts.saveGoogle(ben.person.id, { ...GOOGLE, site, by: "Ben" }),
      /not-admin/,
    );
    await assert.rejects(
      accounts.saveGoogle(cy.person.id, { ...GOOGLE, site, by: "Cy" }),
      /not-admin/,
    );
    assert.deepEqual(accounts.methods(), { password: true, google: false });
    // Nobody is left without a way in.
    await assert.rejects(
      accounts.setPassword(ana.person.id, false),
      /google-first/,
    );
    await assert.rejects(
      accounts.saveGoogle(ana.person.id, {
        clientId: "not-a-client",
        secret: GOOGLE.secret,
        site,
        by: "Ana",
      }),
      /google-id-wrong/,
    );
    await assert.rejects(
      accounts.saveGoogle(ana.person.id, {
        clientId: GOOGLE.clientId,
        secret: "",
        site,
        by: "Ana",
      }),
      /google-secret-missing/,
    );
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: `${site}/home/admin`,
      by: "Ana",
    });
    assert.deepEqual(accounts.methods(), { password: true, google: true });
    const [kept] = await db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'sign-in'",
    );
    assert.ok(!kept.value.includes(GOOGLE.secret), "never kept in the clear");
    assert.ok(isSealed(JSON.parse(kept.value).google.secret));
    const settings = await accounts.settings(ana.person.id);
    assert.equal(settings.google?.site, site, "the server's address alone");
    assert.equal(settings.google?.readable, true);
    assert.equal(settings.passwordOnly, 3);
    assert.equal(JSON.stringify(settings).includes(GOOGLE.secret), false);
    await assert.rejects(accounts.settings(ben.person.id), /not-admin/);
    // Saving the same client again with no secret keeps the one kept.
    await accounts.saveGoogle(ana.person.id, {
      clientId: GOOGLE.clientId,
      secret: "",
      site,
      by: "Ana",
    });
    assert.equal(accounts.methods().google, true);

    // Off to Google, the way back bound by a cookie.
    const started = await accounts.googleStart({
      back: "/home",
      failed: "/login",
      signUp: false,
    });
    const at = new URL(started.url);
    assert.equal(at.origin, "https://accounts.google.com");
    assert.equal(at.searchParams.get("client_id"), GOOGLE.clientId);
    assert.equal(
      at.searchParams.get("redirect_uri"),
      `${site}/api/auth/callback/google`,
    );
    assert.ok(at.searchParams.get("state"));
    assert.ok(started.cookies.some((c) => c.includes("state=")));

    // The admin turns passwords off only once they sign in with Google themselves.
    await assert.rejects(
      accounts.setPassword(ana.person.id, false),
      /link-google-first/,
    );
    await googleOn(db, ana.person.id);
    assert.deepEqual(await accounts.ways(ana.person.id), {
      password: true,
      google: true,
    });
    await accounts.setPassword(ana.person.id, false);
    assert.deepEqual(accounts.methods(), { password: false, google: true });
    await assert.rejects(
      accounts.signIn({
        email: "ben@example.com",
        password: "ben's long password",
      }),
      /password-off/,
    );
    await assert.rejects(
      accounts.signUp(office.key, {
        name: "Dee",
        email: "dee@example.com",
        password: "a long password",
      }),
      /password-off/,
    );
    await assert.rejects(
      accounts.setGoogle(ana.person.id, false),
      /password-first/,
    );
    await assert.rejects(
      accounts.removeGoogle(ana.person.id),
      /password-first/,
    );

    // Another of the server's processes reads the change.
    const elsewhere = await Accounts.open(db, relay, { sealKey });
    assert.deepEqual(elsewhere.methods(), { password: false, google: true });
    await accounts.setPassword(ana.person.id, true);
    await elsewhere.refresh();
    assert.deepEqual(elsewhere.methods(), { password: true, google: true });

    await accounts.setGoogle(ana.person.id, false);
    assert.equal(accounts.methods().google, false);
    await assert.rejects(
      accounts.googleStart({ back: "/home", failed: "/login", signUp: false }),
      /google-off/,
    );
    await accounts.setGoogle(ana.person.id, true);
    await accounts.removeGoogle(ana.person.id);
    assert.deepEqual(accounts.methods(), { password: true, google: false });
    assert.equal((await accounts.settings(ana.person.id)).google, undefined);

    // Sealed, the relay needs its key to start.
    await assert.rejects(Accounts.open(db, relay), /sign-in secret is sealed/);
  } finally {
    await relay.close();
    await db.close();
  }
});

test("without a key to seal it with, no Google secret is kept", async () => {
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  try {
    const accounts = await Accounts.open(db, relay);
    const office = await relay.office();
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    await assert.rejects(
      accounts.saveGoogle(ana.person.id, {
        ...GOOGLE,
        site: "http://localhost:3200",
        by: "Ana",
      }),
      /sealing-off/,
    );
    assert.equal((await accounts.settings(ana.person.id)).sealing, false);
  } finally {
    await relay.close();
    await db.close();
  }
});

test("a sign-in secret kept plain is sealed in place, and one another key sealed gives way to a new one", async () => {
  const { keyFrom, newKeyText, isSealed } = await import("../../lib/seal.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  try {
    await db.query(
      "INSERT INTO server_settings (name, value) VALUES ('auth-secret', 'a-plain-secret-from-before-sealing')",
    );
    const first = keyFrom(newKeyText());
    const accounts = await Accounts.open(db, relay, { sealKey: first });
    const office = await relay.office();
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const [sealed] = await db.query<{ value: string }>(
      "SELECT value FROM server_settings WHERE name = 'auth-secret'",
    );
    assert.ok(isSealed(sealed.value));
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: "http://localhost:3200",
      by: "Ana",
    });
    // The same secret opens again: a session made before still signs in.
    const again = await Accounts.open(db, relay, { sealKey: first });
    assert.equal(
      (await again.person(cookieOf(ana.cookies)))?.email,
      "ana@example.com",
    );
    // Another key opens neither: Google stays off, sessions start again.
    const warned = console.warn;
    console.warn = () => {};
    const other = await Accounts.open(db, relay, {
      sealKey: keyFrom(newKeyText()),
    }).finally(() => {
      console.warn = warned;
    });
    assert.equal(other.methods().google, false);
    assert.equal((await other.settings(ana.person.id)).google?.readable, false);
    assert.equal(await other.person(cookieOf(ana.cookies)), undefined);
  } finally {
    await relay.close();
    await db.close();
  }
});

test("the pages offer Google where it is on, start it only from their own pages, and say why it failed", async () => {
  const { createServer } = await import("node:http");
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay, {
    sealKey: keyFrom(newKeyText()),
  });
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const form = (fields: Record<string, string>, cookie = "") => ({
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields),
    redirect: "manual" as const,
  });
  try {
    assert.doesNotMatch(
      await (await fetch(`${base}/login`)).text(),
      /class="google"/,
    );
    const made = await fetch(
      `${base}/i/${office.key}`,
      form({
        name: "Ana",
        email: "ana@example.com",
        password: "a long password",
      }),
    );
    const ana = cookieOf(made.headers.getSetCookie());
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });

    // Only the admin sees and changes the settings.
    assert.match(
      await (await fetch(`${base}/home`, { headers: { cookie: ana } })).text(),
      /href="\/home\/admin"/,
    );
    const notAdmin = await fetch(`${base}/home/admin`, {
      headers: { cookie: cookieOf(ben.cookies) },
      redirect: "manual",
    });
    assert.equal(notAdmin.headers.get("location"), "/home");
    const page = await (
      await fetch(`${base}/home/admin`, { headers: { cookie: ana } })
    ).text();
    assert.match(page, /Sign-in settings/);
    assert.match(page, new RegExp(`${base}/api/auth/callback/google`));
    const saved = await fetch(`${base}/home/admin/google`, form(GOOGLE, ana));
    assert.equal(saved.headers.get("location"), "/home/admin?done=saved");
    const after = await (
      await fetch(`${base}/home/admin?done=saved`, { headers: { cookie: ana } })
    ).text();
    assert.match(after, /Saved\./);
    assert.ok(!after.includes(GOOGLE.secret), "the secret is never shown");
    assert.match(after, new RegExp(GOOGLE.clientId));
    const forged = await fetch(`${base}/home/admin/google/off`, {
      method: "POST",
      headers: { cookie: ana, "sec-fetch-site": "cross-site" },
      redirect: "manual",
    });
    assert.equal(forged.status, 403);

    // Google offered on the sign-in and invite pages.
    const login = await (await fetch(`${base}/login`)).text();
    assert.match(login, /href="\/login\/google"[\s\S]*Continue with Google/);
    assert.match(
      await (await fetch(`${base}/i/${office.key}?from=Ana`)).text(),
      new RegExp(`href="/i/${office.key}/google\\?from=Ana"`),
    );
    // Started only from the server's own pages, and bound to the browser that started it.
    const crossSite = await fetch(`${base}/login/google`, {
      headers: { "sec-fetch-site": "cross-site" },
      redirect: "manual",
    });
    assert.equal(crossSite.status, 403);
    const off = await fetch(`${base}/i/${office.key}/google`, {
      headers: { "sec-fetch-site": "same-origin" },
      redirect: "manual",
    });
    assert.equal(off.status, 303);
    const google = new URL(off.headers.get("location") ?? "");
    assert.equal(google.origin, "https://accounts.google.com");
    assert.equal(google.searchParams.get("client_id"), GOOGLE.clientId);
    assert.ok(off.headers.getSetCookie().some((c) => /state=/.test(c)));
    const noSuch = await fetch(`${base}/i/no-such-office/google`, {
      headers: { "sec-fetch-site": "same-origin" },
      redirect: "manual",
    });
    assert.equal(noSuch.status, 404);
    // A way back that was not started here is turned away, and said so.
    const stray = await fetch(
      `${base}/api/auth/callback/google?code=x&state=not-ours`,
      { redirect: "manual" },
    );
    assert.equal(stray.status, 302);
    assert.match(stray.headers.get("location") ?? "", /^\/login\?error=/);
    // Google's refusals read in the person's words.
    assert.match(
      await (await fetch(`${base}/login?error=account_not_linked`)).text(),
      /signs in with its password/,
    );
    assert.match(
      await (
        await fetch(`${base}/login?error=signup_disabled`, {
          headers: { "accept-language": "ko" },
        })
      ).text(),
      /그 Google 계정으로 만든 계정이 아직 없어요/,
    );
    assert.match(
      await (await fetch(`${base}/login?error=%3Cscript%3E`)).text(),
      /^(?![\s\S]*<script>)/,
    );

    // With Google on and connected, the admin turns passwords off: the pages offer Google alone.
    await googleOn(db, (await accounts.person(ana))?.id ?? "");
    const turned = await fetch(
      `${base}/home/admin/password/off`,
      form({}, ana),
    );
    assert.equal(turned.headers.get("location"), "/home/admin?done=saved");
    const googleOnly = await (await fetch(`${base}/login`)).text();
    assert.match(googleOnly, /Continue with Google/);
    assert.doesNotMatch(googleOnly, /name="password"/);
    const refused = await fetch(
      `${base}/login`,
      form({ email: "ben@example.com", password: "ben's long password" }),
    );
    assert.match(
      await refused.text(),
      /Signing in with a password is turned off/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  }
});

test("with Google, as people do it: an invite makes an account, a password's account connects it from its page, and nobody takes one by its email", async () => {
  const { createServer } = await import("node:http");
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay, {
    sealKey: keyFrom(newKeyText()),
  });
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  // Google's side: the code exchanged for who signed in there, as its token endpoint answers.
  const people: Record<
    string,
    { sub: string; email: string; name: string; unchecked?: boolean }
  > = {
    dee: { sub: "g-dee", email: "dee@example.com", name: "Dee" },
    ben: { sub: "g-ben", email: "ben@example.com", name: "Ben" },
    eve: { sub: "g-eve", email: "eve@example.com", name: "Eve" },
    other: { sub: "g-other", email: "someone@example.com", name: "Other" },
    fay: {
      sub: "g-fay",
      email: "fay@example.com",
      name: "Fay",
      unchecked: true,
    },
  };
  const part = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.startsWith("https://oauth2.googleapis.com/token"))
      return realFetch(input, init);
    const code = new URLSearchParams(String(init?.body ?? "")).get("code");
    const who = people[code ?? ""];
    if (!who) return Response.json({ error: "invalid_grant" }, { status: 400 });
    const now = Math.floor(Date.now() / 1000);
    return Response.json({
      access_token: `access-${who.sub}`,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "openid email profile",
      id_token: `${part({ alg: "RS256", typ: "JWT" })}.${part({
        iss: "https://accounts.google.com",
        aud: GOOGLE.clientId,
        sub: who.sub,
        email: who.email,
        email_verified: !who.unchecked,
        name: who.name,
        iat: now,
        exp: now + 3600,
      })}.signature`,
    });
  }) as typeof fetch;
  const same = { "sec-fetch-site": "same-origin" };
  /** Through Google and back: where the browser lands, and its cookie after. */
  const through = async (start: string, code: string, cookie = "") => {
    const off = await fetch(`${base}${start}`, {
      headers: { ...same, ...(cookie ? { cookie } : {}) },
      redirect: "manual",
    });
    assert.equal(off.status, 303, `${start} goes to Google`);
    const state = new URL(off.headers.get("location") ?? "").searchParams.get(
      "state",
    );
    const bound = [cookie, cookieOf(off.headers.getSetCookie())]
      .filter(Boolean)
      .join("; ");
    const back = await fetch(
      `${base}/api/auth/callback/google?code=${code}&state=${state}`,
      { headers: { cookie: bound }, redirect: "manual" },
    );
    const set = cookieOf(back.headers.getSetCookie());
    return {
      to: back.headers.get("location") ?? "",
      cookie: [bound, set].filter(Boolean).join("; "),
    };
  };
  try {
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: base,
      by: "Ana",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });

    // Dee makes her account from the invite with Google, and lands in the office.
    const dee = await through(`/i/${office.key}/google?from=Ana`, "dee");
    assert.equal(dee.to, `/i/${office.key}?from=Ana`);
    const landed = await fetch(`${base}${dee.to}`, {
      headers: { cookie: dee.cookie },
      redirect: "manual",
    });
    assert.equal(landed.headers.get("location"), "/home");
    const deePerson = await accounts.person(dee.cookie);
    assert.equal(deePerson?.email, "dee@example.com");
    assert.deepEqual(
      (await accounts.places(deePerson?.id ?? "")).map((p) => p.role),
      ["member"],
    );
    assert.deepEqual(await accounts.ways(deePerson?.id ?? ""), {
      password: false,
      google: true,
    });
    const tokens = await db.query<{ accessToken: string | null }>(
      'SELECT "accessToken" FROM auth_accounts WHERE "providerId" = \'google\'',
    );
    assert.ok(
      tokens.every((row) => !row.accessToken?.includes("access-g-")),
      "Google's tokens are kept encrypted",
    );
    // She signs in again with Google from the sign-in page.
    const again = await through("/login/google", "dee");
    assert.equal(again.to, "/home");

    // Ben's Google account carries his email, but his account signs in with a password: it is not
    // taken by Google's word for the email alone.
    const taken = await through(`/i/${office.key}/google`, "ben");
    assert.match(taken.to, /^\/i\/[\w-]+\?error=account_not_linked/);
    assert.match(
      await (await fetch(`${base}${taken.to}`)).text(),
      /signs in with its password/,
    );
    // An email Google has not checked makes no account, even from an invite.
    const unchecked = await through(`/i/${office.key}/google`, "fay");
    assert.match(unchecked.to, /error=/);
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM auth_users WHERE email = 'fay@example.com'",
        )
      ).length,
      0,
    );
    // From the sign-in page, a Google account with no account here makes none.
    const nobody = await through("/login/google", "eve");
    assert.equal(nobody.to, "/login?error=signup_disabled");
    assert.equal(
      (
        await db.query(
          "SELECT 1 FROM auth_users WHERE email = 'eve@example.com'",
        )
      ).length,
      0,
    );
    // Signed in with his password, Ben connects his own Google account from his page...
    const benCookie = cookieOf(ben.cookies);
    const other = await through("/home/google", "other", benCookie);
    assert.match(other.to, /^\/home\?error=/, "not another email's");
    const linked = await through("/home/google", "ben", benCookie);
    assert.equal(linked.to, "/home");
    assert.deepEqual(await accounts.ways(ben.person.id), {
      password: true,
      google: true,
    });
    // ...and then signs in with it.
    const viaGoogle = await through("/login/google", "ben");
    assert.equal(viaGoogle.to, "/home");
    assert.equal((await accounts.person(viaGoogle.cookie))?.id, ben.person.id);
    assert.match(
      await (
        await fetch(`${base}/home`, { headers: { cookie: viaGoogle.cookie } })
      ).text(),
      /How you sign in[\s\S]*Email and password[\s\S]*Google[\s\S]*Connected/,
    );
  } finally {
    globalThis.fetch = realFetch;
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  }
});

test("nobody is locked out: a way that cannot work leaves passwords on, and the operator can force them", async () => {
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const sealKey = keyFrom(newKeyText());
  try {
    const accounts = await Accounts.open(db, relay, { sealKey });
    const office = await relay.office();
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: "http://localhost:3200",
      by: "Ana",
    });
    await googleOn(db, ana.person.id);
    await accounts.setPassword(ana.person.id, false);
    assert.deepEqual(accounts.methods(), { password: false, google: true });
    // Ben signed in only with a password: his session ends with it.
    assert.equal(await accounts.person(cookieOf(ben.cookies)), undefined);
    assert.ok(
      await accounts.person(cookieOf(ana.cookies)),
      "the admin stays in",
    );
    // The Google client cannot change while passwords are off.
    await assert.rejects(
      accounts.saveGoogle(ana.person.id, {
        ...GOOGLE,
        site: "http://localhost:3200",
        by: "Ana",
      }),
      /password-first/,
    );
    // The operator says passwords stay on, whatever the settings.
    process.env.RELAY_PASSWORD_SIGNIN = "1";
    try {
      assert.equal(accounts.methods().password, true);
    } finally {
      delete process.env.RELAY_PASSWORD_SIGNIN;
    }
    // The key changes: Google can no longer be opened, so passwords come back on.
    const warned = console.warn;
    console.warn = () => {};
    const after = await Accounts.open(db, relay, {
      sealKey: keyFrom(newKeyText()),
    }).finally(() => {
      console.warn = warned;
    });
    assert.deepEqual(after.methods(), {
      password: true,
      google: false,
      adminsOnly: true,
    });
    const back = await after.signIn({
      email: "ana@example.com",
      password: "a long password",
    });
    assert.ok(back.cookies.length, "the admin signs in with the password");
    // ...the admin alone, to mend Google: passwords stay off for everyone else.
    assert.equal(after.methods().adminsOnly, true);
    await assert.rejects(
      after.signIn({
        email: "ben@example.com",
        password: "ben's long password",
      }),
      /password-off/,
    );
    const [{ n: sessions }] = await db.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM auth_sessions WHERE "userId" = $1',
      [ben.person.id],
    );
    assert.equal(sessions, 0, "refused, Ben's password leaves no session");
    // A wrong password answers alike for the admin and anyone else: it never tells who the admin is.
    for (const email of [
      "ana@example.com",
      "ben@example.com",
      "nobody@example.com",
    ])
      await assert.rejects(
        after.signIn({ email, password: "not the password" }),
        /sign-in-wrong/,
        email,
      );
    await assert.rejects(
      after.signUp(office.key, {
        name: "Dee",
        email: "dee@example.com",
        password: "a long password",
      }),
      /password-off/,
    );
    assert.equal(
      (await after.settings(ana.person.id)).password,
      true,
      "said on the admin's page as it is",
    );
    // Mending Google turns passwords back on for everyone, and the admin is told.
    const mended = await after.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: "http://localhost:3200",
      by: "Ana",
    });
    assert.equal(mended.passwordBack, true);
    assert.deepEqual(after.methods(), { password: true, google: true });
  } finally {
    await relay.close();
    await db.close();
  }
});

test("a forgotten password, a removed account, another office's invite and odd addresses, as the pages handle them", async () => {
  const { createServer, request: send } = await import("node:http");
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay, {
    sealKey: keyFrom(newKeyText()),
  });
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const form = (fields: Record<string, string>, cookie = "") => ({
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
      ...(cookie ? { cookie } : {}),
    },
    body: new URLSearchParams(fields),
    redirect: "manual" as const,
  });
  try {
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const admin = cookieOf(ana.cookies);
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });

    // A code the pages do not know reads as a general failure, never a broken page.
    for (const odd of ["constructor", "__proto__", "toString"]) {
      const page = await fetch(`${base}/login?error=${odd}`);
      assert.equal(page.status, 200, odd);
    }

    // The admin makes Ben a reset link; it works once, and ends his sessions.
    const ask = await fetch(`${base}/home/admin/reset?user=${ben.person.id}`, {
      headers: { cookie: admin },
    });
    assert.match(await ask.text(), /Make a password reset link for Ben\?/);
    const made = await (
      await fetch(
        `${base}/home/admin/reset`,
        form({ user: ben.person.id }, admin),
      )
    ).text();
    const link = /(http:\/\/[^\s<]+\/reset\?token=[\w-]+)/.exec(made)?.[1];
    assert.ok(link, "the link to hand on");
    assert.match(await (await fetch(link)).text(), /A new password for Ben/);
    const told = await (
      await fetch(`${base}/home`, {
        headers: { cookie: cookieOf(ben.cookies) },
      })
    ).text();
    assert.match(
      told,
      /Ana made a link to reset your password\. It works once, for 60 more minutes/,
    );
    assert.match(
      told,
      /action="\/home\/reset\/stop"/,
      "with the way to stop it",
    );
    await assert.rejects(
      accounts.resetLink(ana.person.id, ana.person.id),
      /owner-reset/,
    );
    const token = new URL(link).searchParams.get("token") ?? "";
    const short = await fetch(
      `${base}/reset`,
      form({ token, password: "short" }),
    );
    assert.equal(short.status, 400);
    const changed = await fetch(
      `${base}/reset`,
      form({ token, password: "ben's new password" }),
    );
    assert.equal(changed.headers.get("location"), "/login?done=reset");
    assert.match(
      await (await fetch(`${base}/login?done=reset`)).text(),
      /Your password is changed/,
    );
    assert.equal(await accounts.person(cookieOf(ben.cookies)), undefined);
    await assert.rejects(
      accounts.signIn({
        email: "ben@example.com",
        password: "ben's long password",
      }),
      /sign-in-wrong/,
    );
    const benAfter = await accounts.signIn({
      email: "ben@example.com",
      password: "ben's new password",
    });
    assert.doesNotMatch(
      await (
        await fetch(`${base}/home`, {
          headers: { cookie: cookieOf(benAfter.cookies) },
        })
      ).text(),
      /reset your password/,
      "a link one used oneself is not told again",
    );
    const again = await fetch(
      `${base}/reset`,
      form({ token, password: "yet another password" }),
    );
    assert.match(await again.text(), /no longer works/);
    const reopened = await fetch(link);
    assert.equal(reopened.status, 410, "a used link says so as it opens");
    const dead = await reopened.text();
    assert.doesNotMatch(dead, /name="password"/);
    assert.match(dead, /<h1>This link no longer works<\/h1>/);

    // A link Ben did not ask for, he stops: it no longer works.
    const linkOf = async () =>
      /(http:\/\/[^\s<]+\/reset\?token=[\w-]+)/.exec(
        await (
          await fetch(
            `${base}/home/admin/reset`,
            form({ user: ben.person.id }, admin),
          )
        ).text(),
      )?.[1] ?? "";
    const unasked = await linkOf();
    const benCookie = cookieOf(benAfter.cookies);
    const stopped = await fetch(`${base}/home/reset/stop`, form({}, benCookie));
    assert.equal(stopped.headers.get("location"), "/home?done=stopped");
    assert.equal((await fetch(unasked)).status, 410);
    const late = await fetch(
      `${base}/reset`,
      form({
        token: new URL(unasked).searchParams.get("token") ?? "",
        password: "someone else's password",
      }),
    );
    assert.match(await late.text(), /no longer works/);
    const benPage = await (
      await fetch(`${base}/home?done=stopped`, {
        headers: { cookie: benCookie },
      })
    ).text();
    assert.match(
      benPage,
      /Stopped\. That link can no longer change your password/,
    );
    assert.match(
      benPage,
      /Ana made a link to reset your password\. You stopped it/,
    );
    // A stop from another site is refused.
    const forged = await fetch(`${base}/home/reset/stop`, {
      ...form({}, benCookie),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "cross-site",
        cookie: benCookie,
      },
    });
    assert.equal(forged.status, 403);

    // A link is checked again when used: Ben, since become another office's owner, is not the
    // admin's to reset any more, and the link dies.
    const later = await linkOf();
    const third = await relay.office("third-office-key");
    await accounts.signIn(
      { email: "ben@example.com", password: "ben's new password" },
      third.key,
    );
    assert.equal(
      (await accounts.places(ben.person.id)).find(
        (one) => one.key === third.key,
      )?.role,
      "owner",
    );
    assert.equal((await fetch(later)).status, 410, "said as it opens");
    const taken = await fetch(
      `${base}/reset`,
      form({
        token: new URL(later).searchParams.get("token") ?? "",
        password: "the admin's choice",
      }),
    );
    assert.match(await taken.text(), /no longer works/);
    await accounts.signIn({
      email: "ben@example.com",
      password: "ben's new password",
    });
    // Out of that office again for what follows.
    await db.query("DELETE FROM office_people WHERE office_id = $1", [
      third.id,
    ]);
    // Only the admin makes links, and only for others.
    await assert.rejects(
      accounts.resetLink(ben.person.id, ana.person.id),
      /not-admin/,
    );

    // Someone in another office opening this one's invite is asked before joining.
    const other = await relay.office("other-office-key");
    const cy = await accounts.signUp(other.key, {
      name: "Cy",
      email: "cy@example.com",
      password: "cy's long password",
    });
    const cyCookie = cookieOf(cy.cookies);
    const asked = await fetch(`${base}/i/${office.key}`, {
      headers: { cookie: cyCookie },
      redirect: "manual",
    });
    assert.equal(asked.status, 200);
    assert.match(await asked.text(), /Join this office too\?/);
    assert.equal((await accounts.places(cy.person.id)).length, 1);
    const joined = await fetch(
      `${base}/i/${office.key}/join`,
      form({}, cyCookie),
    );
    assert.match(
      joined.headers.get("location") ?? "",
      /^\/home\?office=o-/,
      "on to the office just joined",
    );
    assert.match(
      await (
        await fetch(`${base}${joined.headers.get("location")}`, {
          headers: { cookie: cyCookie },
        })
      ).text(),
      /Your offices[\s\S]*aria-current="page"/,
    );
    assert.equal((await accounts.places(cy.person.id)).length, 2);
    // Signed in, the sign-in page goes on to one's page.
    const signedIn = await fetch(`${base}/login`, {
      headers: { cookie: cyCookie },
      redirect: "manual",
    });
    assert.equal(signedIn.headers.get("location"), "/home");

    // The admin removes Ben's account (a member, not anyone's only owner): no way back in.
    const benNow = await accounts.signIn({
      email: "ben@example.com",
      password: "ben's new password",
    });
    const removed = await fetch(
      `${base}/home/admin/account/remove`,
      form({ user: ben.person.id }, admin),
    );
    assert.equal(removed.headers.get("location"), "/home/admin?done=saved");
    assert.equal((await accounts.places(ben.person.id)).length, 0);
    assert.equal(await accounts.person(cookieOf(benNow.cookies)), undefined);
    await assert.rejects(
      accounts.signIn({
        email: "ben@example.com",
        password: "ben's new password",
      }),
      /sign-in-wrong/,
    );
    // Cy, in an office the admin does not own, is that office's to look after.
    const kept = await fetch(
      `${base}/home/admin/account/remove`,
      form({ user: cy.person.id }, admin),
    );
    assert.equal(kept.headers.get("location"), "/home/admin?error=not-yours");
    await assert.rejects(
      accounts.resetLink(ana.person.id, cy.person.id),
      /not-yours/,
    );
    assert.ok(
      !(await accounts.serverPeople(ana.person.id)).some(
        (one) => one.id === cy.person.id,
      ),
      "nor listed for the admin",
    );

    // A wrong Google client comes back as typed, with what was wrong under it, at its section
    // (and a reload does not send the form again).
    const wrong = await fetch(
      `${base}/home/admin/google`,
      form({ clientId: "my-client", secret: "x" }, admin),
    );
    assert.equal(
      wrong.headers.get("location"),
      "/home/admin?google=google-id-wrong&client=my-client#google",
    );
    const wrongPage = await (
      await fetch(
        `${base}/home/admin?google=google-id-wrong&client=my-client`,
        {
          headers: { cookie: admin },
        },
      )
    ).text();
    assert.match(wrongPage, /value="my-client"/);
    assert.match(wrongPage, /aria-invalid="true"/);
    assert.match(wrongPage, /not a Google client ID/);

    // Google's way back answers only as itself, whatever the request's host claims.
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: base,
      by: "Ana",
    });
    const tricked = await new Promise<{ status: number; body: string }>(
      (resolve, reject) => {
        const call = send(
          {
            host: "127.0.0.1",
            port,
            path: "/api/auth/callback/google",
            headers: {
              host: "h/api/auth/list-sessions?",
              cookie: admin,
            },
          },
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
        call.on("error", reject);
        call.end();
      },
    );
    assert.notEqual(tricked.status, 200);
    assert.doesNotMatch(tricked.body, /token/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  }
});

test("sign-in's edges: Google starts at its own address, an invite asks unless this browser came to join, the last owner stays, the operator's word keeps sessions", async () => {
  const { createServer } = await import("node:http");
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay, {
    sealKey: keyFrom(newKeyText()),
  });
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: base,
      by: "Ana",
    });
    // Reached at another address of the same server, Google starts at the one it was set up at:
    // the same page there, as a start sent on from elsewhere would come from another site.
    const elsewhere = await fetch(
      `http://localhost:${port}/i/${office.key}/google?from=Ana`,
      { headers: { "sec-fetch-site": "same-origin" }, redirect: "manual" },
    );
    assert.equal(
      elsewhere.headers.get("location"),
      `${base}/i/${office.key}?from=Ana&account#account`,
    );
    for (const [from, to] of [
      ["/login/google?key=abcd", "/login?key=abcd"],
      ["/home/google", "/home"],
    ]) {
      const moved = await fetch(`http://localhost:${port}${from}`, {
        headers: { "sec-fetch-site": "same-origin" },
        redirect: "manual",
      });
      assert.equal(moved.headers.get("location"), `${base}${to}`, from);
    }
    // Connecting Google signed out goes to the sign-in page.
    const out = await fetch(`${base}/home/google`, {
      headers: { "sec-fetch-site": "same-origin" },
      redirect: "manual",
    });
    assert.equal(out.headers.get("location"), "/login");
    // A start from the invite marks the browser as come to join that office.
    const start = await fetch(`${base}/i/${office.key}/google`, {
      headers: { "sec-fetch-site": "same-origin" },
      redirect: "manual",
    });
    assert.ok(
      start.headers
        .getSetCookie()
        .some((c) => c.startsWith(`sub-office.join=${office.key};`)),
    );

    // Someone in no office (removed from theirs) who opens an invite is asked, not put in.
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    await accounts.removePerson(ana.person.id, office.id, ben.person.id);
    const benCookie = cookieOf(ben.cookies);
    const asked = await fetch(`${base}/i/${office.key}`, {
      headers: { cookie: benCookie },
      redirect: "manual",
    });
    assert.equal(asked.status, 200);
    const question = await asked.text();
    assert.match(question, /Join this office too\?/);
    assert.equal((await accounts.places(ben.person.id)).length, 0);
    // Not Ben? Signing out goes on to the invite, to make one's own account there; never elsewhere.
    assert.match(
      question,
      new RegExp(`name="next" value="/i/${office.key}\\?account"`),
    );
    const post = (fields: Record<string, string>, cookie: string) => ({
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "sec-fetch-site": "same-origin",
        cookie,
      },
      body: new URLSearchParams(fields),
      redirect: "manual" as const,
    });
    const other1 = await accounts.signIn({
      email: "ben@example.com",
      password: "ben's long password",
    });
    const onward = await fetch(
      `${base}/logout`,
      post({ next: `/i/${office.key}?account` }, cookieOf(other1.cookies)),
    );
    assert.equal(
      onward.headers.get("location"),
      `/i/${office.key}?account#account`,
    );
    assert.equal(await accounts.person(cookieOf(other1.cookies)), undefined);
    for (const next of [
      "//elsewhere.example/i/abcd?account",
      "https://elsewhere.example",
      "/home/admin",
    ]) {
      const other2 = await accounts.signIn({
        email: "ben@example.com",
        password: "ben's long password",
      });
      const plain = await fetch(
        `${base}/logout`,
        post({ next }, cookieOf(other2.cookies)),
      );
      assert.equal(plain.headers.get("location"), "/login", next);
    }
    // With the mark, as after a sign-up through that invite, it lands in the office.
    const landed = await fetch(`${base}/i/${office.key}`, {
      headers: { cookie: `${benCookie}; sub-office.join=${office.key}` },
      redirect: "manual",
    });
    assert.equal(landed.headers.get("location"), "/home");
    assert.ok(
      landed.headers.getSetCookie().some((c) => /sub-office\.join=;/.test(c)),
      "the mark goes once used",
    );
    assert.equal((await accounts.places(ben.person.id)).length, 1);

    // An office's only owner is not removed with their account.
    const other = await relay.office("other-office-key");
    const cy = await accounts.signUp(other.key, {
      name: "Cy",
      email: "cy@example.com",
      password: "cy's long password",
    });
    await assert.rejects(
      accounts.removeAccount(ana.person.id, cy.person.id),
      /not-yours/,
    );

    // The operator keeps passwords on: turning them off on the page signs nobody out.
    await googleOn(db, ana.person.id);
    process.env.RELAY_PASSWORD_SIGNIN = "1";
    try {
      await accounts.setPassword(ana.person.id, false);
      assert.ok(await accounts.person(benCookie), "Ben stays signed in");
    } finally {
      delete process.env.RELAY_PASSWORD_SIGNIN;
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  }
});

test("the admin's pages say what a change would do before it fails, and an invite link is safe to paste into a shell", async () => {
  const { createServer } = await import("node:http");
  const { keyFrom, newKeyText } = await import("../../lib/seal.ts");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const accounts = await Accounts.open(db, relay, {
    sealKey: keyFrom(newKeyText()),
  });
  const office = await relay.office();
  const server = createServer(relayHandler(relay, { accounts }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "a long password",
    });
    const admin = cookieOf(ana.cookies);
    await accounts.saveGoogle(ana.person.id, {
      ...GOOGLE,
      site: base,
      by: "Ana",
    });
    // Passwords off while the admin has no Google of their own would lock them out: the page says
    // so with the way to connect it, and offers no button that would fail.
    const blocked = await (
      await fetch(`${base}/home/admin/password/off`, {
        headers: { cookie: admin },
      })
    ).text();
    assert.match(blocked, /Connect your own Google account first/);
    assert.match(blocked, /href="\/home\/google"/);
    assert.doesNotMatch(
      blocked,
      /<form method="post" action="\/home\/admin\/password\/off"/,
    );
    await googleOn(db, ana.person.id);
    const open = await (
      await fetch(`${base}/home/admin/password/off`, {
        headers: { cookie: admin },
      })
    ).text();
    assert.match(
      open,
      /<form method="post" action="\/home\/admin\/password\/off"/,
    );

    // An inviter's name stays readable, and nothing in it runs inside the line's quotes.
    const mo = await accounts.signUp(office.key, {
      name: "Mo$(id)`whoami`!x 민아",
      email: "mo@example.com",
      password: "a long password",
    });
    const page = await (
      await fetch(`${base}/home`, { headers: { cookie: cookieOf(mo.cookies) } })
    ).text();
    const link = /<pre>(http:[^<]*\/i\/[^<]*)<\/pre>/.exec(page)?.[1] ?? "";
    assert.ok(
      link.endsWith("?from=Mo%24%28id%29%60whoami%60%21x%20민아"),
      link,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  }
});
