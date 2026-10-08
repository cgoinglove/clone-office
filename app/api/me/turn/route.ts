import * as z from "zod";
import { officeSide } from "@/features/minime/messenger/office";
import { ownGate } from "@/features/minime/office/boot";
import { refuse } from "@/features/minime/server/guard";
import { words } from "@/features/minime/server/words";
import { answerTurn, turnEntries } from "@/features/minime/turn/turn";

// What waits on the person, for their own Claude Code (the plugin's /office), worded as the
// page's cards are in the language their screen last used, and their answers to it. The plugin is
// on this computer, so it reaches the app as the page does.

const side = () => officeSide(ownGate);

export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const w = await words();
  const entries = await turnEntries(side(), w);
  return Response.json({
    entries,
    words: {
      header: w.plugin("header"),
      later: w.plugin("later"),
      stop: w.plugin("stop"),
      none: w.plugin("none"),
      status: w.plugin("status", { count: entries.length }),
    },
  });
}

const Body = z.object({
  value: z.string().max(200).optional(),
  words: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success || (!body.data.value && !body.data.words?.trim()))
    return Response.json({ error: "bad-request" }, { status: 400 });
  return Response.json(await answerTurn(side(), await words(), body.data));
}
