import assert from "node:assert/strict";
import { test } from "node:test";
import type { Incoming, Person, Press } from "./discord";
import { SlackBot } from "./slack";

/** Slack's socket, played by the test. */
class FakeSocket {
  sent: Record<string, unknown>[] = [];
  closed = false;
  private listeners: Record<
    string,
    ((event: Record<string, unknown>) => void)[]
  > = { message: [], close: [], error: [] };

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
    if (this.closed) return;
    this.closed = true;
    for (const listener of this.listeners.close) listener({ code });
  }

  addEventListener(
    type: string,
    listener: (event: Record<string, unknown>) => void,
  ) {
    this.listeners[type].push(listener);
  }

  say(payload: Record<string, unknown>) {
    for (const listener of this.listeners.message)
      listener({ data: JSON.stringify(payload) });
  }
}

/** Slack's Web API, played by the test: who answers what, and every call with its token. */
function fakeSlack(
  answers: Record<string, (body: Record<string, unknown>) => unknown> = {},
) {
  const calls: {
    method: string;
    token: string;
    body: Record<string, unknown>;
  }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const method = url.split("/").at(-1) ?? "";
    const body = JSON.parse(String(init.body ?? "{}"));
    const token = String(
      (init.headers as Record<string, string>).authorization,
    ).replace("Bearer ", "");
    calls.push({ method, token, body });
    const answer = answers[method]?.(body) ??
      {
        "auth.test": {
          ok: true,
          user: "minime",
          user_id: "UBOT",
          team_id: "T1",
        },
        "apps.connections.open": {
          ok: true,
          url: `wss://slack.test/${calls.length}`,
        },
        "users.info": { ok: true, user: { real_name: "Ana Kim", name: "ana" } },
        "chat.postMessage": { ok: true, ts: `${calls.length}.0` },
        "conversations.open": { ok: true, channel: { id: "D9" } },
      }[method] ?? { ok: true };
    return new Response(JSON.stringify(answer));
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

test("the app says who it is, takes every envelope, and hears its Messages tab and button presses only", async () => {
  const slack = fakeSlack();
  const sockets: FakeSocket[] = [];
  const heard: { ready: Person[]; messages: Incoming[]; presses: Press[] } = {
    ready: [],
    messages: [],
    presses: [],
  };
  const bot = new SlackBot(
    "xoxb-bot",
    "xapp-app",
    {
      ready: (me) => heard.ready.push(me),
      message: (message) => heard.messages.push(message),
      press: (press) => heard.presses.push(press),
    },
    {
      fetch: slack.fetch,
      open: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
    },
  );
  bot.start();
  await until(() => sockets.length === 1);
  assert.equal(
    slack.calls.find((c) => c.method === "apps.connections.open")?.token,
    "xapp-app",
    "the socket is opened with the app-level token",
  );
  assert.equal(
    slack.calls.find((c) => c.method === "auth.test")?.token,
    "xoxb-bot",
  );
  const socket = sockets[0];
  socket.say({ type: "hello", connection_info: { app_id: "A1" } });
  assert.deepEqual(heard.ready, [{ id: "UBOT", name: "@minime" }]);
  assert.equal(bot.invite, "https://slack.com/app_redirect?app=A1&team=T1");

  const message = (event: Record<string, unknown>, id: string) =>
    socket.say({
      envelope_id: id,
      type: "events_api",
      payload: {
        event: {
          type: "message",
          channel_type: "im",
          channel: "D1",
          user: "U1",
          ts: "1.1",
          ...event,
        },
      },
    });
  message({ text: "hi &amp; &lt;b&gt; <https://x.y|docs>" }, "e1");
  message({ text: "from the app itself", bot_id: "B1" }, "e2");
  message({ text: "in a channel", channel_type: "channel" }, "e3");
  message({ text: "an edit", subtype: "message_changed" }, "e4");
  message({ text: "Friday", ts: "1.3", thread_ts: "1.2" }, "e5");
  socket.say({
    envelope_id: "e6",
    type: "interactive",
    payload: {
      type: "block_actions",
      user: { id: "U1", name: "ana" },
      channel: { id: "D1" },
      message: { ts: "1.4", text: "May I?" },
      actions: [{ value: "ask:x:allow", action_ts: "9.9" }],
    },
  });
  await until(() => heard.messages.length === 2 && heard.presses.length === 1);
  assert.deepEqual(
    socket.sent.map((frame) => frame.envelope_id),
    ["e1", "e2", "e3", "e4", "e5", "e6"],
    "every envelope is taken at once",
  );
  assert.deepEqual(
    heard.messages.map((m) => [m.channel, m.author.name, m.text, m.replyTo]),
    [
      ["D1", "Ana Kim", "hi & <b> docs (https://x.y)", undefined],
      ["D1", "Ana Kim", "Friday", "1.2"],
    ],
  );
  assert.deepEqual(heard.presses[0], {
    id: "9.9",
    token: "",
    channel: "D1",
    user: { id: "U1", name: "ana" },
    value: "ask:x:allow",
    message: { id: "1.4", text: "May I?" },
  });
  assert.equal(
    slack.calls.filter((c) => c.method === "users.info").length,
    1,
    "a name is asked for once",
  );

  // Slack says it will close the socket: a new one is opened at a fresh address.
  socket.say({ type: "disconnect", reason: "refresh_requested" });
  await until(() => sockets.length === 2);
  assert.equal(
    slack.calls.filter((c) => c.method === "apps.connections.open").length,
    2,
  );
  bot.stop();
  assert.equal(sockets[1].closed, true);
});

test("text goes in Slack's mrkdwn with the buttons as blocks; a press is settled; the person is written to first", async () => {
  const slack = fakeSlack();
  const bot = new SlackBot(
    "xoxb-bot",
    "xapp-app",
    {},
    { fetch: slack.fetch, open: () => new FakeSocket() },
  );
  const id = await bot.send("D1", "**Hi** see [docs](https://x.y) & more", [
    { label: "Allow", value: "ask:x:allow", style: "primary" },
  ]);
  const post = slack.calls.find((c) => c.method === "chat.postMessage");
  assert.equal(id, "1.0");
  assert.equal(post?.body.text, "*Hi* see <https://x.y|docs> &amp; more");
  assert.equal(post?.body.unfurl_links, false);
  assert.deepEqual(post?.body.blocks, [
    {
      type: "section",
      text: { type: "mrkdwn", text: "*Hi* see <https://x.y|docs> &amp; more" },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "choice_0",
          text: { type: "plain_text", text: "Allow" },
          value: "ask:x:allow",
          style: "primary",
        },
      ],
    },
  ]);
  await bot.settle(
    {
      id: "9.9",
      token: "",
      channel: "D1",
      user: { id: "U1", name: "ana" },
      value: "ask:x:allow",
      message: { id: "1.4", text: "May I?" },
    },
    "Allowed",
  );
  const update = slack.calls.find((c) => c.method === "chat.update");
  assert.deepEqual(update?.body, {
    channel: "D1",
    ts: "1.4",
    text: "May I?\n\n→ Allowed",
    blocks: [],
  });
  assert.equal(await bot.dm("U1"), "D9");
  assert.deepEqual(
    slack.calls.find((c) => c.method === "conversations.open")?.body,
    { users: "U1" },
  );
});

