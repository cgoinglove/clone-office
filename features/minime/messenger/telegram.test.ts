import assert from "node:assert/strict";
import { test } from "node:test";
import type { Incoming, Person, Press } from "./discord";
import { TelegramBot } from "./telegram";

/** Telegram's Bot API, played by the test: updates wait in a queue for the long poll. */
function fakeTelegram() {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const queue: unknown[][] = [];
  let wake: (() => void) | undefined;
  const answers: Record<string, (body: Record<string, unknown>) => Response> =
    {};
  const ok = (result: unknown) =>
    new Response(JSON.stringify({ ok: true, result }));
  const request = (async (url: string, init: RequestInit) => {
    const method = url.split("/").at(-1) ?? "";
    const body = JSON.parse(String(init.body ?? "{}"));
    calls.push({ method, body });
    if (answers[method]) return answers[method](body);
    if (method === "getMe")
      return ok({ id: 42, is_bot: true, username: "mini_bot" });
    if (method === "getUpdates") {
      if (!queue.length)
        await new Promise<void>((resolve) => {
          wake = resolve;
          init.signal?.addEventListener("abort", () => resolve());
        });
      if (init.signal?.aborted) throw new Error("aborted");
      return ok(queue.shift() ?? []);
    }
    if (method === "sendMessage") return ok({ message_id: calls.length });
    return ok(true);
  }) as typeof globalThis.fetch;
  return {
    fetch: request,
    calls,
    answers,
    push(updates: unknown[]) {
      queue.push(updates);
      wake?.();
    },
  };
}

const until = async (check: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
};

const ana = { id: 7, first_name: "Ana", is_bot: false };

test("the bot says who it is and where to find it, and hears private chats and button presses only", async () => {
  const telegram = fakeTelegram();
  const heard: { ready: Person[]; messages: Incoming[]; presses: Press[] } = {
    ready: [],
    messages: [],
    presses: [],
  };
  const bot = new TelegramBot(
    "123:token",
    {
      ready: (me) => heard.ready.push(me),
      message: (message) => heard.messages.push(message),
      press: (press) => heard.presses.push(press),
    },
    { fetch: telegram.fetch, pollSeconds: 1 },
  );
  bot.start();
  await until(() => heard.ready.length === 1);
  assert.deepEqual(heard.ready[0], { id: "42", name: "@mini_bot" });
  assert.equal(bot.invite, "https://t.me/mini_bot");
  telegram.push([
    {
      update_id: 10,
      message: {
        message_id: 1,
        from: ana,
        chat: { id: 7, type: "private" },
        text: "/start",
      },
    },
    {
      update_id: 11,
      message: {
        message_id: 2,
        from: ana,
        chat: { id: -5, type: "group" },
        text: "in a group",
      },
    },
    {
      update_id: 12,
      message: {
        message_id: 3,
        from: { id: 9, is_bot: true },
        chat: { id: 9, type: "private" },
        text: "a bot",
      },
    },
    {
      update_id: 13,
      message: {
        message_id: 4,
        from: ana,
        chat: { id: 7, type: "private" },
        text: "Friday",
        reply_to_message: { message_id: 3 },
      },
    },
    {
      update_id: 14,
      callback_query: {
        id: "q1",
        from: ana,
        data: "ask:x:allow",
        message: {
          message_id: 5,
          chat: { id: 7, type: "private" },
          text: "May I?",
          entities: [{ type: "bold", offset: 0, length: 3 }],
        },
      },
    },
  ]);
  await until(() => heard.presses.length === 1);
  assert.deepEqual(
    heard.messages.map((m) => [m.channel, m.author.name, m.text, m.replyTo]),
    [
      ["7", "Ana", "/start", undefined],
      ["7", "Ana", "Friday", "3"],
    ],
  );
  assert.deepEqual(heard.presses[0], {
    id: "q1",
    token: "",
    channel: "7",
    user: { id: "7", name: "Ana" },
    value: "ask:x:allow",
    message: {
      id: "5",
      text: "May I?",
      keep: [{ type: "bold", offset: 0, length: 3 }],
    },
  });
  assert.ok(
    telegram.calls.some(
      (c) =>
        c.method === "answerCallbackQuery" && c.body.callback_query_id === "q1",
    ),
  );
  // What was handed over is not asked for again.
  await until(
    () => telegram.calls.filter((c) => c.method === "getUpdates").length >= 2,
  );
  assert.equal(
    telegram.calls.filter((c) => c.method === "getUpdates").at(-1)?.body.offset,
    15,
  );

  // A settled press keeps its words and marks, its buttons gone and the answer under it.
  await bot.settle(heard.presses[0], "Allowed");
  const edit = telegram.calls.find((c) => c.method === "editMessageText");
  assert.equal(edit?.body.text, "May I?\n\n→ Allowed");
  assert.deepEqual(edit?.body.entities, [
    { type: "bold", offset: 0, length: 3 },
  ]);
  assert.equal(edit?.body.reply_markup, undefined);
  bot.stop();
});

