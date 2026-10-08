import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

// The clone's office-skill tools as its tool server runs them in a conversation: asking goes to a
// stand-in for the app's gate route, which records each card and answers as told.
const root = mkdtempSync(join(tmpdir(), "minime-skills-tool-"));
const homes = { ana: join(root, "ana"), ben: join(root, "ben") };
process.env.CLONE_OFFICE_HOME = homes.ana;
const servers: Server[] = [];
let relayAt = "";
let closeRelay: () => Promise<void>;
/** Each card put to the person, and what the person answers next. */
const cards: { tool: string; input: Record<string, unknown> }[] = [];
let answer: "allow" | "deny" = "allow";

const listen = (server: Server) =>
  new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve(
        `http://127.0.0.1:${(server.address() as { port: number }).port}`,
      ),
    ),
  );

before(async () => {
  const gate = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      const { ask } = JSON.parse(body);
      cards.push({ tool: ask.tool, input: ask.input });
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: "x", answered: true, answer }));
    });
  });
  servers.push(gate);
  process.env.MINIME_GATE_URL = `${await listen(gate)}/api/me/gate`;
  process.env.MINIME_GATE_SECRET = "secret";
  process.env.MINIME_CHAT_ID = "chat-1";
  const { openDatabase } = await import("../../relay/db");
  const { Relay } = await import("../../relay/relay");
  const { relayHandler } = await import("../../relay/handler");
  const db = await openDatabase("memory");
  const relay = await Relay.open(db);
  await relay.office("tool-key");
  const relayServer = createServer(relayHandler(relay));
  servers.push(relayServer);
  relayAt = await listen(relayServer);
  closeRelay = async () => {
    await relay.close();
    await db.close();
  };
});
after(async () => {
  for (const server of servers)
    await new Promise((resolve) => server.close(resolve));
  await closeRelay();
  rmSync(root, { recursive: true, force: true });
});

const md = (name: string) =>
  `---\nname: ${name}\ndescription: Use when replying to a client.\n---\n\n- Thank them first.\n`;

test("sharing and adding are asked every time, on a card listing the files that go or come; never from now on", async () => {
  const client = await import("./client");
  const tools = await import("./skills-tool");
  const { SkillStore } = await import("../memory/skills");
  const { ruleFor, ALWAYS_ASKED } = await import("../gate/rules");
  process.env.CLONE_OFFICE_HOME = homes.ben;
  await client.joinOffice(relayAt, "tool-key", {
    name: "Ben",
    description: "",
  });
  process.env.CLONE_OFFICE_HOME = homes.ana;
  await client.joinOffice(relayAt, "tool-key", {
    name: "Ana",
    description: "",
  });
  const ana = new SkillStore(join(homes.ana, "skills"));
  await ana.apply([
    { action: "create", name: "client-reply", content: md("client-reply") },
    {
      action: "write_file",
      name: "client-reply",
      file_path: "scripts/greet.sh",
      file_content: "echo hello\n",
    },
  ]);

  // Not let go: nothing reaches the office.
  answer = "deny";
  const refused = await tools.callOfficeSkillTool(ana, "office_skill_manage", {
    action: "share",
    name: "client-reply",
  });
  assert.equal(refused.isError, true);
  assert.equal(
    (await tools.callOfficeSkillTool(ana, "office_skills", {})).result,
    "No one in the office has shared a skill yet.",
  );

  answer = "allow";
  const sharedNow = await tools.callOfficeSkillTool(
    ana,
    "office_skill_manage",
    { action: "share", name: "client-reply" },
  );
  assert.equal(sharedNow.isError, false, String(sharedNow.result));
  assert.deepEqual(cards.at(-1), {
    tool: "mcp__minime__office_skill_manage",
    input: {
      action: "share",
      name: "client-reply",
      description: "Use when replying to a client.",
      files: ["SKILL.md", "scripts/greet.sh"],
    },
  });

  process.env.CLONE_OFFICE_HOME = homes.ben;
  const ben = new SkillStore(join(homes.ben, "skills"));
  const listed = (await tools.callOfficeSkillTool(ben, "office_skills", {}))
    .result as { name: string; here: string; scripts?: number }[];
  assert.deepEqual(
    listed.map((skill) => [skill.name, skill.here, skill.scripts]),
    [["client-reply", "new", 1]],
  );
  const read = (
    await tools.callOfficeSkillTool(ben, "office_skills", {
      name: "client-reply",
    })
  ).result as { skill_md: string };
  assert.match(read.skill_md, /^<untrusted source="Ana's shared skill">/);
  assert.match(read.skill_md, /Thank them first/);

  const added = await tools.callOfficeSkillTool(ben, "office_skill_manage", {
    action: "add",
    name: "client-reply",
  });
  assert.equal(added.isError, false, String(added.result));
  assert.match(String(added.result), /never run one/);
  assert.deepEqual(cards.at(-1)?.input, {
    action: "add",
    name: "client-reply",
    from: "Ana",
    description: "Use when replying to a client.",
    files: ["SKILL.md", "scripts/greet.sh"],
    scripts: 1,
  });
  assert.ok((await ben.list()).some((skill) => skill.name === "client-reply"));

  // Added already: nobody is asked again.
  const before = cards.length;
  const again = await tools.callOfficeSkillTool(ben, "office_skill_manage", {
    action: "add",
    name: "client-reply",
  });
  assert.match(String(again.result), /here already/);
  assert.equal(cards.length, before);

  // Never a rule, whatever was answered.
  assert.ok(ALWAYS_ASKED.has("mcp__minime__office_skill_manage"));
  assert.equal(
    ruleFor("mcp__minime__office_skill_manage", {
      action: "add",
      name: "client-reply",
    }),
    undefined,
  );
});

test("the card says which skill, whose, what it is for and every file that goes or comes", async () => {
  const { createTranslator } = await import("next-intl");
  const english = (await import("../../../messages/en.json")).default;
  const { askDetails, changeOf, describe } = await import("../ask-text");
  const t = createTranslator({
    locale: "en",
    messages: english,
    namespace: "ask",
  });
  const tool = "mcp__minime__office_skill_manage";
  const share = {
    action: "share",
    name: "client-reply",
    description: "Use when replying to a client.",
    files: ["SKILL.md", "scripts/greet.sh"],
  };
  assert.equal(
    describe(t, tool, share),
    "Share a skill with your office: client-reply",
  );
  assert.equal(changeOf(tool, share), "SKILL.md\nscripts/greet.sh");
  const words = {
    flows: createTranslator({
      locale: "en",
      messages: english,
      namespace: "flows",
    }),
    format: {} as never,
  };
  assert.deepEqual(askDetails(words, tool, share), [
    "Use when replying to a client.",
  ]);
  assert.equal(
    describe(t, tool, { ...share, action: "add", from: "Ana", scripts: 1 }),
    "Add Ana's skill to your clone: client-reply (it has scripts, which your clone never runs on its own)",
  );
  assert.equal(
    describe(t, tool, { action: "unshare", name: "client-reply" }),
    "Stop sharing a skill with your office: client-reply",
  );
});
