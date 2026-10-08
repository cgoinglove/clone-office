import { readActivity } from "@/features/minime/server/activity";
import { refuse } from "@/features/minime/server/guard";

// What the clone did in the person's name, latest first (server/activity.ts).
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json({ activity: await readActivity(200) });
}
