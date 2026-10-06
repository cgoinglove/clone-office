import * as z from "zod";
import { refuse } from "@/features/minime/server/guard";
import {
  readPreferences,
  writePreferences,
} from "@/features/minime/server/preferences";

// How the person wants their clone to behave (Settings › Preferences).
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await readPreferences());
}

const Body = z.object({
  autonomy: z.enum(["ask", "reads", "auto"]).optional(),
  defaultTrust: z.enum(["auto", "tell", "ask"]).optional(),
  batchHours: z.array(z.number().int().min(0).max(23)).max(6).optional(),
  review: z.boolean().optional(),
  lobby: z.boolean().optional(),
  lightBackground: z.boolean().optional(),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  return Response.json(await writePreferences(body.data));
}
