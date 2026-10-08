import { refuse } from "@/features/minime/server/guard";
import { updateStatus } from "@/features/minime/server/update";

// Whether a newer version is on npm, for Settings › General (server/update.ts).
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await updateStatus());
}
