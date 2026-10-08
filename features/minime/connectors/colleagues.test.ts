import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-colleague-reads-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a colleague's request reads in the services let for it and can change nothing there; mail starts off", async () => {
  const { changeKept } = await import("./store.ts");
  const { colleagueRules, colleagueServices, setForColleagues } = await import(
    "./colleagues.ts"
  );
  const listed = Date.now();
  // Connected, with the tools each server said it has (as tools.ts keeps them).
  await changeKept("notion", () => ({
    token: "t",
    toolsAt: listed,
    tools: [
      { name: "notion-search", readOnly: true },
      { name: "notion-create-pages", readOnly: false },
    ],
  }));
  await changeKept("gmail", () => ({
    token: "t",
    toolsAt: listed,
    tools: [{ name: "gmail.search", readOnly: true }],
  }));

  const ids = async () =>
    (await colleagueServices()).map((entry) => entry.id).sort();
  assert.deepEqual(await ids(), ["notion"], "the person's mail starts off");
  assert.deepEqual(await colleagueRules(await colleagueServices()), {
    allow: ["mcp__notion__notion-search"],
    deny: ["mcp__notion__notion-create-pages"],
  });

  await setForColleagues("gmail", true);
  await setForColleagues("notion", false);
  assert.deepEqual(await ids(), ["gmail"]);
  assert.deepEqual((await colleagueRules(await colleagueServices())).allow, [
    "mcp__gmail__gmail_search",
  ]);
});
