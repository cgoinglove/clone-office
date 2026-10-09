import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { after, test } from "node:test";
import {
  describeFolder,
  MAX_PLACES,
  type PlaceDetail,
  placeScore,
  rankPlaces,
  runWalker,
} from "./places.ts";
import {
  gitActivity,
  gitDirOf,
  plainRemote,
  readmeHead,
  type WalkLine,
} from "./places-walk.ts";

const root = mkdtempSync(join(tmpdir(), "minime-places-"));
after(() => rmSync(root, { recursive: true, force: true }));

const DAY = 86_400_000;

function file(path: string, at = Date.now(), text = "x") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
  utimesSync(path, at / 1000, at / 1000);
}

/** A reflog line as git writes it, at a time. */
const reflogLine = (at: number) =>
  `${"0".repeat(40)} ${"1".repeat(40)} A <a@b.c> ${Math.floor(at / 1000)} +0900\tcommit: x\n`;

/** A repository as the walk sees it: a .git folder with an index and a reflog. */
function repo(path: string, entries: number[] = [Date.now()]) {
  file(join(path, ".git", "index"));
  file(
    join(path, ".git", "logs", "HEAD"),
    Date.now(),
    entries.map(reflogLine).join(""),
  );
  file(join(path, "README.md"));
}

/** No place lies inside another. */
function assertApart(places: { path: string }[]) {
  for (const a of places)
    for (const b of places)
      if (a !== b)
        assert.ok(
          !(b.path === a.path || b.path.startsWith(a.path + sep)),
          `${b.path} lies inside ${a.path}`,
        );
}

