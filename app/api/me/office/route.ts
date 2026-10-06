import * as z from "zod";
import { pendingAsks } from "@/features/minime/gate/gate";
import { draftCard, draftMenu, draftWays } from "@/features/minime/office/card";
import {
  inviteLink,
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
import { answerLater, laterQuestions } from "@/features/minime/office/handle";
import { likeMe } from "@/features/minime/office/likeme";
import { writeMe } from "@/features/minime/office/me";
import {
  cleanMenu,
  loadMenu,
  menuSkills,
  saveMenu,
} from "@/features/minime/office/menu";
import { loadState } from "@/features/minime/office/state";
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
  const menu = await loadMenu();
  if (!office) return Response.json({ joined: false, menu });
  // Of the answers the person saw first, how many they sent as they were.
  const like = likeMe((await loadState()).outcomes);
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
      menu,
      likeMe: like,
      members: everyone,
      tasks: requests,
      asks: pendingAsks().filter((ask) => ask.chat?.startsWith("office-")),
      // Questions about requests kept for the person to answer when they can.
      later: (await laterQuestions(requests)).map((entry) => ({
        id: entry.id,
        task: entry.task,
        from: entry.from,
        at: entry.at,
        ask: {
          kind: "question",
          question: entry.question,
          ...(entry.choices?.length ? { choices: entry.choices } : {}),
        },
      })),
      problem: officeProblem(),
    });
  } catch (error) {
    return Response.json({
      joined: true,
      relay: office.relay,
      me: { id: office.member, card: office.card },
      menu,
      likeMe: like,
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
  howToWork: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
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
  z.object({ action: z.literal("invite") }),
  z.object({
    action: z.literal("draft"),
    locale: z.string().max(35).default("en"),
  }),
  z.object({
    action: z.literal("menu"),
    menu: z.array(z.record(z.string(), z.unknown())).max(12),
  }),
  z.object({
    action: z.literal("draft-menu"),
    locale: z.string().max(35).default("en"),
  }),
  z.object({
    action: z.literal("draft-ways"),
    locale: z.string().max(35).default("en"),
  }),
  z.object({
    action: z.literal("later"),
    id: z.string().uuid(),
    answer: z.string().trim().min(1).max(4000),
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
    if (input.action === "later") {
      const going = await answerLater(input.id, input.answer, {
        gateUrl: new URL("/api/me/gate", request.url).toString(),
        language: await personLanguage(undefined),
      });
      return going
        ? Response.json({ ok: true })
        : Response.json({ error: "no-longer-waiting" }, { status: 410 });
    }
    if (input.action === "draft-ways") {
      if (!hasClaudeCode())
        return Response.json({ error: "claude-missing" }, { status: 409 });
      const lines = await draftWays(await personLanguage(input.locale));
      return lines.length
        ? Response.json({ lines })
        : Response.json({ error: "no-draft" }, { status: 502 });
    }
    if (input.action === "draft-menu") {
      if (!hasClaudeCode())
        return Response.json({ error: "claude-missing" }, { status: 409 });
      const drafted = cleanMenu(
        await draftMenu(await personLanguage(input.locale)),
      );
      return drafted.length
        ? Response.json({ menu: drafted })
        : Response.json({ error: "no-draft" }, { status: 502 });
    }
    if (input.action === "menu") {
      // Kept here with how much is done alone; colleagues see only the kinds, on the card.
      const menu = await saveMenu(input.menu);
      const office = await loadOffice();
      if (office) {
        const next = await updateCard(office, {
          ...office.card,
          skills: menuSkills(menu),
        });
        await writeMe(next.card, menu);
      }
      return Response.json({ menu });
    }
    if (input.action === "join") {
      const menu = await loadMenu();
      const office = await joinOffice(input.relay, input.key, {
        ...input.card,
        skills: menuSkills(menu),
      });
      await writeMe(office.card, menu);
      return Response.json({
        joined: true,
        me: { id: office.member, card: office.card },
      });
    }
    const office = await loadOffice();
    if (!office)
      return Response.json({ error: "not-in-office" }, { status: 409 });
    if (input.action === "card") {
      const menu = await loadMenu();
      const next = await updateCard(office, {
        ...input.card,
        skills: menuSkills(menu),
      });
      await writeMe(next.card, menu);
      return Response.json({ me: { id: next.member, card: next.card } });
    }
    if (input.action === "invite")
      return Response.json({ url: await inviteLink(office) });
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