test("text goes as Telegram's HTML with the buttons under the last piece; marks it cannot read go as words", async () => {
  const telegram = fakeTelegram();
  let refused = false;
  telegram.answers.sendMessage = (body) => {
    if (body.parse_mode && String(body.text).includes("broken") && !refused) {
      refused = true;
      return new Response(
        JSON.stringify({
          ok: false,
          description: "Bad Request: can't parse entities",
        }),
        { status: 400 },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        result: { message_id: 100 + telegram.calls.length },
      }),
    );
  };
  const bot = new TelegramBot("123:token", {}, { fetch: telegram.fetch });
  const long = `**Hello**\n${"a".repeat(3990)}\nlast line`;
  const id = await bot.send("7", long, [
    { label: "Allow", value: "ask:x:allow", style: "primary" },
  ]);
  const sent = telegram.calls.filter((c) => c.method === "sendMessage");
  assert.equal(sent.length, 2);
  assert.equal(sent[0].body.parse_mode, "HTML");
  assert.match(String(sent[0].body.text), /^<b>Hello<\/b>/);
  assert.equal(sent[0].body.reply_markup, undefined);
  assert.deepEqual(sent[1].body.reply_markup, {
    inline_keyboard: [[{ text: "Allow", callback_data: "ask:x:allow" }]],
  });
  assert.deepEqual(sent[1].body.link_preview_options, { is_disabled: true });
  assert.equal(id, String(100 + telegram.calls.length), "the last piece's");

  await bot.send("7", "a broken <mark");
  const again = telegram.calls
    .filter((c) => c.method === "sendMessage")
    .slice(-2);
  assert.equal(again[0].body.parse_mode, "HTML");
  assert.equal(again[1].body.parse_mode, undefined);
  assert.equal(again[1].body.text, "a broken <mark");
});

test("a token Telegram turns away stops it for good; too many at once is waited out", async () => {
  const telegram = fakeTelegram();
  let limited = false;
  telegram.answers.getMe = () => {
    if (!limited) {
      limited = true;
      return new Response(
        JSON.stringify({ ok: false, parameters: { retry_after: 0.01 } }),
        { status: 429 },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, result: { id: 42, username: "mini_bot" } }),
    );
  };
  assert.deepEqual(
    await new TelegramBot("123:token", {}, { fetch: telegram.fetch }).whoAmI(),
    {
      id: "42",
      name: "@mini_bot",
    },
  );

  const refusing = fakeTelegram();
  refusing.answers.getMe = () =>
    new Response(JSON.stringify({ ok: false, description: "Unauthorized" }), {
      status: 401,
    });
  const failed: string[] = [];
  const bot = new TelegramBot(
    "123:wrong",
    { failed: (why) => failed.push(why) },
    { fetch: refusing.fetch },
  );
  bot.start();
  await until(() => failed.length === 1);
  assert.deepEqual(failed, ["messenger-telegram-token-wrong"]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(
    refusing.calls.filter((c) => c.method === "getMe").length,
    1,
    "not asked again",
  );
});

