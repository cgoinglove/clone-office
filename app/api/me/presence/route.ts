import * as z from "zod";
import { refuse } from "@/features/minime/server/guard";
import { notePresence } from "@/features/minime/server/presence";

const Body = z.object({
  page: z.string().min(8).max(64),
  here: z.boolean(),
});

// Each page in view says so every little while, and says when it is hidden or closed, so what
// waits on the person goes to their phone only while they are not looking here.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  notePresence(body.data.page, body.data.here);
  return Response.json({ ok: true });
}
