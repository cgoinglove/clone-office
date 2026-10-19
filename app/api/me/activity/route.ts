import { readActivity } from "@/features/minime/server/activity";
import { refuse } from "@/features/minime/server/guard";

/** How many lines a page may ask for: a week of a flow every half hour, and more. */
const MOST = 1000;

// What the clone did in the person's name, latest first (server/activity.ts): 200 lines unless the
// page asks for more (`?limit=`, its clone screen counting the week).
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const asked = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isInteger(asked) && asked > 0 ? Math.min(asked, MOST) : 200;
  return Response.json({ activity: await readActivity(limit) });
}
