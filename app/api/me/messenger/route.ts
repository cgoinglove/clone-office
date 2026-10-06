import * as z from "zod";
import {
  messenger,
  SERVICES,
  startMessenger,
} from "@/features/minime/messenger/bridge";
import { refuse } from "@/features/minime/server/guard";

// The person's messenger as their screen sees it: whether their bot is connected, who it talks
// with, and who waits to be let in. Asking also connects it, when it is set up.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  await startMessenger();
  return Response.json(await messenger().status());
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("connect"),
    service: z.enum(SERVICES),
    token: z.string().trim().min(20).max(300),
    /** Slack's app-level token, which opens its socket. */
    appToken: z.string().trim().min(20).max(300).optional(),
  }),
  z.object({ action: z.literal("allow"), code: z.string().max(20) }),
  z.object({ action: z.literal("decline"), code: z.string().max(20) }),
  z.object({ action: z.literal("disconnect") }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const input = body.data;
  const bridge = messenger();
  try {
    if (input.action === "connect")
      await bridge.connect(input.service, input.token, input.appToken);
    else if (input.action === "allow") {
      if (!(await bridge.allow(input.code)))
        return Response.json({ error: "no-longer-waiting" }, { status: 410 });
    } else if (input.action === "decline") bridge.decline(input.code);
    else await bridge.disconnect();
    return Response.json(await bridge.status());
  } catch (error) {
    // The bridge can be the copy the server started with (instrumentation.ts), whose error class
    // is not this file's, so its failures are known by their code.
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && code.startsWith("messenger-"))
      return Response.json({ error: code }, { status: 400 });
    throw error;
  }
}
