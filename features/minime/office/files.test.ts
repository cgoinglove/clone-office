import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-files-"));
const homes = { ana: join(root, "ana"), ben: join(root, "ben") };
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
  await relay.office("files-key");
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

test("a file goes with a request after the checks, and comes once into the request's folder", async () => {
  const client = await import("./client");
  const files = await import("./files");
  // Ana's mini-me and Ben's, each in its own folder.
  process.env.CLONE_OFFICE_HOME = homes.ben;
  const ben = await client.joinOffice(base, "files-key", {
    name: "Ben",
    description: "",
  });
  process.env.CLONE_OFFICE_HOME = homes.ana;
  const ana = await client.joinOffice(base, "files-key", {
    name: "Ana",
    description: "",
  });

  const docs = join(root, "docs");
  const kept = join(root, "private");
  mkdirSync(docs, { recursive: true });
  mkdirSync(kept, { recursive: true });
  writeFileSync(join(docs, "quote.csv"), "item,price\nlicense,100\n");
  writeFileSync(join(kept, "secret.txt"), "not for colleagues");
  writeFileSync(
    join(homes.ana, "settings.json"),
    JSON.stringify({
      ...JSON.parse(readFileSync(join(homes.ana, "settings.json"), "utf8")),
      exclude: [kept],
    }),
  );

  // What may not go is refused before anything leaves.
  await assert.rejects(
    files.readToSend([join(kept, "secret.txt")]),
    /Kept out/,
  );
  await assert.rejects(files.readToSend(["quote.csv"]), /Not a full path/);
  await assert.rejects(
    files.readToSend([join(docs, "nope.csv")]),
    /No such file/,
  );
  await assert.rejects(
    files.readToSend([docs]),
    /No such file/,
    "a folder is not a file",
  );

  const refs = await files.putFiles(ana, [join(docs, "quote.csv")]);
  assert.deepEqual(
    refs.map((ref) => [ref.name, ref.type, ref.size]),
    [["quote.csv", "text/csv", 23]],
  );
  const sent = await client.sendRequest(
    ana,
    ben.member,
    "Can you check the quote?",
    refs.map((ref) => ref.id),
  );
  assert.equal(sent.history[0].files?.[0].id, refs[0].id);

  // Ben's mini-me takes it into the request's folder, once, for its person's eyes only.
  process.env.CLONE_OFFICE_HOME = homes.ben;
  const incoming = sent.history[0].files ?? [];
  const taken = await files.takeFiles(ben, sent.id, incoming);
  assert.equal(
    taken[0].path,
    join(homes.ben, "office", "files", sent.id, "quote.csv"),
  );
  assert.equal(
    readFileSync(taken[0].path, "utf8"),
    "item,price\nlicense,100\n",
  );
  if (process.platform !== "win32")
    assert.equal(statSync(taken[0].path).mode & 0o777, 0o600);
  const again = await files.takeFiles(ben, sent.id, incoming);
  assert.equal(again[0].path, taken[0].path, "taken once");
  assert.deepEqual(await files.keptFiles(sent.id), [
    { id: refs[0].id, name: "quote.csv", size: 23 },
  ]);
  assert.match(files.filesLine(taken), /^- quote\.csv \(23 B\): .*quote\.csv$/);

  // An answer brings a file of the same name: it gets a number, not the first one's place.
  writeFileSync(join(docs, "fixed.csv"), "item,price\nlicense,90\n");
  process.env.CLONE_OFFICE_HOME = homes.ben;
  const back = await client.putFile(ben, {
    name: "quote.csv",
    type: "text/csv",
    bytes: new TextEncoder().encode("fixed"),
  });
  const answered = await client.updateRequest(ben, sent.id, {
    state: "COMPLETED",
    text: "One price was off.",
    files: [back.id],
  });
  const more = await files.takeFiles(
    ben,
    sent.id,
    answered.history.at(-1)?.files ?? [],
  );
  assert.equal(
    more[0].path,
    join(homes.ben, "office", "files", sent.id, "quote (2).csv"),
  );

  // A colleague's file named to climb out of its folder stays inside it.
  const sly = await client.putFile(ben, {
    name: "../../../escape.sh",
    type: "text/plain",
    bytes: new TextEncoder().encode("echo"),
  });
  assert.equal(sly.name, "escape.sh");
});

test("the card for asking a colleague shows each file that would leave, and no rule is made from it", async () => {
  const { changeOf } = await import("../ask-text");
  const { ruleFor } = await import("../gate/rules");
  const input = {
    to: "Ben",
    request: "Check this",
    files: ["/Users/ana/Documents/quote.csv", "/home/ana/a.pdf"],
  };
  assert.equal(
    changeOf("mcp__minime__ask_colleague", input),
    "~/Documents/quote.csv\n~/a.pdf",
  );
  assert.equal(ruleFor("mcp__minime__ask_colleague", input), undefined);
  assert.equal(
    ruleFor("mcp__minime__ask_colleague", { to: "Ben", request: "Hi" }),
    "mcp__minime__ask_colleague",
  );
});

test("the check names the files that would go with an answer, and the person always sees them", async () => {
  const { checkPrompt } = await import("./check");
  const prompt = checkPrompt(
    "Send me the deck",
    "Here it is.",
    [],
    true,
    "Ben",
    [],
    ["/Users/ana/deck.pdf"],
  );
  assert.match(
    prompt,
    /With these files from your person's computer:\n- \/Users\/ana\/deck\.pdf/,
  );
  assert.match(prompt, /and files from their computer always/);
  assert.match(prompt, /names the files/);
  assert.doesNotMatch(checkPrompt("Q", "A"), /With these files/);
});
