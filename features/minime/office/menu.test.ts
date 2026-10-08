import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  cleanMenu,
  loadMenu,
  menuLines,
  menuSkills,
  saveMenu,
  trustFor,
} from "./menu";

const root = mkdtempSync(join(tmpdir(), "minime-menu-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

test("a menu keeps what an item can hold, with an id of its own for each", () => {
  const menu = cleanMenu([
    {
      name: "Payments API questions",
      description: "Which endpoint",
      trust: "auto",
    },
    {
      name: "결제 API 질문",
      trust: "nonsense",
      examples: ["a", "b", "c", "d"],
    },
    { name: "Payments API questions!", trust: "ask" },
    { name: "리뷰 부탁", trust: "ask" },
    { name: "   ", trust: "auto" },
    "not an item",
  ]);
  assert.deepEqual(
    menu.map((item) => [item.id, item.trust]),
    [
      ["payments-api-questions", "auto"],
      ["api", "tell"],
      ["payments-api-questions-2", "ask"],
      ["item-4", "ask"],
    ],
  );
  assert.equal(menu[1]?.examples?.length, 3, "three examples at most");
  assert.deepEqual(cleanMenu("nope"), []);
});

test("colleagues see the kinds of request, never how much is done alone", () => {
  const menu = cleanMenu([
    {
      name: "Reviews",
      description: "Of payment changes",
      examples: ["Review #12?"],
      trust: "ask",
    },
  ]);
  assert.deepEqual(menuSkills(menu), [
    {
      id: "reviews",
      name: "Reviews",
      description: "Of payment changes",
      examples: ["Review #12?"],
    },
  ]);
  assert.equal(JSON.stringify(menuSkills(menu)).includes("ask"), false);
  assert.match(menuLines(menu), /^- reviews: Reviews — Of payment changes$/);
});

test("a request is done as its kind is set; one that fits none is answered and told", () => {
  const menu = cleanMenu([{ name: "Reviews", trust: "ask" }]);
  assert.equal(trustFor(menu, "reviews").trust, "ask");
  assert.equal(trustFor(menu, "unknown").trust, "tell");
  assert.equal(trustFor(menu, undefined).trust, "tell");
});

test("the menu is kept beside the other settings", async () => {
  writeFileSync(
    join(root, "settings.json"),
    '{"exclude":["~/client-a"],"language":"ko-KR"}',
  );
  await saveMenu([{ name: "Reviews", trust: "ask" }]);
  const settings = JSON.parse(
    readFileSync(join(root, "settings.json"), "utf8"),
  );
  assert.deepEqual(settings.exclude, ["~/client-a"]);
  assert.equal(settings.language, "ko-KR");
  assert.equal((await loadMenu())[0]?.trust, "ask");
});
