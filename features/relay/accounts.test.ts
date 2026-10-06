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
    const line = /npx sub-office connect (http:\/\/[^\s<]+)/.exec(paired);
    assert.ok(line, "the line to run");
    const link = line[1];
    assert.match(await (await fetch(link)).text(), /Run this on your computer/);

    // The person runs the line on their computer.
    const run = promisify(execFile);
    const env = { ...process.env, SUB_OFFICE_HOME: home };
    const bin = join(import.meta.dirname, "..", "..", "bin", "sub-office.mjs");
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
