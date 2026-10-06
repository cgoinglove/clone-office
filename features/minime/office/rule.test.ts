import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-rule-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("three answers of a kind sent as they were, and the mini-me offers to do them alone", async () => {
  const { answerAsk, pendingAsks } = await import("../gate/gate");
  const { countApproval, RULE_CHAT } = await import("./handle");
  const { loadMenu, saveMenu } = await import("./menu");
  writeFileSync(join(root, "settings.json"), "{}");
  const [item] = await saveMenu([{ name: "API questions", trust: "ask" }]);
  if (!item) throw new Error("no item");

  await countApproval(item, true);
  await countApproval(item, true);
  await countApproval(item, false);
  await countApproval(item, true);
  await countApproval(item, true);
  assert.equal(
    pendingAsks(RULE_CHAT).length,
    0,
    "a changed answer starts the count again",
  );

  await countApproval(item, true);
  const [offer] = pendingAsks(RULE_CHAT);
  assert.deepEqual(offer?.ask, {
    kind: "rule",
    menu: "API questions",
    trust: "tell",
  });

  answerAsk(offer?.id ?? "", "yes");
  for (let i = 0; i < 50 && (await loadMenu())[0]?.trust !== "tell"; i++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(
    (await loadMenu())[0]?.trust,
    "tell",
    "on their yes, the kind is answered and told",
  );
});
