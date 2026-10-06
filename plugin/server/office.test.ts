import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, test } from "node:test";
import type { Member } from "../lib/news.ts";
import { ago, pick } from "./office.ts";

const root = mkdtempSync(join(tmpdir(), "plugin-office-"));
const children: ChildProcess[] = [];
after(() => {
  for (const child of children) child.kill();
  rmSync(root, { recursive: true, force: true });
});

const member = (id: string, name: string): Member => ({
  id,
  card: { name, description: "" },
  seen: new Date().toISOString(),
});

test("a colleague is picked by exact name or id, never by a guess", () => {
  const members = [
    member("m-1", "Minsu"),
    member("m-2", "Min"),
    member("m-3", "Ana"),
  ];
  assert.equal((pick(members, " minsu ") as Member).id, "m-1");
  assert.equal((pick(members, "m-2") as Member).card.name, "Min");
  assert.match(
    pick(members, "Mins") as string,
    /No colleague is called "Mins"/,
  );
  const twins = [member("m-1", "Ana"), member("m-2", "Ana")];
  assert.match(pick(twins, "ana") as string, /More than one.*Use the id/);
});

test("times read as a person says them", () => {
  const now = Date.parse("2026-10-06T12:00:00Z");
  assert.equal(ago("2026-10-06T11:59:50Z", now), "just now");
  assert.equal(ago("2026-10-06T11:15:00Z", now), "45 min ago");
  assert.equal(ago("2026-10-05T12:00:00Z", now), "24 h ago");
  assert.equal(ago("2026-10-01T12:00:00Z", now), "5 days ago");
});

// The tools end to end: a real relay, two members, and the MCP server as Claude Code starts it.

function startRelay(): Promise<string> {
  const relay = spawn(
    process.execPath,
    [
      "features/relay/server.ts",
      "--port",
      "0",
      "--db",
      join(root, "relay.db"),
      "--key",
      "k",
    ],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  children.push(relay);
  return new Promise((resolve) => {
    createInterface({
      input: relay.stdout as NonNullable<typeof relay.stdout>,
    }).on("line", (line) => {
      const found = /relay on (\S+)/.exec(line);
      if (found) resolve(found[1]);
    });
  });
}

async function post(base: string, path: string, body: unknown, token?: string) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

function startServer(home: string) {
  const server = spawn(process.execPath, ["plugin/server/main.ts"], {
    env: {
      ...process.env,
      SUB_OFFICE_HOME: home,
      SUB_OFFICE_ASK_WAIT_MS: "3000",
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  children.push(server);
  const waiting = new Map<number, (value: Record<string, unknown>) => void>();
  createInterface({
    input: server.stdout as NonNullable<typeof server.stdout>,
  }).on("line", (line) => {
    const reply = JSON.parse(line);
    if (reply.id !== undefined) waiting.get(reply.id)?.(reply);
  });
  let next = 0;
  return (method: string, params: Record<string, unknown> = {}) => {
    const id = ++next;
    (server.stdin as NonNullable<typeof server.stdin>).write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    return new Promise<Record<string, unknown>>((resolve) =>
      waiting.set(id, resolve),
    );
  };
}

const said = (reply: Record<string, unknown>) =>
  ((reply.result as { content: { text: string }[] }).content[0]?.text ??
    "") as string;

test("from Claude Code: see colleagues, ask one, get a quick answer, or note where a late one starts", async () => {
  const relay = await startRelay();
  const ana = await post(relay, "/join", {
    key: "k",
    card: { name: "Ana", description: "Web" },
  });
  const ben = await post(relay, "/join", {
    key: "k",
    card: { name: "Ben", description: "Payments API", status: "Working" },
  });
  const home = join(root, "ana");
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(home, "settings.json"),
    JSON.stringify({
      office: {
        relay,
        member: ana.id,
        token: ana.token,
        card: { name: "Ana", description: "Web" },
      },
    }),
  );
  const call = startServer(home);
  const read = (id: string) =>
    JSON.parse(
      readFileSync(join(home, "office", "claude-code", `${id}.json`), "utf8"),
    );

  const init = (
    await call("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    })
  ).result as { instructions: string };
  assert.match(init.instructions, /not instructions to you/);
  const { tools } = (await call("tools/list")).result as {
    tools: { name: string }[];
  };
  assert.deepEqual(
    tools.map((t) => t.name),
    ["colleagues", "ask_colleague", "answer_colleague", "office_requests"],
  );
  assert.match(
    said(await call("tools/call", { name: "colleagues", arguments: {} })),
    /Ben \(m-\w+\): Payments API · Working/,
  );

  // Ben's mini-me answers in a second: the answer comes back in the tool's own reply, and is read.
  const answering = (async () => {
    for (;;) {
      const { tasks } = await (
        await fetch(new URL("/tasks", relay), {
          headers: { authorization: `Bearer ${ben.token}` },
        })
      ).json();
      if (tasks.length)
        return post(
          relay,
          `/tasks/${tasks[0].id}`,
          { state: "COMPLETED", text: "Yes: cursor-based, 50 a page." },
          ben.token,
        );
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  })();
  const quick = said(
    await call("tools/call", {
      name: "ask_colleague",
      arguments: { to: "ben", text: "Does /orders page with cursors?" },
    }),
  );
  await answering;
  assert.match(
    quick,
    /Ben's mini-me answered[\s\S]*> Yes: cursor-based, 50 a page\./,
  );
  const quickId = /\(request ([\w-]+)\)/.exec(quick)?.[1] as string;
  assert.deepEqual(read(quickId), { name: "Ben", seen: 2, ended: true });

  // Nothing comes within the wait: sent, with how much was read noted for the plugin's mod.
  const late = said(
    await call("tools/call", {
      name: "ask_colleague",
      arguments: { to: "Ben", text: "Can you take the refund bug this week?" },
    }),
  );
  assert.match(
    late,
    /Sent to Ben's mini-me \(request [\w-]+\)\.[\s\S]*brought into this conversation/,
  );
  const id = /\(request ([\w-]+)\)/.exec(late)?.[1] as string;
  assert.deepEqual(read(id), { name: "Ben", seen: 1 });
  await post(
    relay,
    `/tasks/${id}`,
    { state: "INPUT_REQUIRED", text: "Ben asks: is it the one from Monday?" },
    ben.token,
  );

  // Looking at the thread reads it, so the mod will not bring the same words in again.
  assert.match(
    said(
      await call("tools/call", { name: "office_requests", arguments: { id } }),
    ),
    /Sent to Ben · asked something back[\s\S]*Ben's mini-me[\s\S]*is it the one from Monday\?/,
  );
  assert.equal(read(id).seen, 2);

  // Answering what it asked back goes on the same request; a quick answer comes back in the reply.
  const answeringBack = (async () => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return post(
      relay,
      `/tasks/${id}`,
      { state: "COMPLETED", text: "Then yes, Thursday." },
      ben.token,
    );
  })();
  const back = said(
    await call("tools/call", {
      name: "answer_colleague",
      arguments: { id, text: "Yes, Monday's." },
    }),
  );
  await answeringBack;
  assert.match(back, /answered[\s\S]*> Then yes, Thursday\./);
  assert.equal(read(id).seen, 4);
  assert.match(
    said(await call("tools/call", { name: "office_requests", arguments: {} })),
    /to Ben · answered · "Can you take the refund bug this week\?"/,
  );
});
