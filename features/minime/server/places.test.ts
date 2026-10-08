import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import {
  describeFolder,
  type PlaceDetail,
  placeScore,
  rankPlaces,
  runWalker,
} from "./places.ts";
import { plainRemote, readmeHead } from "./places-walk.ts";

const root = mkdtempSync(join(tmpdir(), "minime-places-"));
after(() => rmSync(root, { recursive: true, force: true }));

const DAY = 86_400_000;

function file(path: string, at = Date.now()) {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "x");
  utimesSync(path, at / 1000, at / 1000);
}

test("the walk finds where work changed lately, by place, and never looks into what it must skip", async () => {
  const docs = join(root, "Documents");
  file(join(docs, "Clients", "acme", "contract.docx"));
  file(join(docs, "Clients", "beta", "invoice.pdf"));
  file(join(docs, "Old", "notes.txt"), Date.now() - 90 * DAY);
  file(join(docs, "Clients", "node_modules", "pkg", "index.js"));
  file(join(docs, "Clients", "id_rsa"));
  file(join(docs, "Private", "diary.md"));
  file(join(docs, "loose.txt"));
  const repo = join(root, "code", "app");
  mkdirSync(join(repo, ".git", "logs"), { recursive: true });
  file(join(repo, ".git", "index"));
  file(join(repo, "src", "main.ts"));
  const lines = await runWalker(
    {
      mode: "walk",
      since: Date.now() - 30 * DAY,
      excludes: [join(docs, "Private")],
      roots: [docs, join(root, "code")],
      ai: [],
    },
    10_000,
  );
  const groups = new Map(
    lines.flatMap((line) =>
      line.type === "group" ? [[line.group.path, line.group] as const] : [],
    ),
  );
  const clients = groups.get(join(docs, "Clients"));
  assert.ok(clients, "a folder under a work folder is a place");
  assert.equal(
    clients.files,
    2,
    "what a package manager filled and keys are left out",
  );
  assert.deepEqual(clients.recent.map((one) => one.name).sort(), [
    "acme/contract.docx",
    "beta/invoice.pdf",
  ]);
  assert.equal(groups.has(join(docs, "Old")), false, "nothing recent there");
  assert.equal(
    groups.has(join(docs, "Private")),
    false,
    "kept out, never entered",
  );
  assert.equal(
    groups.get(docs)?.files,
    1,
    "what lies loose in a work folder is its own place",
  );
  assert.equal(groups.get(repo)?.kind, "repo", "a repository is one place");
  assert.equal(
    groups.has(join(root, "code", "app", "src")),
    false,
    "a repository is not walked",
  );
});

test("a walk that runs out of time gives back what came so far", async () => {
  const lines = await runWalker(
    {
      mode: "walk",
      since: Date.now() - DAY,
      excludes: [],
      roots: [join(root, "nowhere")],
      ai: [],
    },
    1,
  );
  assert.ok(Array.isArray(lines));
});

test("places rank by conversations, changes and how lately; a folder kept out stays listed but unread", () => {
  const now = Date.now();
  const places = rankPlaces(
    [
      {
        type: "group",
        group: {
          path: "/w/docs",
          kind: "folder",
          files: 40,
          changed: now - DAY,
          recent: [],
          kinds: {},
          folders: {},
        },
      },
      { type: "ai", path: "/w/app", exists: true, repo: true, changed: now },
      { type: "ai", path: "/w/gone", exists: false, repo: false, changed: 0 },
    ],
    [
      { path: "/w/app", name: "app", sessions: 30, tools: ["claude"] },
      { path: "/w/gone", name: "gone", sessions: 9, tools: ["codex"] },
      { path: "/w/secret", name: "secret", sessions: 5, tools: ["claude"] },
    ],
    ["/w/secret"],
    now,
  );
  assert.deepEqual(
    places.map((place) => place.path),
    ["/w/app", "/w/docs", "/w/secret"],
  );
  assert.equal(places[0].kind, "repo");
  assert.ok(
    placeScore({ ...places[0], sessions: 0, files: 0, changed: 0 }, now) < 2,
  );
});

test("a README's head is its words, without badges, pictures or markup", () => {
  assert.equal(
    readmeHead(
      '<p align="center"><img src="x.png"></p>\n\n# My App\n\n[![ci](b.svg)](c)\n\nA **tool** for [teams](https://x).\n\n```sh\nnpm i\n```\n',
    ),
    "My App A tool for teams.",
  );
});

test("a remote's address never carries a name or a password", () => {
  assert.equal(
    plainRemote("https://user:token@github.com/a/b.git"),
    "github.com/a/b",
  );
  assert.equal(plainRemote("git@github.com:a/b.git"), "github.com/a/b");
  assert.equal(plainRemote(""), "");
});

test("a plain folder is described by kind, by folder and by its newest files", () => {
  const place: PlaceDetail = {
    path: "/w/pics",
    name: "pics",
    kind: "folder",
    sessions: 0,
    tools: [],
    files: 3,
    changed: Date.parse("2026-10-01"),
    recent: [{ name: "shoot/a.jpg", at: Date.parse("2026-10-01") }],
    kinds: { jpg: 3 },
    folders: { shoot: 3 },
  };
  const lines = describeFolder(place).join("\n");
  assert.match(lines, /3 files changed/);
  assert.match(lines, /jpg 3/);
  assert.match(lines, /shoot\/a\.jpg \(2026-10-01\)/);
});
