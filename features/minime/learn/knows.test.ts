import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { forgetKnown } from "./forget";
import {
  keepKnowledge,
  LEARN_CAPS,
  LEARN_PROMPT,
  LEARN_SCHEMA,
  pageSlug,
} from "./learn";
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

test("where their work lives is one map page, and a project's page starts with its folder", async () => {
  const { knows } = await keepKnowledge(
    {
      user: [],
      work: [],
      places: {
        title: "일하는 곳",
        entries: [
          { path: "~/code/app", about: "결제 서버 저장소" },
          { path: "~/Pictures/shoots", about: "촬영 원본" },
          { path: "bad `path`", about: "dropped" },
        ],
      },
      projects: [
        {
          name: "Checkout",
          path: "~/code/app",
          summary: "결제 화면",
          page: "결제 화면을 고친다.",
        },
      ],
    },
    "reading",
  );
  assert.deepEqual(
    knows.places?.map((spot) => spot.path),
    ["~/code/app", "~/Pictures/shoots"],
  );
  const map = readFileSync(
    join(root, "notes", "topics", "where-work-lives.md"),
    "utf8",
  );
  assert.match(map, /- `~\/code\/app` — 결제 서버 저장소/);
  assert.equal(knows.projects[0].folder, "~/code/app");
  assert.match(
    readFileSync(join(root, "notes", "projects", "checkout.md"), "utf8"),
    /`~\/code\/app`\n\n결제 화면을 고친다/,
  );
  // A later reading adds what it found and says anew what it found again; nothing is lost.
  const later = await keepKnowledge(
    {
      user: [],
      work: [],
      places: {
        title: "일하는 곳",
        entries: [{ path: "~/code/app", about: "결제 서버와 관리자 화면" }],
      },
    },
    "reading",
  );
  assert.deepEqual(later.knows.places, [
    { path: "~/code/app", about: "결제 서버와 관리자 화면" },
    { path: "~/Pictures/shoots", about: "촬영 원본" },
  ]);
});

test("a reading keeps no more than its caps, whatever the model gives, and the map keeps the newest places", async () => {
  const many = (n: number, kind: string) =>
    Array.from({ length: n }, (_, at) => ({
      name: `${kind} ${at}`,
      summary: `${kind} ${at}`,
      page: `${kind} ${at} page`,
    }));
  const { knows } = await keepKnowledge(
    {
      user: [],
      work: [],
      projects: many(LEARN_CAPS.projects + 5, "capped project"),
      people: many(LEARN_CAPS.people + 5, "capped person"),
      places: {
        title: "Where work lives",
        entries: Array.from({ length: 50 }, (_, at) => ({
          path: `~/old/${at}`,
          about: "older",
        })),
      },
    },
    "reading",
  );
  assert.equal(knows.projects.length, LEARN_CAPS.projects);
  assert.equal(knows.people.length, LEARN_CAPS.people);
  assert.equal(
    knows.places?.length,
    LEARN_CAPS.places + 2,
    "this reading's, and the two before",
  );
  // Readings go on; the map stays the same size, what was found last first.
  for (let round = 0; round < 4; round++)
    await keepKnowledge(
      {
        user: [],
        work: [],
        places: {
          title: "Where work lives",
          entries: [{ path: `~/new/${round}`, about: "newer" }],
        },
      },
      "reading",
    );
  const last = await keepKnowledge(
    {
      user: [],
      work: [],
      places: {
        title: "Where work lives",
        entries: Array.from({ length: LEARN_CAPS.places }, (_, at) => ({
          path: `~/latest/${at}`,
          about: "latest",
        })),
      },
    },
    "reading",
  );
  assert.equal(last.knows.places?.length, 60);
  assert.equal(last.knows.places?.[0].path, "~/latest/0");
  assert.equal(last.knows.places?.[LEARN_CAPS.places].path, "~/new/3");
});

test("what the reading kept is taken back one thing at a time: a line removed, a page archived, a place off the map", async () => {
  const { knows } = await keepKnowledge(
    {
      user: [{ kind: "voice", text: "take-back: answers in one line" }],
      work: ["take-back: the team ships on Thursdays"],
      projects: [
        {
          name: "Take Back Project",
          summary: "s",
          page: "a page to set aside",
        },
      ],
      people: [],
      places: {
        title: "Where work lives",
        entries: [{ path: "~/take/back", about: "a place to take off" }],
      },
    },
    "reading",
  );
  writeFileSync(
    join(root, "learn.json"),
    JSON.stringify({
      last: { at: new Date().toISOString(), since: "", kept: [], knows },
    }),
  );
  const page = knows.projects.find((one) => one.name === "Take Back Project");
  assert.ok(page);
  assert.equal(
    await forgetKnown({ kind: "user", text: "take-back: answers in one line" }),
    true,
  );
  assert.equal(
    await forgetKnown({
      kind: "work",
      text: "take-back: the team ships on Thursdays",
    }),
    true,
  );
  assert.equal(await forgetKnown({ kind: "projects", path: page.path }), true);
  assert.equal(
    await forgetKnown({ kind: "places", path: "~/take/back" }),
    true,
  );
  // Gone where it was kept, and from what the screen shows.
  assert.doesNotMatch(
    readFileSync(join(root, "memories", "USER.md"), "utf8"),
    /take-back/,
  );
  assert.doesNotMatch(
    readFileSync(join(root, "memories", "MEMORY.md"), "utf8"),
    /take-back/,
  );
  assert.equal(
    existsSync(join(root, "notes", `${page.path}.md`)),
    false,
    "set aside, never deleted",
  );
  assert.doesNotMatch(
    readFileSync(join(root, "notes", "topics", "where-work-lives.md"), "utf8"),
    /take\/back/,
  );
  const record = JSON.parse(readFileSync(join(root, "learn.json"), "utf8"));
  assert.equal(
    record.last.knows.projects.some(
      (one: { path: string }) => one.path === page.path,
    ),
    false,
  );
  assert.equal(
    record.last.knows.places.some(
      (one: { path: string }) => one.path === "~/take/back",
    ),
    false,
  );
  // Only the reading's own pages: nothing else in the notes is reached.
  assert.equal(
    await forgetKnown({ kind: "projects", path: "topics/where-work-lives" }),
    false,
  );
  assert.equal(
    await forgetKnown({ kind: "people", path: "people/../topics/x" }),
    false,
  );
});
