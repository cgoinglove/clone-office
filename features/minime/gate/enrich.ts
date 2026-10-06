// What a permission card shows besides the tool's own input, worked out by code as the question is
// asked, so the page and the phone show the same: whether "from now on" can be kept as a rule (a
// command, or files leaving the computer, never can), and for a flow, the flow as it stands now
// (to remove or pause one is to see which) and the name of the kind of request it is for.

import { getFlow } from "../flows/store.ts";
import { loadMenu } from "../office/menu.ts";
import type { Ask } from "./gate.ts";
import { ruleFor } from "./rules.ts";

export async function enrichAsk(ask: Ask): Promise<Ask> {
  if (ask.kind !== "permission") return ask;
  const always = Boolean(ruleFor(ask.tool, ask.input));
  if (ask.tool !== "mcp__minime__flow_manage") return { ...ask, always };
  const id = typeof ask.input.id === "string" ? ask.input.id : undefined;
  const flow = id ? await getFlow(id).catch(() => undefined) : undefined;
  const when = (ask.input.when ?? flow?.when) as
    | { kind?: unknown; menu?: unknown }
    | undefined;
  const menu =
    when?.kind === "request" && typeof when.menu === "string"
      ? (await loadMenu().catch(() => [])).find((item) => item.id === when.menu)
      : undefined;
  return {
    ...ask,
    always,
    ...(flow
      ? { flow: { name: flow.name, when: flow.when, what: flow.what } }
      : {}),
    ...(menu ? { menuName: menu.name } : {}),
  };
}
