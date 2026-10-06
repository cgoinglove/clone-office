import { clearLearn } from "@/features/minime/learn/job";
import { startOver } from "@/features/minime/learn/reset";
import { refuse } from "@/features/minime/server/guard";

// Start over: what the mini-me keeps moves into a backup folder (never deleted) and the first
// screen begins again. Refused while a learning is running.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  if (!clearLearn()) return Response.json({ error: "busy" }, { status: 409 });
  return Response.json(await startOver());
}
