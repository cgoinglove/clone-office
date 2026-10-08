// The office's skills as the clone's two tools, fixed so a session's tool list stays the same:
// - office_skills (free): what colleagues shared and how each stands here, or one's SKILL.md;
// - office_skill_manage (asked every time): share one of the person's skills, add or update one a
//   colleague shared, or stop sharing one. The tool asks the person itself, on a card that lists
//   the files that would go or come (worked out here, so what they see is what is sent), and the
//   session lets it through its own permission check for that reason; "from now on" is never
//   offered for it (gate/rules.ts ALWAYS_ASKED). Only in a conversation with the person.

import { untrusted } from "../brain/untrusted.ts";
import { askPermission, gateOpen } from "../gate/tools.ts";
import type { SkillStore } from "../memory/skills.ts";
import { OfficeError, problemCode, skillName } from "./client.ts";
import {
  addSkill,
  fetchToAdd,
  officeSkills,
  packToShare,
  readSharedSkill,
  scriptsIn,
  shareSkill,
  unshareSkill,
} from "./shared-skills.ts";

export const OFFICE_SKILLS_TOOL = {
  name: "office_skills",
  description:
    "Skills your person's colleagues shared with their office (how a colleague does one kind of task), for your person to add to you so you do it the team's way, and the ones they shared: each with who shared it and how it stands here (new, added, update available, changed here, a skill of yours by that name, yours). With name, that skill's SKILL.md, to tell your person what it does before they add it. Says so when they are in no office.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "One shared skill's name, to read its SKILL.md",
      },
    },
  },
};

export const OFFICE_SKILL_MANAGE_TOOL = {
  name: "office_skill_manage",
  description:
    "Only when your person asks: share one of your skills with their office so colleagues' clones can add it (share; again after it changed, to update it), add a skill a colleague shared, or its newer version (add), or stop sharing one they shared (unshare). Your person is asked first every time, on a card listing the files that would go or come. What comes is checked before it is added; a skill of yours by the same name, or one changed here since it was added, is never replaced. Scripts in a skill are kept as text: you never run them.",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["share", "add", "unshare"] },
      name: { type: "string", description: "The skill's name" },
    },
    required: ["action", "name"],
  },
};

/** The tool as the gate and the cards name it. */
export const OFFICE_SKILL_MANAGE = `mcp__minime__${OFFICE_SKILL_MANAGE_TOOL.name}`;

const NOT_ASKED = {
  deny: "Your person said no. Nothing was changed; do not try another way.",
  unanswered:
    "Your person did not answer in time. Nothing was changed; tell them what you wanted to do.",
} as const;

export async function callOfficeSkillTool(
  store: SkillStore,
  tool: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; isError: boolean }> {
  const name = String(args.name ?? "").trim();
  try {
    if (tool === OFFICE_SKILLS_TOOL.name) {
      if (name) {
        const { skill, skillMd } = await readSharedSkill(name);
        return {
          result: {
            name: skill.name,
            shared_by: skill.byName,
            files: skill.files.map((file) => file.path),
            // A colleague's text: what it would have you do, once your person adds it.
            skill_md: untrusted(`${skill.byName}'s shared skill`, skillMd),
          },
          isError: false,
        };
      }
      const skills = await officeSkills(store);
      return {
        result: skills.length
          ? skills.map((skill) => ({
              name: skill.name,
              ...(skill.category ? { category: skill.category } : {}),
              description: skill.description,
              shared_by: skill.byName,
              here: skill.here,
              files: skill.files.length,
              ...(skill.scripts ? { scripts: skill.scripts } : {}),
            }))
          : "No one in the office has shared a skill yet.",
        isError: false,
      };
    }
    if (!gateOpen)
      return {
        result:
          "Your person cannot be asked now, so nothing was shared or added. Tell them what you would do.",
        isError: true,
      };
    const action = String(args.action ?? "");
    if (action === "share") {
      const packed = await packToShare(store, name);
      const answer = await askPermission(OFFICE_SKILL_MANAGE, {
        action,
        name: packed.name,
        description: packed.description,
        files: packed.files.map((file) => file.path),
      });
      if (answer !== "allow")
        return { result: NOT_ASKED[answer], isError: true };
      const skill = await shareSkill(packed);
      return {
        result: `Shared '${skill.name}' with the office (${skill.files.length} files). Colleagues' clones can add it now; after it changes, share it again to update it.`,
        isError: false,
      };
    }
    if (action === "add") {
      const ready = await fetchToAdd(store, name);
      if (ready.same)
        return {
          result: `'${ready.skill.name}' is here already, as the office has it.`,
          isError: false,
        };
      const scripts = scriptsIn(ready.files);
      const answer = await askPermission(OFFICE_SKILL_MANAGE, {
        action,
        name: ready.skill.name,
        from: ready.skill.byName,
        description: ready.skill.description,
        files: ready.files.map((file) => file.path),
        ...(scripts ? { scripts } : {}),
      });
      if (answer !== "allow")
        return { result: NOT_ASKED[answer], isError: true };
      const added = await addSkill(store, ready);
      return {
        result: `${added.updated ? "Updated" : "Added"} '${ready.skill.name}', shared by ${ready.skill.byName}; it is one of your skills now (skill_view).${scripts ? " Its scripts are kept as text: never run one; if one matters, tell your person what it would do." : ""}`,
        isError: false,
      };
    }
    if (action === "unshare") {
      // A name the office could not hold is refused before the person is asked about it.
      skillName(name);
      const answer = await askPermission(OFFICE_SKILL_MANAGE, { action, name });
      if (answer !== "allow")
        return { result: NOT_ASKED[answer], isError: true };
      await unshareSkill(name);
      return {
        result: `'${name}' is no longer shared. Copies colleagues added stay theirs.`,
        isError: false,
      };
    }
    return {
      result: "Unknown action: use share, add or unshare.",
      isError: true,
    };
  } catch (error) {
    const known = error instanceof OfficeError;
    return {
      result: known
        ? `${error.message} (${error.code})`
        : `It could not be done: ${problemCode(error)}.`,
      // Being in no office is an answer, not a failure.
      isError: !known || error.code !== "not-in-office",
    };
  }
}
