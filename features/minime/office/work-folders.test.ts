import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readsForColleagues } from "../connectors/colleagues.ts";
import { SECRET_READ_RULES, secretFile } from "../gate/secrets.ts";
import { workFolder, workReadRules } from "./work-folders.ts";

test("files named like keys and passwords are told apart from the rest, by name or path", () => {
  for (const path of [
    ".env",
    ".env.local",
    ".env.example",
    "server.pem",
    "id_ed25519",
    "id_rsa.pub",
    ".npmrc",
    "credentials",
    "credentials.json",
    "service-account-prod.json",
    "client_secret_123.json",
    "vault.kdbx",
    "prod.tfvars",
    "/home/a/proj/.git/config",
    "/home/a/proj/.claude/settings.local.json",
    "/home/a/.ssh/anything",
    "/home/a/proj/.dev.vars",
  ])
    assert.ok(secretFile(path), path);
  for (const path of [
    "env.ts",
    "README.md",
    "keyboard.ts",
    "monkey.json",
    "package.json",
    "/home/a/proj/config",
    "/home/a/proj/.git/HEAD",
  ])
    assert.ok(!secretFile(path), path);
  // Claude Code is told the same, from the disk's root
  assert.ok(SECRET_READ_RULES.includes("Read(//**/.env)"));
  assert.ok(SECRET_READ_RULES.includes("Read(//**/.ssh/**)"));
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
    mkdirSync(join(home, "Library", "CloudStorage", "drive"), {
      recursive: true,
    });
    mkdirSync(join(home, "a,b"));
    symlinkSync(clone, join(home, "link-to-clone"));
    symlinkSync(join(home, "code"), join(home, "link-to-code"));
    const take = (given: string, excludes: string[] = []) =>
      workFolder(given, { home, clone, excludes });
    const real = realpathSync(home);
    assert.equal(
      await take("~/Desktop/project/api"),
      join(real, "Desktop/project/api"),
    );
    assert.equal(
      await take(join(home, "Documents/plans")),
      join(real, "Documents/plans"),
    );
    assert.equal(await take("~/code"), join(real, "code"));
    // a link is taken as where it leads
    assert.equal(await take("~/link-to-code"), join(real, "code"));
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
      "~/Library/CloudStorage/drive",
      "~/link-to-clone",
      "~/a,b",
      ...(process.platform === "darwin" ? ["~/desktop"] : []),
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
