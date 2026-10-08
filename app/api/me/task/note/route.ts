import * as z from "zod";
import { addNote, takeBack } from "@/features/minime/chat/steer";
import { refuse } from "@/features/minime/server/guard";

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add"),
    chat: z.string().max(64),
    text: z.string().trim().min(1).max(8000),
  }),
  z.object({
    action: z.literal("take-back"),
    chat: z.string().max(64),
    id: z.string().max(64),
  }),
]);

// A word for the clone while it works in a conversation, read before its next step, or taken back
// while unread (chat/steer.ts). A conversation it is not working in answers 409: the page asks
// the usual way then.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const input = body.data;
  if (input.action === "take-back")
    return Response.json({ taken: takeBack(input.chat, input.id) });
  const note = addNote(input.chat, input.text);
  return note
    ? Response.json({ id: note.id })
    : Response.json({ error: "not-working" }, { status: 409 });
}
