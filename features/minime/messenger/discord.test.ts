import assert from "node:assert/strict";
import { test } from "node:test";
import { DiscordBot, type Incoming, type Press } from "./discord";
import { pieces } from "./text";

/** Discord's gateway, played by the test: what the bot sent, and what Discord says to it. */
class FakeSocket {
  sent: { op: number; d: Record<string, unknown> | number | null }[] = [];
  private listeners: Record<
    string,
    ((event: Record<string, unknown>) => void)[]
  > = { message: [], close: [], error: [] };
  url: string;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
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

function connected() {
  const sockets: FakeSocket[] = [];
  const calls: { method: string; url: string; body: unknown }[] = [];
  const heard: {
    messages: Incoming[];
    presses: Press[];
    failed: string[];
  } = {
    messages: [],
    presses: [],
    failed: [],
  };
  let ready = "";
  const bot = new DiscordBot(
    "bot-token",
    {
      ready: (me) => {
        ready = me.name;
      },
      message: (message) => heard.messages.push(message),
      press: (press) => heard.presses.push(press),
      failed: (code) => heard.failed.push(code),
    },
    {
      open: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      fetch: (async (url: string, init: RequestInit) => {
        calls.push({
          method: String(init.method),
          url,
          body: init.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(null, { status: 204 });
      }) as typeof fetch,
    },
  );
  bot.start();
  return { bot, sockets, heard, calls, ready: () => ready };
}

test("the bot says who it is, and hears direct messages and button presses only", async () => {
  const { bot, sockets, heard, calls, ready } = connected();
  const socket = sockets[0];
  socket.say({ op: 10, d: { heartbeat_interval: 45_000 } });
  assert.deepEqual(socket.sent[0], {
    op: 2,
    d: {
      token: "bot-token",
      intents: 4096,
      properties: {
        os: process.platform,
        browser: "clone-office",
        device: "clone-office",
      },
    },
  });
  socket.say({
    op: 0,
    s: 1,
    t: "READY",
    d: {
      session_id: "s1",
      resume_gateway_url: "wss://resume.example",
      user: { id: "b1", username: "mini", global_name: "Mini" },
      application: { id: "a1" },
    },
  });
  assert.equal(ready(), "Mini");
  assert.equal(
    bot.invite,
    "https://discord.com/oauth2/authorize?client_id=a1&scope=bot&permissions=0",
  );
  const message = (d: Record<string, unknown>) =>
    socket.say({ op: 0, s: 2, t: "MESSAGE_CREATE", d });
  message({
    id: "m1",
    channel_id: "dm1",
    author: { id: "u1", username: "ana" },
    content: "hi",
  });
  message({
    id: "m2",
    channel_id: "c1",
    guild_id: "g1",
    author: { id: "u2", username: "ben" },
    content: "in a server",
  });
  message({
    id: "m3",
    channel_id: "dm1",
    author: { id: "b1", username: "mini", bot: true },
    content: "itself",
  });
  assert.deepEqual(heard.messages, [
    {
      id: "m1",
      channel: "dm1",
      author: { id: "u1", name: "ana" },
      text: "hi",
    },
  ]);
  socket.say({
    op: 0,
    s: 3,
    t: "INTERACTION_CREATE",
    d: {
      id: "i1",
      token: "t1",
      type: 3,
      channel_id: "dm1",
      user: { id: "u1", username: "ana" },
      data: { custom_id: "ask:x:allow" },
      message: { id: "m9", content: "May I do this?" },
    },
  });
  assert.equal(heard.presses[0]?.value, "ask:x:allow");
  // Taken at once, as Discord wants within three seconds; the message is settled afterwards.
  assert.deepEqual(calls[0], {
    method: "POST",
    url: "https://discord.com/api/v10/interactions/i1/t1/callback",
    body: { type: 6 },
  });
  await bot.settle(heard.presses[0], "Allowed");
  assert.deepEqual(calls[1], {
    method: "PATCH",
    url: "https://discord.com/api/v10/channels/dm1/messages/m9",
    body: { content: "May I do this?\n\n→ Allowed", components: [] },
  });
  bot.stop();
});

test("a lost connection resumes the session where it was; a wrong token stops for good", async () => {
  const { bot, sockets, heard } = connected();
  sockets[0].say({ op: 10, d: { heartbeat_interval: 45_000 } });
  sockets[0].say({
    op: 0,
    s: 7,
    t: "READY",
    d: {
      session_id: "s1",
      resume_gateway_url: "wss://resume.example",
      user: { id: "b1", username: "mini" },
    },
  });
  sockets[0].close(1006);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.equal(sockets.length, 2);
  assert.equal(sockets[1].url, "wss://resume.example/?v=10&encoding=json");
  sockets[1].say({ op: 10, d: { heartbeat_interval: 45_000 } });
  assert.deepEqual(sockets[1].sent[0], {
    op: 6,
    d: { token: "bot-token", session_id: "s1", seq: 7 },
  });
  sockets[1].close(4004);
  await new Promise((resolve) => setTimeout(resolve, 1200));
  assert.deepEqual(heard.failed, ["messenger-token-wrong"]);
  assert.equal(sockets.length, 2, "no new try after a wrong token");
  bot.stop();
});

test("long text goes in pieces Discord takes, with the buttons on the last; a rate limit is waited out", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  let limited = false;
  const bot = new DiscordBot(
    "bot-token",
    {},
    {
      open: (url) => new FakeSocket(url),
      fetch: (async (url: string, init: RequestInit) => {
        if (!limited) {
          limited = true;
          return new Response(JSON.stringify({ retry_after: 0.01 }), {
            status: 429,
          });
        }
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ id: `m${calls.length}` }));
      }) as typeof fetch,
    },
  );
  const text = `${"a".repeat(1500)}\n${"b".repeat(1500)}`;
  const id = await bot.send("dm1", text, [
    { label: "Allow", value: "ask:x:allow", style: "primary" },
  ]);
  assert.equal(id, "m2");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.content, "a".repeat(1500));
  assert.equal(calls[0].body.components, undefined);
  assert.deepEqual(calls[1].body.components, [
    {
      type: 1,
      components: [
        { type: 2, style: 1, label: "Allow", custom_id: "ask:x:allow" },
      ],
    },
  ]);
  assert.deepEqual(calls[1].body.allowed_mentions, { parse: [] });
  assert.equal(calls[1].body.flags, 4, "no card under links");
  assert.match(calls[1].url, /\/channels\/dm1\/messages$/);
});

