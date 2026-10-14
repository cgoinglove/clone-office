import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { Accounts } from "./accounts.ts";
import { openDatabase } from "./db.ts";
import { Relay } from "./relay.ts";
import {
  mentioned,
  plainWords,
  type SlackSocket,
  slackLang,
  TeamSlack,
} from "./slack.ts";

test("a Slack message is read as its mentions and its words", () => {
  const text =
    "<@UBOT> <@UBEN|ben> how do refunds work? see <https://x.dev/r|the doc> &amp; <#C1|pay>";
  assert.deepEqual(mentioned(text, "UBOT"), ["UBEN"]);
  assert.equal(
    plainWords(text),
    "how do refunds work? see the doc (https://x.dev/r) & #pay",
  );
  assert.equal(slackLang("ko-KR"), "ko");
  assert.equal(slackLang("de-DE"), "en");
  assert.equal(slackLang(undefined), "en");
});

/** Slack as the app sees it: its Web API, and the socket it sends events down. */
function fakeSlack() {
  const posted: Record<string, string>[] = [];
  const acked: string[] = [];
  let refuseNextPost = false;
  let opened = 0;
  const users: Record<
    string,
    { email?: string; name: string; locale?: string }
  > = {
    UANA: { email: "ana@example.com", name: "Ana", locale: "ko-KR" },
    UBEN: { email: "ben@example.com", name: "Ben" },
    UZED: { email: "zed@elsewhere.com", name: "Zed" },
    UCAL: { email: "cal@example.com", name: "Cal" },
  };
  const listeners = new Map<string, (event: { data?: unknown }) => void>();
  const socket: SlackSocket = {
    send: (data) => acked.push(JSON.parse(data).envelope_id),
    close: () => {},
    addEventListener: (type, listener) => listeners.set(type, listener),
  };
  const fetch = (async (url: string | URL, init?: RequestInit) => {
    const method = String(url).split("/").at(-1);
    const auth = new Headers(init?.headers).get("authorization") ?? "";
    const body = Object.fromEntries(new URLSearchParams(String(init?.body)));
    const ok = (data: Record<string, unknown>) =>
      Response.json({ ok: true, ...data });
    if (method === "auth.test")
      return auth.includes("xoxb-good")
        ? ok({ team: "Momo Lab", user_id: "UBOT" })
        : Response.json({ ok: false, error: "invalid_auth" });
    if (method === "apps.connections.open") {
      if (!auth.includes("xapp-good"))
        return Response.json({ ok: false, error: "invalid_auth" });
      opened += 1;
      return ok({ url: "wss://slack.test/socket" });
    }
    if (method === "users.info") {
      const found = users[body.user];
      return ok({
        user: {
          name: found?.name,
          ...(found?.locale ? { locale: found.locale } : {}),
          profile: { real_name: found?.name, email: found?.email },
        },
      });
    }
    if (method === "conversations.info")
      return ok({
        channel: { id: body.channel, is_ext_shared: body.channel === "CX" },
      });
    if (method === "chat.postMessage") {
      if (refuseNextPost) {
        refuseNextPost = false;
        return Response.json({ ok: false, error: "fatal_error" });
      }
      posted.push(body);
      return ok({ ts: String(posted.length) });
    }
    return Response.json({ ok: false, error: "unknown_method" });
  }) as typeof globalThis.fetch;
  let envelope = 0;
  const event = (data: Record<string, unknown>) =>
    listeners.get("message")?.({
      data: JSON.stringify({
        type: "events_api",
        envelope_id: `e${++envelope}`,
        payload: { event: data },
      }),
    });
  return {
    posted,
    acked,
    fetch,
    open: () => socket,
    event,
    refuseNextPost: () => {
      refuseNextPost = true;
    },
    opened: () => opened,
  };
}

const until = async (check: () => boolean | Promise<boolean>, ms = 3000) => {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
};

