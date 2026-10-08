// Skills an office's members share: a skill is a folder its clone keeps, SKILL.md with what it
// holds under references/, templates/, scripts/ and assets/, and a member shares one so their
// colleagues' clones can add it and do that kind of task the team's way (not the A2A card's
// `skills`, which are the kinds of request a member takes). The relay keeps each one whole, its
// files' bytes as base64, small (256 KB), under one name per office; a clone checks what it takes
// before adding it, as Hermes Agent's skills hub scans a skill before installing it.
//
// The hash is the one a clone keeps for a skill's folder (features/minime/memory/skills.ts
// `filesHash`): each file's path and bytes, by path, so a clone tells "as it came" from "changed
// here" by hashing its own copy.

import { createHash } from "node:crypto";

/** The most a shared skill may hold, all its files together. */
export const SKILL_BYTES = 256 * 1024;
/** The most files one shared skill may hold. */
export const SKILL_FILES = 50;
/** The most skills one office keeps. */
export const SKILLS_PER_OFFICE = 200;

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FOLDERS = ["references", "templates", "scripts", "assets"];
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

/** A file of a shared skill as it travels: its path in the skill and its bytes as base64. */
export interface SkillFileData {
  path: string;
  data: string;
}

/** A shared skill as an office lists it. */
export interface SharedSkill {
  name: string;
  category?: string;
  /** From its SKILL.md's front matter. */
  description: string;
  /** Its files by path, with each one's size in bytes. */
  files: { path: string; size: number }[];
  size: number;
  hash: string;
  /** The member who shared it, and their name (as it is now, or when they shared it). */
  by: string;
  byName: string;
  updated: string;
  /** Whether the caller may take it out of the office: theirs, or an office they own. */
  removable: boolean;
}

/** One shared skill with its files, for a clone to add. */
export type SharedSkillContent = SharedSkill & { content: SkillFileData[] };

/** What is wrong with a skill someone shares, as an HTTP status and the code a screen reads. */
export interface SkillProblem {
  status: number;
  code: string;
  message: string;
}

export const isSkillName = (name: string): boolean => NAME.test(name);

/** A file's path in a skill: SKILL.md, or a file under one of the four folders, never leaving it. */
export function skillPath(path: unknown): string | undefined {
  if (typeof path !== "string" || !path || path.length > 240) return undefined;
  if (path === "SKILL.md") return path;
  const parts = path.split("/");
  if (parts.length < 2 || !FOLDERS.includes(parts[0])) return undefined;
  // No hidden or empty part (so no "." or ".."), nothing a file system on another computer
  // would take otherwise (a drive, a backslash, control characters, Windows' reserved ones).
  for (const part of parts)
    if (
      !part ||
      part.length > 120 ||
      part.startsWith(".") ||
      /[\\:*?"<>|\u0000-\u001f\u007f]/.test(part)
    )
      return undefined;
  return path;
}

/** One hash over a skill's files: each path and its bytes, in path order. */
export function skillHash(
  files: readonly { path: string; bytes: Uint8Array }[],
): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    hash.update(`${file.path}\0`);
    hash.update(file.bytes);
    hash.update("\0");
  }
  return hash.digest("hex");
}

/** The name and description in a SKILL.md's front matter. */
export function skillFrontMatter(text: string): {
  name?: string;
  description?: string;
} {
  const block = /^---\n([\s\S]*?)\n---/.exec(text.replace(/^﻿/, ""))?.[1];
  if (!block) return {};
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*(.*)$`, "m")
      .exec(block)?.[1]
      ?.trim()
      .replace(/^["']|["']$/g, "");
  return { name: field("name"), description: field("description") };
}

/**
 * A skill as a member shares it, checked: its name, its category, every file's path and bytes, the
 * size, and a SKILL.md whose front matter names it and says what it is for. A problem otherwise.
 */
export function checkSkill(input: {
  name: unknown;
  category: unknown;
  files: unknown;
}):
  | {
      name: string;
      category?: string;
      description: string;
      files: { path: string; bytes: Uint8Array }[];
      size: number;
      hash: string;
    }
  | SkillProblem {
  const bad = (message: string, code = "bad-request", status = 400) => ({
    status,
    code,
    message,
  });
  const name = typeof input.name === "string" ? input.name : "";
  if (!isSkillName(name)) return bad("Not a skill's name.");
  const category =
    input.category === undefined ||
    input.category === null ||
    input.category === ""
      ? undefined
      : String(input.category);
  if (category !== undefined && !isSkillName(category))
    return bad("Not a category's name.");
  if (!Array.isArray(input.files) || !input.files.length)
    return bad("A skill comes with its files.");
  if (input.files.length > SKILL_FILES)
    return bad(
      `A shared skill holds at most ${SKILL_FILES} files.`,
      "skill-too-large",
      413,
    );
  const files: { path: string; bytes: Uint8Array }[] = [];
  const seen = new Set<string>();
  let size = 0;
  for (const given of input.files as unknown[]) {
    const file = given as Partial<SkillFileData> | null;
    const path = skillPath(file?.path);
    if (!path || seen.has(path))
      return bad(`Not a file a skill holds: ${String(file?.path)}.`);
    const data = file?.data;
    if (typeof data !== "string" || data.length % 4 || !BASE64.test(data))
      return bad(`${path} is not base64.`);
    const bytes = new Uint8Array(Buffer.from(data, "base64"));
    size += bytes.byteLength;
    if (size > SKILL_BYTES)
      return bad(
        `A shared skill holds at most ${SKILL_BYTES / 1024} KB.`,
        "skill-too-large",
        413,
      );
    seen.add(path);
    files.push({ path, bytes });
  }
  const main = files.find((file) => file.path === "SKILL.md");
  if (!main) return bad("A skill has a SKILL.md.", "skill-invalid");
  const meta = skillFrontMatter(Buffer.from(main.bytes).toString("utf8"));
  if (meta.name !== name || !meta.description)
    return bad(
      "SKILL.md starts with front matter naming the skill and saying what it is for.",
      "skill-invalid",
    );
  return {
    name,
    ...(category ? { category } : {}),
    description: meta.description.slice(0, 1024),
    files,
    size,
    hash: skillHash(files),
  };
}
