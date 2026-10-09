import * as z from "zod";
import {
  archiveChat,
  listChats,
  readChat,
  renameChat,
  TITLE_MAX,
} from "@/features/minime/chat/store";
import { refuse } from "@/features/minime/server/guard";

/** How many conversations one look asks for at most. */
const MOST = 500;

// The person's conversations with their mini-me, latest first, `limit` at a time up to `MOST`
// (`more` says whether there are others within it); with ?archived=1 the ones they put away; with
// ?q=, those whose name holds it (search finds any, not only those the column loaded); `asked` says
// whether there was ever one, put away or not; with ?id=, one conversation with its messages. Brain sessions stay on the server. A conversation is renamed, put away or
// brought back by a line added to its file, so nothing of it is ever removed.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");
  if (!id) {
    const limit = Math.min(
      MOST,
      Math.max(1, Number(params.get("limit")) || 30),
    );
    const archived = params.get("archived") === "1";
    const chats = await listChats(limit + 1, {
      archived,
      match: params.get("q") ?? undefined,
    });
    return Response.json({
      chats: chats.slice(0, limit).map(({ id, title, updated, turns }) => ({
        id,
        title,
        updated,
        turns,
      })),
      // Past `MOST` the list stops growing, so it says there is no more rather than asking forever.
      more: chats.length > limit && limit < MOST,
      asked:
        chats.length > 0 ||
        (await listChats(1, { archived: !archived })).length > 0,
    });
  }
  const chat = await readChat(id).catch(() => undefined);
  if (!chat) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json({
    id: chat.info.id,
    title: chat.info.title,
    carried: Boolean(chat.info.summary),
    archived: Boolean(chat.info.archived),
    messages: chat.messages,
  });
}

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    id: z.string().min(1).max(80),
    title: z.string().trim().min(1).max(TITLE_MAX),
  }),
  z.object({
    action: z.literal("archive"),
    id: z.string().min(1).max(80),
    archived: z.boolean(),
  }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const { id } = body.data;
  if (!(await readChat(id).catch(() => undefined)))
    return Response.json({ error: "not-found" }, { status: 404 });
  if (body.data.action === "rename") await renameChat(id, body.data.title);
  else await archiveChat(id, body.data.archived);
  return Response.json({ ok: true });
}
