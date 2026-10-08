import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { keepKnowledge, LEARN_PROMPT, LEARN_SCHEMA, pageSlug } from "./learn";
import { onlyRead } from "./reset";

const root = mkdtempSync(join(tmpdir(), "minime-knows-"));
const saved = process.env.CLONE_OFFICE_HOME;
before(() => {
  process.env.CLONE_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.CLONE_OFFICE_HOME;
  else process.env.CLONE_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

const answer = {
  user: [
    { kind: "work", text: "결론을 먼저, 짧게 보고받는 걸 좋아한다." },
    { kind: "decide", text: "돈이 걸린 일은 먼저 확인받고 싶어 한다." },
    { kind: "nonsense", text: "kept nowhere" },
  ],
  work: ["결제 API와 배포를 맡는다.", "GitHub, Linear, Slack에서 일한다."],
  projects: [
    {
      name: "Payments API",
      summary: "결제 승인과 환불을 맡는 서버",
      now: "10/7 상태값 이름을 바꾸는 중",
      page: "결제 승인·환불 서버. 내가 주로 맡는다.\n\n- 10/7: paid → succeeded",
    },
    { name: "", summary: "no name", page: "dropped" },
  ],
  people: [
    {
      name: "민지",
      summary: "디자인 담당",
      page: "출시 화면 문구를 같이 본다.",
    },
  ],
};

test("the first reading learns their work broadly: how they work, their work, projects and people", async () => {
  assert.match(LEARN_PROMPT, /what they are working on now/);
  assert.ok("projects" in LEARN_SCHEMA.properties);
  assert.ok("people" in LEARN_SCHEMA.properties);
  const { kept, knows } = await keepKnowledge(answer, "reading");
  assert.equal(kept.length, 4, "two lines about them, two about their work");
  assert.deepEqual(
    knows.user.map((trait) => trait.kind),
    ["work", "decide"],
  );
  const memories = join(root, "memories");
  assert.match(readFileSync(join(memories, "USER.md"), "utf8"), /결론을 먼저/);
  assert.match(readFileSync(join(memories, "MEMORY.md"), "utf8"), /GitHub/);
  assert.deepEqual(
    knows.projects.map((page) => page.path),
    ["projects/payments-api"],
  );
  assert.equal(knows.projects[0].now, "10/7 상태값 이름을 바꾸는 중");
  const page = readFileSync(
    join(root, "notes", "projects", "payments-api.md"),
    "utf8",
  );
  assert.match(page, /paid → succeeded/);
  assert.match(page, /first reading/);
  assert.deepEqual(
    knows.people.map((person) => person.path),
    ["people/민지"],
  );
});

test("a later reading adds to a page the notes already hold, under its date", async () => {
  await keepKnowledge(
    {
      user: [],
      work: [],
      projects: [
        {
          name: "Payments API",
          summary: "결제 서버",
          page: "10/9: 환불 한도 추가",
        },
      ],
    },
    "reading",
  );
  const page = readFileSync(
    join(root, "notes", "projects", "payments-api.md"),
    "utf8",
  );
  assert.match(page, /paid → succeeded/, "what was there stays");
  assert.match(page, /환불 한도 추가/);
});

test("pages the reading wrote are the reading's own when starting over; a page changed after is theirs", async () => {
  writeFileSync(join(root, "learn.json"), "{}");
  assert.equal(await onlyRead(root), true);
  await new Promise((done) => setTimeout(done, 20));
  writeFileSync(
    join(root, "notes", "people", "민지.md"),
    readFileSync(join(root, "notes", "people", "민지.md"), "utf8") +
      "\n더 알게 된 것",
  );
  assert.equal(await onlyRead(root), false);
});

test("a page's name is its words, joined", () => {
  assert.equal(pageSlug("Payments API", "x"), "payments-api");
  assert.equal(pageSlug("  결제 / 정산  ", "x"), "결제-정산");
  assert.equal(pageSlug("!!!", "projects-1"), "projects-1");
});
