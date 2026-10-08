// Skills between the person's clone and their office (features/relay/skills.ts): sharing one of
// theirs so colleagues' clones can do that kind of task the same way, adding one a colleague
// shared, taking one out, and how each of the office's skills stands here. Sharing sends files off
// this computer, so it happens only when the person does it on their screen (their click) or allows
// it on a card (skills-tool.ts). What is added is checked first (memory/skills.ts `addShared`):
// links, programs and the memory threat scan, and its hash; a skill of the person's by the same
// name, or one added before and changed here since, is never replaced, as with the app's own.
//
// Scripts: a shared skill may hold scripts/, as Hermes Agent's and Claude Code's skills do. They are
// kept as plain files, never made runnable, and the clone has no way to run a program itself; a
// script runs only when the person allows that very command in one of their Claude Code
// conversations. So they are kept, scanned like the rest, and counted where the person decides.

import type { PackedSkill, SkillFile, SkillStore } from "../memory/skills.ts";
import { logActivity } from "../server/activity.ts";
import {
  loadOffice,
  type OfficeConfig,
  OfficeError,
  putSharedSkill,
  removeSharedSkill,
  type SharedSkill,
  sharedSkill,
  sharedSkills,
} from "./client.ts";

/**
 * How one of the office's skills stands for this clone: `new` (not here, it can be added), `added`
 * (as the office has it), `update` (the office has a newer version), `changed` (changed here since
 * it was added, so the office's versions no longer replace it), `taken` (a skill of the person's by
 * that name is here), `yours` (this clone shared it, as it is here) and `yours-changed` (it changed
 * here since it was shared: sharing it again updates it).
 */
export type SkillHere =
  | "new"
  | "added"
  | "update"
  | "changed"
  | "taken"
  | "yours"
  | "yours-changed";

export interface OfficeSkill extends SharedSkill {
  here: SkillHere;
  /** How many scripts it holds. */
  scripts: number;
}

/** A shared skill fetched and checked, ready to add once the person says so. */
export interface SkillToAdd {
  skill: SharedSkill;
  files: SkillFile[];
  /** It replaces the version added before. */
  updated: boolean;
  /** It is here already, as the office has it. */
  same: boolean;
}

async function inOffice(): Promise<OfficeConfig> {
  const office = await loadOffice();
  if (!office)
    throw new OfficeError("not-in-office", "Your person is in no office.");
  return office;
}

export const scriptsIn = (files: readonly { path: string }[]): number =>
  files.filter((file) => file.path.startsWith("scripts/")).length;

/** The skills the office's members share, each with how it stands here. */
export async function officeSkills(store: SkillStore): Promise<OfficeSkill[]> {
  const office = await inOffice();
  const [shared, origins] = await Promise.all([
    sharedSkills(office),
    store.officeOrigins(),
  ]);
  const out: OfficeSkill[] = [];
  for (const skill of shared) {
    let here: SkillHere;
    if (skill.by === office.member) {
      const packed = await store.pack(skill.name);
      here =
        !packed.ok || packed.hash === skill.hash ? "yours" : "yours-changed";
    } else {
      const local = await store.hashOf(skill.name);
      const origin = origins[skill.name]?.hash;
      here =
        local === undefined
          ? "new"
          : !origin
            ? "taken"
            : local !== origin
              ? "changed"
              : skill.hash === origin
                ? "added"
                : "update";
    }
    out.push({ ...skill, here, scripts: scriptsIn(skill.files) });
  }
  return out;
}

/**
 * One of the person's skills as it would go to the office, or why it may not: not one that came
 * with the app (every clone has those) or from a colleague (theirs to share).
 */
export async function packToShare(
  store: SkillStore,
  name: string,
): Promise<PackedSkill> {
  const packed = await store.pack(name);
  if (!packed.ok) throw new OfficeError(packed.code, packed.message);
  const made = (await store.usage())[packed.name]?.created_by;
  if (made === "bundled" || made === "office")
    throw new OfficeError(
      "skill-not-shareable",
      made === "bundled"
        ? `'${packed.name}' came with the app; every clone has it already.`
        : `'${packed.name}' came from a colleague through the office; it is theirs to share.`,
    );
  return packed;
}

/** Shares a packed skill with the office (or its newer version), exactly as it was packed. */
export async function shareSkill(packed: PackedSkill): Promise<SharedSkill> {
  const office = await inOffice();
  const skill = await putSharedSkill(office, {
    name: packed.name,
    ...(packed.category ? { category: packed.category } : {}),
    files: packed.files.map((file) => ({
      path: file.path,
      data: Buffer.from(file.bytes).toString("base64"),
    })),
  });
  await logActivity({ kind: "skill", name: skill.name, action: "shared" });
  return skill;
}

/** What the skill store is given to add a shared skill: its files and where it came from. */
function toAdd(skill: SharedSkill, files: SkillFile[]) {
  return {
    name: skill.name,
    ...(skill.category ? { category: skill.category } : {}),
    files,
    hash: skill.hash,
    by: skill.by,
    byName: skill.byName,
  };
}

/** A skill a colleague shared, fetched and checked as it would be added, nothing written yet. */
export async function fetchToAdd(
  store: SkillStore,
  name: string,
): Promise<SkillToAdd> {
  const office = await inOffice();
  const { content, ...skill } = await sharedSkill(office, name);
  if (skill.by === office.member)
    throw new OfficeError(
      "skill-name-taken-here",
      `'${skill.name}' is your person's own; they shared it.`,
    );
  const files = content.map((file) => ({
    path: file.path,
    bytes: new Uint8Array(Buffer.from(file.data, "base64")),
  }));
  const checked = await store.addShared(toAdd(skill, files), { check: true });
  if (!checked.ok) throw new OfficeError(checked.code, checked.message);
  return { skill, files, updated: checked.updated, same: checked.same };
}

/** Adds what `fetchToAdd` brought, checked once more as it is written. */
export async function addSkill(
  store: SkillStore,
  ready: SkillToAdd,
): Promise<{ updated: boolean; same: boolean }> {
  const added = await store.addShared(toAdd(ready.skill, ready.files));
  if (!added.ok) throw new OfficeError(added.code, added.message);
  if (!added.same)
    await logActivity({
      kind: "skill",
      name: ready.skill.name,
      action: added.updated ? "updated" : "added",
      from: ready.skill.byName,
    });
  return { updated: added.updated, same: added.same };
}

/** Takes a skill out of the office; copies colleagues added stay theirs. */
export async function unshareSkill(name: string): Promise<void> {
  await removeSharedSkill(await inOffice(), name);
  await logActivity({ kind: "skill", name, action: "unshared" });
}

/** One shared skill's SKILL.md as text, to tell the person what it does before they add it. */
export async function readSharedSkill(
  name: string,
): Promise<{ skill: SharedSkill; skillMd: string }> {
  const { content, ...skill } = await sharedSkill(await inOffice(), name);
  const main = content.find((file) => file.path === "SKILL.md");
  return {
    skill,
    skillMd: main ? Buffer.from(main.data, "base64").toString("utf8") : "",
  };
}
