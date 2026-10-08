import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { type Database, openDatabase } from "./db";
import { relayHandler } from "./handler";
import { type Caller, Relay } from "./relay";
import { SKILL_BYTES, skillHash, skillPath } from "./skills";

let db: Database;
let relay: Relay;
before(async () => {
  db = await openDatabase(process.env.RELAY_TEST_DATABASE_URL ?? "memory");
  relay = await Relay.open(db);
  await relay.office("skills-key");
});
after(async () => {
  await relay.close();
  await db.close();
});

async function join(name: string, key = "skills-key") {
  const { token } = await relay.join({
    key,
    card: { name, description: "" },
  });
  return { token, ...(await relay.memberByToken(token)) } as Caller & {
    token: string;
  };
}

const b64 = (text: string) => Buffer.from(text, "utf8").toString("base64");
const skillMd = (name: string, rule = "One line per item.") =>
  `---\nname: ${name}\ndescription: Use when writing the weekly report.\n---\n\n- ${rule}\n`;

test("a member shares a skill; the office lists it without its files and gives it whole to add", async () => {
  const ana = await join("Ana");
  const ben = await join("Ben");
  await relay.office("other-skills-key");
  const eve = await join("Eve", "other-skills-key");
  const shared = await relay.shareSkill(ana, {
    name: "weekly-report",
    category: "writing",
    files: [
      { path: "SKILL.md", data: b64(skillMd("weekly-report")) },
      { path: "references/format.md", data: b64("Wins, risks, next.") },
    ],
  });
  assert.equal(shared.description, "Use when writing the weekly report.");
  assert.equal(shared.category, "writing");
  assert.equal(shared.byName, "Ana");
  assert.equal(shared.removable, true);
  assert.equal(
    shared.hash,
    skillHash([
      {
        path: "references/format.md",
        bytes: new TextEncoder().encode("Wins, risks, next."),
      },
      {
        path: "SKILL.md",
        bytes: new TextEncoder().encode(skillMd("weekly-report")),
      },
    ]),
    "the hash does not depend on the order the files came in",
  );

  const listed = await relay.sharedSkills(ben);
  assert.deepEqual(
    listed.map((skill) => [skill.name, skill.by, skill.removable]),
    [["weekly-report", ana.id, false]],
  );
  assert.ok(!("content" in listed[0]), "a list carries no files");
  assert.deepEqual(listed[0].files.map((file) => file.path).sort(), [
    "SKILL.md",
    "references/format.md",
  ]);
  const whole = await relay.sharedSkill(ben, "weekly-report");
  assert.equal(
    Buffer.from(
      whole.content.find((file) => file.path === "SKILL.md")?.data ?? "",
      "base64",
    ).toString("utf8"),
    skillMd("weekly-report"),
  );
  assert.deepEqual(await relay.sharedSkills(eve), [], "another office's");
  await assert.rejects(relay.sharedSkill(eve, "weekly-report"), /No such/);
});

test("only the one who shared a skill updates it; a colleague's own by the same name is refused", async () => {
  const ana = await join("Ana U");
  const ben = await join("Ben U");
  const first = await relay.shareSkill(ana, {
    name: "standup-notes",
    files: [{ path: "SKILL.md", data: b64(skillMd("standup-notes")) }],
  });
  const second = await relay.shareSkill(ana, {
    name: "standup-notes",
    files: [
      {
        path: "SKILL.md",
        data: b64(skillMd("standup-notes", "Blockers first.")),
      },
    ],
  });
  assert.notEqual(second.hash, first.hash);
  await assert.rejects(
    relay.shareSkill(ben, {
      name: "standup-notes",
      files: [{ path: "SKILL.md", data: b64(skillMd("standup-notes")) }],
    }),
    (error: Error & { code?: string }) => error.code === "skill-taken",
  );
  // Ana's name as her card says it now.
  await relay.join({
    token: ana.token,
    card: { name: "Ana Kim", description: "" },
  });
  const listed = (await relay.sharedSkills(ben)).find(
    (skill) => skill.name === "standup-notes",
  );
  assert.equal(listed?.byName, "Ana Kim");
});

