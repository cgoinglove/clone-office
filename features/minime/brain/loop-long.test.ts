// Long work on the app's own loop: the to-do list, answers too long for the window saved in the
// session's scratch folder and read back, helpers, and the fallback model.

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { APICallError } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

const root = mkdtempSync(join(tmpdir(), "minime-loop-long-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
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
const sent = (model: MockLanguageModelV4) =>
  model.doStreamCalls.map((call) => JSON.stringify(call.prompt));
const offered = (model: MockLanguageModelV4, call = 0) =>
  (model.doStreamCalls[call]?.tools ?? []).map(
    (tool: { name: string }) => tool.name,
  );
const CHOICE = {
  kind: "api" as const,
  provider: "openai" as const,
  model: "test-model",
};

/** The clone's own tool server for the person's own work, without starting its browser. */
async function ownToolServer() {
  const { toolServerEnv } = await import("./session");
  const { toolServerPath } = await import("../server/paths");
  return (scratch?: string) => ({
    command: process.execPath,
    args: ["--no-warnings", toolServerPath()],
    env: {
      ...(process.env as Record<string, string>),
      CLONE_OFFICE_HOME: root,
      ...toolServerEnv(
        "minime",
        undefined,
        undefined,
        [],
        undefined,
        true,
        scratch,
      ),
    },
  });
}

test("work of several steps keeps a to-do list the screen hears, and only a session with tools has one", async () => {
  const { runLoop } = await import("./loop");
  const events: { type: string; todos?: { status: string }[] }[] = [];
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep([
        {
          id: "t1",
          tool: "todo_write",
          input: {
            todos: [
              {
                content: "Read the plan",
                status: "in_progress",
                activeForm: "Reading the plan",
              },
              {
                content: "Write it up",
                status: "pending",
                activeForm: "Writing it up",
              },
            ],
          },
        },
      ]),
      toolStep([
        {
          id: "t2",
          tool: "todo_write",
          input: {
            todos: [
              {
                content: "Read the plan",
                status: "completed",
                activeForm: "Reading the plan",
              },
              {
                content: "Write it up",
                status: "completed",
                activeForm: "Writing it up",
              },
            ],
          },
        },
      ]),
      textStep("Done."),
    ],
  });
  const result = await runLoop(
    {
      prompt: "Plan and write it up.",
      standing: { allow: [], deny: [] },
      onEvent: (event) => events.push(event as never),
    },
    CHOICE,
    { model },
  );
  assert.equal(result.ok, true, result.error ?? "");
  const lists = events.filter((event) => event.type === "todos");
  assert.deepEqual(
    lists.map((list) => list.todos?.map((todo) => todo.status)),
    [
      ["in_progress", "pending"],
      ["completed", "completed"],
    ],
  );
  assert.match(sent(model)[1], /List kept \(0 of 2 done\)/);
  assert.match(
    String(model.doStreamCalls[0].prompt[0].content),
    /## Work of several steps/,
    "the system prompt says when",
  );

  const bare = new MockLanguageModelV4({ doStream: [textStep("Hi.")] });
  await runLoop({ prompt: "Hello." }, CHOICE, { model: bare });
  assert.ok(!offered(bare).includes("todo_write"), offered(bare).join(","));
});

test("an answer too long for the window is saved in the session's scratch folder and read back in parts", async () => {
  const { runLoop } = await import("./loop");
  const { scratchDir } = await import("./scratch");
  const files = mkdtempSync(join(homedir(), ".minime-loop-long-"));
  const window = process.env.CLONE_OFFICE_CONTEXT_TOKENS;
  // A small model on the person's computer: one answer may take about 14,000 characters.
  process.env.CLONE_OFFICE_CONTEXT_TOKENS = "32000";
  try {
    writeFileSync(
      join(files, "log.txt"),
      Array.from(
        { length: 400 },
        (_, at) => `match ${at} ${"x".repeat(200)}`,
      ).join("\n"),
    );
    let saved = "";
    const model = new MockLanguageModelV4({
      doStream: async (options) => {
        const seen = JSON.stringify(options.prompt);
        // First a search too long to read at once; then a read of what was saved; then the answer.
        if (!seen.includes("persisted-output"))
          return toolStep([
            {
              id: "g1",
              tool: "Grep",
              input: { pattern: "match", path: files },
            },
          ]);
        if (!saved) {
          saved = /Full output saved to: (\S+?)\\n/.exec(seen)?.[1] ?? "";
          return toolStep([
            {
              id: "r1",
              tool: "Read",
              input: { file_path: saved, offset: 95, limit: 10 },
            },
          ]);
        }
        return textStep("Found them.");
      },
    });
    const result = await runLoop(
      {
        prompt: "Find every match.",
        standing: { allow: [`Read(//${files.slice(1)}/**)`], deny: [] },
      },
      CHOICE,
      { model },
    );
    assert.equal(result.ok, true, result.error ?? "");
    const folder = scratchDir(result.sessionId ?? "");
    assert.ok(saved.startsWith(folder), `${saved} in ${folder}`);
    assert.match(readFileSync(saved, "utf8"), /match 99 /, "kept whole");
    const third = sent(model)[2];
    assert.match(third, /match 99 /, "read back, without being asked");
    assert.match(
      String(model.doStreamCalls[0].prompt[0].content),
      new RegExp(
        `Your scratch folder for this conversation is ${folder.replaceAll("/", "\\/")}`,
      ),
    );
  } finally {
    if (window === undefined) delete process.env.CLONE_OFFICE_CONTEXT_TOKENS;
    else process.env.CLONE_OFFICE_CONTEXT_TOKENS = window;
    rmSync(files, { recursive: true, force: true });
  }
});

