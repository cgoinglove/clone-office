import * as z from "zod";
import { IMPORT_MAX, importMemory } from "@/features/minime/learn/import";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";
import { languageName, ndjson } from "@/features/minime/server/ndjson";

const Body = z.object({
  text: z.string().trim().min(1).max(IMPORT_MAX),
  locale: z.string().max(35).default("en"),
});

// What the person brought from their usual AI's memory (step 2 of the import). The mini-me keeps a
// few lasting lines from it, sent as "saved" events; the pasted text is not stored anywhere.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  if (!hasClaudeCode())
    return Response.json({ error: "claude-missing" }, { status: 409 });
  const { text, locale } = body.data;
  return ndjson(async (send) => {
    const result = await importMemory({
      text,
      language: languageName(locale),
      onEvent: (event) => send({ type: "saved", event }),
    });
    send(
      result.ok
        ? { type: "done", kept: result.kept }
        : { type: "error", message: result.error ?? "import-failed" },
    );
  });
}
