import { clearLearn } from "@/features/minime/learn/job";
import { onlyRead, startOver } from "@/features/minime/learn/reset";
import { refuse } from "@/features/minime/server/guard";

// Whether starting over would only clear what a reading gave (nothing of the person's to keep), so
// the screen says which will happen before they confirm.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json({ onlyRead: await onlyRead() });
}

// Start over: what the mini-me keeps moves into a backup folder (never deleted), or is cleared when
// it only came from a reading, and the first screen begins again. Refused while a learning is
// running.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  if (!clearLearn()) return Response.json({ error: "busy" }, { status: 409 });
  return Response.json(await startOver());
}
