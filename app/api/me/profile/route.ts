import * as z from "zod";
import { refuse } from "@/features/minime/server/guard";
import { readProfile, writeProfile } from "@/features/minime/server/profile";

// What to call the person and what they do, as they said on the first steps.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await readProfile());
}

const Body = z.object({
  name: z.string().max(80).optional(),
  role: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  return Response.json(await writeProfile(body.data));
}
