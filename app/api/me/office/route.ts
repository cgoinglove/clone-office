import * as z from "zod";
import { brainProblem } from "@/features/minime/brain/choice";
import { pendingAsks } from "@/features/minime/gate/gate";
import { draftCard, draftMenu, draftWays } from "@/features/minime/office/card";
import {
  inviteLink,
  joinOffice,
  leaveOffice,
  loadOffice,
  meetings,
  members,
  openMeeting,
  problemCode,
  sendRequest,
  setTeamSetting,
  tasks,
  teamSetting,
  updateCard,
  updateRequest,
} from "@/features/minime/office/client";
import {
  answerLater,
  answerMyself,
  handBack,
  laterQuestions,
  stepIn,
  takeBack,
  takeItOver,
} from "@/features/minime/office/handle";
import {
  closeHere,
  hostProblem,
  hostsOffice,
  networkAddress,
  openHere,
  publicRelay,
  resumeHosting,
} from "@/features/minime/office/host";
import { clearInvite, readInvite } from "@/features/minime/office/invited";
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
import { refuse } from "@/features/minime/server/guard";
import { personLanguage } from "@/features/minime/server/language";
import {
  readPreferences,
  writePreferences,
} from "@/features/minime/server/preferences";
import { readProfile } from "@/features/minime/server/profile";

// The person's office as their screen sees it: who is there (their cards), the requests sent and
// received, and the questions about those requests waiting for them. Asking also keeps this
// mini-me's office work running in the background, and the office open on this computer if it is.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  await resumeHosting();
  const office = await loadOffice();
  const menu = await loadMenu();
  // An invite the launcher kept (`clone-office join <link>`) waits here until it is used.
  if (!office)
    return Response.json({ joined: false, menu, invite: await readInvite() });
  // Of the answers the person saw first, how many they sent as they were.
  const like = likeMe((await loadState()).outcomes);
  const url = new URL(request.url);
  startOffice(
    new URL("/api/me/gate", request.url).toString(),
    await personLanguage(url.searchParams.get("locale")),
  );
  // Links are made on the address others reach; open here, that is this computer's network address.
  const relay = await publicRelay(office);
  const here = (await hostsOffice(office))
    ? { relay, network: Boolean(networkAddress()), problem: hostProblem() }
    : undefined;
  try {
    const [{ members: everyone }, { tasks: requests }, held, standup] =
      await Promise.all([
        members(office),
        tasks(office),
        // The office's latest meetings of the clones, and when its standup is.
        meetings(office, 5).catch(() => []),
        teamSetting(office, "meeting:standup").catch(() => undefined),
      ]);
    return Response.json({
      joined: true,
      relay,
      here,
      me: { id: office.member, card: office.card },
      menu,
      likeMe: like,
      members: everyone,
      tasks: requests,
      meetings: held,
      standup: standup?.value ?? null,
      meetingsOn: (await readPreferences()).meetings,
      meetingChats: Object.fromEntries(
        Object.entries((await loadState()).meetings).flatMap(([id, back]) =>
          back.chat ? [[id, back.chat]] : [],
        ),
      ),
      asks: pendingAsks().filter((ask) => ask.chat?.startsWith("office-")),
      // Questions about requests kept for the person to answer when they can.
      later: (await laterQuestions(requests)).map((entry) => ({
        id: entry.id,
        task: entry.task,
        from: entry.from,
        at: entry.at,
        // The person's to answer themselves: what they write goes as their own words.
        ...(entry.kind === "self" ? { self: true } : {}),
        ask: {
          kind: "question",
          question: entry.question,
          ...(entry.choices?.length ? { choices: entry.choices } : {}),
        },
      })),
      // Requests colleagues sent that the person stepped into: their notes to the clone, and the
      // ones they answer themselves.
      steps: await stepsFor(requests),
      problem: officeProblem(),
    });
  } catch (error) {
    return Response.json({
      joined: true,
      relay,
      here,
      me: { id: office.member, card: office.card },
      menu,
      likeMe: like,
      members: [],
      tasks: [],
      asks: pendingAsks().filter((ask) => ask.chat?.startsWith("office-")),
      // While the office here is starting, or failed to, that is the problem to show.
      problem: here?.problem ?? problemCode(error),
    });
  }
}

const Card = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(600).default(""),
  status: z.string().trim().max(60).optional(),
  owns: z.array(z.string().trim().min(1).max(80)).max(6).optional(),
  howToWork: z.array(z.string().trim().min(1).max(240)).max(12).optional(),
});

