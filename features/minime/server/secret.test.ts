import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-secret-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("secrets are sealed with the folder's own key, and what was written plain is still read", async () => {
  const {
    readSecretJson,
    writeSecretJson,
    secretKeyPath,
    isSealed,
    seal,
    open,
  } = await import("./secret.ts");
  const path = join(root, "keys.json");

  // Written before sealing began: read as it is.
  writeFileSync(path, JSON.stringify({ openai: "sk-old" }));
  assert.deepEqual(await readSecretJson(path), { openai: "sk-old" });

  await writeSecretJson(path, { openai: "sk-new" });
  const raw = readFileSync(path, "utf8");
  assert.ok(isSealed(raw), "sealed whole");
  assert.doesNotMatch(raw, /sk-new/);
  assert.deepEqual(await readSecretJson(path), { openai: "sk-new" });
  if (process.platform !== "win32") {
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(statSync(secretKeyPath()).mode & 0o777, 0o600);
  }

  // One key for the folder, kept: two equal secrets never look alike, and both open.
  const key = readFileSync(secretKeyPath(), "utf8");
  const [a, b] = [await seal("same"), await seal("same")];
  assert.notEqual(a, b);
  assert.equal(await open(a), "same");
  assert.equal(readFileSync(secretKeyPath(), "utf8"), key);

  // Sealed under another key: read as nothing, so it is given again.
  const { sealWith, newKeyText, keyFrom } = await import(
    "../../../lib/seal.ts"
  );
  const other = keyFrom(newKeyText()) as Buffer;
  writeFileSync(path, sealWith(other, JSON.stringify({ openai: "x" })));
  assert.equal(await readSecretJson(path), undefined);

  // A key file that is not a key is never replaced.
  writeFileSync(secretKeyPath(), "not a key\n");
  await assert.rejects(seal("x"), /not a key Clone Office made/);
  assert.equal(readFileSync(secretKeyPath(), "utf8"), "not a key\n");
});
