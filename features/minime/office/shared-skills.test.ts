import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-shared-skills-"));
const homes = {
  ana: join(root, "ana"),
  ben: join(root, "ben"),
  alone: join(root, "alone"),
};
process.env.CLONE_OFFICE_HOME = homes.ana;
let server: Server;
let base = "";
let close: () => Promise<void>;

before(async () => {
  const { openDatabase } = await import("../../relay/db");
  const { Relay } = await import("../../relay/relay");
  const { relayHandler } = await import("../../relay/handler");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  await relay.office("skills-key");
  server = createServer(relayHandler(relay));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  close = async () => {
    await new Promise((resolve) => server.close(resolve));
    await relay.close();
    await db.close();
  };
});
after(async () => {
  await close();
  rmSync(root, { recursive: true, force: true });
});

const md = (name: string, rule = "One line per item.") =>
  `---\nname: ${name}\ndescription: Use when writing the weekly report.\n---\n\n- ${rule}\n`;

/** Who is acting: the clone folder the code reads (settings, skills, the log). */
const as = (who: keyof typeof homes) => {
  process.env.CLONE_OFFICE_HOME = homes[who];
};

test("a skill goes from one clone to the office and into a colleague's, and its newer versions follow while unchanged there", async () => {
  const client = await import("./client");
  const shared = await import("./shared-skills");
  const { SkillStore } = await import("../memory/skills");
  as("ben");
  await client.joinOffice(base, "skills-key", { name: "Ben", description: "" });
  as("ana");
  await client.joinOffice(base, "skills-key", { name: "Ana", description: "" });
  const anaStore = new SkillStore(join(homes.ana, "skills"), "person");
  const benStore = new SkillStore(join(homes.ben, "skills"), "person");
  assert.ok(
    (
      await anaStore.apply([
        {
          action: "create",
          name: "weekly-report",
          category: "writing",
          content: md("weekly-report"),
        },
        {
          action: "write_file",
          name: "weekly-report",
          file_path: "scripts/count.sh",
          file_content: "wc -l notes.md\n",
        },
      ])
    ).success,
  );

  const packed = await shared.packToShare(anaStore, "weekly-report");
  const put = await shared.shareSkill(packed);
  assert.equal(put.hash, packed.hash, "the office keeps what was packed");
  const here = async (store: InstanceType<typeof SkillStore>) =>
    (await shared.officeSkills(store)).find(
      (skill) => skill.name === "weekly-report",
    );
  assert.equal((await here(anaStore))?.here, "yours");

  as("ben");
  const seen = await here(benStore);
  assert.equal(seen?.here, "new");
  assert.equal(seen?.scripts, 1);
  assert.equal(seen?.byName, "Ana");
  const ready = await shared.fetchToAdd(benStore, "weekly-report");
  assert.deepEqual(await shared.addSkill(benStore, ready), {
    updated: false,
    same: false,
  });
  assert.equal((await here(benStore))?.here, "added");
  assert.deepEqual(
    (await benStore.list()).map((skill) => [skill.name, skill.category]),
    [["weekly-report", "writing"]],
  );

  // Ana changes hers: hers shows it, and once she shares it again Ben's clone may update.
  as("ana");
  await anaStore.view("weekly-report");
  await anaStore.apply([
    {
      action: "patch",
      name: "weekly-report",
      old_string: "One line per item.",
      new_string: "Blockers first.",
    },
  ]);
  assert.equal((await here(anaStore))?.here, "yours-changed");
  await shared.shareSkill(await shared.packToShare(anaStore, "weekly-report"));
  assert.equal((await here(anaStore))?.here, "yours");

  as("ben");
  assert.equal((await here(benStore))?.here, "update");
  assert.deepEqual(
    await shared.addSkill(
      benStore,
      await shared.fetchToAdd(benStore, "weekly-report"),
    ),
    { updated: true, same: false },
  );
  const skillMd = join(
    homes.ben,
    "skills",
    "writing",
    "weekly-report",
    "SKILL.md",
  );
  assert.match(readFileSync(skillMd, "utf8"), /Blockers first/);

  // Ben makes it his own: the office's versions no longer replace it.
  writeFileSync(skillMd, md("weekly-report", "Ben's way."));
  assert.equal((await here(benStore))?.here, "changed");
  await assert.rejects(
    shared.fetchToAdd(benStore, "weekly-report"),
    (error: Error & { code?: string }) => error.code === "skill-changed-here",
  );
  const log = readFileSync(join(homes.ben, "logs", "activity.jsonl"), "utf8");
  assert.match(
    log,
    /"kind":"skill","name":"weekly-report","action":"added","from":"Ana"/,
  );
  assert.match(log, /"action":"updated"/);
});

test("only the person's own skills go; a name a colleague shares stays theirs; taking one out leaves the copies", async () => {
  const shared = await import("./shared-skills");
  const { SkillStore } = await import("../memory/skills");
  const benStore = new SkillStore(join(homes.ben, "skills"), "person");
  as("ben");
  // One added from the office is the colleague's to share.
  await assert.rejects(
    shared.packToShare(benStore, "weekly-report"),
    (error: Error & { code?: string }) => error.code === "skill-not-shareable",
  );
  // A skill of Ben's by a name Ana shares already.
  as("ana");
  const anaStore = new SkillStore(join(homes.ana, "skills"), "person");
  await anaStore.apply([
    { action: "create", name: "standup", content: md("standup") },
  ]);
  await shared.shareSkill(await shared.packToShare(anaStore, "standup"));
  as("ben");
  await benStore.apply([
    { action: "create", name: "standup", content: md("standup", "Mine.") },
  ]);
  const taken = (await shared.officeSkills(benStore)).find(
    (skill) => skill.name === "standup",
  );
  assert.equal(taken?.here, "taken");
  await assert.rejects(
    shared.shareSkill(await shared.packToShare(benStore, "standup")),
    (error: Error & { code?: string }) => error.code === "skill-taken",
  );
  await assert.rejects(
    shared.unshareSkill("standup"),
    (error: Error & { code?: string }) => error.code === "skill-not-yours",
  );

  as("ana");
  await shared.unshareSkill("weekly-report");
  as("ben");
  assert.ok(
    !(await shared.officeSkills(benStore)).some(
      (skill) => skill.name === "weekly-report",
    ),
  );
  assert.ok(
    (await benStore.list()).some((skill) => skill.name === "weekly-report"),
    "the copy Ben's clone added stays",
  );

  as("alone");
  await assert.rejects(
    shared.officeSkills(new SkillStore(join(homes.alone, "skills"))),
    (error: Error & { code?: string }) => error.code === "not-in-office",
  );
});
