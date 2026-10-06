import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-mcp-"));
after(() => rmSync(root, { recursive: true, force: true }));

// The tool server runs under Node as it is (no bundler), so every import must resolve there.
test("the mini-me's tool server starts and lists its tools, the gate's and the hands' too", async () => {
  const server = spawn(
    process.execPath,
    ["features/minime/memory/mcp-server.ts"],
    {
      env: {
        ...process.env,
        SUB_OFFICE_HOME: root,
        MINIME_GATE_URL: "http://127.0.0.1:9/api/me/gate",
        MINIME_GATE_SECRET: "s",
        MINIME_CHAT_ID: "chat-1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const replies = new Map<number, (value: Record<string, unknown>) => void>();
  createInterface({ input: server.stdout }).on("line", (line) => {
    const reply = JSON.parse(line);
    replies.get(reply.id)?.(reply);
  });
  const call = (
    id: number,
    method: string,
    params: Record<string, unknown> = {},
  ) => {
    server.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    return new Promise<Record<string, unknown>>((resolve) =>
      replies.set(id, resolve),
    );
  };
  await call(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });
  server.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`,
  );
  const { tools } = (await call(2, "tools/list")).result as {
    tools: { name: string }[];
  };
  server.kill();
  const names = tools.map((t) => t.name);
  for (const name of [
    "memory",
    "conversation_search",
    "guide_read",
    "ask_me",
    "permission_prompt",
    "sessions",
    "ask_session",
  ])
    assert.ok(names.includes(name), `${name} is listed`);
});
