import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-flows-"));
const saved = process.env.SUB_OFFICE_HOME;
before(() => {
  process.env.SUB_OFFICE_HOME = root;
});
after(() => {
  if (saved === undefined) delete process.env.SUB_OFFICE_HOME;
  else process.env.SUB_OFFICE_HOME = saved;
  rmSync(root, { recursive: true, force: true });
});

test("the mini-me makes, changes and removes flows; schedules come only in their shape", async () => {
  const { callFlowTool } = await import("./tools");
  const now = new Date(2026, 9, 6, 14, 5);
  const bad = await callFlowTool(
    "flow_manage",
    {
      action: "create",
      name: "Morning",
      what: "Sum up",
      when: "weekdays at 9",
    },
    now,
  );
  assert.equal(bad.isError, true);
  const made = await callFlowTool(
    "flow_manage",
    {
      action: "create",
      name: "Morning summary",
      what: "Sum up what is waiting for me today.",
      when: { kind: "weekly", days: [1, 2, 3, 4, 5], time: "9:00" },
    },
    now,
  );
  assert.equal(made.isError, false);
  const listed = (await callFlowTool("flows", {}, now)).result as {
    now: string;
    flows: { id: string; when: string; next: string }[];
  };
  assert.equal(listed.now, "2026-10-06 14:05 (Tuesday)");
  assert.equal(listed.flows[0].when, "weekdays at 09:00");
  assert.equal(listed.flows[0].next, "2026-10-07T09:00");
  const id = listed.flows[0].id;
  const changed = await callFlowTool(
    "flow_manage",
    { action: "update", id, when: { kind: "every", minutes: 120 } },
    now,
  );
  assert.equal(changed.isError, false);
  assert.equal(
    (
      (await callFlowTool("flows", {}, now)).result as {
        flows: { when: string }[];
      }
    ).flows[0].when,
    "every 2 hour(s)",
  );
  assert.equal(
    (
      await callFlowTool(
        "flow_manage",
        { action: "pause", id: "nope-123" },
        now,
      )
    ).isError,
    true,
  );
  await callFlowTool("flow_manage", { action: "remove", id }, now);
  assert.equal(
    ((await callFlowTool("flows", {}, now)).result as { flows: unknown[] })
      .flows.length,
    0,
  );
});

test("each minute: a flow whose time came runs once, a missed one is noted, a paused one waits", async () => {
  const { addFlow, getFlow } = await import("./store");
  const { tick } = await import("./run");
  const made = new Date(2026, 9, 5, 12).toISOString();
  await addFlow({
    id: "morning-aaaaaa",
    name: "Morning",
    what: "Sum up.",
    when: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00" },
    created: made,
  });
  await addFlow({
    id: "noon-bbbbbb",
    name: "Noon",
    what: "Lunch?",
    when: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "06:00" },
    created: made,
  });
  await addFlow({
    id: "paused-cccccc",
    name: "Paused",
    what: "Nothing.",
    when: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "09:00" },
    created: made,
    paused: true,
  });
  const ran: string[] = [];
  const run = async (id: string) => {
    ran.push(id);
  };
  // 09:30: the 9:00 flow runs; the 6:00 one is three and a half hours late, so it is missed.
  await tick(new Date(2026, 9, 6, 9, 30), run);
  assert.deepEqual(ran, ["morning-aaaaaa"]);
  assert.equal((await getFlow("noon-bbbbbb"))?.last?.missed, true);
  // A minute later nothing runs twice.
  await tick(new Date(2026, 9, 6, 9, 31), run);
  assert.deepEqual(ran, ["morning-aaaaaa"]);
});

test("a run that fails is noted and never holds up the others due at the same time", async () => {
  const { addFlow, getFlow } = await import("./store");
  const { tick } = await import("./run");
  const made = new Date(2026, 9, 5, 12).toISOString();
  for (const id of ["first-dddddd", "second-eeeeee"])
    await addFlow({
      id,
      name: id,
      what: "Sum up.",
      when: { kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "11:00" },
      created: made,
    });
  const ran: string[] = [];
  await tick(new Date(2026, 9, 6, 11, 1), async (id) => {
    if (id === "first-dddddd") throw new Error("the brain fell over");
    ran.push(id);
  });
  assert.deepEqual(ran, ["second-eeeeee"]);
  assert.equal((await getFlow("first-dddddd"))?.last?.ok, false);
});

test("a flow for a kind of request is followed while answering one, never on a clock", async () => {
  const { saveMenu } = await import("../office/menu");
  const { callFlowTool } = await import("./tools");
  const { decide } = await import("./schedule");
  const { requestPrompt } = await import("../office/handle");
  await saveMenu([
    {
      id: "payments-api",
      name: "Payments API questions",
      description: "",
      trust: "ask",
    },
  ]);
  const now = new Date(2026, 9, 6, 14, 5);
  const wrong = await callFlowTool(
    "flow_manage",
    {
      action: "create",
      name: "Reviews",
      what: "Have my web-app conversation look first.",
      when: { kind: "request", menu: "code-review" },
    },
    now,
  );
  assert.equal(wrong.isError, true);
  assert.match(String(wrong.result), /payments-api \(Payments API questions\)/);
  const made = await callFlowTool(
    "flow_manage",
    {
      action: "create",
      name: "API answers",
      what: "Check with my api conversation first, and end with the docs link.",
      when: { kind: "request", menu: "payments-api" },
    },
    now,
  );
  assert.equal(made.isError, false);
  const listed = (await callFlowTool("flows", {}, now)).result as {
    menu: { id: string }[];
    flows: { when: string; next: string | null }[];
  };
  assert.deepEqual(listed.menu, [
    { id: "payments-api", name: "Payments API questions" },
  ]);
  const flow = listed.flows.find((f) => f.when.includes("payments-api"));
  assert.equal(flow?.next, null);
  assert.deepEqual(
    decide({ kind: "request", menu: "payments-api" }, now, undefined, now),
    { run: false },
  );
  const prompt = requestPrompt(
    { name: "Ana", description: "" },
    "Does /orders return a total?",
    [
      {
        id: "payments-api",
        name: "Payments API questions",
        description: "",
        trust: "ask",
      },
    ],
    [
      { menu: "payments-api", what: "Check with my api conversation first." },
      { what: "Answer in two lines at most." },
    ],
  );
  assert.match(
    prompt,
    /- Payments API questions: Check with my api conversation first\./,
  );
  assert.match(prompt, /- Any request: Answer in two lines at most\./);
});

test("what the person approved is what is kept: a flow too long is refused, never cut", async () => {
  const { callFlowTool } = await import("./tools");
  const long = await callFlowTool("flow_manage", {
    action: "create",
    name: "Brief",
    when: { kind: "every", minutes: 60 },
    what: `${"Sum up what waits. ".repeat(220)}Never send it to anyone.`,
  });
  assert.equal(long.isError, true);
  assert.match(String(long.result), /Too long to keep/);
  const named = await callFlowTool("flow_manage", {
    action: "create",
    name: "n".repeat(81),
    when: { kind: "every", minutes: 60 },
    what: "Short.",
  });
  assert.equal(named.isError, true);
});
