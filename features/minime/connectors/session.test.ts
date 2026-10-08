import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-connector-session-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a session reaches each connected service through the helper, never with its token in the arguments", async () => {
  const { mcpConfig } = await import("../brain/session");
  const { connectedConnectors, setToken } = await import("./oauth");
  assert.deepEqual(await connectedConnectors(), []);
  await setToken("github", "github_pat_0123456789abcdefghij");
  const connected = await connectedConnectors();
  assert.deepEqual(
    connected.map((c) => c.id),
    ["github"],
  );
  const config = JSON.parse(mcpConfig("minime", undefined, connected));
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ["github", "minime"]);
  const github = config.mcpServers.github;
  assert.equal(github.type, "http");
  assert.equal(github.url, "https://api.githubcopilot.com/mcp/");
  assert.match(github.headersHelper, /headers\.ts" github "[^"]+"$/);
  assert.doesNotMatch(
    JSON.stringify(config),
    /github_pat_/,
    "the token stays in its file",
  );
});
