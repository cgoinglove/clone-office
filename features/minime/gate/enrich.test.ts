import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { createFormatter, createTranslator } from "next-intl";
import english from "../../../messages/en.json";

const root = mkdtempSync(join(tmpdir(), "minime-enrich-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true }));

const words = {
  flows: createTranslator({
    locale: "en",
    messages: english,
    namespace: "flows",
  }),
  // The computer's own zone, as the app's words use (server/words.ts), wherever the test runs.
  format: createFormatter({
    locale: "en",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
};

test("a card may offer 'from now on' only where code can keep it as a rule", async () => {
  const { enrichAsk } = await import("./enrich");
  const ask = async (tool: string, input: Record<string, unknown>) => {
    const made = await enrichAsk({ kind: "permission", tool, input });
    return { always: made.kind === "permission" ? made.always : undefined };
  };
  assert.equal((await ask("Read", { file_path: "/tmp/a.txt" })).always, true);
  assert.equal((await ask("Bash", { command: "ls" })).always, false);
  assert.equal(
    (
      await ask("mcp__minime__ask_colleague", {
        to: "Ben",
        request: "x",
        files: ["/tmp/a"],
      })
    ).always,
    false,
    "files leave the computer only after the person saw them",
  );
});

test("a flow card shows the flow as it would be kept, or as it is when it is paused or removed", async () => {
  const { enrichAsk } = await import("./enrich");
  const { askDetails } = await import("../ask-text");
  const { addFlow } = await import("../flows/store");
  const { saveMenu } = await import("../office/menu");
  await saveMenu([
    { id: "item-1", name: "코드 리뷰", description: "", trust: "ask" },
  ]);
  await addFlow({
    id: "flow-abc123",
    name: "Morning brief",
    when: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "09:00" },
    what: "What waits for me today.",
    created: new Date().toISOString(),
  });
  const card = async (input: Record<string, unknown>) => {
    const ask = await enrichAsk({
      kind: "permission",
      tool: "mcp__minime__flow_manage",
      input,
    });
    return ask.kind === "permission"
      ? askDetails(words, ask.tool, ask.input, ask)
      : [];
  };
  // To remove one is to see which.
  assert.deepEqual(await card({ action: "remove", id: "flow-abc123" }), [
    "Morning brief",
    "Weekdays at 9:00 AM",
    "What waits for me today.",
  ]);
  // A request flow names the kind by its name, not its id.
  assert.deepEqual(
    await card({
      action: "create",
      name: "Reviews",
      when: { kind: "request", menu: "item-1" },
      what: "Look first.",
    }),
    ["Reviews", "When a colleague asks: 코드 리뷰", "Look first."],
  );
  // The schedule shown is the one kept; one that would be refused says so; too long is said too.
  assert.deepEqual(
    (
      await card({
        action: "create",
        name: "Often",
        when: { kind: "every", minutes: 10 },
        what: "x",
      })
    )[1],
    "Your clone can't keep this schedule.",
  );
  assert.equal(
    (
      await card({
        action: "create",
        name: "Days",
        when: { kind: "weekly", days: [5, 4, 3, 2, 1], time: "08:30" },
        what: "x",
      })
    )[1],
    "Weekdays at 8:30 AM",
  );
  assert.equal(
    (
      await card({
        action: "create",
        name: "Soon",
        when: { kind: "once", in_minutes: "120" },
        what: "x",
      })
    )[1],
    "Once, in 120 minutes",
  );
  assert.match(
    (
      await card({
        action: "create",
        name: "Long",
        when: { kind: "every", minutes: 60 },
        what: "x".repeat(4001),
      })
    ).at(-1) ?? "",
    /Too long to save/,
  );
});
