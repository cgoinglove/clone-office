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
  const users: Record<
    string,
    { email?: string; name: string; locale?: string }
  > = {
    UANA: { email: "ana@example.com", name: "Ana", locale: "ko-KR" },
    UBEN: { email: "ben@example.com", name: "Ben" },
    UZED: { email: "zed@elsewhere.com", name: "Zed" },
    UCAL: { name: "Cal Unknown" },
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
    if (method === "apps.connections.open")
      return auth.includes("xapp-good")
        ? ok({ url: "wss://slack.test/socket" })
        : Response.json({ ok: false, error: "invalid_auth" });
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
    if (method === "chat.postMessage") {
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
  return { posted, acked, fetch, open: () => socket, event };
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

    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "100.1",
      text: "<@UBOT> <@UBEN> how do refunds work?",
    });
    await until(() => slack.posted.length === 1);
    assert.equal(slack.acked[0], "e1", "the envelope is taken at once");
    assert.equal(slack.posted[0].thread_ts, "100.1");
    assert.match(slack.posted[0].text, /Ben의 클론에게 물었어요/);
    // The request reached Ben's clone, from Ana's place (made on the web for her account).
    const asked = await relay.tasks(benClone);
    assert.equal(asked.length, 1);
    const anaPlace = await relay.memberOf(office.id, ana.person.id);
    assert.equal(asked[0].metadata.from, anaPlace?.id);
    assert.match(asked[0].history[0].parts[0].text, /^how do refunds work\?/);
    assert.match(asked[0].history[0].parts[0].text, /in a channel/);
    assert.equal(asked[0].history[0].metadata.by, "person");

    // Ben's clone answers: posted once, named as his clone.
    await relay.update(benClone, asked[0].id, {
      text: "Refunds go through **Stripe**, within 5 days.",
      state: "COMPLETED",
    });
    await team.poll();
    await team.poll();
    assert.equal(slack.posted.length, 2);
    assert.equal(slack.posted[1].username, "Ben의 클론");
    assert.equal(
      slack.posted[1].text,
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
    const both = await relay.tasks(benClone);
    const later = both.find((task) => task.id !== asked[0].id);
    assert.equal(later?.contextId, asked[0].contextId);
    // Ben answers it himself: named as Ben.
    await relay.update(benClone, later?.id as string, {
      text: "Partial ones too.",
      state: "COMPLETED",
      by: "person",
    });
    await team.poll();
    assert.equal(slack.posted.at(-1)?.username, "Ben");

    // Someone with no account in the office, a message naming nobody, an unknown colleague.
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
    await until(() => slack.posted.length === 6);
    const said = slack.posted.slice(3).map((post) => post.text);
    assert.ok(said.some((text) => /invite you with the email/.test(text)));
    assert.ok(said.some((text) => /누구에게 물을까요/.test(text)));
    assert.ok(said.some((text) => /Cal Unknown 님은 아직/.test(text)));
    // the same event twice is taken once
    slack.event({
      type: "app_mention",
      user: "UANA",
      channel: "C1",
      ts: "400.1",
      text: "<@UBOT> <@UCAL> hi",
    });
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(slack.posted.length, 6);

    // Let go: the tokens are gone.
    await team.set(office.id, ana.person.id, null);
    assert.equal((await team.status(office.id)).on, false);
    team.stop();
  } finally {
    await db.close();
  }
});
