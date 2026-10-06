import * as z from "zod";
import { runSession } from "@/features/minime/brain/session";
import { refuse } from "@/features/minime/server/guard";
import { languageName, ndjson } from "@/features/minime/server/ndjson";

const Body = z.object({
  line: z.string().min(1).max(2000),
  fix: z.string().min(1).max(2000),
  locale: z.string().max(35).default("en"),
});

// The person corrected one entry of the mini-me's memory, as the screen shows it. The mini-me fixes
// that entry with its memory tool, in the person's words, and says in one sentence what it changed.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  const { line, fix, locale } = body.data;
  return ndjson(async (send) => {
    const result = await runSession({
      prompt: `This entry is in your memory of your person: "${line}"\nThey corrected it: "${fix}"\n\nReplace that entry with what they said, in their words, as one short line in their language; remove it instead if they only said it is wrong. Then tell them in one short sentence what you changed.`,
      language: languageName(locale),
      maxTurns: 6,
      purpose: "fix",
      onEvent: (event) =>
        send(event.type === "text" ? event : { type: "saved", event }),
    });
    send(
      result.ok
        ? { type: "done" }
        : { type: "error", message: result.error ?? "fix-failed" },
    );
  });
}