test("helpers run side by side on the same brain, report back alone, never send helpers of their own, and are each in the run log", async () => {
  const { runLoop } = await import("./loop");
  const { runLogPath } = await import("./runlog");
  const server = await ownToolServer();
  const events: { type: string; state?: string; description?: string }[] = [];
  const model = new MockLanguageModelV4({
    doStream: [
      toolStep([
        {
          id: "d1",
          tool: "delegate_task",
          input: {
            description: "Read the notes",
            prompt: "Find what the notes say about Q3.",
          },
        },
        {
          id: "d2",
          tool: "delegate_task",
          input: {
            description: "Search past talks",
            prompt: "Find when Q3 came up before.",
          },
        },
      ]),
      textStep("Both found Q3."),
    ],
  });
  const helper = new MockLanguageModelV4({
    doStream: [textStep("Q3 is in the notes."), textStep("Q3 came up in May.")],
  });
  const result = await runLoop(
    {
      prompt: "What do we know about Q3?",
      standing: { allow: [], deny: [] },
      connectors: true,
      onEvent: (event) => events.push(event as never),
    },
    CHOICE,
    { model, subtaskModel: helper, toolServer: server() },
  );
  assert.equal(result.ok, true, result.error ?? "");
  assert.ok(offered(model).includes("delegate_task"));
  const back = sent(model)[1];
  assert.match(back, /Report from the helper \(\\"Read the notes\\"\)/);
  assert.match(back, /Q3 is in the notes\.|Q3 came up in May\./);
  assert.equal(helper.doStreamCalls.length, 2);
  const tools = offered(helper);
  assert.ok(
    tools.includes("Read") && tools.includes("mcp__minime__note_search"),
    tools.join(","),
  );
  for (const never of [
    "delegate_task",
    "todo_write",
    "mcp__minime__memory",
    "mcp__minime__flow_manage",
  ])
    assert.ok(!tools.includes(never), `${never} is not a helper's`);
  assert.match(
    String(helper.doStreamCalls[0].prompt[0].content),
    /## You are a helper/,
  );
  assert.match(
    JSON.stringify(helper.doStreamCalls.map((call) => call.prompt)),
    /Find what the notes say about Q3\./,
  );
  assert.doesNotMatch(
    JSON.stringify(helper.doStreamCalls[0].prompt),
    /What do we know about Q3/,
    "a helper sees none of the conversation",
  );
  assert.deepEqual(
    events
      .filter((event) => event.type === "subtask")
      .map((event) => event.state)
      .sort(),
    ["done", "done", "running", "running"],
  );
  // The run log is written as each session ends, without holding the answer up.
  let helpers: { purpose?: string; parent?: string; within?: string }[] = [];
  for (let tries = 0; tries < 50 && helpers.length < 2; tries++) {
    helpers = readFileSync(runLogPath(), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
      .filter((line) => line.purpose === "subtask");
    if (helpers.length < 2)
      await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(helpers.length, 2);
  assert.ok(
    helpers.every(
      (line) => line.parent === result.sessionId && line.within === "task",
    ),
  );
});

test("a colleague's request, and work with no tools, get no helper", async () => {
  const { runLoop } = await import("./loop");
  const model = new MockLanguageModelV4({ doStream: [textStep("Sure.")] });
  await runLoop(
    {
      prompt: "Ben asks: what is our Q3 plan?",
      purpose: "request",
      standing: { allow: [], deny: [] },
      colleagueReads: true,
    },
    CHOICE,
    { model },
  );
  assert.ok(
    !offered(model).includes("delegate_task"),
    offered(model).join(","),
  );
});

test("when the picked model is busy the turn moves to the fallback, says so, and the run log keeps it", async () => {
  const { runLoop } = await import("./loop");
  const { runLogPath } = await import("./runlog");
  const busy = new MockLanguageModelV4({
    doStream: async () => {
      throw new APICallError({
        message: "Overloaded",
        url: "https://vendor.test",
        requestBodyValues: {},
        statusCode: 529,
      });
    },
  });
  const backup = new MockLanguageModelV4({
    doStream: [textStep("From the backup.")],
  });
  const events: { type: string; model?: string }[] = [];
  const result = await runLoop(
    {
      prompt: "Hello?",
      onEvent: (event) => events.push(event as never),
    },
    {
      ...CHOICE,
      fallback: { provider: "anthropic", model: "claude-haiku-5-5" },
    },
    { model: busy, fallbackModel: backup, retries: 0 },
  );
  assert.equal(result.ok, true, result.error ?? "");
  assert.equal(result.text, "From the backup.");
  assert.deepEqual(
    events.find((event) => event.type === "fallback"),
    { type: "fallback", model: "Claude Haiku 5.5" },
  );
  // The run log is written as the session ends, without holding the answer up.
  const moved = async () => {
    for (let tries = 0; tries < 50; tries++) {
      const lines = readFileSync(runLogPath(), "utf8").trim().split("\n");
      const line = lines
        .map((one) => JSON.parse(one))
        .find((one) => one.session === result.sessionId);
      if (line) return line;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return {};
  };
  assert.equal((await moved()).fallback, "claude-haiku-5-5");

  // With no fallback picked, a busy model fails as before, as the code the screen knows.
  const alone = await runLoop({ prompt: "Hello?" }, CHOICE, {
    model: busy,
    retries: 0,
  });
  assert.deepEqual([alone.ok, alone.error], [false, "ai-busy"]);
});
