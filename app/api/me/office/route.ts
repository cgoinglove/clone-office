import * as z from "zod";
import { pendingAsks } from "@/features/minime/gate/gate";
import { draftCard } from "@/features/minime/office/card";
import {
  joinOffice,
  leaveOffice,
  loadOffice,
  members,
  problemCode,
  sendRequest,
  tasks,
  updateCard,
  updateRequest,
} from "@/features/minime/office/client";
import {
  officeProblem,
  startOffice,
  stopOffice,
} from "@/features/minime/office/worker";
import { hasClaudeCode } from "@/features/minime/server/brain";
import { refuse } from "@/features/minime/server/guard";
import { personLanguage } from "@/features/minime/server/language";

// The person's office as their screen sees it: who is there (their cards), the requests sent and
// received, and the questions about those requests waiting for them. Asking also keeps this
// mini-me's office work running in the background.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const office = await loadOffice();
  if (!office) return Response.json({ joined: false });
  const url = new URL(request.url);
  startOffice(
    new URL("/api/me/gate", request.url).toString(),
    await personLanguage(url.searchParams.get("locale")),
  );
  try {
    const [{ members: everyone }, { tasks: requests }] = await Promise.all([
      members(office),
      tasks(office),
    ]);
    return Response.json({
      joined: true,
      relay: office.relay,
      me: { id: office.member, card: office.card },
      members: everyone,
      tasks: requests,
      asks: pendingAsks().filter((ask) => ask.chat?.startsWith("office-")),
      problem: officeProblem(),
    });
  } catch (error) {
    return Response.json({
      joined: true,
      relay: office.relay,
      me: { id: office.member, card: office.card },
      members: [],
      tasks: [],
      asks: pendingAsks().filter((ask) => ask.chat?.startsWith("office-")),
      problem: problemCode(error),
    });
  }
}

const Card = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600).default(""),
  status: z.string().trim().max(60).optional(),
});

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    relay: z.string().url(),
    key: z.string().min(1).max(200),
    card: Card,
  }),
  z.object({ action: z.literal("card"), card: Card }),
  z.object({
    action: z.literal("send"),
    to: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
  }),
  z.object({
    action: z.literal("cancel"),
    id: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal("reply"),
    id: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
  }),
  z.object({ action: z.literal("leave") }),
  z.object({
    action: z.literal("draft"),
    locale: z.string().max(35).default("en"),
  }),
]);

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  try {
    const input = body.data;
    if (input.action === "draft") {
      if (!hasClaudeCode())
        return Response.json({ error: "claude-missing" }, { status: 409 });
      const description = await draftCard(await personLanguage(input.locale));
      return description
        ? Response.json({ description })
        : Response.json({ error: "no-draft" }, { status: 502 });
    }
    if (input.action === "join") {
      const office = await joinOffice(input.relay, input.key, input.card);
      return Response.json({
        joined: true,
        me: { id: office.member, card: office.card },
      });
    }
    const office = await loadOffice();
    if (!office)
      return Response.json({ error: "not-in-office" }, { status: 409 });
    if (input.action === "card") {
      const next = await updateCard(office, input.card);
      return Response.json({ me: { id: next.member, card: next.card } });
    }
    if (input.action === "send")
      return Response.json({
        task: await sendRequest(office, input.to, input.text),
      });
    if (input.action === "reply")
      return Response.json({
        task: await updateRequest(office, input.id, { text: input.text }),
      });
    if (input.action === "cancel")
      return Response.json({
        task: await updateRequest(office, input.id, { state: "CANCELED" }),
      });
    stopOffice();
    await leaveOffice();
    return Response.json({ joined: false });
  } catch (error) {
    return Response.json({ error: problemCode(error) }, { status: 502 });
  }
}
