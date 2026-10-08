// What a permission card shows besides the tool's own input, worked out by code as the question is
// asked, so the page and the phone show the same: whether "from now on" can be kept as a rule (a
// command, or files leaving the computer, never can), whether it would cover reading in a whole
// service, and for a flow, the flow as it stands now (to remove or pause one is to see which) and
// the name of the kind of request it is for. Also whether the person already let it through: a rule
// they agreed to during this very session is not asked again.

import { connectorOfTool } from "../connectors/catalog.ts";
import { readRule, readsOnly } from "../connectors/tools.ts";
import { getFlow } from "../flows/store.ts";
import { GRANT_TASK_MAX } from "../hands/grants.ts";
import { findSession, listSessions } from "../hands/sessions.ts";
import { loadMenu } from "../office/menu.ts";
import { allowedByMode } from "./autonomy.ts";
import type { Ask } from "./gate.ts";
import { loadTrust, pathRule, ruleFor } from "./rules.ts";

/** Whether the person's rules already let this through, so nobody needs to be asked. */
export async function alreadyAllowed(ask: Ask, own = false): Promise<boolean> {
  if (ask.kind !== "permission") return false;
  // What the person's autonomy mode lets the clone do on its own (Settings › Preferences), in
  // their own work only: a colleague's request never reads or acts on the strength of it.
  if (own && (await allowedByMode(ask.tool, ask.input).catch(() => false)))
    return true;
  const rules = await loadTrust();
  const rule = ruleFor(ask.tool, ask.input);
  if (rule && rules.includes(rule)) return true;
  const service = connectorOfTool(ask.tool);
  return Boolean(
    service &&
      rules.includes(readRule(service.connector.id)) &&
      (await readsOnly(ask.tool)),
  );
}

/**
 * Work in one of the person's conversations: never "from now on", but its folder, where they may let
 * it change files for this one task (hands/grants.ts). Not offered for the whole home folder or disk.
 */
async function workCard(ask: Extract<Ask, { kind: "permission" }>) {
  const wanted = typeof ask.input.session === "string" ? ask.input.session : "";
  // A task too long to be looked up again offers no grant, so what is offered is what is kept.
  if (String(ask.input.task ?? "").length > GRANT_TASK_MAX)
    return { ...ask, always: false };
  const session = wanted
    ? findSession(
        await listSessions({ days: 90, limit: 200 }).catch(() => []),
        wanted,
      )
    : undefined;
  const rule = session ? pathRule(session.cwd) : undefined;
  return rule && rule !== "~" && rule !== "//" && rule !== "/"
    ? {
        ...ask,
        always: true,
        task: rule.startsWith("//") ? rule.slice(1) : rule,
      }
    : { ...ask, always: false };
}

export async function enrichAsk(ask: Ask): Promise<Ask> {
  if (ask.kind !== "permission") return ask;
  const always = Boolean(ruleFor(ask.tool, ask.input));
  const service = connectorOfTool(ask.tool);
  if (service)
    return {
      ...ask,
      always,
      ...((await readsOnly(ask.tool).catch(() => false))
        ? { reads: service.connector.name }
        : {}),
    };
  if (ask.tool === "mcp__minime__work_session") return workCard(ask);
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