test("text is cut at a line where it can be, else at the limit", () => {
  assert.deepEqual(pieces("short", 1900), ["short"]);
  assert.deepEqual(pieces("x".repeat(25), 10), [
    "x".repeat(10),
    "x".repeat(10),
    "x".repeat(5),
  ]);
  assert.deepEqual(pieces("aaaaaaa\nbbbbbbb", 10), ["aaaaaaa", "bbbbbbb"]);
});

test("files come with a direct message and are fetched when wanted; a file of ours goes as a message", async () => {
  const fetched: string[] = [];
  const posts: { url: string; body: unknown }[] = [];
  const heard: Incoming[] = [];
  const sockets: FakeSocket[] = [];
  const bot = new DiscordBot(
    "bot-token",
    { message: (message) => heard.push(message) },
    {
      open: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      fetch: (async (url: string, init?: RequestInit) => {
        if (String(url).startsWith("https://cdn.example")) {
          fetched.push(String(url));
          return new Response("photo-bytes");
        }
        posts.push({ url: String(url), body: init?.body });
        return new Response(JSON.stringify({ id: "m9" }));
      }) as typeof fetch,
    },
  );
  bot.start();
  sockets[0].say({
    op: 0,
    s: 1,
    t: "MESSAGE_CREATE",
    d: {
      id: "m1",
      channel_id: "dm1",
      author: { id: "u1", username: "ana" },
      content: "",
      attachments: [
        {
          filename: "receipt.jpg",
          size: 11,
          url: "https://cdn.example/receipt.jpg",
          content_type: "image/jpeg",
        },
      ],
    },
  });
  const [file] = heard[0].files ?? [];
  assert.deepEqual(
    [file.name, file.size, file.type],
    ["receipt.jpg", 11, "image/jpeg"],
  );
  assert.deepEqual(fetched, [], "not before it is wanted");
  assert.equal(new TextDecoder().decode(await file.fetch()), "photo-bytes");
  await bot.sendFile("dm1", {
    name: "quote.csv",
    type: "text/csv",
    bytes: new TextEncoder().encode("a,b"),
  });
  assert.match(posts[0].url, /\/channels\/dm1\/messages$/);
  const form = posts[0].body as FormData;
  assert.ok(form instanceof FormData);
  assert.equal((form.get("files[0]") as File).name, "quote.csv");
  assert.equal(await (form.get("files[0]") as File).text(), "a,b");
  bot.stop();
});