test("a walk of a real disk gives places none of which lies inside another", async () => {
  const home = join(root, "walk-home");
  const desktop = join(home, "Desktop");
  const docs = join(home, "Documents");
  const projects = join(desktop, "projects");
  const old = Date.now() - 90 * DAY;
  // A collection: two repositories, a worktree of one, a plain folder and a loose file.
  repo(join(projects, "app"), [Date.now(), Date.now() - DAY, Date.now(), old]);
  file(join(projects, "app", "src", "main.ts"));
  repo(join(projects, "web"));
  file(join(projects, "app", ".git", "worktrees", "wt", "index"));
  file(
    join(projects, "app-wt", ".git"),
    Date.now(),
    "gitdir: ../app/.git/worktrees/wt\n",
  );
  file(join(projects, "notes", "ideas.md"));
  file(join(projects, "notes", "drafts", "first.md"));
  file(join(projects, "README.md"));
  // Loose on the desktop beside the collection, and a plain folder of its own.
  file(join(desktop, "shot.png"));
  file(join(desktop, "videos", "a.mp4"));
  // Documents: plain folders only, what must never be looked at, and something old.
  file(join(docs, "Clients", "acme", "contract.docx"));
  file(join(docs, "Clients", "beta", "invoice.pdf"));
  file(join(docs, "Clients", "node_modules", "pkg", "index.js"));
  file(join(docs, "Clients", "id_rsa"));
  file(join(docs, "Private", "diary.md"));
  file(join(docs, "Old", "notes.txt"), old);
  file(join(docs, "loose.txt"));

  const roots = [desktop, docs, join(home, "Downloads")];
  const excludes = [join(docs, "Private")];
  const ai = [join(projects, "app", "src"), projects];
  const since = Date.now() - 30 * DAY;
  const lines = await runWalker(
    { mode: "walk", since, excludes, roots, ai, ms: 8_000 },
    10_000,
  );
  const { places, groups } = rankPlaces(
    lines,
    [
      { path: ai[0], name: "src", sessions: 4, tools: ["claude"] },
      { path: ai[1], name: "projects", sessions: 2, tools: ["codex"] },
    ],
    excludes,
    Date.now(),
    roots,
    home,
  );
  const byPath = new Map(places.map((place) => [place.path, place]));
  assert.deepEqual(
    [...byPath.keys()].sort(),
    [
      join(projects, "app"),
      join(projects, "app-wt"),
      join(projects, "notes"),
      join(projects, "web"),
      join(desktop, "videos"),
      join(docs, "Clients"),
    ].sort(),
  );
  assertApart(places);
  const app = byPath.get(join(projects, "app"));
  assert.equal(app?.kind, "repo");
  assert.equal(app?.sessions, 4, "a folder inside a repository counts for it");
  assert.equal(app?.activity, 3, "what happened there lately, not before");
  assert.equal(
    byPath.get(join(projects, "app-wt"))?.kind,
    "repo",
    "a worktree is a repository",
  );
  const notes = byPath.get(join(projects, "notes"));
  assert.equal(notes?.files, 2, "a plain folder takes in its own folders");
  assert.deepEqual(notes?.folders, { drafts: 1 });
  assert.equal(notes?.within, projects);
  assert.equal(
    byPath.get(join(docs, "Clients"))?.files,
    2,
    "what a package manager filled and keys are left out",
  );
  // The collection is not a place; the conversations in it are its own, for the page to show.
  const collection = groups.find((group) => group.path === projects);
  assert.equal(collection?.sessions, 2);
  assert.equal(
    places.some((place) => place.path.startsWith(join(docs, "Private"))),
    false,
    "kept out, never entered",
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

test("a folder of hundreds of repositories is read whole, and a folder of thousands of files costs a bounded look", async () => {
  const home = join(root, "many-home");
  const code = join(home, "code");
  for (let at = 0; at < 300; at++) repo(join(code, "org", `r${at}`));
  for (let at = 0; at < 600; at++)
    file(join(home, "Pictures", "dump", `p${at}.jpg`));
  const lines = await runWalker(
    {
      mode: "walk",
      since: Date.now() - 30 * DAY,
      excludes: [],
      roots: [code, join(home, "Pictures")],
      ai: [],
      ms: 15_000,
    },
    20_000,
  );
  assert.equal(lines.filter((line) => line.type === "repo").length, 300);
  const dump = lines.find(
    (line) =>
      line.type === "dir" && line.dir.path === join(home, "Pictures", "dump"),
  );
  assert.ok(
    dump?.type === "dir" && dump.dir.files > 0 && dump.dir.files <= 300,
  );
});

test("a repository's activity counts its reflog's entries since a time, and a worktree finds its git folder", async () => {
  const path = join(root, "activity");
  const now = Date.now();
  repo(path, [now - 40 * DAY, now - 20 * DAY, now - DAY, now]);
  assert.equal(await gitActivity(join(path, ".git"), now - 30 * DAY), 3);
  assert.equal(await gitActivity(join(path, "missing"), now - 30 * DAY), 0);
  file(join(root, "wt", ".git"), now, `gitdir: ${join(path, ".git")}\n`);
  assert.equal(await gitDirOf(join(root, "wt")), join(path, ".git"));
  assert.equal(await gitDirOf(join(root, "nothing-here")), null);
});

// ---- The rules, on what a walk could say ----

const H = join(sep, "h");
const at = (...parts: string[]) => join(H, ...parts);
const ROOTS = [at("Desktop"), at("Documents"), at("Downloads")];
const dir = (path: string, files: number, changed = Date.now()): WalkLine => ({
  type: "dir",
  dir: {
    path,
    files,
    changed,
    recent: [{ name: "f", at: changed }],
    kinds: { md: files },
  },
});
const repoLine = (path: string, activity = 5): WalkLine => ({
  type: "repo",
  path,
  changed: Date.now(),
  activity,
});
const rank = (
  lines: WalkLine[],
  ai: { path: string; sessions: number }[] = [],
  excludes: string[] = [],
) =>
  rankPlaces(
    lines,
    ai.map((one) => ({
      ...one,
      name: one.path.split(sep).at(-1) ?? "",
      tools: ["claude"],
    })),
    excludes,
    Date.now(),
    ROOTS,
    H,
  );
const paths = (found: { places: { path: string }[] }) =>
  found.places.map((place) => place.path).sort();

test("a downloads folder of loose files is one place, its small folders in it", () => {
  const found = rank([
    dir(at("Downloads"), 40),
    dir(at("Downloads", "trip"), 4),
  ]);
  assert.deepEqual(paths(found), [at("Downloads")]);
  assert.equal(found.places[0].files, 44);
  assert.deepEqual(found.places[0].folders, { trip: 4 });
});

test("a work folder whose folders hold the most is split into them, its few loose files left out", () => {
  const found = rank([
    dir(at("Documents"), 1),
    dir(at("Documents", "Clients", "acme"), 12),
    dir(at("Documents", "Taxes"), 3),
  ]);
  assert.deepEqual(paths(found), [
    at("Documents", "Clients"),
    at("Documents", "Taxes"),
  ]);
});

test("a folder worked in with AI takes in those inside it, and one holding a repository is a collection", () => {
  const found = rank(
    [
      repoLine(at("Desktop", "ws", "api")),
      dir(at("Desktop", "ws", "notes"), 3),
      dir(at("Desktop", "ws"), 2),
      dir(at("Desktop", "solo", "deep"), 2),
    ],
    [
      { path: at("Desktop", "ws"), sessions: 10 },
      { path: at("Desktop", "solo"), sessions: 5 },
      { path: at("Desktop", "solo", "deep"), sessions: 2 },
    ],
  );
  assert.deepEqual(paths(found), [
    at("Desktop", "solo"),
    at("Desktop", "ws", "api"),
    at("Desktop", "ws", "notes"),
  ]);
  const solo = found.places.find(
    (place) => place.path === at("Desktop", "solo"),
  );
  assert.equal(solo?.sessions, 7);
  assert.equal(solo?.files, 2);
  const ws = found.groups.find((group) => group.path === at("Desktop", "ws"));
  assert.equal(ws?.sessions, 10, "the collection keeps its own conversations");
});

test("the home folder, a work folder and what holds the home folder are never places, whatever was done there", () => {
  const found = rank(
    [repoLine(at("Desktop", "app")), dir(at("Desktop"), 3)],
    [
      { path: H, sessions: 30 },
      { path: at("Desktop"), sessions: 4 },
      { path: sep, sessions: 2 },
    ],
  );
  assert.deepEqual(paths(found), [at("Desktop", "app")]);
});

test("a folder gone from the disk is not offered; one kept out stays listed; one inside a repository counts for it", () => {
  const found = rank(
    [
      repoLine(at("code", "app")),
      {
        type: "ai",
        path: at("gone"),
        exists: false,
        repo: null,
        changed: 0,
        activity: 0,
      },
      {
        type: "ai",
        path: at("secret"),
        exists: true,
        repo: null,
        changed: 0,
        activity: 0,
      },
    ],
    [
      { path: at("code", "app", "pkg"), sessions: 6 },
      { path: at("gone"), sessions: 9 },
      { path: at("secret"), sessions: 5 },
    ],
    [at("secret")],
  );
  assert.deepEqual(paths(found), [at("code", "app"), at("secret")]);
  assert.equal(
    found.places.find((place) => place.path === at("code", "app"))?.sessions,
    6,
  );
});

test("places rank by conversations, changes, what happened in a repository and how lately", () => {
  const now = Date.now();
  const base = {
    name: "x",
    sessions: 0,
    tools: [],
    files: 0,
    activity: 0,
    changed: now,
  };
  const busy = placeScore(
    { ...base, path: "/a", kind: "repo", activity: 60 },
    now,
  );
  const quiet = placeScore(
    { ...base, path: "/b", kind: "repo", activity: 1 },
    now,
  );
  const stale = placeScore(
    { ...base, path: "/c", kind: "repo", changed: now - 29 * DAY },
    now,
  );
  assert.ok(busy > quiet && quiet > stale);
  assert.ok(
    placeScore({ ...base, path: "/d", kind: "folder", changed: 0 }, now) < 0.5,
  );
});

/** A small generator, the same every run. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 2 ** 32;
  };
}

test("whatever the disk holds, no place lies inside another and every changed file counts once", () => {
  for (let run = 0; run < 300; run++) {
    const next = random(run + 1);
    const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)];
    const somewhere = () => {
      const parts = [pick(["Desktop", "Documents", "Downloads", "code", "x"])];
      const depth = Math.floor(next() * 5);
      for (let step = 0; step < depth; step++)
        parts.push(pick(["a", "b", "c", "d"]));
      return at(...parts);
    };
    const lines: WalkLine[] = [];
    const ai: { path: string; sessions: number }[] = [];
    for (let n = Math.floor(next() * 6); n > 0; n--)
      lines.push(repoLine(somewhere()));
    for (let n = Math.floor(next() * 40); n > 0; n--)
      lines.push(dir(somewhere(), 1 + Math.floor(next() * 9)));
    for (let n = Math.floor(next() * 6); n > 0; n--) {
      const path = somewhere();
      ai.push({ path, sessions: 1 + Math.floor(next() * 5) });
      if (next() < 0.3)
        lines.push({
          type: "ai",
          path,
          exists: true,
          repo: pick([null, somewhere()]),
          changed: Date.now(),
          activity: 1,
        });
    }
    const found = rank(lines, ai);
    assert.ok(found.places.length <= MAX_PLACES);
    assertApart(found.places);
    // Every place holds exactly the changes of the folders inside it: none counted twice or lost.
    for (const place of found.places) {
      const inside = lines.reduce(
        (sum, line) =>
          line.type === "dir" &&
          (line.dir.path === place.path ||
            line.dir.path.startsWith(place.path + sep))
            ? sum + line.dir.files
            : sum,
        0,
      );
      assert.equal(place.files, inside, `run ${run}: ${place.path}`);
    }
    // A collection a place names holds it.
    for (const place of found.places)
      if (place.within) assert.ok(place.path.startsWith(place.within + sep));
  }
});

test("thousands of repositories and folders rank at once, the busiest first", () => {
  const lines: WalkLine[] = [];
  for (let n = 0; n < 5_000; n++)
    lines.push(repoLine(at("code", `org${n % 50}`, `r${n}`), n % 97));
  for (let n = 0; n < 20_000; n++)
    lines.push(dir(at("Documents", `p${n % 400}`, `d${n}`), 1));
  const started = performance.now();
  const found = rank(lines);
  const took = performance.now() - started;
  assert.ok(took < 1_500, `took ${Math.round(took)} ms`);
  assert.equal(found.places.length, MAX_PLACES);
  assertApart(found.places);
  const scores = found.places.map((place) => placeScore(place));
  assert.deepEqual(
    scores,
    [...scores].sort((a, b) => b - a),
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
    activity: 0,
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
