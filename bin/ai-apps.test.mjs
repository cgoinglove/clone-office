import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  addApp,
  listApps,
  removeApp,
  tomlServer,
  withoutTomlServer,
} from "./ai-apps.mjs";

const root = join(import.meta.dirname, "..");

test("the office's tools are added to an AI app's own file, leaving everything else as it was", () => {
  const home = mkdtempSync(join(tmpdir(), "ai-apps-"));
  try {
    const appHome = join(home, ".clone-office");
    const at = { home, platform: "linux" };
    const desktop = join(
      home,
      ".config",
      "Claude",
      "claude_desktop_config.json",
    );
    mkdirSync(join(home, ".config", "Claude"), { recursive: true });
    writeFileSync(
      desktop,
      JSON.stringify({
        theme: "dark",
        mcpServers: { other: { command: "x" } },
      }),
    );
    mkdirSync(join(home, ".codex"));
    writeFileSync(
      join(home, ".codex", "config.toml"),
      'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "y"\n',
    );
    mkdirSync(join(home, ".cursor"));
    writeFileSync(join(home, ".cursor", "mcp.json"), "{ not json");

    const before = Object.fromEntries(
      listApps(at).map((app) => [app.id, app.added]),
    );
    assert.equal(before["claude-desktop"], false);

    assert.equal(addApp("claude-desktop", { root, appHome, ...at }).ok, true);
    const kept = JSON.parse(readFileSync(desktop, "utf8"));
    assert.equal(kept.theme, "dark");
    assert.deepEqual(kept.mcpServers.other, { command: "x" });
    assert.equal(
      kept.mcpServers["clone-office"].env.CLONE_OFFICE_HOME,
      appHome,
    );
    assert.match(kept.mcpServers["clone-office"].args[0], /server/);

    assert.equal(addApp("codex", { root, appHome, ...at }).ok, true);
    // added twice, it is there once
    assert.equal(addApp("codex", { root, appHome, ...at }).ok, true);
    const toml = readFileSync(join(home, ".codex", "config.toml"), "utf8");
    assert.equal(toml.match(/\[mcp_servers\.clone-office\]/g)?.length, 1);
    assert.match(toml, /\[mcp_servers\.other\]\ncommand = "y"/);

    // a file that does not read as JSON is left alone
    assert.deepEqual(addApp("cursor", { root, appHome, ...at }), {
      ok: false,
      message: "config-unreadable",
    });
    assert.equal(
      readFileSync(join(home, ".cursor", "mcp.json"), "utf8"),
      "{ not json",
    );

    const after = Object.fromEntries(
      listApps(at).map((app) => [app.id, app.added]),
    );
    assert.equal(after["claude-desktop"], true);
    assert.equal(after.codex, true);
    assert.equal(after.cursor, false);
    assert.equal(after.gemini, false);

    assert.equal(removeApp("codex", at).ok, true);
    assert.doesNotMatch(
      readFileSync(join(home, ".codex", "config.toml"), "utf8"),
      /clone-office/,
    );
    assert.equal(removeApp("claude-desktop", at).ok, true);
    assert.deepEqual(JSON.parse(readFileSync(desktop, "utf8")).mcpServers, {
      other: { command: "x" },
    });
    assert.equal(addApp("nothing", { root, appHome, ...at }).ok, false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("Codex's section is written as TOML and taken out up to the next table", () => {
  const section = tomlServer({
    command: "/usr/bin/node",
    args: ['/a "b"/office.mjs'],
    env: { CLONE_OFFICE_HOME: "/h" },
  });
  assert.equal(
    section,
    '[mcp_servers.clone-office]\ncommand = "/usr/bin/node"\nargs = ["/a \\"b\\"/office.mjs"]\nenv = { CLONE_OFFICE_HOME = "/h" }',
  );
  assert.equal(
    withoutTomlServer(`a = 1\n\n${section}\n\n[next]\nb = 2\n`),
    "a = 1\n\n[next]\nb = 2\n",
  );
});
