import * as z from "zod";
import { gateSecret } from "@/features/minime/gate/gate";
import { loadTrust } from "@/features/minime/gate/rules";
import {
  loadOffice,
  members,
  OfficeError,
  problemCode,
  sendLink,
  sendRequest,
} from "@/features/minime/office/client";
import { putFiles } from "@/features/minime/office/files";
import { publicRelay } from "@/features/minime/office/host";
import { changeState } from "@/features/minime/office/state";
import { refuse } from "@/features/minime/server/guard";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("members") }),
  z.object({
    action: z.literal("send"),
    to: z.string().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
    /** Files on the person's computer to send with it (the person saw them on the card). */
    files: z.array(z.string().min(1).max(1000)).max(10).optional(),
    /** The person saw the files on a card the tool server put to them. */
    seen: z.boolean().optional(),
    chat: z.string().max(64).optional(),
  }),
  z.object({
    action: z.literal("link"),
    name: z.string().trim().min(1).max(80),
    text: z.string().trim().min(1).max(8000),
    chat: z.string().max(64).optional(),
  }),
]);

// The office for the mini-me's tool server in a conversation (only processes this app started know
// the secret): who is there, and a request to one of them, remembered against the conversation it
// came from so the answer goes back there.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  if (request.headers.get("x-minime-gate") !== gateSecret())
    return Response.json({ error: "forbidden" }, { status: 403 });
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const office = await loadOffice();
  if (!office)
    return Response.json({ error: "not-in-office" }, { status: 409 });
  try {
    const { members: everyone } = await members(office);
    const others = everyone.filter((m) => m.id !== office.member);
    const input = body.data;
    if (input.action === "link") {
      const { task, url } = await sendLink(
        office,
        input.name,
        input.text,
        await publicRelay(office),
      );
      if (input.chat) {
        const chat = input.chat;
        await changeState((s) => {
          s.sent[task.id] = { chat };
        });
      }
      return Response.json({ link: { name: input.name, url, id: task.id } });
    }
    if (input.action === "members")
      return Response.json({
        members: others.map((m) => ({ id: m.id, ...m.card })),
      });
    const wanted = input.to.trim().toLowerCase();
    const to =
      others.find((m) => m.id === input.to) ??
      others.find((m) => m.card.name.trim().toLowerCase() === wanted) ??
      others.find((m) => m.card.name.toLowerCase().includes(wanted));
    if (!to)
      return Response.json({ error: "no-such-colleague" }, { status: 404 });
    // Asking a colleague allowed from now on skips the card; files never leave unseen.
    if (
      input.files?.length &&
      !input.seen &&
      (await loadTrust()).includes("mcp__minime__ask_colleague")
    )
      return Response.json({ ask: true });
    const files = input.files?.length
      ? await putFiles(office, input.files)
      : [];
    const task = await sendRequest(
      office,
      to.id,
      input.text,
      files.map((file) => file.id),
    );
    const chat = input.chat;
    if (chat)
      await changeState((s) => {
        s.sent[task.id] = { chat };
      });
    return Response.json({
      sent: { to: to.card.name, id: task.id, files: files.length },
    });
  } catch (error) {
    // A file that cannot go is said with which one, for the mini-me to tell its person.
    if (error instanceof OfficeError && error.code.startsWith("file"))
      return Response.json(
        { error: `${error.code}: ${error.message}` },
        { status: 400 },
      );
    return Response.json({ error: problemCode(error) }, { status: 502 });
  }
}
