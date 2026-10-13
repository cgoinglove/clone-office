import * as z from "zod";
import { askDesktop, inDesktop } from "@/features/minime/server/desktop";
import { refuse } from "@/features/minime/server/guard";
import { updateStatus } from "@/features/minime/server/update";

// Whether a newer version is on npm, for Settings › General (server/update.ts); inside the desktop
// app, what its own updates say, and restarting into one it has ready.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await updateStatus());
}

const Body = z.object({ restart: z.literal(true) });

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success || !inDesktop())
    return Response.json({ error: "bad-request" }, { status: 400 });
  // The desktop app stops this server and restarts into the new version; it answers first.
  const done = await askDesktop<{ ok: boolean }>("restart-to-update");
  if (!done?.ok)
    return Response.json({ error: "update-failed" }, { status: 500 });
  return Response.json({ ok: true });
}