const Body = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("join"),
    relay: z.string().url(),
    key: z.string().min(1).max(200),
    card: Card,
  }),
  z.object({ action: z.literal("open"), card: Card }),
  z.object({ action: z.literal("card"), card: Card }),
  z.object({
    action: z.literal("send"),
    to: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
    /** Files the person picked, already put at the relay (app/api/me/office/upload). */
    files: z.array(z.string().min(4).max(64)).max(10).optional(),
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
  z.object({
    action: z.literal("meeting"),
    kind: z.enum(["standup", "question"]),
    topic: z.string().trim().max(600).optional(),
    locale: z.string().max(35).default("en"),
  }),
  // Stepping into a request a colleague sent: telling the clone something, taking it back while
  // unread, answering it oneself, handing it back to the clone.
  z.object({
    action: z.literal("step-in"),
    id: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("take-back"),
    id: z.string().min(1).max(80),
    note: z.string().min(1).max(80),
  }),
  z.object({
    action: z.literal("answer-myself"),
    id: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
    /** Done with it: the request closes; else it stays open, theirs to answer. */
    close: z.boolean().default(true),
  }),
  z.object({ action: z.literal("hand-back"), id: z.string().min(1).max(80) }),
  z.object({ action: z.literal("take-over"), id: z.string().min(1).max(80) }),
  z.object({
    action: z.literal("standup-time"),
    standup: z
      .object({
        days: z.array(z.number().int().min(0).max(6)).min(1).max(7),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        zone: z.string().min(1).max(64),
      })
      .nullable(),
  }),
]);

async function stepsFor(requests: { id: string }[]) {
  const { handled } = await loadState();
  const ids = new Set(requests.map((task) => task.id));
  return Object.fromEntries(
    Object.entries(handled)
      .filter(
        ([id, entry]) => ids.has(id) && (entry.person || entry.notes?.length),
      )
      .map(([id, entry]) => [
        id,
        {
          ...(entry.person ? { person: entry.person.since } : {}),
          notes: entry.notes ?? [],
        },
      ]),
  );
}

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  try {
    const input = body.data;
    if (input.action === "draft") {
      const problem = await brainProblem();
      if (problem) return Response.json({ error: problem }, { status: 409 });
      const draft = await draftCard(await personLanguage(input.locale));
      return draft
        ? Response.json(draft)
        : Response.json({ error: "no-draft" }, { status: 502 });
    }
    if (
      input.action === "step-in" ||
      input.action === "take-back" ||
      input.action === "answer-myself" ||
      input.action === "hand-back" ||
      input.action === "take-over"
    ) {
      const options = {
        gateUrl: new URL("/api/me/gate", request.url).toString(),
        language: await personLanguage(undefined),
      };
      const done =
        input.action === "step-in"
          ? await stepIn(input.id, input.text, options)
          : input.action === "take-back"
            ? await takeBack(input.id, input.note)
            : input.action === "answer-myself"
              ? await answerMyself(input.id, input.text, input.close)
              : input.action === "take-over"
                ? await takeItOver(input.id)
                : await handBack(input.id, options);
      return done
        ? Response.json({ ok: true })
        : Response.json({ error: "request-closed" }, { status: 409 });
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
      const problem = await brainProblem();
      if (problem) return Response.json({ error: problem }, { status: 409 });
      const lines = await draftWays(await personLanguage(input.locale));
      return lines.length
        ? Response.json({ lines })
        : Response.json({ error: "no-draft" }, { status: 502 });
    }
    if (input.action === "draft-menu") {
      const problem = await brainProblem();
      if (problem) return Response.json({ error: problem }, { status: 409 });
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
    if (input.action === "join" || input.action === "open") {
      const menu = await loadMenu();
      // What they look after comes from their profile unless the page sent it.
      const owns = input.card.owns ?? (await readProfile()).owns;
      const card = {
        ...input.card,
        ...(owns?.length ? { owns } : {}),
        skills: menuSkills(menu),
      };
      const office =
        input.action === "open"
          ? await openHere(card)
          : await joinOffice(input.relay, input.key, card);
      await writeMe(office.card, menu);
      await clearInvite();
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
      return Response.json({
        url: await inviteLink(office, await publicRelay(office)),
      });
    if (input.action === "send")
      return Response.json({
        // Typed on the page by the person themselves.
        task: await sendRequest(
          office,
          input.to,
          input.text,
          input.files,
          "person",
        ),
      });
    if (input.action === "reply")
      return Response.json({
        task: await updateRequest(office, input.id, {
          text: input.text,
          by: "person",
        }),
      });
    if (input.action === "cancel")
      return Response.json({
        task: await updateRequest(office, input.id, { state: "CANCELED" }),
      });
    if (input.action === "meeting") {
      // Starting a meeting is taking part in it: the person's clone speaks for them from now on.
      if (!(await readPreferences()).meetings)
        await writePreferences({ meetings: true });
      return Response.json({
        meeting: await openMeeting(office, {
          kind: input.kind,
          topic: input.topic,
          language: (await personLanguage(input.locale)) ?? "English",
        }),
      });
    }
    if (input.action === "standup-time") {
      await setTeamSetting(office, "meeting:standup", input.standup);
      return Response.json({ standup: input.standup });
    }
    stopOffice();
    // Leaving the office open here closes it; what it keeps stays, for opening it again.
    if (await hostsOffice(office)) await closeHere();
    await leaveOffice();
    return Response.json({ joined: false });
  } catch (error) {
    return Response.json({ error: problemCode(error) }, { status: 502 });
  }
}
