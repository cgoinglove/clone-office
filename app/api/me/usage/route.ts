import { usageSummary } from "@/features/minime/brain/runlog";
import { refuse } from "@/features/minime/server/guard";

// What the clone used its AI for in the last 30 days, from its run log (no conversation text).
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await usageSummary());
}
