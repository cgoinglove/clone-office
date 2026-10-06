import * as z from "zod";
import { runTurn } from "@/features/minime/chat/turn";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";
import { personLanguage } from "@/features/minime/server/language";
import { ndjson } from "@/features/minime/server/ndjson";

const Body = z.object({
  text: z.string().trim().min(1).max(8000),
  locale: z.string().max(35).default("en"),
  /** The conversation to go on with; a new one starts without it. */
  chat: z.string().max(64).optional(),
});

// One turn of a conversation with the mini-me. Its answer streams in; the conversation is kept in
// its own file, a long one is carried into a fresh session first, and after the answer the session
// is looked back on, with what it kept sent as "saved" events.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  if (!hasClaudeCode())
    return Response.json({ error: "claude-missing" }, { status: 409 });
  const { text, locale, chat } = body.data;
  const gateUrl = new URL("/api/me/gate", request.url).toString();
  const language = await personLanguage(locale);
  return ndjson((send) => runTurn({ text, chat, language, gateUrl, send }));
}
