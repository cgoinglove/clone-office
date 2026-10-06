import * as z from "zod";
import { answerPerson } from "@/features/minime/gate/answer";
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
  const answered = await answerPerson(id, answer, always);
  if (!answered.ok)
    return Response.json({ error: "no-longer-waiting" }, { status: 410 });
  return Response.json(answered);
}
