import * as z from "zod";
import { brainProblem } from "@/features/minime/brain/choice";
import { IMPORT_MAX, importMemory } from "@/features/minime/learn/import";
import { refuse } from "@/features/minime/server/guard";
import { personLanguage } from "@/features/minime/server/language";
import { errorCode, ndjson } from "@/features/minime/server/ndjson";

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
    return Response.json({ error: "bad-request" }, { status: 400 });
  const problem = await brainProblem();
  if (problem) return Response.json({ error: problem }, { status: 409 });
  const { text, locale } = body.data;
  return ndjson(async (send) => {
    const result = await importMemory({
      text,
      language: await personLanguage(locale),
      onEvent: (event) => send({ type: "saved", event }),
    });
    send(
      result.ok
        ? { type: "done", kept: result.kept }
        : {
            type: "error",
            message: result.error ?? "import-failed",
            code: errorCode(result.error ?? "import-failed"),
          },
    );
  });
}