test("what is not a skill, or too much of one, is refused before it is kept", async () => {
  const ana = await join("Ana R");
  const code = (error: Error & { code?: string }) => error.code;
  const share = (files: unknown, name = "report") =>
    relay.shareSkill(ana, { name, files });
  for (const path of [
    "../SKILL.md",
    "references/../../x.md",
    "notes.md",
    "references/.hidden",
    "references",
    "/etc/passwd",
    "references/a\\b.md",
    "references/c:d.md",
  ])
    await assert.rejects(
      share([
        { path: "SKILL.md", data: b64(skillMd("report")) },
        { path, data: b64("x") },
      ]),
      (error: Error & { code?: string }) => code(error) === "bad-request",
      path,
    );
  assert.equal(
    skillPath("references/보고서 형식.md"),
    "references/보고서 형식.md",
  );
  await assert.rejects(
    share([{ path: "references/a.md", data: b64("no SKILL.md") }]),
    (error: Error & { code?: string }) => code(error) === "skill-invalid",
  );
  await assert.rejects(
    share([{ path: "SKILL.md", data: b64(skillMd("other-name")) }]),
    (error: Error & { code?: string }) => code(error) === "skill-invalid",
  );
  await assert.rejects(
    share([{ path: "SKILL.md", data: "not base64!" }]),
    (error: Error & { code?: string }) => code(error) === "bad-request",
  );
  await assert.rejects(
    share([
      { path: "SKILL.md", data: b64(skillMd("report")) },
      {
        path: "assets/big.bin",
        data: Buffer.alloc(SKILL_BYTES).toString("base64"),
      },
    ]),
    (error: Error & { code?: string }) => code(error) === "skill-too-large",
  );
  await assert.rejects(
    relay.shareSkill(ana, { name: "Not A Name", files: [] }),
    (error: Error & { code?: string }) => code(error) === "bad-request",
  );
  assert.ok(
    !(await relay.sharedSkills(ana)).some((skill) => skill.name === "report"),
  );
});

test("a skill is taken out by the one who shared it or an owner of the office, never another colleague", async () => {
  const ana = await join("Ana O");
  const ben = await join("Ben O");
  const owner = await join("Olu O");
  await db.query("UPDATE members SET user_id = $1 WHERE id = $2", [
    "u-olu",
    owner.id,
  ]);
  await db.query(
    "INSERT INTO office_people (office_id, user_id, role, joined) VALUES ($1, $2, 'owner', $3)",
    [owner.office, "u-olu", new Date().toISOString()],
  );
  for (const name of ["meeting-notes", "client-reply"])
    await relay.shareSkill(ana, {
      name,
      files: [{ path: "SKILL.md", data: b64(skillMd(name)) }],
    });
  assert.ok(
    (await relay.sharedSkills(owner)).every((skill) => skill.removable),
    "an owner may take out any",
  );
  await assert.rejects(
    relay.unshareSkill(ben, "meeting-notes"),
    (error: Error & { code?: string }) => error.code === "skill-not-yours",
  );
  await relay.unshareSkill(owner, "meeting-notes");
  await relay.unshareSkill(ana, "client-reply");
  const left = (await relay.sharedSkills(ben)).map((skill) => skill.name);
  assert.ok(!left.includes("meeting-notes") && !left.includes("client-reply"));
  await assert.rejects(relay.unshareSkill(ana, "client-reply"), /No such/);
});

test("over HTTP: members list, share, take and remove skills with their own token", async () => {
  const server = createServer(relayHandler(relay));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const ana = await join("Ana H");
    const ben = await join("Ben H");
    const as = (who: { token: string }) => ({
      authorization: `Bearer ${who.token}`,
      "content-type": "application/json",
    });
    const put = await fetch(`${base}/skills`, {
      method: "POST",
      headers: as(ana),
      body: JSON.stringify({
        name: "release-notes",
        category: "writing",
        files: [{ path: "SKILL.md", data: b64(skillMd("release-notes")) }],
      }),
    }).then((r) => r.json());
    assert.equal(put.skill.name, "release-notes");
    const listed = await fetch(`${base}/skills`, { headers: as(ben) }).then(
      (r) => r.json(),
    );
    assert.ok(
      listed.skills.some(
        (skill: { name: string }) => skill.name === "release-notes",
      ),
    );
    const one = await fetch(`${base}/skills/release-notes`, {
      headers: as(ben),
    }).then((r) => r.json());
    assert.equal(one.skill.content[0].path, "SKILL.md");
    const refused = await fetch(`${base}/skills/release-notes`, {
      method: "DELETE",
      headers: as(ben),
    });
    assert.equal(refused.status, 403);
    assert.equal((await refused.json()).code, "skill-not-yours");
    const stranger = await fetch(`${base}/skills`, {
      headers: { authorization: "Bearer nope" },
    });
    assert.equal(stranger.status, 401);
    const gone = await fetch(`${base}/skills/release-notes`, {
      method: "DELETE",
      headers: as(ana),
    });
    assert.equal(gone.status, 200);
    const missing = await fetch(`${base}/skills/release-notes`, {
      headers: as(ben),
    });
    assert.equal(missing.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
