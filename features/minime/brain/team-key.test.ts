import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-team-key-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

interface Configured {
  config: {
    url?: (options: { path: string; modelId: string }) => string;
    baseURL?: string;
    headers: () => Promise<Record<string, string | undefined>>;
  };
}

test("with the office's team key, the clone calls its vendor through the relay, carrying only its own token", async () => {
  const { languageModel } = await import("./loop.ts");
  const choice = (provider: "openai" | "anthropic") => ({
    kind: "api" as const,
    provider,
    model: "m",
    team: true,
  });
  await assert.rejects(languageModel(choice("openai")), {
    code: "brain-team-no-office",
  });

  writeFileSync(
    join(root, "settings.json"),
    JSON.stringify({
      office: {
        relay: "http://127.0.0.1:3200",
        member: "m-1",
        token: "member-token",
        card: { name: "Ana", description: "" },
      },
    }),
  );
  const openai = (await languageModel(choice("openai")))
    .model as unknown as Configured;
  assert.equal(
    openai.config.url?.({ path: "/responses", modelId: "m" }),
    "http://127.0.0.1:3200/ai/openai/responses",
  );
  assert.equal(
    (await openai.config.headers()).authorization,
    "Bearer member-token",
  );

  const anthropic = (await languageModel(choice("anthropic")))
    .model as unknown as Configured;
  assert.equal(anthropic.config.baseURL, "http://127.0.0.1:3200/ai/anthropic");
  assert.equal((await anthropic.config.headers())["x-api-key"], "member-token");
});
