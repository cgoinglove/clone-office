import * as z from "zod";
import { brainProblem } from "@/features/minime/brain/choice";
import {
  flowChat,
  keepFlowsRunning,
  runFlow,
} from "@/features/minime/flows/run";
import { nextRun } from "@/features/minime/flows/schedule";
import { changeFlow, getFlow, listFlows } from "@/features/minime/flows/store";
import { loadMenu } from "@/features/minime/office/menu";
import { refuse } from "@/features/minime/server/guard";

// The person's flows as their page shows them: each with when it runs (the screen writes it in
// their language), when next, and how its last run went. Flows are made by talking to the mini-me;
// here they are run now, paused, resumed or removed.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  keepFlowsRunning();
  const now = new Date();
  const menu = await loadMenu();
  const flows = (await listFlows()).map((flow) => {
    const next = flow.paused
      ? undefined
      : nextRun(
          flow.when,
          flow.seen ? new Date(flow.seen) : now,
          new Date(flow.created),
        );
    const kind = flow.when.kind === "request" ? flow.when.menu : undefined;
    return {
      id: flow.id,
      name: flow.name,
      when: flow.when,
      ...(kind
        ? { menuName: menu.find((item) => item.id === kind)?.name }
        : {}),
      what: flow.what,
      paused: Boolean(flow.paused),
      next: next?.toISOString(),
      last: flow.last,
      chat: flow.chat,
    };
  });
  return Response.json({ flows });
}

const Body = z.object({
  action: z.enum(["run", "pause", "resume", "remove"]),
  id: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const { action, id } = body.data;
  if (!(await getFlow(id)))
    return Response.json({ error: "not-found" }, { status: 404 });
  if (action === "run") {
    if ((await getFlow(id))?.when.kind === "request")
      return Response.json({ error: "bad-request" }, { status: 400 });
    const problem = await brainProblem();
    if (problem) return Response.json({ error: problem }, { status: 409 });
    // The person pressed it, so they are asked for what it may not do alone yet, on cards in
    // the flow's conversation. It runs on in this server; its answer lands there too.
    const flow = await getFlow(id);
    const chat = flow ? await flowChat(flow) : undefined;
    void runFlow(id, {
      gateUrl: new URL("/api/me/gate", request.url).toString(),
    }).catch(() => {});
    return Response.json({ started: true, chat });
  }
  const now = new Date().toISOString();
  await changeFlow(id, (flow) =>
    action === "remove"
      ? undefined
      : action === "pause"
        ? { ...flow, paused: true }
        : // Resuming starts from now: nothing missed while paused is made up.
          { ...flow, paused: false },
  );
  return Response.json({ ok: true });
}
