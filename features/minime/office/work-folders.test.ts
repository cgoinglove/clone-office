import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readsForColleagues } from "../connectors/colleagues.ts";
import { secretFile } from "../gate/secrets.ts";
import { workFolder, workReadRules } from "./work-folders.ts";

test("files named like keys and passwords are told apart from the rest", () => {
  for (const name of [
    ".env",
    ".env.local",
    ".env.production",
    "server.pem",
    "id_ed25519",
    "id_rsa.pub",
    ".npmrc",
    "credentials.json",
    "service-account-prod.json",
    "client_secret_123.json",
    "vault.kdbx",
  ])
    assert.ok(secretFile(name), name);
  for (const name of [
    ".env.example",
    ".env.sample",
    "env.ts",
    "README.md",
    "keyboard.ts",
    "monkey.json",
    "package.json",
  ])
    assert.ok(!secretFile(name), name);
});

test("a colleague's request reads only real work folders under home, never broad or hidden ones", async () => {
  const home = mkdtempSync(join(tmpdir(), "work-folders-"));
  try {
    const clone = join(home, ".clone-office");
    for (const folder of [
      "Desktop/project/api",
      "Documents/plans",
      "code",
      ".ssh",
      "client-x/app",
      ".clone-office",
    ])
      mkdirSync(join(home, folder), { recursive: true });
    writeFileSync(join(home, "notes.txt"), "x");
    const take = (given: string, excludes: string[] = []) =>
      workFolder(given, { home, clone, excludes });
    assert.equal(
      await take("~/Desktop/project/api"),
      join(home, "Desktop/project/api"),
    );
    assert.equal(
      await take(join(home, "Documents/plans")),
      join(home, "Documents/plans"),
    );
    assert.equal(await take("~/code"), join(home, "code"));
    // the home itself, a whole broad folder, a hidden one, the clone's own, a file, outside home
    for (const given of [
      "~",
      "~/Desktop",
      "~/Documents",
      "~/.ssh",
      "~/.clone-office",
      "~/notes.txt",
      "~/missing",
      "/etc",
      "relative/path",
    ])
      assert.equal(await take(given), undefined, given);
    // a folder the person keeps out, by path or by name
    assert.equal(await take("~/client-x/app", ["client-*"]), undefined);
    assert.equal(
      await take("~/client-x/app", [join(home, "client-x")]),
      undefined,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test("work folders become reading rules, and team trackers are read for colleagues unless turned off", () => {
  assert.deepEqual(workReadRules(["/srv/work/api"]), [
    "Read(//srv/work/api/**)",
  ]);
  assert.equal(readsForColleagues("linear", {}), true);
  assert.equal(readsForColleagues("github", {}), true);
  assert.equal(readsForColleagues("gmail", {}), false);
  assert.equal(readsForColleagues("drive", {}), false);
  assert.equal(readsForColleagues("linear", { linear: false }), false);
  assert.equal(readsForColleagues("gmail", { gmail: true }), true);
});
