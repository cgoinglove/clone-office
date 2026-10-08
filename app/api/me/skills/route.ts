import * as z from "zod";
import { skillsDir } from "@/features/minime/brain/session";
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
// clone's own tool makes (office/shared-skills.ts).
async function snapshot() {
  const store = new SkillStore(skillsDir(), "person");
  const [skills, usage, origins] = await Promise.all([
    store.list().catch(() => []),
    store.usage(),
    store.officeOrigins(),
  ]);
  const office = await loadOffice();
  let shared: OfficeSkill[] = [];
  let problem: string | undefined;
  if (office)
    shared = await officeSkills(store).catch((error) => {
      problem = problemCode(error);
      return [];
    });
  const mine = new Map(
    shared
      .filter((skill) => skill.by === office?.member)
      .map((skill) => [skill.name, skill]),
  );
  const own = [];
  for (const skill of skills) {
    const made = usage[skill.name]?.created_by;
    const from: From =
      made === "bundled" ? "app" : made === "office" ? "office" : "own";
    // What sharing it would send, or why it may not go, shown before the person confirms.
    const packed =
      office && from === "own" ? await store.pack(skill.name) : undefined;
    const sharedAs = mine.get(skill.name);
    own.push({
      ...skill,
      from,
      ...(from === "office" && origins[skill.name]
        ? { by: origins[skill.name].byName }
        : {}),
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
