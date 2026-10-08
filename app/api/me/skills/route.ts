import * as z from "zod";
import { bringShippedSkills, skillsDir } from "@/features/minime/brain/session";
import { SkillStore } from "@/features/minime/memory/skills";
import { loadOffice, problemCode } from "@/features/minime/office/client";
import {
  addSkill,
  fetchToAdd,
  type OfficeSkill,
  officeSkills,
  packToShare,
  shareSkill,
  unshareSkill,
} from "@/features/minime/office/shared-skills";
import { refuse } from "@/features/minime/server/guard";

/** Who made a skill, as the screen says it: the app, a colleague through the office, or here. */
type From = "app" | "office" | "own";

// The clone's skills as the person's page shows them, and, in an office, the skills colleagues
// shared with how each stands here. What the person presses here is theirs to do: sharing one
// sends its files to the office, adding one brings a colleague's in, after the same checks the
// clone's own tool makes (office/shared-skills.ts). One look over the skills folder serves the
// whole answer (`survey`), after a press too: each skill's files are read at most once, and only
// where that is needed (what one of the person's own would send, a copy from the office's hash).
async function snapshot() {
  const store = new SkillStore(skillsDir(), "person");
  // The skills the app ships are in place before they are listed, as before a session lists them.
  await bringShippedSkills();
  const [local, office, bundled] = await Promise.all([
    store.survey().catch(() => []),
    loadOffice(),
    store.bundledOrigins(),
  ]);
  let shared: OfficeSkill[] = [];
  let problem: string | undefined;
  if (office)
    shared = await officeSkills(store, local).catch((error) => {
      problem = problemCode(error);
      return [];
    });
  const mine = new Map(
    shared
      .filter((skill) => skill.by === office?.member)
      .map((skill) => [skill.name, skill]),
  );
  const own = [];
  for (const skill of local) {
    const from: From =
      skill.createdBy === "bundled"
        ? "app"
        : skill.createdBy === "office"
          ? "office"
          : "own";
    // What sharing it would send, or why it may not go, shown before the person confirms.
    const packed = office && from === "own" ? await skill.pack() : undefined;
    const sharedAs = mine.get(skill.name);
    // One the app ships, as it came: the page names it in the person's language.
    const shipped =
      from === "app" &&
      typeof bundled[skill.name] === "string" &&
      (await skill.hash()) === bundled[skill.name];
    own.push({
      name: skill.name,
      description: skill.description,
      ...(shipped ? { shipped: true } : {}),
      ...(skill.category ? { category: skill.category } : {}),
      from,
      ...(skill.origin ? { by: skill.origin.byName } : {}),
      ...(packed?.ok
        ? { files: packed.files.map((file) => file.path) }
        : packed
          ? { problem: packed.code }
          : {}),
      ...(sharedAs
        ? { shared: sharedAs.here === "yours-changed" ? "changed" : "yes" }
        : {}),
    });
  }
  return {
    skills: own,
    office: office
      ? { skills: shared, me: office.member, ...(problem ? { problem } : {}) }
      : null,
  };
}

export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json(await snapshot());
}

const Body = z.object({
  action: z.enum(["share", "unshare", "add"]),
  name: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const { action, name } = body.data;
  const store = new SkillStore(skillsDir(), "person");
  try {
    if (action === "share") await shareSkill(await packToShare(store, name));
    else if (action === "add")
      await addSkill(store, await fetchToAdd(store, name));
    else await unshareSkill(name);
  } catch (error) {
    const code = problemCode(error);
    return Response.json(
      { error: code },
      { status: code === "relay-unreachable" ? 502 : 409 },
    );
  }
  return Response.json(await snapshot());
}
