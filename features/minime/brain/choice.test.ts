import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-brain-choice-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("Claude Code stays the brain until the person picks another; keys are theirs alone, checked for free", async () => {
  const choice = await import("./choice");
  assert.deepEqual(await choice.brainChoice(), { kind: "claude-code" });
  await choice.setBrainChoice({
    kind: "api",
    provider: "google",
    model: "gemini-3.8-flash",
  });
  assert.deepEqual(await choice.brainChoice(), {
    kind: "api",
    provider: "google",
    model: "gemini-3.8-flash",
  });
  assert.equal(await choice.brainProblem(), "brain-key-missing");
  await choice.setProviderKey("google", "AIza-test-key-0123456789");
  assert.equal(await choice.brainProblem(), undefined);
  assert.equal(await choice.providerKey("google"), "AIza-test-key-0123456789");
  if (process.platform !== "win32")
    assert.equal(statSync(choice.keysPath()).mode & 0o777, 0o600);
  assert.deepEqual(await choice.keyedProviders(), ["google"]);
  await choice.setProviderKey("google", undefined);
  assert.deepEqual(await choice.keyedProviders(), []);

  // A key is checked by listing the vendor's models: nothing is spent.
  const seen: string[] = [];
  const fake = (status: number) =>
    (async (url: string | URL | Request) => {
      seen.push(String(url));
      return new Response("{}", { status });
    }) as typeof fetch;
  await choice.checkKey("openai", "sk-good", undefined, fake(200));
  await assert.rejects(
    choice.checkKey("anthropic", "bad", undefined, fake(401)),
    /brain-key-wrong/,
  );
  await assert.rejects(
    choice.checkKey("openrouter", "k", undefined, fake(500)),
    /brain-unreachable/,
  );
  await choice.checkKey("local", "", "http://127.0.0.1:11434/v1/", fake(200));
  assert.deepEqual(seen, [
    "https://api.openai.com/v1/models",
    "https://api.anthropic.com/v1/models?limit=1",
    "https://openrouter.ai/api/v1/key",
    "http://127.0.0.1:11434/v1/models",
  ]);
  // A model on this computer needs no key.
  await choice.setBrainChoice({
    kind: "api",
    provider: "local",
    model: "qwen3:8b",
  });
  assert.equal(await choice.brainProblem(), undefined);
});

test("a backup model fits what the clone thinks with, is never the model itself, and stays while it fits", async () => {
  const choice = await import("./choice");
  await choice.setBrainChoice({ kind: "claude-code", model: "opus" });
  await choice.setFallback("sonnet");
  assert.deepEqual(await choice.brainChoice(), {
    kind: "claude-code",
    model: "opus",
    fallback: "sonnet",
  });
  await assert.rejects(choice.setFallback("opus"), /brain-fallback-same/);
  await assert.rejects(
    choice.setFallback({ provider: "openai", model: "gpt-6-luna" }),
    /brain-fallback-unfit/,
    "Claude Code moves only to another Claude",
  );
  // Another Claude picked: the backup stays; the backup itself picked: it goes.
  await choice.setBrainChoice({ kind: "claude-code", model: "haiku" });
  assert.equal((await choice.brainChoice()).fallback, "sonnet");
  await choice.setBrainChoice({ kind: "claude-code", model: "sonnet" });
  assert.equal((await choice.brainChoice()).fallback, undefined);

  // The app's own loop: any model it reaches, kept across a change of pick while it fits.
  await choice.setBrainChoice({
    kind: "api",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
  });
  await assert.rejects(choice.setFallback("haiku"), /brain-fallback-unfit/);
  await choice.setFallback({ provider: "openai", model: "gpt-6.1-sol" });
  await choice.setBrainChoice({
    kind: "api",
    provider: "anthropic",
    model: "claude-opus-5-5",
  });
  assert.deepEqual(await choice.brainChoice(), {
    kind: "api",
    provider: "anthropic",
    model: "claude-opus-5-5",
    fallback: { provider: "openai", model: "gpt-6.1-sol" },
  });
  await assert.rejects(
    choice.setFallback({ provider: "anthropic", model: "claude-opus-5-5" }),
    /brain-fallback-same/,
  );
  await choice.setFallback(undefined);
  assert.equal((await choice.brainChoice()).fallback, undefined);
  // Back to Claude Code: a loop's model is no backup for it.
  await choice.setFallback({ provider: "openai", model: "gpt-6.1-sol" });
  await choice.setBrainChoice({ kind: "claude-code" });
  assert.deepEqual(await choice.brainChoice(), { kind: "claude-code" });
});
