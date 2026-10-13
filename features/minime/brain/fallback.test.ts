import assert from "node:assert/strict";
import { test } from "node:test";
import { APICallError, stepCountIs, streamText } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { fallsBack, rootError, withFallback } from "./fallback.ts";

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};
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
const busy = (status = 529) =>
  new APICallError({
    message: status === 529 ? "Overloaded" : `HTTP ${status}`,
    url: "https://vendor.test/v1",
    requestBodyValues: {},
    statusCode: status,
    // A short wait, so the SDK's own retries do not slow the test.
    responseHeaders: { "retry-after-ms": "1" },
  });

const said = async (
  model: Parameters<typeof streamText>[0]["model"],
  maxRetries = 0,
) => {
  const run = streamText({
    model,
    prompt: "Hello?",
    maxRetries,
    stopWhen: stepCountIs(1),
  });
  let text = "";
  let error: unknown;
  for await (const part of run.fullStream) {
    if (part.type === "text-delta") text += part.text;
    if (part.type === "error") error = part.error;
  }
  return { text, error };
};

test("a busy or failing vendor is a reason to move; a wrong key or a refused request is not", () => {
  assert.equal(fallsBack(busy(529)), true);
  assert.equal(fallsBack(busy(429)), true);
  assert.equal(fallsBack(busy(500)), true);
  assert.equal(fallsBack(busy(401)), false);
  assert.equal(fallsBack(busy(400)), false);
  // The AI SDK gives up with an error that keeps the last one it saw.
  const gaveUp = Object.assign(new Error("Failed after 3 attempts"), {
    lastError: busy(503),
  });
  assert.equal(rootError(gaveUp), gaveUp.lastError);
  assert.equal(fallsBack(gaveUp), true);
  assert.equal(
    fallsBack({ type: "overloaded_error", message: "Overloaded" }),
    true,
  );
  assert.equal(fallsBack(new Error("Invalid API key")), false);
});

test("after the SDK's retries the call goes to the fallback, and the rest of the turn stays there", async () => {
  let tries = 0;
  const main = new MockLanguageModelV4({
    provider: "anthropic.messages",
    doStream: async () => {
      tries += 1;
      throw busy(529);
    },
  });
  const other = new MockLanguageModelV4({
    provider: "openai.responses",
    doStream: [textStep("From the backup."), textStep("Still the backup.")],
  });
  const moves: number[] = [];
  const model = withFallback(
    main,
    { model: other, options: { openai: { store: false } } },
    () => moves.push(1),
    1,
  );
  const first = await said(model, 1);
  assert.equal(first.text, "From the backup.");
  assert.equal(tries, 2, "the picked model was tried, and retried once, first");
  assert.deepEqual(moves, [1]);
  assert.deepEqual(other.doStreamCalls[0].providerOptions, {
    openai: { store: false },
  });
  const second = await said(model, 1);
  assert.equal(second.text, "Still the backup.");
  assert.equal(tries, 2, "moved for good within the turn");
  assert.deepEqual(moves, [1], "heard once");
});

test("a stream that opens saying it is overloaded moves at once; one that answers stays", async () => {
  const overloaded = new MockLanguageModelV4({
    provider: "anthropic.messages",
    doStream: {
      stream: convertArrayToReadableStream([
        { type: "stream-start" as const, warnings: [] },
        {
          type: "error" as const,
          error: { type: "overloaded_error", message: "Overloaded" },
        },
      ]),
    },
  });
  const other = new MockLanguageModelV4({
    doStream: [textStep("Backup.")],
  });
  let moved = false;
  const model = withFallback(overloaded, { model: other, options: {} }, () => {
    moved = true;
  });
  assert.equal((await said(model)).text, "Backup.");
  assert.equal(moved, true);

  const fine = new MockLanguageModelV4({ doStream: [textStep("Main.")] });
  const unused = new MockLanguageModelV4({ doStream: [textStep("No.")] });
  const steady = withFallback(fine, { model: unused, options: {} }, () => {
    throw new Error("must not move");
  });
  assert.equal((await said(steady)).text, "Main.");
  assert.equal(unused.doStreamCalls.length, 0);
});

test("a wrong key fails as it is, without moving", async () => {
  const refused = new MockLanguageModelV4({
    doStream: async () => {
      throw busy(401);
    },
  });
  const other = new MockLanguageModelV4({ doStream: [textStep("No.")] });
  const model = withFallback(refused, { model: other, options: {} }, () => {
    throw new Error("must not move");
  });
  const result = await said(model);
  assert.equal(result.text, "");
  assert.ok(APICallError.isInstance(result.error));
  assert.equal(other.doStreamCalls.length, 0);
});

test("a vendor's own tool goes only to that vendor's models", async () => {
  const main = new MockLanguageModelV4({
    provider: "anthropic.messages",
    doStream: async () => {
      throw busy(503);
    },
  });
  const other = new MockLanguageModelV4({
    provider: "openai.responses",
    doStream: [textStep("Searched elsewhere.")],
  });
  const model = withFallback(main, { model: other, options: {} }, () => {}, 0);
  const run = streamText({
    model,
    prompt: "Look it up.",
    maxRetries: 0,
    tools: {
      web_search: {
        type: "provider",
        id: "anthropic.web_search_20260209",
        args: {},
        inputSchema: { jsonSchema: { type: "object" } },
      } as never,
    },
  });
  for await (const _ of run.fullStream);
  assert.deepEqual(other.doStreamCalls[0].tools ?? [], []);
});
