import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { personLanguage } from "./language";

const root = mkdtempSync(join(tmpdir(), "minime-language-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("the page's language is kept for work that runs with no page open", async () => {
  writeFileSync(join(root, "settings.json"), '{"exclude":["~/client-a"]}');
  assert.equal(await personLanguage(undefined), undefined, "nothing known yet");
  assert.equal(await personLanguage("ko-KR"), "Korean");
  const settings = JSON.parse(
    readFileSync(join(root, "settings.json"), "utf8"),
  );
  assert.deepEqual(settings, { exclude: ["~/client-a"], language: "ko-KR" });
  assert.equal(await personLanguage(null), "Korean", "a call with no page");
  assert.equal(await personLanguage("ja"), "Japanese", "the page changed");
  assert.equal(
    await personLanguage("not a tag"),
    "Japanese",
    "a tag no one can name pins nothing",
  );
});
