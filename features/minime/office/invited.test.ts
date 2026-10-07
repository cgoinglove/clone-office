import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-invited-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("an invite the launcher kept is offered with who sent it, until it is used", async () => {
  const { clearInvite, readInvite } = await import("./invited");
  const path = join(root, "settings.json");
  assert.equal(await readInvite(), undefined);

  writeFileSync(
    path,
    JSON.stringify({
      profile: { name: "Mina" },
      invite: { link: "http://192.168.0.7:3200/i/key1?from=Ana%20Kim" },
    }),
  );
  assert.deepEqual(await readInvite(), {
    link: "http://192.168.0.7:3200/i/key1?from=Ana%20Kim",
    from: "Ana Kim",
  });

  await clearInvite();
  assert.equal(await readInvite(), undefined);
  const kept = JSON.parse(readFileSync(path, "utf8"));
  assert.deepEqual(kept, { profile: { name: "Mina" } }, "the rest stays");

  writeFileSync(path, JSON.stringify({ invite: { link: "not a link" } }));
  assert.equal(await readInvite(), undefined, "only an invite link is one");
});
