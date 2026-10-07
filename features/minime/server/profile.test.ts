import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  cleanAbout,
  cleanList,
  profileBlock,
  readProfile,
  writeProfile,
} from "./profile";

const root = mkdtempSync(join(tmpdir(), "minime-profile-"));
process.env.SUB_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a reading's view of their work is cleaned, and nothing seen is no suggestion", () => {
  assert.deepEqual(
    cleanAbout({
      role: " Backend developer ",
      owns: ["payments API", "Payments API", "", 3, "releases"],
      tools: [
        "Notion",
        "Figma",
        "Slack",
        "Linear",
        "Claude Code",
        "Cursor",
        "Zoom",
      ],
    }),
    {
      role: "Backend developer",
      owns: ["payments API", "releases"],
      tools: ["Notion", "Figma", "Slack", "Linear", "Claude Code", "Cursor"],
    },
  );
  assert.equal(cleanAbout({ role: " ", owns: [], tools: [] }), undefined);
  assert.equal(cleanAbout("not one"), undefined);
  assert.deepEqual(cleanList(["a", "b", "c"], 2, 10), ["a", "b"]);
});

test("the profile keeps what is left out, clears what is emptied, and leaves other settings alone", async () => {
  writeFileSync(join(root, "settings.json"), '{"exclude":["~/private"]}');
  assert.deepEqual(await readProfile(), {});
  await writeProfile({ name: "Ana", role: "Designer", owns: ["checkout"] });
  await writeProfile({ tools: ["Figma"] });
  assert.deepEqual(await readProfile(), {
    name: "Ana",
    role: "Designer",
    owns: ["checkout"],
    tools: ["Figma"],
  });
  await writeProfile({ owns: [], role: "" });
  assert.deepEqual(await readProfile(), { name: "Ana", tools: ["Figma"] });
  const settings = JSON.parse(
    readFileSync(join(root, "settings.json"), "utf8"),
  );
  assert.deepEqual(settings.exclude, ["~/private"]);
});

test("the clone starts each session knowing whose work it does, and an empty profile adds nothing", () => {
  assert.equal(profileBlock({}), "");
  const block = profileBlock({
    name: "Ana",
    role: "Designer",
    owns: ["checkout", "onboarding"],
    tools: ["Figma"],
  });
  assert.match(block, /## Your person/);
  assert.match(block, /What they do: Designer/);
  assert.match(block, /What they look after: checkout; onboarding/);
  assert.match(block, /Tools they work in: Figma/);
  assert.match(block, /look it up/, "it is no stand-in for what is current");
});
