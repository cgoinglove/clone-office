import * as z from "zod";
import { catchUpIndex } from "@/features/minime/history/indexer";
import {
  currentLearn,
  follow,
  savedLearn,
  startLearn,
} from "@/features/minime/learn/job";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";
import { personLanguage } from "@/features/minime/server/language";
import { ndjson } from "@/features/minime/server/ndjson";

const Body = z.object({ locale: z.string().max(35).default("en") });

// Starts the first transplant in the background (or joins the one running).
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  if (!hasClaudeCode())
    return Response.json({ error: "claude-missing" }, { status: 409 });
  const job = startLearn({
    language: await personLanguage(body.data.locale),
  });
  return Response.json({ id: job.id });
}

// Follows the running transplant, one JSON event per line, from its first event; when none ran in
// this server process, sends what the last one left, or {"type":"idle"}.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return ndjson(async (send) => {
    const job = currentLearn();
    if (!job || job.done) void catchUpIndex({ maxMs: 30_000 }).catch(() => {});
    if (!job) {
      send((await savedLearn()) ?? { type: "idle" });
      return;
    }
    await new Promise<void>((resolve) => {
      const stop = follow(job, send, resolve);
      request.signal.addEventListener("abort", () => {
        stop();
        resolve();
      });
    });
  });
}