test("another program reading the same bot is said while it lasts", async () => {
  const telegram = fakeTelegram();
  let conflicts = 1;
  const plain = telegram.fetch;
  const troubles: (string | undefined)[] = [];
  const bot = new TelegramBot(
    "123:token",
    { trouble: (problem) => troubles.push(problem) },
    {
      fetch: (async (url: string, init: RequestInit) => {
        if (String(url).endsWith("/getUpdates") && conflicts-- > 0)
          return new Response(
            JSON.stringify({
              ok: false,
              description: "Conflict: terminated by other getUpdates request",
            }),
            { status: 409 },
          );
        return plain(url, init);
      }) as typeof globalThis.fetch,
      pollSeconds: 1,
    },
  );
  bot.start();
  await until(() => troubles.length === 1);
  assert.deepEqual(troubles, ["messenger-telegram-taken"]);
  telegram.push([]);
  await until(() => troubles.length === 2, 5000);
  assert.deepEqual(troubles, ["messenger-telegram-taken", undefined]);
  bot.stop();
});

test("a document or photo comes with its caption and is fetched when wanted; a file of ours goes as a document", async () => {
  const telegram = fakeTelegram();
  const heard: Incoming[] = [];
  const plain = telegram.fetch;
  const downloads: string[] = [];
  const bodies: unknown[] = [];
  const bot = new TelegramBot(
    "123:token",
    { message: (message) => heard.push(message) },
    {
      fetch: (async (url: string, init: RequestInit) => {
        if (String(url).includes("/file/bot123:token/")) {
          downloads.push(String(url));
          return new Response("pdf-bytes");
        }
        if (String(url).endsWith("/getFile"))
          return new Response(
            JSON.stringify({
              ok: true,
              result: { file_path: "documents/file_7.pdf" },
            }),
          );
        if (String(url).endsWith("/sendDocument")) {
          bodies.push(init.body);
          return new Response(
            JSON.stringify({ ok: true, result: { message_id: 9 } }),
          );
        }
        return plain(url, init);
      }) as typeof globalThis.fetch,
      pollSeconds: 1,
    },
  );
  bot.start();
  telegram.push([
    {
      update_id: 20,
      message: {
        message_id: 7,
        from: ana,
        chat: { id: 7, type: "private" },
        caption: "Can you read this?",
        document: {
          file_id: "F1",
          file_name: "contract.pdf",
          file_size: 9,
          mime_type: "application/pdf",
        },
      },
    },
    {
      update_id: 21,
      message: {
        message_id: 8,
        from: ana,
        chat: { id: 7, type: "private" },
        photo: [
          { file_id: "small", file_size: 1 },
          { file_id: "large", file_size: 4 },
        ],
      },
    },
  ]);
  await until(() => heard.length === 2);
  assert.equal(heard[0].text, "Can you read this?");
  assert.deepEqual(
    heard[0].files?.map((f) => [f.name, f.size]),
    [["contract.pdf", 9]],
  );
  assert.equal(
    new TextDecoder().decode(
      await (heard[0].files?.[0].fetch() as Promise<Uint8Array>),
    ),
    "pdf-bytes",
  );
  assert.match(downloads[0], /\/file\/bot123:token\/documents\/file_7\.pdf$/);
  assert.deepEqual(
    heard[1].files?.map((f) => [f.name, f.size]),
    [["photo-8.jpg", 4]],
    "the largest size",
  );
  await bot.sendFile("7", {
    name: "quote.csv",
    type: "text/csv",
    bytes: new TextEncoder().encode("a,b"),
  });
  const form = bodies[0] as FormData;
  assert.equal(form.get("chat_id"), "7");
  assert.equal((form.get("document") as File).name, "quote.csv");
  bot.stop();
});
