import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-colleague-reads-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a colleague's request reads only where the person let it, only with listed reading tools", async () => {
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
  assert.deepEqual(await ids(), [], "nothing until the person turns it on");

  await setForColleagues("notion", true);
  assert.deepEqual(await ids(), ["notion"]);
  const rules = await colleagueRules(await colleagueServices());
  assert.deepEqual(rules.allow, ["mcp__notion__notion-search"]);
  assert.deepEqual(rules.deny, ["mcp__notion__notion-create-pages"]);
  assert.deepEqual([...(rules.reads.get("notion") ?? [])], ["notion-search"]);
  assert.deepEqual(rules.services, ["notion"]);

  // A service whose tools could not be listed offers nothing at all.
  await changeKept("notion", (was) => ({ ...was, tools: [], toolsAt: listed }));
  const blind = await colleagueRules(await colleagueServices());
  assert.deepEqual(blind.allow, []);
  assert.deepEqual([...(blind.reads.get("notion") ?? [])], []);
  assert.deepEqual(
    blind.services,
    ["notion"],
    "and its prompt refuses every tool",
  );
});