test("tokens Slack turns away stop it for good, and are found out before it is set up", async () => {
  const refusing = fakeSlack({
    "auth.test": () => ({ ok: false, error: "invalid_auth" }),
  });
  const failed: string[] = [];
  const bot = new SlackBot(
    "xoxb-wrong",
    "xapp-app",
    { failed: (why) => failed.push(why) },
    { fetch: refusing.fetch, open: () => new FakeSocket() },
  );
  bot.start();
  await until(() => failed.length === 1);
  assert.deepEqual(failed, ["messenger-slack-token-wrong"]);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(
    refusing.calls.filter((c) => c.method === "auth.test").length,
    1,
    "not asked again",
  );

  const wrongApp = fakeSlack({
    "apps.connections.open": () => ({
      ok: false,
      error: "not_allowed_token_type",
    }),
  });
  await assert.rejects(
    new SlackBot(
      "xoxb-bot",
      "xoxb-not-an-app-token",
      {},
      { fetch: wrongApp.fetch },
    ).check(),
    /not_allowed_token_type/,
  );
});

test("a file shared in the Messages tab is fetched with the bot's token; a file of ours is uploaded and posted", async () => {
  const slack = fakeSlack({
    "files.getUploadURLExternal": () => ({
      ok: true,
      upload_url: "https://files.example/upload/1",
      file_id: "F9",
    }),
  });
  const plain = slack.fetch;
  const fetched: { url: string; auth: string }[] = [];
  const uploads: unknown[] = [];
  const sockets: FakeSocket[] = [];
  const heard: Incoming[] = [];
  const bot = new SlackBot(
    "xoxb-bot",
    "xapp-app",
    { message: (message) => heard.push(message) },
    {
      open: () => {
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      fetch: (async (url: string, init: RequestInit = {}) => {
        if (String(url).startsWith("https://files.slack.example")) {
          fetched.push({
            url: String(url),
            auth: String(
              (init.headers as Record<string, string>)?.authorization,
            ),
          });
          return new Response("sheet-bytes");
        }
        if (String(url).startsWith("https://files.example/upload")) {
          uploads.push(init.body);
          return new Response("OK");
        }
        if (String(url).endsWith("/files.getUploadURLExternal"))
          return new Response(
            JSON.stringify({
              ok: true,
              upload_url: "https://files.example/upload/1",
              file_id: "F9",
            }),
          );
        return plain(url, init);
      }) as typeof globalThis.fetch,
    },
  );
  bot.start();
  await until(() => sockets.length === 1);
  sockets[0].say({
    envelope_id: "e1",
    type: "events_api",
    payload: {
      event: {
        type: "message",
        subtype: "file_share",
        channel_type: "im",
        channel: "D1",
        user: "U1",
        ts: "1.1",
        text: "",
        files: [
          {
            name: "budget.xlsx",
            size: 11,
            mimetype: "application/vnd.ms-excel",
            url_private_download: "https://files.slack.example/budget.xlsx",
          },
        ],
      },
    },
  });
  await until(() => heard.length === 1);
  const [file] = heard[0].files ?? [];
  assert.equal(file.name, "budget.xlsx");
  assert.equal(new TextDecoder().decode(await file.fetch()), "sheet-bytes");
  assert.deepEqual(fetched[0], {
    url: "https://files.slack.example/budget.xlsx",
    auth: "Bearer xoxb-bot",
  });

  await bot.sendFile("D1", {
    name: "quote.csv",
    type: "text/csv",
    bytes: new TextEncoder().encode("a,b"),
  });
  assert.equal(uploads.length, 1);
  assert.deepEqual(
    slack.calls.find((c) => c.method === "files.completeUploadExternal")?.body,
    {
      files: [{ id: "F9", title: "quote.csv" }],
      channel_id: "D1",
    },
  );
  bot.stop();
});