test("asked from Slack, a colleague's clone answers in the thread, as its clone, in the asker's language", async () => {
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  try {
    const key = randomBytes(32);
    const accounts = await Accounts.open(db, relay, { sealKey: key });
    const office = await relay.office();
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "ana's long password",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    const cal = await accounts.signUp(office.key, {
      name: "Cal",
      email: "cal@example.com",
      password: "cal's long password",
    });
    // Ben's clone, with his account's place
    const benClone = await relay.joinWeb(office.id, ben.person.id, {
      name: "Ben",
      description: "Payments",
    });
    const slack = fakeSlack();
    const team = new TeamSlack(relay, db, key, {
      fetch: slack.fetch,
      open: slack.open,
      api: "https://slack.test/api",
    });
    // Only Slack's own tokens, and only ones it takes.
    await assert.rejects(
      team.set(office.id, ana.person.id, { bot: "nope", app: "nope" }),
      { code: "slack-token-wrong" },
    );
    await assert.rejects(
      team.set(office.id, ana.person.id, {
        bot: "xoxb-bad-1234567890",
        app: "xapp-good-1234567890",
      }),
      { code: "slack-token-wrong" },
    );
    await team.set(office.id, ana.person.id, {
      bot: "xoxb-good-1234567890",
      app: "xapp-good-1234567890",
    });
    assert.deepEqual(await team.status(office.id), {
      on: true,
      team: "Momo Lab",
      by: "Ana",
      sealing: true,
    });
    // the tokens are kept sealed, never as they are
    const [kept] = await db.query<{ sealed: string }>(
      "SELECT sealed FROM office_slack",
    );
    assert.doesNotMatch(kept.sealed, /xoxb|xapp/);

    // An email typed when signing up is not proof: Ana has to link her Slack first.
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "90.1",
      text: "<@UBOT> <@UBEN> hi",
    });
    await until(() => slack.posted.length === 1);
    assert.match(slack.posted[0].text, /계정 페이지에서 "슬랙 연결"/);
    // Her code from her page, sent directly: linked. A wrong one is refused.
    const code = await team.linkCode(office.id, ana.person.id);
    slack.event({
      type: "message",
      channel_type: "im",
      user: "UANA",
      channel: "D1",
      ts: "91.1",
      text: "000000" === code ? "111111" : "000000",
    });
    slack.event({
      type: "message",
      channel_type: "im",
      user: "UANA",
      channel: "D1",
      ts: "91.2",
      text: code,
    });
    await until(() => slack.posted.length === 3);
    assert.match(slack.posted[1].text, /코드는 쓸 수 없어요/);
    assert.match(slack.posted[2].text, /Ana 님이에요/);
    assert.equal(await team.linkedName(office.id, ana.person.id), "Ana");
    // Ben's email is one Google checked: that is enough for him.
    await db.query(
      `UPDATE auth_users SET "emailVerified" = true WHERE id = $1`,
      [ben.person.id],
    );

    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "100.1",
      text: "<@UBOT> <@UBEN> how do refunds work?",
    });
    await until(() => slack.posted.length === 4);
    assert.match(slack.posted[3].text, /Ben의 클론에게 물었어요/);
    assert.equal(slack.posted[3].thread_ts, "100.1");
    // The request reached Ben's clone, from Ana's place (made on the web for her account).
    const asked = await relay.tasks(benClone);
    assert.equal(asked.length, 1);
    const anaPlace = await relay.memberOf(office.id, ana.person.id);
    assert.equal(asked[0].metadata.from, anaPlace?.id);
    const first = asked[0].history[0];
    assert.match(first.parts[0].text, /^how do refunds work\?/);
    assert.equal(first.metadata.by, "person");
    assert.equal(first.metadata.via, "slack-channel");

    // Ben's clone answers: posted once, named as his clone; a refusal is tried again.
    await relay.update(benClone, asked[0].id, {
      text: "Refunds go through **Stripe**, within 5 days.",
      state: "COMPLETED",
    });
    slack.refuseNextPost();
    await team.poll();
    assert.equal(slack.posted.length, 4, "Slack refused it once");
    await team.poll();
    await team.poll();
    assert.equal(slack.posted.length, 5);
    assert.equal(slack.posted[4].username, "Ben의 클론");
    assert.equal(
      slack.posted[4].text,
      "Refunds go through *Stripe*, within 5 days.",
    );

    // Ana goes on in the thread: the request was done, so a new one in the same conversation.
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "100.2",
      thread_ts: "100.1",
      text: "<@UBOT> and partial refunds?",
    });
    await until(async () => (await relay.tasks(benClone)).length === 2);
    const later = (await relay.tasks(benClone)).find(
      (task) => task.id !== asked[0].id,
    );
    assert.equal(later?.contextId, asked[0].contextId);
    await relay.update(benClone, later?.id as string, {
      text: "Partial ones too.",
      state: "COMPLETED",
      by: "person",
    });
    await team.poll();
    assert.equal(slack.posted.at(-1)?.username, "Ben");

    // A channel shared with another company, someone with no account here, a message naming
    // nobody, a colleague who never linked.
    const before = slack.posted.length;
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "CX",
      ts: "150.1",
      text: "<@UBOT> <@UBEN> hi",
    });
    slack.event({
      type: "app_mention",
      user: "UZED",
      channel: "C1",
      ts: "200.1",
      text: "<@UBOT> <@UBEN> hi",
    });
    slack.event({
      type: "message",
      channel_type: "im",
      user: "UANA",
      channel: "D1",
      ts: "300.1",
      text: "hello",
    });
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "400.1",
      text: "<@UBOT> <@UCAL> hi",
    });
    await until(() => slack.posted.length === before + 4);
    const said = slack.posted.slice(before).map((post) => post.text);
    assert.ok(said.some((text) => /다른 회사와 함께 쓰는 채널/.test(text)));
    assert.ok(said.some((text) => /Link your Slack/.test(text)));
    assert.ok(said.some((text) => /누구에게 물을까요/.test(text)));
    assert.ok(said.some((text) => /Cal 님이 누구인지/.test(text)));
    assert.equal(await team.linkedName(office.id, cal.person.id), undefined);
    // the same event twice is taken once
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "400.1",
      text: "<@UBOT> <@UCAL> hi",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(slack.posted.length, before + 4);

    // Another relay process on the same database follows what this one connected.
    const other = new TeamSlack(relay, db, key, {
      fetch: slack.fetch,
      open: slack.open,
      api: "https://slack.test/api",
    });
    const opened = slack.opened();
    await other.sync();
    assert.ok(slack.opened() > opened, "the other process connects too");

    // Let go: the tokens and what was followed are gone, there and here.
    await team.set(office.id, ana.person.id, null);
    assert.equal((await team.status(office.id)).on, false);
    assert.deepEqual(await db.query("SELECT 1 FROM slack_threads"), []);
    team.stop();
    other.stop();
  } finally {
    await db.close();
  }
});

