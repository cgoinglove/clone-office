import assert from "node:assert/strict";
import { test } from "node:test";
import { parseId, relayout, skillFolder } from "./hub.ts";

const text = (value: string) => new TextEncoder().encode(value);
const read = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

test("a registry id is owner/repo/skill, each part plain", () => {
  assert.deepEqual(parseId("anthropics/skills/pdf"), {
    repo: "anthropics/skills",
    skill: "pdf",
  });
  assert.deepEqual(parseId("skills.sh/a/b/c"), { repo: "a/b", skill: "c" });
  assert.equal(parseId("a/b"), undefined);
  assert.equal(parseId("a/../b/c"), undefined);
  assert.equal(parseId("a/b/c d"), undefined);
});

test("a skill's folder is found where repositories usually keep it, else anywhere", () => {
  const tree = [
    { path: "skills/pdf/SKILL.md", type: "blob" },
    { path: "other/pdf/SKILL.md", type: "blob" },
    { path: "deep/x/docx/SKILL.md", type: "blob" },
    { path: "SKILL.md", type: "blob" },
  ];
  assert.equal(skillFolder(tree, "pdf"), "skills/pdf");
  assert.equal(skillFolder(tree, "docx"), "deep/x/docx");
  assert.equal(skillFolder(tree, "nothing"), undefined);
});

test("a registry skill's other files move under references or assets, and SKILL.md follows them", () => {
  const files = relayout([
    {
      path: "SKILL.md",
      bytes: text(
        "See REFERENCE.md and [forms](forms.md). Run `scripts/a.py`.\nKeep reference.md.bak as is.",
      ),
    },
    { path: "reference.md", bytes: text("r") },
    { path: "forms.md", bytes: text("f") },
    { path: "scripts/a.py", bytes: text("print(1)") },
    { path: "logo.png", bytes: new Uint8Array([137, 80]) },
  ]);
  assert.deepEqual(
    files.map((file) => file.path),
    [
      "SKILL.md",
      "references/reference.md",
      "references/forms.md",
      "scripts/a.py",
      "assets/logo.png",
    ],
  );
  const skill = read(files[0].bytes);
  assert.match(
    skill,
    /See references\/reference\.md and \[forms\]\(references\/forms\.md\)/,
  );
  assert.match(skill, /`scripts\/a\.py`/);
  assert.match(
    skill,
    /reference\.md\.bak/,
    "a longer name that only starts the same stays",
  );
});
