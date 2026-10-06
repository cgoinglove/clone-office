import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

const root = mkdtempSync(join(tmpdir(), "minime-loop-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

const usage = {
  inputTokens: { total: 120, noCache: 100, cacheRead: 20, cacheWrite: 0 },
  outputTokens: { total: 8, text: 8, reasoning: 0 },
};
const toolStep = (calls: { id: string; tool: string; input: unknown }[]) => ({
  stream: convertArrayToReadableStream([
    { type: "stream-start" as const, warnings: [] },
    ...calls.map((call) => ({
      type: "tool-call" as const,
      toolCallId: call.id,
      toolName: call.tool,
      input: JSON.stringify(call.input),
    })),
    {
      type: "finish" as const,
      finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
      usage,
    },
  ]),
});
const textStep = (text: string) => ({
  stream: convertArrayToReadableStream([
    { type: "stream-start" as const, warnings: [] },
    { type: "text-start" as const, id: "t" },
    { type: "text-delta" as const, id: "t", delta: text },
    { type: "text-end" as const, id: "t" },
    {
      type: "finish" as const,
      finishReason: { unified: "stop" as const, raw: "end_turn" },
      usage,
    },
  ]),
});
/** What the model was sent on each call, as text, to see what it saw. */
const sent = (model: MockLanguageModelV4) =>
  model.doStreamCalls.map((call) => JSON.stringify(call.prompt));

const CHOICE = {
  kind: "api" as const,
  provider: "openai" as const,
  model: "test-model",
};

test("a session on a model reached directly keeps what it learns, reads what it may, and goes on later", async () => {
  const { runLoop } = await import("./loop");
  const files = mkdtempSync(join(homedir(), ".minime-loop-test-"));
  try {
    writeFileSync(join(files, "plan.md"), "Ship on Friday.\nThen rest.");
    const events: { type: string }[] = [];
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep([
          {
            id: "m1",
            tool: "mcp__minime__memory",
            input: {
              action: "add",
              target: "user",
              content: "Likes short answers.",
            },
          },
          {
            id: "r1",
            tool: "Read",
            input: { file_path: join(files, "plan.md") },
          },
        ]),
        textStep("Friday."),
      ],
    });
    const first = await runLoop(
      {
        prompt: "When do we ship?",
        standing: { allow: [`Read(//${files.slice(1)}/**)`], deny: [] },
        onEvent: (event) => events.push(event),
      },
      CHOICE,
      { model },
    );
    assert.equal(first.ok, true, first.error ?? "");
    assert.equal(first.text, "Friday.");
    assert.ok(
      events.some((event) => event.type === "memory"),
      "kept a line, and the screen heard",
    );
    assert.match(sent(model)[1], /Ship on Friday/, "read the file it may read");
    assert.equal(first.context, 120);
    assert.equal(first.usage?.input_tokens, 240);

    // Going on: the next call sees the whole conversation; a copy leaves it as it was.
    const next = new MockLanguageModelV4({ doStream: [textStep("Yes.")] });
    const again = await runLoop(
      { prompt: "And after?", resume: first.sessionId },
      CHOICE,
      { model: next },
    );
    assert.equal(again.sessionId, first.sessionId);
    assert.match(
      sent(next)[0],
      /When do we ship\?[\s\S]*Friday\.[\s\S]*And after\?/,
    );
    const copy = new MockLanguageModelV4({ doStream: [textStep("Copied.")] });
    const forked = await runLoop(
      { prompt: "Look back.", resume: first.sessionId, fork: true },
      CHOICE,
      { model: copy },
    );
    assert.notEqual(forked.sessionId, first.sessionId);
    const missing = await runLoop(
      { prompt: "Hello?", resume: "not-kept-here-0001" },
      CHOICE,
      { model: copy },
    );
    assert.deepEqual(
      [missing.ok, missing.error],
      [false, "session-missing"],
      "a Claude Code session cannot go on here",
    );
  } finally {
    rmSync(files, { recursive: true, force: true });
  }
});

test("what the person has not allowed is refused with nobody to ask, and a folder kept out stays out", async () => {
  const { runLoop } = await import("./loop");
  const files = mkdtempSync(join(homedir(), ".minime-loop-test-"));
  try {
    mkdirSync(join(files, "secret"));
    writeFileSync(join(files, "secret", "pay.md"), "Salary: 1");
    writeFileSync(join(files, "open.md"), "Open.");
    const model = new MockLanguageModelV4({
      doStream: [
        toolStep([
          {
            id: "a",
            tool: "Read",
            input: { file_path: join(files, "open.md") },
          },
          {
            id: "b",
            tool: "Read",
            input: { file_path: join(files, "secret", "pay.md") },
          },
          { id: "c", tool: "WebFetch", input: { url: "https://example.com" } },
        ]),
        textStep("Done what I could."),
      ],
    });
    const result = await runLoop(
      {
        prompt: "Look.",
        standing: {
          allow: [`Read(//${files.slice(1)}/**)`],
          deny: [`Read(//${join(files, "secret").slice(1)}/**)`],
        },
      },
      CHOICE,
      { model },
    );
    assert.equal(result.ok, true, result.error ?? "");
    const seen = sent(model)[1];
    assert.match(seen, /Open\./);
    assert.doesNotMatch(seen, /Salary/, "kept out");
    assert.match(seen, /keeps out of everything/);
    assert.match(seen, /nobody is here to ask/, "a page it was never let open");
  } finally {
    rmSync(files, { recursive: true, force: true });
  }
});

