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
import { after, before, test } from "node:test";
import { leaveOut } from "./leave-out";

const root = mkdtempSync(join(tmpdir(), "minime-leave-"));
const saved = process.env.SUB_OFFICE_HOME;
before(() => {
  process.env.SUB_OFFICE_HOME = root;
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "settings.json"),
    JSON.stringify({ language: "Korean", exclude: ["/work/old"] }),
  );
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

test("asking the mini-me to leave a folder out adds it and keeps the other settings", async () => {
  const first = await leaveOut({ folder: " client-* " });
  assert.equal(first.isError, false);
  const settings = JSON.parse(
    readFileSync(join(root, "settings.json"), "utf8"),
  );
  assert.deepEqual(settings.exclude, ["/work/old", "client-*"]);
  assert.equal(settings.language, "Korean");
  assert.match((await leaveOut({ folder: "client-*" })).result, /already/);
  assert.equal((await leaveOut({ folder: "" })).isError, true);
});
