import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { a2aTask, messageText, versionServed } from "./a2a";
import { type Database, openDatabase } from "./db";
import { relayHandler } from "./handler";
import { type Caller, Relay } from "./relay";

let db: Database;
let relay: Relay;
let server: Server;
let base = "";
before(async () => {
  db = await openDatabase("memory");
  relay = await Relay.open(db);
  await relay.office("a2a-key");
  server = createServer(relayHandler(relay));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await relay.close();
  await db.close();
});

async function join(name: string, key = "a2a-key") {
  const { token } = await relay.join({
    key,
    card: {
      name,
      description: `${name}'s work`,
      skills: [
        { id: "review", name: "Code review", description: "Looks at a change" },
      ],
      howToWork: ["Short questions first"],
      owns: ["Receipts service"],
    },
  });
  return { token, ...(await relay.memberByToken(token)) } as Caller & {
    token: string;
  };
}

async function rpc(
  token: string,
  member: string,
  method: string,
  params: unknown,
  headers: Record<string, string> = { "A2A-Version": "1.0" },
) {
  const response = await fetch(`${base}/a2a/${member}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 7, method, params }),
  });
  return {
    status: response.status,
    body: (await response.json()) as {
      id: unknown;
      result?: Record<string, unknown>;
      error?: { code: number; message: string };
    },
  };
}

const message = (text: string, extra: Record<string, unknown> = {}) => ({
  message: {
    messageId: `m-${Math.random()}`,
    role: "ROLE_USER",
    parts: [{ text, mediaType: "text/plain" }],
    ...extra,
  },
});

test("a member is an A2A agent: its card, to office members only", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  const card = await fetch(
    `${base}/a2a/${ben.id}/.well-known/agent-card.json`,
    {
      headers: { authorization: `Bearer ${ana.token}` },
    },
  );
  assert.equal(card.status, 200);
  const shown = (await card.json()) as Record<string, any>;
  assert.equal(shown.name, "Ben");
  assert.match(shown.description, /Short questions first/);
  assert.match(shown.description, /Looks after: Receipts service/);
  assert.deepEqual(shown.supportedInterfaces, [
    {
      url: `${base}/a2a/${ben.id}`,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    },
  ]);
  assert.equal(shown.skills[0].id, "review");
  assert.deepEqual(shown.skills[0].tags, ["review"]);
  assert.equal(shown.capabilities.streaming, false);
  // No token, or one from another office: nothing is shown.
  const anonymous = await fetch(
    `${base}/a2a/${ben.id}/.well-known/agent-card.json`,
  );
  assert.equal(anonymous.status, 401);
  await relay.office("other-key");
  const outsider = await join("Eve", "other-key");
  const elsewhere = await fetch(
    `${base}/a2a/${ben.id}/.well-known/agent-card.json`,
    { headers: { authorization: `Bearer ${outsider.token}` } },
  );
  assert.equal(elsewhere.status, 404);
});

test("SendMessage asks the clone and waits for its answer; GetTask and ListTasks see it", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  // Ben's clone answers when the request reaches it.
  const answering = (async () => {
    for (let i = 0; i < 50; i += 1) {
      const [open] = (await relay.tasks(ben)).filter(
        (t) => t.metadata.to === ben.id && t.status.state === "SUBMITTED",
      );
      if (open) {
        await relay.update(ben, open.id, {
          state: "COMPLETED",
          text: "Yes, Thursday works.",
        });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  })();
  const sent = await rpc(
    ana.token,
    ben.id,
    "SendMessage",
    message("Thursday?"),
  );
  await answering;
  assert.equal(sent.status, 200);
  assert.equal(sent.body.id, 7);
  const task = sent.body.result?.task as Record<string, any>;
  assert.equal(task.status.state, "TASK_STATE_COMPLETED");
  assert.equal(task.status.message.role, "ROLE_AGENT");
  assert.equal(task.artifacts[0].parts[0].text, "Yes, Thursday works.");
  assert.deepEqual(
    task.history.map((m: any) => m.role),
    ["ROLE_USER", "ROLE_AGENT"],
  );
  // The same request in the relay's own terms.
  assert.equal((await relay.taskFor(ben, task.id)).metadata.from, ana.id);

  const got = await rpc(ana.token, ben.id, "GetTask", {
    id: task.id,
    historyLength: 1,
  });
  assert.equal((got.body.result as any).history.length, 1);
  const listed = await rpc(ana.token, ben.id, "ListTasks", {});
  assert.equal((listed.body.result as any).totalSize, 1);
  assert.equal((listed.body.result as any).tasks[0].id, task.id);
  assert.equal((listed.body.result as any).tasks[0].history, undefined);
  // Another member's endpoint does not show it.
  const cleo = await join("Cleo");
  const elsewhere = await rpc(ana.token, cleo.id, "GetTask", { id: task.id });
  assert.equal(elsewhere.body.error?.code, -32001);
});

test("returnImmediately answers at once; the asker answers a question back and cancels", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  const sent = await rpc(ana.token, ben.id, "SendMessage", {
    ...message("Can you review PR 12?"),
    configuration: { returnImmediately: true },
  });
  const task = sent.body.result?.task as Record<string, any>;
  assert.equal(task.status.state, "TASK_STATE_SUBMITTED");
  await relay.update(ben, task.id, {
    state: "INPUT_REQUIRED",
    text: "Which repository?",
  });
  const answered = await rpc(ana.token, ben.id, "SendMessage", {
    ...message("The web one.", { taskId: task.id }),
    configuration: { returnImmediately: true },
  });
  assert.equal(
    (answered.body.result?.task as any).status.state,
    "TASK_STATE_WORKING",
  );
  // Only the one asking cancels.
  const notHers = await rpc(ben.token, ana.id, "CancelTask", { id: task.id });
  assert.equal(notHers.body.error?.code, -32001);
  const canceled = await rpc(ana.token, ben.id, "CancelTask", { id: task.id });
  assert.equal(
    (canceled.body.result as any).status.state,
    "TASK_STATE_CANCELED",
  );
  const again = await rpc(ana.token, ben.id, "CancelTask", { id: task.id });
  assert.equal(again.body.error?.code, -32002);
});

test("a client that goes on by its conversation alone goes on with the open request", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  const first = await rpc(ana.token, ben.id, "SendMessage", {
    ...message("Lunch?", { contextId: "ctx-hermes-1" }),
    configuration: { returnImmediately: true },
  });
  const task = first.body.result?.task as Record<string, any>;
  assert.equal(task.contextId, "ctx-hermes-1");
  await relay.update(ben, task.id, { state: "INPUT_REQUIRED", text: "Where?" });
  const next = await rpc(ana.token, ben.id, "SendMessage", {
    ...message("The usual place.", { contextId: "ctx-hermes-1" }),
    configuration: { returnImmediately: true },
  });
  const same = next.body.result?.task as Record<string, any>;
  assert.equal(same.id, task.id);
  assert.equal(same.history.length, 3);
  await relay.update(ben, task.id, { state: "COMPLETED", text: "See you." });
  // Once it is done, the same conversation starts a new request in it.
  const later = await rpc(ana.token, ben.id, "SendMessage", {
    ...message("Tomorrow too?", { contextId: "ctx-hermes-1" }),
    configuration: { returnImmediately: true },
  });
  const another = later.body.result?.task as Record<string, any>;
  assert.notEqual(another.id, task.id);
  assert.equal(another.contextId, "ctx-hermes-1");
});

test("what is not offered is said in A2A's own errors", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  assert.equal(
    (await rpc(ana.token, ben.id, "SendStreamingMessage", message("hi"))).body
      .error?.code,
    -32004,
  );
  assert.equal(
    (await rpc(ana.token, ben.id, "CreateTaskPushNotificationConfig", {})).body
      .error?.code,
    -32003,
  );
  assert.equal(
    (await rpc(ana.token, ben.id, "Dance", {})).body.error?.code,
    -32601,
  );
  assert.equal(
    (
      await rpc(ana.token, ben.id, "SendMessage", message("hi"), {
        "A2A-Version": "2.0",
      })
    ).body.error?.code,
    -32009,
  );
  assert.equal(
    (
      await rpc(ana.token, ben.id, "SendMessage", {
        message: { role: "ROLE_AGENT", parts: [{ text: "x" }] },
      })
    ).body.error?.code,
    -32602,
  );
  assert.equal(
    (await rpc(ana.token, ana.id, "SendMessage", message("me?"))).body.error
      ?.code,
    -32602,
  );
  const unknown = await fetch(`${base}/a2a/${ben.id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(unknown.status, 401);
  // A client from before 1.0 uses slash names and gets the task itself.
  const legacy = await rpc(
    ana.token,
    ben.id,
    "message/send",
    { ...message("Old client"), configuration: { blocking: false } },
    {},
  );
  assert.equal(
    (legacy.body.result as any).status.state,
    "TASK_STATE_SUBMITTED",
  );
});

test("message parts become words; a file is named by its address, never fetched", () => {
  assert.equal(
    messageText({
      parts: [
        { text: "See this" },
        { url: "https://x.test/a.pdf", filename: "a.pdf" },
        { data: { n: 1 } },
        { raw: "AAAA", filename: "b.png" },
      ],
    }),
    'See this\n[file: a.pdf] https://x.test/a.pdf\n{"n":1}\n[file: b.png, not taken: send it as a link]',
  );
  assert.ok(versionServed(undefined));
  assert.ok(versionServed("1.0"));
  assert.ok(versionServed("0.3.0"));
  assert.ok(!versionServed("2.0"));
  const shown = a2aTask(
    {
      id: "t",
      contextId: "c",
      status: { state: "WORKING", timestamp: "2026-10-07T00:00:00.000Z" },
      history: [
        {
          messageId: "m",
          role: "user",
          parts: [{ text: "" }],
          files: [{ id: "f1", name: "q.csv", type: "text/csv", size: 3 }],
          taskId: "t",
          contextId: "c",
          metadata: { from: "a", at: "2026-10-07T00:00:00.000Z" },
        },
      ],
      metadata: { from: "a", to: "b", created: "2026-10-07T00:00:00.000Z" },
    },
    "http://relay",
  ) as any;
  assert.deepEqual(shown.history[0].parts, [
    { url: "http://relay/files/f1", filename: "q.csv", mediaType: "text/csv" },
  ]);
  assert.equal(shown.artifacts, undefined);
});
