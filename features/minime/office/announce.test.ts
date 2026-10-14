import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-announce-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("what a colleague's request may now read is said once, and services connected before stay off", async () => {
  const { changeKept } = await import("../connectors/store.ts");
  const { readsForColleagues } = await import("../connectors/colleagues.ts");
  const { announceColleagueReads } = await import("./announce.ts");
  const { listChats, readChat } = await import("../chat/store.ts");
  await changeKept("notion", () => ({
    token: "t",
    toolsAt: Date.now(),
    tools: [{ name: "notion-search", readOnly: true }],
  }));
  await announceColleagueReads();
  const settings = JSON.parse(
    readFileSync(join(root, "settings.json"), "utf8"),
  );
  assert.equal(
    readsForColleagues("notion", settings.connectors.forColleagues),
    false,
    "connected while the screen said off: it stays off",
  );
  const chats = await listChats(10);
  assert.equal(chats.length, 1);
  const said = (await readChat(chats[0].id)).messages.map((m) => m.text);
  assert.match(said.join("\n"), /read the folders where your work lives/);
  // Once only.
  await announceColleagueReads();
  assert.equal((await readChat(chats[0].id)).messages.length, said.length);
});
