import * as z from "zod";
import {
  askPerson,
  gateSecret,
  pendingAsks,
  waitFor,
} from "@/features/minime/gate/gate";
import { refuse } from "@/features/minime/server/guard";

/** How long one request waits for the answer; the tool server asks again until the question times out. */
const HOLD_MS = 240_000;

const Ask = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    question: z.string().min(1).max(2000),
    choices: z.array(z.string().min(1).max(200)).max(4).optional(),
  }),
  z.object({
    kind: z.literal("permission"),
    tool: z.string().min(1).max(100),
    input: z.record(z.string(), z.unknown()),
  }),
]);

const Body = z.union([
  z.object({ chat: z.string().max(64).optional(), ask: Ask }),
  z.object({ id: z.string().uuid() }),
]);

// Questions from the mini-me's tool server (only those this app started know the secret). A new
// question is put to the person; the request holds until they answer, or answers "waiting" so the
// tool server asks again, until the question times out.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  if (request.headers.get("x-minime-gate") !== gateSecret())
    return Response.json({ error: "Not the mini-me." }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  let id: string;
  let done: ReturnType<typeof waitFor>;
  if ("ask" in body.data) {
    ({ id, done } = askPerson(body.data.chat, body.data.ask));
  } else {
    id = body.data.id;
    done = waitFor(id);
    if (!done) return Response.json({ id, answered: false });
  }
  const held = await Promise.race([
    done,
    new Promise<"waiting">((resolve) =>
      setTimeout(() => resolve("waiting"), HOLD_MS),
    ),
  ]);
  return Response.json(
    held === "waiting" ? { id, waiting: true } : { id, ...held },
  );
}

// The questions waiting for the person, for a screen that opens a conversation in the middle.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const chat = new URL(request.url).searchParams.get("chat") ?? undefined;
  return Response.json({ asks: pendingAsks(chat) });
}
