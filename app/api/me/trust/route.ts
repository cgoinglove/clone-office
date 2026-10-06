import * as z from "zod";
import { loadTrust, removeTrust } from "@/features/minime/gate/rules";
import { refuse } from "@/features/minime/server/guard";

// What the person let their mini-me do without asking ("from now on" on a card), and taking one
// back: the mini-me asks first again.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json({ rules: await loadTrust() });
}

const Body = z.object({ remove: z.string().min(1).max(2000) });

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  await removeTrust(body.data.remove);
  return Response.json({ rules: await loadTrust() });
}
