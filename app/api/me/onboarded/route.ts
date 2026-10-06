import { refuse } from "@/features/minime/server/guard";
import { setOnboarded } from "@/features/minime/server/onboarded";

// The first steps are done, or set aside: from now on the app opens the clone itself.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  await setOnboarded();
  return Response.json({ ok: true });
}
