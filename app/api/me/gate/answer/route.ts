import * as z from "zod";
import { answerAsk, pendingAsks } from "@/features/minime/gate/gate";
import { addTrust, ruleFor } from "@/features/minime/gate/rules";
import { refuse } from "@/features/minime/server/guard";

const Body = z.object({
  id: z.string().uuid(),
  answer: z.string().min(1).max(4000),
  /** For a tool: let it do this kind of thing from now on, without asking. */
  always: z.boolean().optional(),
});

// The person's answer to a question on their screen. "From now on" on a tool becomes a rule in
// settings.json before the waiting session hears the answer.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const { id, answer, always } = body.data;
  const waiting = pendingAsks().find((ask) => ask.id === id);
  if (!waiting)
    return Response.json({ error: "no-longer-waiting" }, { status: 410 });
  let rule: string | undefined;
  if (always && answer === "allow" && waiting.ask.kind === "permission") {
    rule = ruleFor(waiting.ask.tool, waiting.ask.input);
    if (rule) await addTrust(rule);
  }
  answerAsk(id, answer, Boolean(rule));
  return Response.json({ ok: true, ...(rule ? { rule } : {}) });
}