test("a session that ends in a shape is asked for it last, and a session with nobody to ask gets only its keeping tools", async () => {
  const { runLoop } = await import("./loop");
  const model = new MockLanguageModelV4({
    // The shape is asked for last, streamed as everything is.
    doStream: [
      textStep("Thinking it over."),
      textStep(JSON.stringify({ reply: "Sure." })),
    ],
  });
  const result = await runLoop(
    {
      prompt: "Answer the request.",
      jsonSchema: {
        type: "object",
        properties: { reply: { type: "string" } },
        required: ["reply"],
      },
    },
    CHOICE,
    { model },
  );
  assert.equal(result.ok, true, result.error ?? "");
  assert.deepEqual(result.structured, { reply: "Sure." });
  const offered = (model.doStreamCalls[0].tools ?? []).map(
    (tool: { name: string }) => tool.name,
  );
  assert.ok(offered.includes("mcp__minime__memory"));
  assert.ok(
    !offered.includes("Read") && !offered.includes("mcp__minime__flow_manage"),
    offered.join(","),
  );
});

test("with the person there, what they have not allowed is asked on their screen, and their no holds", async () => {
  const { createServer } = await import("node:http");
  const { guarded, REFUSED } = await import("./loop-tools");
  const asked: unknown[] = [];
  let answer = "allow";
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    asked.push({
      secret: request.headers["x-minime-gate"],
      ...JSON.parse(body),
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: "q1", answered: true, answer }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/me/gate`;
    const guard = {
      allow: [],
      deny: [],
      gate: { url, secret: "s", chat: "c1" },
    };
    const ran = await guarded(
      guard,
      "WebFetch",
      { url: "https://example.com" },
      async () => "the page",
    );
    assert.equal(ran, "the page");
    assert.deepEqual(asked[0], {
      secret: "s",
      chat: "c1",
      ask: {
        kind: "permission",
        tool: "WebFetch",
        input: { url: "https://example.com" },
      },
    });
    answer = "deny";
    assert.equal(
      await guarded(
        guard,
        "WebFetch",
        { url: "https://example.com" },
        async () => "the page",
      ),
      REFUSED.no,
    );
    // Allowed already: nobody is asked.
    const before = asked.length;
    assert.equal(
      await guarded(
        { ...guard, allow: ["WebFetch(domain:example.com)"] },
        "WebFetch",
        { url: "https://example.com/a" },
        async () => "ok",
      ),
      "ok",
    );
    assert.equal(asked.length, before);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a model on this computer, reached over OpenAI's chat API as Ollama serves it, runs the whole loop", async () => {
  const { createServer } = await import("node:http");
  const { runLoop } = await import("./loop");
  const { checkKey } = await import("./choice");
  const bodies: {
    messages: { role: string }[];
    tools?: { function: { name: string } }[];
  }[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      return response.end(JSON.stringify({ data: [{ id: "qwen3:8b" }] }));
    }
    let raw = "";
    for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    bodies.push(body);
    const chunk = (delta: unknown, finish: string | null, usage?: unknown) =>
      `data: ${JSON.stringify({
        id: "c",
        object: "chat.completion.chunk",
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta, finish_reason: finish }],
        ...(usage ? { usage } : {}),
      })}\n\n`;
    const used = { prompt_tokens: 50, completion_tokens: 5, total_tokens: 55 };
    response.writeHead(200, { "content-type": "text/event-stream" });
    // First the model keeps something, then it answers once it hears back.
    const heard = body.messages.some(
      (m: { role: string }) => m.role === "tool",
    );
    response.end(
      heard
        ? `${chunk({ role: "assistant", content: "Noted." }, null)}${chunk({}, "stop", used)}data: [DONE]\n\n`
        : `${chunk(
            {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  type: "function",
                  function: {
                    name: "mcp__minime__memory",
                    arguments: JSON.stringify({
                      action: "add",
                      target: "user",
                      content: "Drinks tea.",
                    }),
                  },
                },
              ],
            },
            null,
          )}${chunk({}, "tool_calls", used)}data: [DONE]\n\n`,
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    await checkKey("local", "", baseUrl);
    const events: { type: string }[] = [];
    const result = await runLoop(
      {
        prompt: "Remember I drink tea.",
        onEvent: (event) => events.push(event),
      },
      { kind: "api", provider: "local", model: "qwen3:8b", baseUrl },
    );
    assert.equal(result.ok, true, result.error ?? "");
    assert.equal(result.text, "Noted.");
    assert.ok(events.some((event) => event.type === "memory"));
    assert.equal(bodies.length, 2);
    assert.ok(
      bodies[0].tools?.some(
        (tool) => tool.function.name === "mcp__minime__memory",
      ),
      "its tools go to the model",
    );
    const { MemoryStore } = await import("../memory/store");
    const { memoryDir } = await import("./session");
    assert.match(
      await new MemoryStore(memoryDir()).render("user"),
      /Drinks tea/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