test("an owner connects the team's Slack on the Office tab; nobody else can", async () => {
  const { createServer } = await import("node:http");
  const { relayHandler } = await import("./handler.ts");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  const key = randomBytes(32);
  const accounts = await Accounts.open(db, relay, { sealKey: key });
  const office = await relay.office();
  const slack = fakeSlack();
  const team = new TeamSlack(relay, db, key, {
    fetch: slack.fetch,
    open: slack.open,
    api: "https://slack.test/api",
  });
  const server = createServer(relayHandler(relay, { accounts, slack: team }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookieOf = (cookies: string[]) =>
    cookies.map((cookie) => cookie.split(";")[0]).join("; ");
  try {
    const ana = await accounts.signUp(office.key, {
      name: "Ana",
      email: "ana@example.com",
      password: "ana's long password",
    });
    const ben = await accounts.signUp(office.key, {
      name: "Ben",
      email: "ben@example.com",
      password: "ben's long password",
    });
    const post = (
      cookie: string,
      path: string,
      fields: Record<string, string>,
    ) =>
      fetch(`${base}${path}`, {
        method: "POST",
        headers: {
          cookie,
          "sec-fetch-site": "same-origin",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ office: office.id, ...fields }),
        redirect: "manual",
      });
    const tab = async (cookie: string) =>
      (
        await fetch(`${base}/home/office?office=${office.id}`, {
          headers: { cookie },
        })
      ).text();
    const anaCookie = cookieOf(ana.cookies);
    const benCookie = cookieOf(ben.cookies);
    // Only an owner sees it, and only an owner connects it.
    assert.match(await tab(anaCookie), /id="slack"[\s\S]*Create the Slack app/);
    assert.doesNotMatch(await tab(benCookie), /id="slack"/);
    const refused = await post(benCookie, "/home/office/slack", {
      bot: "xoxb-good-1234567890",
      app: "xapp-good-1234567890",
    });
    assert.match(refused.headers.get("location") ?? "", /error=not-owner/);
    assert.equal((await team.status(office.id)).on, false);
    // Tokens Slack refuses say so on the tab.
    const wrong = await post(anaCookie, "/home/office/slack", {
      bot: "xoxb-bad-1234567890",
      app: "xapp-good-1234567890",
    });
    assert.match(
      wrong.headers.get("location") ?? "",
      /error=slack-token-wrong/,
    );
    const shown = await fetch(`${base}${wrong.headers.get("location")}`, {
      headers: { cookie: anaCookie },
    });
    assert.match(await shown.text(), /Slack didn’t accept those tokens/);
    // A form from another site is refused.
    const forged = await fetch(`${base}/home/office/slack`, {
      method: "POST",
      headers: {
        cookie: anaCookie,
        "sec-fetch-site": "cross-site",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        office: office.id,
        bot: "xoxb-good-1234567890",
        app: "xapp-good-1234567890",
      }),
      redirect: "manual",
    });
    assert.equal(forged.status, 403);
    assert.equal((await team.status(office.id)).on, false);
    // The owner's own form connects it, and the tab says where.
    await post(anaCookie, "/home/office/slack", {
      bot: "xoxb-good-1234567890",
      app: "xapp-good-1234567890",
    });
    assert.match(await tab(anaCookie), /Connected to Momo Lab by Ana/);
    assert.doesNotMatch(await tab(anaCookie), /xoxb-good|xapp-good/);
    // Anyone in the office links their own Slack from their account page with a code.
    const account = await (
      await fetch(`${base}/home/account?office=${office.id}`, {
        headers: { cookie: benCookie },
      })
    ).text();
    assert.match(account, /action="\/home\/slack\/link"/);
    const linking = await post(benCookie, "/home/slack/link", {});
    assert.match(await linking.text(), /<pre class="pair-code">\d{6}<\/pre>/);
    await post(anaCookie, "/home/office/slack/remove", {});
    assert.equal((await team.status(office.id)).on, false);
  } finally {
    team.stop();
    server.close();
    await db.close();
  }
});
