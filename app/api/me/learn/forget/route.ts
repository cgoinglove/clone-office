import * as z from "zod";
import { forgetKnown } from "@/features/minime/learn/forget";
import { refuse } from "@/features/minime/server/guard";

const Body = z.union([
  z.object({
    kind: z.enum(["user", "work"]),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    kind: z.enum(["projects", "people", "places"]),
    path: z.string().trim().min(1).max(500),
  }),
]);

// The person took back one thing the first reading kept (learn/forget.ts).
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  if (!(await forgetKnown(body.data)))
    return Response.json({ error: "not-forgotten" }, { status: 409 });
  return Response.json({ ok: true });
}
