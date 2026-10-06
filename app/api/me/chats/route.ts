import { listChats, readChat } from "@/features/minime/chat/store";
import { refuse } from "@/features/minime/server/guard";

// The person's conversations with their mini-me, latest first; with ?id=, one conversation with
// its messages. Brain sessions stay on the server.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    const chats = await listChats();
    return Response.json({
      chats: chats.map(({ id, title, updated, turns }) => ({
        id,
        title,
        updated,
        turns,
      })),
    });
  }
  const chat = await readChat(id).catch(() => undefined);
  if (!chat) return Response.json({ error: "not-found" }, { status: 404 });
  return Response.json({
    id: chat.info.id,
    title: chat.info.title,
    carried: Boolean(chat.info.summary),
    messages: chat.messages,
  });
}
