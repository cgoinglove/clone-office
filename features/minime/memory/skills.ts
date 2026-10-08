// Skills: the mini-me's procedural memory, how to do one kind of task the way its person wants it.
// Layout, as in Hermes Agent:
//   <skills>/[category/]<name>/SKILL.md     always-on rules for that kind of task (~200 lines)
//                         references/<topic>.md   depth needed only sometimes, one file per topic
//                         templates/  scripts/  assets/
//   <skills>/<category>/DESCRIPTION.md      one line on what the category holds
//   <skills>/.usage.json                    views, patches, who made it, pinned, state
//   <skills>/.archive/<name>/               skills set aside; never deleted, can be restored
// A session sees only the index (name and the first 60 characters of each description, grouped by
// category); it loads a skill with skill_view and one of its files with skill_view(name, path).
// Changes come in one operations list that applies all or nothing, and an existing file must be
// read in the same run before it is changed, so a write is never based on a stale copy.
// Follows Hermes Agent (tools/skill_manager_tool.py, tools/skills_tool.py, tools/skill_usage.py,
// tools/skill_linter.py; MIT, Nous Research), with one difference: deleting archives instead of
// removing, because this app never deletes what a person's mini-me has learned.
//
// A skill also travels within the person's office (../office/shared-skills.ts): `pack` gathers
// what one would take there, and `addShared` brings in one a colleague shared, checked first as
// Hermes Agent's skills hub checks what it installs (paths, programs, the memory threat scan, the
// hash it was shared with), with its origin in `.office.json` so a later version replaces it only
// while it is as it came, as the skills the app ships are. A copy counts as the office's only while
// its `created_by` is "office"; its origin goes when it is set aside or a skill of the person's takes
// its name. A newer version is written whole aside and swapped in with two renames; what a process
// that died between them left aside is put back, or cleared once shown to be a copy, the next time
// the store is used (`recoverLocked`).

import { randomBytes } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import {
  isSkillName,
  SKILL_BYTES,
  SKILL_FILES,
  skillFrontMatter,
  skillHash,
  skillPath,
} from "../../relay/skills.ts";
import {
  atomicWrite,
  LOCK_STALE_MS,
  readText,
  tryLock,
  withLock,
} from "./files.ts";
import { threatMessage } from "./threats.ts";

const MAX_DESCRIPTION = 1024;
/** What the session's skill index shows of a description; a new skill's must fit whole. */
export const INDEX_DESCRIPTION = 60;
const MAX_CONTENT = 100_000;
const MAX_FILE_BYTES = 1_048_576;
/** Past this a SKILL.md body is loaded whole into every later turn; move depth to references/. */
const BODY_SOFT_BUDGET = 24_000;
/** More reference files than this is a per-session log, not topical depth. */
const MAX_REFERENCE_FILES = 60;
const MAX_CATEGORY_DESCRIPTION = 160;

export const SUPPORT_DIRS = [
  "references",
  "templates",
  "scripts",
  "assets",
] as const;
const ARCHIVE = ".archive";
/** The skills the app shipped here, each with the hash of the files it came with. */
const BUNDLED = ".bundled.json";
/** The skills added from the office, each with the hash it came with and who shared it. */
const OFFICE = ".office.json";
const USAGE = ".usage.json";
/** A skill from the office written whole aside, before it is put in place (`addShared`). */
const INCOMING = ".incoming-";
/**
 * The version a newer one from the office replaces, set aside until that one is in place, named for
 * the hash it was checked to have and where it was: `.replaced-<random>-<hash>+[<category>+]<name>`.
 */
const REPLACED = ".replaced-";
/** A leftover younger than this may be a writer's still at work (one whose lock was taken over). */
const LEFTOVER_MS = 10 * 60_000;
/** One set aside that cannot be shown to be the office's copy is kept this long first. */
const UNPROVEN_MS = 7 * 24 * 60 * 60_000;

/** Programs, which a skill never carries to or from the office (Hermes Agent's skills guard). */
const PROGRAM =
  /\.(?:exe|dll|so|dylib|bin|com|msi|dmg|app|deb|rpm|pkg|apk|jar|scr|bat|cmd|ps1|vbs)$/i;

/**
 * Who is writing. The mini-me in a session with its person, its background review (no person
 * present), or the person themselves. The review may only change skills the mini-me made and
 * the person has not pinned; nobody may set aside a pinned skill.
 */
export type Actor = "minime" | "review" | "person";

export interface SkillInfo {
  name: string;
  description: string;
  category?: string;
}

export interface UsageRecord {
  /**
   * "bundled": one the app ships, which the clone adapts to its person and the curator leaves.
   * "office": one a colleague shared that the person added; changed only with them, never set
   * aside by the curator.
   */
  created_by: "minime" | "person" | "bundled" | "office" | null;
  created_at: string;
  view_count: number;
  last_viewed_at: string | null;
  patch_count: number;
  last_patched_at: string | null;
  state: "active" | "stale" | "archived";
  pinned: boolean;
  archived_at: string | null;
  /** Where an archived skill lived, so restore puts it back. */
  archived_from?: string;
}

export interface SkillOp {
  action?: string;
  name?: string;
  category?: string;
  category_description?: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
  file_path?: string;
  file_content?: string;
}

export interface SkillChange {
  action: "create" | "patch" | "write_file" | "remove_file" | "delete";
  name: string;
  file?: string;
  description?: string;
}

export type SkillResult =
  | {
      success: true;
      message: string;
      skills: string[];
      warnings?: string[];
    }
  | { success: false; error: string };

/** One file of a skill as it goes to or comes from the office: its path in the skill, its bytes. */
export interface SkillFile {
  path: string;
  bytes: Uint8Array;
}

/** Why a skill does not go to the office or come from it: a code for the screen, and the detail. */
export interface SkillRefusal {
  ok: false;
  code: string;
  message: string;
}

/** A skill as it would go to the office. */
export interface PackedSkill {
  ok: true;
  name: string;
  category?: string;
  description: string;
  files: SkillFile[];
  size: number;
  hash: string;
}

/** Where a skill added from the office came from. */
export interface OfficeOrigin {
  /** The hash of its files as they came (the relay's `skillHash`). */
  hash: string;
  /** The member who shared it, and their name then. */
  by: string;
  byName: string;
  added: string;
}

/** A skill here as the screens that weigh it against the office's see it (`survey`). */
export interface StoredSkill extends SkillInfo {
  createdBy: UsageRecord["created_by"];
  /** Where it came from, while it is a copy from the office (made by "office", its origin kept). */
  origin?: OfficeOrigin;
  /** What sharing it would send, or why it may not go; its files are read on the first ask only. */
  pack(): Promise<PackedSkill | SkillRefusal>;
  /** The hash of its folder now (the office's `skillHash`); read on the first ask only. */
  hash(): Promise<string>;
}

/** A skill's folder as a scan finds it. */
interface FoundSkill {
  name: string;
  description: string;
  category?: string;
  path: string;
}

export type SkillView =
  | {
      name: string;
      category?: string;
      description: string;
      content: string;
      linked_files?: Partial<Record<(typeof SUPPORT_DIRS)[number], string[]>>;
    }
  | { name: string; file_path: string; content: string };

function body(content: string): string {
  return content.replace(/^﻿?---\n[\s\S]*?\n---\n?/, "");
}

function validateSkill(
  name: string,
  content: string,
  isNew: boolean,
): string | undefined {
  if (!isSkillName(name))
    return `Invalid skill name '${name}': lowercase letters, digits, '.', '_' or '-', at most 64 characters, starting with a letter or digit.`;
  if (content.length > MAX_CONTENT)
    return `SKILL.md content is ${content.length.toLocaleString("en-US")} characters (limit: ${MAX_CONTENT.toLocaleString("en-US")}). Keep the always-on rules in SKILL.md and move depth into references/<topic>.md.`;
  const meta = skillFrontMatter(content);
  if (!meta.name || !meta.description)
    return "SKILL.md must start with YAML front matter holding 'name' and 'description'.";
  if (meta.name !== name)
    return `Front matter name '${meta.name}' must match the skill name '${name}'.`;
  if (meta.description.length > MAX_DESCRIPTION)
    return `Description exceeds ${MAX_DESCRIPTION} characters.`;
  if (isNew && meta.description.length > INDEX_DESCRIPTION)
    return `The description is ${meta.description.length} characters; sessions see only the first ${INDEX_DESCRIPTION}. Make it one sentence of at most ${INDEX_DESCRIPTION} characters, trigger first: 'Use when <trigger>. <behavior>.'`;
  return threatMessage(content);
}

function validateCategory(category: string): string | undefined {
  return isSkillName(category)
    ? undefined
    : `Invalid category '${category}': one folder name of lowercase letters, digits, '.', '_' or '-'.`;
}

/** A supporting file's path: under references/, templates/, scripts/ or assets/, never escaping. */
function validateFilePath(filePath: string): string | undefined {
  if (!filePath) return "file_path is required.";
  if (filePath.startsWith("/") || /^[a-zA-Z]:/.test(filePath))
    return "file_path must be relative to the skill folder, e.g. 'references/format.md'.";
  if (filePath.split(/[\\/]/).includes(".."))
    return "Path traversal ('..') is not allowed.";
  const parts = normalize(filePath).split(sep);
  if (!(SUPPORT_DIRS as readonly string[]).includes(parts[0]))
    return `File must be under one of: ${SUPPORT_DIRS.join(", ")}. Got: '${filePath}'.`;
  if (parts.length < 2)
    return `Give a file, not just a folder, e.g. '${parts[0]}/notes.md'.`;
  return undefined;
}

function lint(content: string, referenceCount: number): string[] {
  const warnings: string[] = [];
  const size = body(content).length;
  if (size > BODY_SOFT_BUDGET)
    warnings.push(
      `oversized-body: SKILL.md body is ${size.toLocaleString("en-US")} characters and is loaded whole for the rest of a session. Keep the always-on rules (~200 lines) and move topic depth into references/<topic>.md.`,
    );
  if (referenceCount > MAX_REFERENCE_FILES)
    warnings.push(
      `references-sprawl: ${referenceCount} files under references/ — that is a per-session log, not topical depth. Merge same-topic files into one.`,
    );
  return warnings;
}

const now = () => new Date().toISOString();

function emptyRecord(createdBy: UsageRecord["created_by"]): UsageRecord {
  return {
    created_by: createdBy,
    created_at: now(),
    view_count: 0,
    last_viewed_at: null,
    patch_count: 0,
    last_patched_at: null,
    state: "active",
    pinned: false,
    archived_at: null,
  };
}

export class SkillStore {
  readonly dir: string;
  readonly actor: Actor;
  /** Files read in this run (`name` for SKILL.md, `name/<path>` for others); only these may change. */
  private readonly viewed = new Set<string>();
  readonly changes: SkillChange[] = [];

  constructor(dir: string, actor: Actor = "minime") {
    this.dir = dir;
    this.actor = actor;
  }

  // Reading -----------------------------------------------------------------------------------

  /** Every active skill, by category then name. */
  async list(category?: string): Promise<SkillInfo[]> {
    const found = await this.scan();
    return found
      .filter((skill) => !category || skill.category === category)
      .map(({ name, description, category }) => ({
        name,
        description,
        ...(category ? { category } : {}),
      }));
  }

  /** Category descriptions from each category's DESCRIPTION.md. */
  async categories(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const entry of await this.entries(this.dir)) {
      const read = await readText(
        join(/*turbopackIgnore: true*/ this.dir, entry, "DESCRIPTION.md"),
      );
      const description = read.raw && skillFrontMatter(read.raw).description;
      if (description) out[entry] = description;
    }
    return out;
  }

  /** The index a session starts with, grouped by category as in Hermes. */
  async index(): Promise<string> {
    const skills = await this.list();
    if (!skills.length) return "";
    const descriptions = await this.categories();
    const groups = new Map<string, SkillInfo[]>();
    for (const skill of skills) {
      const key = skill.category ?? "general";
      groups.set(key, [...(groups.get(key) ?? []), skill]);
    }
    const lines: string[] = [];
    for (const key of [...groups.keys()].sort()) {
      lines.push(
        descriptions[key] ? `  ${key}: ${descriptions[key]}` : `  ${key}:`,
      );
      for (const skill of groups.get(key) ?? [])
        lines.push(
          `    - ${skill.name}: ${skill.description.length > INDEX_DESCRIPTION ? `${skill.description.slice(0, INDEX_DESCRIPTION - 3)}...` : skill.description}`,
        );
    }
    return `<available_skills>\n${lines.join("\n")}\n</available_skills>`;
  }

  /** A skill's SKILL.md with the list of its files, or one of its files; marks it read. */
  async view(
    name: string,
    filePath?: string,
  ): Promise<SkillView | { error: string }> {
    const found = await this.find(name);
    if (!found) return { error: `No skill named '${name}'. Use skills_list.` };
    if (filePath) {
      const invalid = validateFilePath(filePath);
      if (invalid) return { error: invalid };
      const read = await readText(
        join(/*turbopackIgnore: true*/ found.path, filePath),
      );
      if (!read.exists) {
        const files = await this.linkedFiles(found.path);
        return {
          error: `No file '${filePath}' in skill '${found.name}'. It has: ${JSON.stringify(files)}.`,
        };
      }
      this.viewed.add(`${found.name}/${normalize(filePath)}`);
      await this.touch(found.name, "view");
      return { name: found.name, file_path: filePath, content: read.raw };
    }
    const read = await readText(
      join(/*turbopackIgnore: true*/ found.path, "SKILL.md"),
    );
    this.viewed.add(found.name);
    await this.touch(found.name, "view");
    const linked = await this.linkedFiles(found.path);
    return {
      name: found.name,
      ...(found.category ? { category: found.category } : {}),
      description: skillFrontMatter(read.raw).description ?? "",
      content: read.raw,
      ...(Object.keys(linked).length ? { linked_files: linked } : {}),
    };
  }

  async usage(): Promise<Record<string, UsageRecord>> {
    const read = await readText(
      join(/*turbopackIgnore: true*/ this.dir, USAGE),
    );
    try {
      return read.raw ? JSON.parse(read.raw) : {};
    } catch {
      return {};
    }
  }

  // Writing -----------------------------------------------------------------------------------

  /** Applies every operation or none: touched files are restored if any step fails. */
  async apply(operations: SkillOp[]): Promise<SkillResult> {
    if (!operations.length)
      return { success: false, error: "operations list is empty." };
    return withLock(this.dir, () => this.applyLocked(operations));
  }

  /**
   * Bring in the skills the app ships (`source`, laid out as the store is), as Hermes Agent's
   * skills_sync does: each is copied in once and its origin recorded in `.bundled.json`; a later
   * version replaces it only while it is as it came (not adapted since); one the person set aside
   * or removed is not brought back; a skill of theirs by the same name is never touched. One the
   * app no longer ships is set aside to the archive while it is as it came (never deleted), and
   * stays as the person's own once it was adapted.
   */
  async syncBundled(source: string): Promise<string[]> {
    const shipped = await new SkillStore(source).scan();
    if (!shipped.length) return [];
    return withLock(this.dir, async () => {
      const manifestPath = join(/*turbopackIgnore: true*/ this.dir, BUNDLED);
      let manifest: Record<string, string> = {};
      try {
        manifest = JSON.parse((await readText(manifestPath)).raw || "{}");
      } catch {
        manifest = {};
      }
      const changed: string[] = [];
      const added: string[] = [];
      for (const skill of shipped) {
        const origin = await treeHash(skill.path);
        const here = await this.find(skill.name);
        const was = manifest[skill.name];
        if (!was) {
          if (here) continue;
          const archived = await readText(
            join(
              /*turbopackIgnore: true*/ this.dir,
              ARCHIVE,
              skill.name,
              "SKILL.md",
            ),
          );
          if (archived.exists) continue;
          const to = join(
            /*turbopackIgnore: true*/ this.dir,
            ...(skill.category ? [skill.category] : []),
            skill.name,
          );
          await cp(skill.path, to, { recursive: true });
          if (skill.category)
            await this.copyDescription(source, skill.category);
          manifest[skill.name] = origin;
          added.push(skill.name);
          changed.push(skill.name);
          continue;
        }
        if (!here || was === origin) continue;
        if ((await treeHash(here.path)) !== was) continue;
        await rm(here.path, { recursive: true, force: true });
        await cp(skill.path, here.path, { recursive: true });
        manifest[skill.name] = origin;
        changed.push(skill.name);
      }
      const shippedNames = new Set(shipped.map((skill) => skill.name));
      const adapted: string[] = [];
      for (const [name, origin] of Object.entries(manifest)) {
        if (shippedNames.has(name)) continue;
        delete manifest[name];
        changed.push(name);
        const here = await this.find(name);
        if (!here) continue;
        if ((await treeHash(here.path)) === origin)
          await this.archiveLocked(here);
        else adapted.push(name);
      }
      if (!changed.length) return [];
      await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
      if (added.length || adapted.length)
        await this.updateUsage((usage) => {
          for (const name of added)
            usage[name] = usage[name] ?? emptyRecord("bundled");
          for (const name of adapted)
            if (usage[name]?.created_by === "bundled")
              usage[name] = { ...usage[name], created_by: "person" };
        });
      return changed;
    });
  }

  private async copyDescription(source: string, category: string) {
    const to = join(
      /*turbopackIgnore: true*/ this.dir,
      category,
      "DESCRIPTION.md",
    );
    if ((await readText(to)).exists) return;
    const from = await readText(
      join(/*turbopackIgnore: true*/ source, category, "DESCRIPTION.md"),
    );
    if (from.exists) await atomicWrite(to, from.raw);
  }

  // The office --------------------------------------------------------------------------------

  /**
   * What one of the person's skills would take to their office: SKILL.md and the files under its
   * four folders, as they are, checked as a colleague's clone will check them on adding it (no link
   * to anything elsewhere, no program, nothing the threat scan stops, small enough), with the hash
   * the office will keep for it.
   */
  async pack(name: string): Promise<PackedSkill | SkillRefusal> {
    const found = await this.find(name);
    if (!found) return refusal("not-found", `No skill named '${name}'.`);
    return packFolder(found);
  }

  /**
   * The skills added from the office, by name, with where each came from, as the file has them; a
   * name counts only while its skill's `created_by` is "office" (`survey`, `addShared`).
   */
  async officeOrigins(): Promise<Record<string, OfficeOrigin>> {
    try {
      const origins = JSON.parse(
        (await readText(join(/*turbopackIgnore: true*/ this.dir, OFFICE)))
          .raw || "{}",
      );
      // No prototype: a skill named "constructor" has no origin unless the file gives it one.
      return Object.assign(
        Object.create(null),
        origins && typeof origins === "object" ? origins : {},
      );
    } catch {
      return {};
    }
  }

  /**
   * Every active skill with who made it and, for a copy from the office, where it came from, from
   * one look over the folder (a page weighing ~200 of the office's skills against them makes no
   * other); each one's files are read only when asked, and once. A skill whose `created_by` is not
   * "office" is the person's own, whatever `.office.json` still says.
   */
  async survey(): Promise<StoredSkill[]> {
    const found = await this.scan();
    const [usage, origins] = await Promise.all([
      this.usage(),
      this.officeOrigins(),
    ]);
    return found.map((skill) => {
      const createdBy = usage[skill.name]?.created_by ?? null;
      const origin = createdBy === "office" ? origins[skill.name] : undefined;
      let packed: Promise<PackedSkill | SkillRefusal> | undefined;
      let hashed: Promise<string> | undefined;
      return {
        name: skill.name,
        description: skill.description,
        ...(skill.category ? { category: skill.category } : {}),
        createdBy,
        ...(origin ? { origin } : {}),
        pack: () => {
          packed ??= packFolder(skill);
          return packed;
        },
        hash: () => {
          hashed ??= treeHash(skill.path);
          return hashed;
        },
      };
    });
  }

  /**
   * Adds a skill a colleague shared with the office, or its newer version, after the checks `pack`
   * makes and a check that it came whole (its hash). Never over a skill of the person's by that
   * name, nor over one added before that was changed here since; its scripts are kept as files,
   * never made runnable. With `check`, only says whether it would.
   */
  async addShared(
    input: {
      name: string;
      category?: string;
      files: SkillFile[];
      hash: string;
      by: string;
      byName: string;
    },
    options: { check?: boolean } = {},
  ): Promise<{ ok: true; updated: boolean; same: boolean } | SkillRefusal> {
    const checked = inspect(input.name, input.files);
    if (!checked.ok) return checked;
    if (skillHash(input.files) !== input.hash)
      return refusal(
        "skill-invalid",
        `'${input.name}' did not come whole from the office; nothing was added.`,
      );
    return withLock(this.dir, async () => {
      // What a process that died midway left aside is back in place before anything is weighed.
      await this.recoverLocked();
      const skills = await this.scanTree();
      const [usage, kept] = await Promise.all([
        this.usage(),
        this.officeOrigins(),
      ]);
      // Only copies from the office that are still here and still theirs keep an origin.
      const origins = liveOrigins(kept, skills, usage);
      const here = skills.find((skill) => skill.name === input.name);
      const origin = here && origins[input.name];
      if (here && !origin)
        return refusal(
          "skill-name-taken-here",
          `A skill named '${input.name}' is here already and did not come from the office; it is never replaced.`,
        );
      // Its folder's hash, read once: the one it has when it is set aside below.
      const current = here ? await treeHash(here.path) : undefined;
      if (origin && current !== origin.hash)
        return refusal(
          "skill-changed-here",
          `'${input.name}' was changed here since it was added; the office's version is not put over it.`,
        );
      if (here && origin?.hash === input.hash)
        return { ok: true as const, updated: false, same: true };
      // A new one goes into the category it was shared in, unless that is a skill here.
      let category =
        input.category && isSkillName(input.category)
          ? input.category
          : undefined;
      if (
        category &&
        (
          await readText(
            join(/*turbopackIgnore: true*/ this.dir, category, "SKILL.md"),
          )
        ).exists
      )
        category = undefined;
      const target =
        here?.path ??
        join(
          /*turbopackIgnore: true*/ this.dir,
          ...(category ? [category] : []),
          input.name,
        );
      if (!here) {
        const listed = await readdir(target).then(
          (entries) => entries,
          (error: NodeJS.ErrnoException) =>
            error.code === "ENOENT" ? undefined : ["?"],
        );
        if (listed?.length)
          return refusal(
            "skill-name-taken-here",
            `'${input.name}' is a folder here already (a category or other files); nothing was added.`,
          );
      }
      if (options.check)
        return { ok: true as const, updated: Boolean(here), same: false };
      // Written whole aside first (a hidden folder no listing reads), then put in place at once.
      const staging = join(
        /*turbopackIgnore: true*/ this.dir,
        `${INCOMING}${randomBytes(6).toString("hex")}`,
      );
      try {
        for (const file of input.files) {
          const to = join(
            /*turbopackIgnore: true*/ staging,
            ...file.path.split("/"),
          );
          await mkdir(dirname(to), { recursive: true });
          // Never executable: a script that came from a colleague runs only if the person runs it.
          await writeFile(to, file.bytes, { mode: 0o644 });
        }
        await mkdir(dirname(target), { recursive: true });
        if (here) {
          // Named for the hash it was just checked to have and where it was, so a process that dies
          // before the new one is in place leaves enough to put it back (`recoverLocked`).
          const old = join(
            /*turbopackIgnore: true*/ this.dir,
            setAsideName(current ?? (await treeHash(here.path)), here),
          );
          await rename(here.path, old);
          try {
            await rename(staging, target);
          } catch (error) {
            await rename(old, here.path);
            throw error;
          }
          await rm(old, { recursive: true, force: true });
        } else {
          // An empty folder left there is nothing of anyone's.
          await rm(target, { recursive: true, force: true });
          await rename(staging, target);
        }
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        throw error;
      }
      origins[input.name] = {
        hash: input.hash,
        by: input.by,
        byName: input.byName,
        added: now(),
      };
      await this.writeOrigins(origins);
      await this.updateUsage((usage) => {
        usage[input.name] =
          here && usage[input.name]
            ? { ...usage[input.name], created_by: "office", state: "active" }
            : emptyRecord("office");
      });
      return { ok: true as const, updated: Boolean(here), same: false };
    });
  }

  /** Keep a skill from being set aside or changed by the review; for the person. */
  async pin(name: string, pinned: boolean): Promise<boolean> {
    const found = await this.find(name);
    if (!found) return false;
    await withLock(this.dir, () =>
      this.updateUsage((usage) => {
        usage[found.name] = {
          ...(usage[found.name] ?? emptyRecord(null)),
          pinned,
        };
      }),
    );
    return true;
  }

  /** Move a skill into .archive/, recording where it came from. Never deletes. */
  async archive(name: string): Promise<{ ok: boolean; message: string }> {
    return withLock(this.dir, async () => {
      const found = await this.find(name);
      if (!found) return { ok: false, message: `No skill named '${name}'.` };
      return this.archiveLocked(found);
    });
  }

  /** Put an archived skill back where it was. */
  async restore(name: string): Promise<{ ok: boolean; message: string }> {
    return withLock(this.dir, async () => {
      const usage = await this.usage();
      const record = usage[name];
      const from = join(/*turbopackIgnore: true*/ this.dir, ARCHIVE, name);
      if (!(await readText(join(from, "SKILL.md"))).exists)
        return { ok: false, message: `No archived skill named '${name}'.` };
      if (await this.find(name))
        return {
          ok: false,
          message: `A skill named '${name}' is active already.`,
        };
      const to = join(
        /*turbopackIgnore: true*/ this.dir,
        record?.archived_from ?? name,
      );
      await mkdir(join(to, ".."), { recursive: true });
      await rename(from, to);
      await this.updateUsage((all) => {
        all[name] = {
          ...(all[name] ?? emptyRecord(null)),
          state: "active",
          archived_at: null,
          last_viewed_at: now(),
        };
      });
      return { ok: true, message: `Skill '${name}' restored.` };
    });
  }

  /** Change a skill's lifecycle state; for the curator. */
  async setState(name: string, state: "active" | "stale"): Promise<void> {
    await withLock(this.dir, () =>
      this.updateUsage((usage) => {
        if (usage[name]) usage[name] = { ...usage[name], state };
      }),
    );
  }

  // Internals ---------------------------------------------------------------------------------

  private async applyLocked(operations: SkillOp[]): Promise<SkillResult> {
    if (
      operations.some((op) => op.action === "delete") &&
      operations.length > 1
    )
      return {
        success: false,
        error: "delete must be the only operation. Nothing was changed.",
      };
    const usage = await this.usage();
    const originals = new Map<string, string | undefined>();
    const createdDirs: string[] = [];
    const changes: SkillChange[] = [];
    const warnings: string[] = [];
    const remember = async (path: string) => {
      if (!originals.has(path)) {
        const read = await readText(path);
        if (!read.ok)
          throw new Error(`could not read ${path}; nothing was changed.`);
        originals.set(path, read.exists ? read.raw : undefined);
      }
    };
    try {
      for (const [i, op] of operations.entries()) {
        const at = `Operation ${i + 1} (${op.action ?? "unknown"})`;
        const name = (op.name ?? "").trim();
        if (!name) throw new Error(`${at}: name is required.`);
        if (op.action === "create") {
          const content = (op.content ?? "").trim();
          const category = op.category?.trim() || undefined;
          const invalid =
            (category ? validateCategory(category) : undefined) ??
            validateSkill(name, content, true);
          if (invalid) throw new Error(`${at}: ${invalid}`);
          if (await this.find(name))
            throw new Error(
              `${at}: a skill named '${name}' exists already — view it and patch it, or add a file under it.`,
            );
          const dir = join(
            /*turbopackIgnore: true*/ this.dir,
            category ?? "",
            name,
          );
          // A folder there already (a category, or files someone put) is never written over, nor
          // taken back on a failed batch; a skill is never made inside another skill (Hermes Agent
          // lost whole categories this way).
          const listed = await readdir(dir).then(
            (entries) => entries,
            (error: NodeJS.ErrnoException) =>
              error.code === "ENOENT" ? undefined : ["?"],
          );
          if (listed?.length)
            throw new Error(
              `${at}: '${category ? `${category}/` : ""}${name}' is already a folder (a category or other files); choose another name.`,
            );
          if (
            category &&
            (
              await readText(
                join(/*turbopackIgnore: true*/ this.dir, category, "SKILL.md"),
              )
            ).exists
          )
            throw new Error(`${at}: '${category}' is a skill, not a category.`);
          if (category) {
            const describe = join(
              /*turbopackIgnore: true*/ this.dir,
              category,
              "DESCRIPTION.md",
            );
            const existing = await readText(describe);
            const line = op.category_description?.trim();
            if (!existing.exists && line) {
              if (line.length > MAX_CATEGORY_DESCRIPTION)
                throw new Error(
                  `${at}: category_description is longer than ${MAX_CATEGORY_DESCRIPTION} characters.`,
                );
              await remember(describe);
              await atomicWrite(describe, `---\ndescription: ${line}\n---\n`);
            }
          }
          // An empty folder left behind is used, and left as it was on a failed batch.
          if (listed)
            await remember(join(/*turbopackIgnore: true*/ dir, "SKILL.md"));
          else createdDirs.push(dir);
          await atomicWrite(
            join(/*turbopackIgnore: true*/ dir, "SKILL.md"),
            `${content}\n`,
          );
          this.viewed.add(name);
          usage[name] = emptyRecord(
            this.actor === "person" ? "person" : "minime",
          );
          changes.push({
            action: "create",
            name,
            description: skillFrontMatter(content).description,
          });
          warnings.push(...lint(content, 0));
          continue;
        }
        const found = await this.find(name);
        if (!found)
          throw new Error(`${at}: no skill named '${name}'. Use skills_list.`);
        const record = usage[found.name];
        // The review adapts what the clone made and the skills the app ships to how the person
        // works; their own skills, pinned ones, and setting a shipped one aside are theirs. One
        // their office shared is too: changed here, the office's later versions no longer come.
        const adaptable =
          record?.created_by === "minime" ||
          (record?.created_by === "bundled" && op.action !== "delete");
        if (this.actor === "review" && (!adaptable || record?.pinned))
          throw new Error(
            `${at}: '${found.name}' is ${record?.pinned ? "pinned" : record?.created_by === "bundled" ? "one the app ships; only your person sets it aside" : record?.created_by === "office" ? "one their office shares (once changed, the office's newer versions no longer replace it)" : "your person's own skill"}; it can be changed only in a session with them. Say what should change in your reply instead.`,
          );
        if (op.action === "delete") {
          if (record?.pinned)
            throw new Error(
              `${at}: '${found.name}' is pinned and cannot be set aside.`,
            );
          if (!this.viewed.has(found.name))
            throw new Error(
              `${at}: read before write — call skill_view('${found.name}') in this run first.`,
            );
          const archived = await this.archiveLocked(found);
          if (!archived.ok) throw new Error(`${at}: ${archived.message}`);
          this.changes.push({ action: "delete", name: found.name });
          return {
            success: true,
            message: `${archived.message} This update is complete — do not repeat it.`,
            skills: [`delete ${found.name}`],
          };
        }
        if (
          op.action === "write_file" ||
          op.action === "remove_file" ||
          (op.action === "patch" && op.file_path)
        ) {
          const filePath = (op.file_path ?? "").trim();
          const invalid = validateFilePath(filePath);
          if (invalid) throw new Error(`${at}: ${invalid}`);
          const path = join(/*turbopackIgnore: true*/ found.path, filePath);
          await remember(path);
          const current = originals.get(path);
          const key = `${found.name}/${normalize(filePath)}`;
          if (current !== undefined && !this.viewed.has(key))
            throw new Error(
              `${at}: read before write — call skill_view('${found.name}', '${filePath}') in this run first.`,
            );
          if (op.action === "remove_file") {
            if (current === undefined)
              throw new Error(
                `${at}: no file '${filePath}' in '${found.name}'.`,
              );
            await rm(path, { force: true });
          } else {
            const next =
              op.action === "write_file"
                ? (op.file_content ?? "")
                : patchText(at, current, filePath, op);
            if (Buffer.byteLength(next, "utf8") > MAX_FILE_BYTES)
              throw new Error(`${at}: file is larger than 1 MiB.`);
            const blocked = threatMessage(next);
            if (blocked) throw new Error(`${at}: ${blocked}`);
            await atomicWrite(path, next);
            this.viewed.add(key);
          }
          changes.push({
            action: op.action === "patch" ? "patch" : op.action,
            name: found.name,
            file: filePath,
          });
          continue;
        }
        if (op.action !== "patch")
          throw new Error(
            `${at}: unknown action. Use create, patch, write_file, remove_file or delete.`,
          );
        const path = join(/*turbopackIgnore: true*/ found.path, "SKILL.md");
        await remember(path);
        if (!this.viewed.has(found.name))
          throw new Error(
            `${at}: read before write — call skill_view('${found.name}') in this run, then base the change on what it returned.`,
          );
        const current = originals.get(path) ?? "";
        const next =
          op.old_string !== undefined
            ? patchText(at, current, "SKILL.md", op)
            : op.content
              ? op.content.trim()
              : (() => {
                  throw new Error(
                    `${at}: give old_string/new_string, or content to rewrite the whole file.`,
                  );
                })();
        const invalid = validateSkill(found.name, next, false);
        if (invalid) throw new Error(`${at}: ${invalid}`);
        await atomicWrite(path, next.endsWith("\n") ? next : `${next}\n`);
        changes.push({
          action: "patch",
          name: found.name,
          description: skillFrontMatter(next).description,
        });
        warnings.push(
          ...lint(
            next,
            (await this.linkedFiles(found.path)).references?.length ?? 0,
          ),
        );
      }
    } catch (error) {
      for (const [path, original] of originals) {
        if (original === undefined) await rm(path, { force: true });
        else await atomicWrite(path, original);
      }
      for (const dir of createdDirs) {
        await rm(dir, { recursive: true, force: true });
        const parent = join(/*turbopackIgnore: true*/ dir, "..");
        if (parent !== this.dir && !(await listFiles(parent)).length)
          await rm(parent, { recursive: true, force: true });
      }
      return {
        success: false,
        error: `${(error as Error).message} Nothing was changed (all-or-nothing).`,
      };
    }
    const stamp = now();
    for (const change of changes) {
      if (change.action === "create") continue;
      const record = usage[change.name] ?? emptyRecord(null);
      usage[change.name] = {
        ...record,
        patch_count: record.patch_count + 1,
        last_patched_at: stamp,
        state: "active",
      };
    }
    await atomicWrite(
      join(/*turbopackIgnore: true*/ this.dir, USAGE),
      JSON.stringify(usage, null, 2),
    );
    // A new skill by the name of one the office's copy once had is the person's (or the clone's).
    const created = changes
      .filter((change) => change.action === "create")
      .map((change) => change.name);
    if (created.length) await this.dropOrigins(created);
    for (const change of changes)
      if (
        change.action === "write_file" &&
        change.file?.startsWith("references/")
      ) {
        const found = await this.find(change.name);
        const count = found
          ? ((await this.linkedFiles(found.path)).references?.length ?? 0)
          : 0;
        if (count > MAX_REFERENCE_FILES) warnings.push(...lint("", count));
      }
    this.changes.push(...changes);
    return {
      success: true,
      message: `Applied ${operations.length} operation(s). This update is complete — do not repeat it.`,
      skills: changes.map(
        (change) =>
          `${change.action} ${change.name}${change.file ? `/${change.file}` : ""}`,
      ),
      ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}),
    };
  }

  private async archiveLocked(found: {
    name: string;
    path: string;
    category?: string;
  }): Promise<{ ok: boolean; message: string }> {
    const usage = await this.usage();
    if (usage[found.name]?.pinned)
      return { ok: false, message: `'${found.name}' is pinned.` };
    let dest = join(/*turbopackIgnore: true*/ this.dir, ARCHIVE, found.name);
    if ((await readText(join(dest, "SKILL.md"))).exists)
      dest = `${dest}-${now()
        .replace(/[-:.TZ]/g, "")
        .slice(0, 14)}`;
    await mkdir(join(/*turbopackIgnore: true*/ this.dir, ARCHIVE), {
      recursive: true,
    });
    await rename(found.path, dest);
    if (found.category) {
      const left = await this.entries(
        join(/*turbopackIgnore: true*/ this.dir, found.category),
      );
      if (!left.length)
        await rm(join(/*turbopackIgnore: true*/ this.dir, found.category), {
          recursive: true,
          force: true,
        });
    }
    usage[found.name] = {
      ...(usage[found.name] ?? emptyRecord(null)),
      state: "archived",
      archived_at: now(),
      archived_from: found.category
        ? `${found.category}/${found.name}`
        : found.name,
    };
    await atomicWrite(
      join(/*turbopackIgnore: true*/ this.dir, USAGE),
      JSON.stringify(usage, null, 2),
    );
    // Set aside, it no longer follows the office's versions; a skill by its name later is new.
    await this.dropOrigins([found.name]);
    return {
      ok: true,
      message: `Skill '${found.name}' set aside in .archive/ (it can be restored).`,
    };
  }

  private async updateUsage(
    change: (usage: Record<string, UsageRecord>) => void,
  ): Promise<void> {
    const usage = await this.usage();
    change(usage);
    await atomicWrite(
      join(/*turbopackIgnore: true*/ this.dir, USAGE),
      JSON.stringify(usage, null, 2),
    );
  }

  /** Count a view. Best effort: telemetry never blocks reading. */
  private async touch(name: string, kind: "view"): Promise<void> {
    if (kind !== "view") return;
    await withLock(this.dir, () =>
      this.updateUsage((usage) => {
        const record = usage[name] ?? emptyRecord(null);
        usage[name] = {
          ...record,
          view_count: record.view_count + 1,
          last_viewed_at: now(),
          state: record.state === "stale" ? "active" : record.state,
        };
      }),
    ).catch(() => {});
  }

  private async entries(dir: string): Promise<string[]> {
    try {
      return (await readdir(dir, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => entry.name)
        .sort();
    } catch {
      return [];
    }
  }

  /** Skills at <dir>/<name>/ and <dir>/<category>/<name>/, after tidying what was left aside. */
  private async scan(): Promise<FoundSkill[]> {
    await this.tidy();
    return this.scanTree();
  }

  /**
   * On a look over the store, what a process that died while putting an office skill in place left
   * aside is recovered first (`recoverLocked`), when there is any and the lock is free; a lock held
   * (by another writer, or by the caller of this very look) leaves it for the next look.
   */
  private async tidy(): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    let due = false;
    for (const name of names)
      if (
        name.startsWith(REPLACED) ||
        (name.startsWith(INCOMING) &&
          (await ageOf(join(/*turbopackIgnore: true*/ this.dir, name))) >
            LEFTOVER_MS)
      ) {
        due = true;
        break;
      }
    if (!due) return;
    const release = await tryLock(this.dir, LOCK_STALE_MS).catch(
      () => undefined,
    );
    if (!release) return;
    try {
      await this.recoverLocked();
    } catch {
      // Best effort: what is left aside stays as it is, and the next look tries again.
    } finally {
      await release();
    }
  }

  /**
   * Under the lock: puts back what a process that died while replacing an office skill with its newer
   * version (`addShared`) left aside, then clears what is left over. A version set aside goes back
   * where it was when no skill of its name is here; when one is, it goes once it is shown to be the
   * office's copy as it came (the hash it was checked to have, in its name, or the one its origin
   * records), after the origin follows the newer version put in its place, or else after UNPROVEN_MS.
   * A half-written incoming one goes after LEFTOVER_MS. Only an office copy unchanged here is ever
   * set aside, so nothing removed is the person's own work.
   */
  private async recoverLocked(): Promise<void> {
    const names = await readdir(this.dir).catch(() => [] as string[]);
    const aside = names.filter((name) => name.startsWith(REPLACED));
    const incoming = names.filter((name) => name.startsWith(INCOMING));
    if (!aside.length && !incoming.length) return;
    const [usage, origins] = await Promise.all([
      this.usage(),
      this.officeOrigins(),
    ]);
    let followed = false;
    for (const entry of aside) {
      const path = join(/*turbopackIgnore: true*/ this.dir, entry);
      const mark = setAsideMark(entry);
      // Set aside before its name said where (or a name that does not parse): its own SKILL.md
      // names it, and it goes back at the top.
      const name =
        mark.at?.at(-1) ??
        skillFrontMatter(
          (await readText(join(/*turbopackIgnore: true*/ path, "SKILL.md")))
            .raw,
        ).name;
      if (!name || !isSkillName(name)) continue;
      const place = join(
        /*turbopackIgnore: true*/ this.dir,
        ...(mark.at ?? [name]),
      );
      const here = (await this.scanTree()).find((skill) => skill.name === name);
      if (!here) {
        if (await emptyOrMissing(place)) {
          await mkdir(dirname(place), { recursive: true });
          await rm(place, { recursive: true, force: true });
          await rename(path, place);
        }
        continue;
      }
      const hash = await treeHash(path);
      const origin = Object.hasOwn(origins, name) ? origins[name] : undefined;
      if (hash === mark.hash || (origin && hash === origin.hash)) {
        // Its newer version was put in place but not recorded before the process died.
        if (
          origin?.hash === hash &&
          here.path === place &&
          usage[name]?.created_by === "office"
        ) {
          origins[name] = {
            ...origin,
            hash: await treeHash(here.path),
            added: now(),
          };
          followed = true;
        }
        await rm(path, { recursive: true, force: true });
      } else if ((await ageOf(path, true)) > UNPROVEN_MS)
        await rm(path, { recursive: true, force: true });
    }
    for (const entry of incoming) {
      const path = join(/*turbopackIgnore: true*/ this.dir, entry);
      if ((await ageOf(path)) > LEFTOVER_MS)
        await rm(path, { recursive: true, force: true });
    }
    if (followed) await this.writeOrigins(origins);
  }

  private async writeOrigins(
    origins: Record<string, OfficeOrigin>,
  ): Promise<void> {
    await atomicWrite(
      join(/*turbopackIgnore: true*/ this.dir, OFFICE),
      JSON.stringify(origins, null, 2),
    );
  }

  /** Forgets where these skills came from: set aside, or a skill of the person's took the name. */
  private async dropOrigins(names: string[]): Promise<void> {
    const origins = await this.officeOrigins();
    const gone = names.filter((name) => Object.hasOwn(origins, name));
    if (!gone.length) return;
    for (const name of gone) delete origins[name];
    await this.writeOrigins(origins);
  }

  /** Skills at <dir>/<name>/ and <dir>/<category>/<name>/, as they are. */
  private async scanTree(): Promise<FoundSkill[]> {
    const out: FoundSkill[] = [];
    for (const top of await this.entries(this.dir)) {
      const topPath = join(/*turbopackIgnore: true*/ this.dir, top);
      const own = await readText(join(topPath, "SKILL.md"));
      if (own.exists) {
        out.push({
          name: top,
          description: skillFrontMatter(own.raw).description ?? "",
          path: topPath,
        });
        continue;
      }
      for (const inner of await this.entries(topPath)) {
        const read = await readText(join(topPath, inner, "SKILL.md"));
        if (read.exists)
          out.push({
            name: inner,
            description: skillFrontMatter(read.raw).description ?? "",
            category: top,
            path: join(topPath, inner),
          });
      }
    }
    return out.sort(
      (a, b) =>
        (a.category ?? "").localeCompare(b.category ?? "") ||
        a.name.localeCompare(b.name),
    );
  }

  /** A skill by bare name or by "category/name". */
  private async find(name: string): Promise<FoundSkill | undefined> {
    const [category, bare] = name.includes("/")
      ? name.split("/", 2)
      : [undefined, name];
    return (await this.scan()).find(
      (skill) =>
        skill.name === bare && (!category || skill.category === category),
    );
  }

  private async linkedFiles(
    skillDir: string,
  ): Promise<Partial<Record<(typeof SUPPORT_DIRS)[number], string[]>>> {
    const out: Partial<Record<(typeof SUPPORT_DIRS)[number], string[]>> = {};
    for (const sub of SUPPORT_DIRS) {
      const files = await listFiles(
        join(/*turbopackIgnore: true*/ skillDir, sub),
      );
      if (files.length) out[sub] = files.map((file) => `${sub}/${file}`);
    }
    return out;
  }
}

/**
 * One hash over a skill's files (names and contents, hidden files left out), to tell if it changed:
 * the office's own (`skillHash`), so a skill added from it hashes here as it was shared.
 */
async function treeHash(dir: string): Promise<string> {
  const files: SkillFile[] = [];
  for (const path of await listFiles(dir))
    files.push({
      path,
      bytes: await readFile(join(/*turbopackIgnore: true*/ dir, path)),
    });
  return skillHash(files);
}

function refusal(code: string, message: string): SkillRefusal {
  return { ok: false, code, message };
}

/**
 * What one of the person's skills would take to their office (`SkillStore.pack`): SKILL.md and the
 * files under its four folders, read once, checked, and hashed as the office hashes them.
 */
async function packFolder(
  found: FoundSkill,
): Promise<PackedSkill | SkillRefusal> {
  const files: SkillFile[] = [];
  let size = 0;
  const take = async (path: string): Promise<SkillRefusal | undefined> => {
    const full = join(/*turbopackIgnore: true*/ found.path, path);
    const info = await lstat(full).catch(() => undefined);
    if (!info) return undefined;
    // A link could carry any file on this computer out with the skill.
    if (info.isSymbolicLink())
      return refusal(
        "skill-blocked",
        `${path} is a link to something elsewhere on this computer; a skill never takes one to the office.`,
      );
    if (info.isDirectory()) {
      const entries = await readdir(full).catch(() => [] as string[]);
      for (const entry of entries.sort()) {
        if (entry.startsWith(".")) continue;
        const stop = await take(`${path}/${entry}`);
        if (stop) return stop;
      }
      return undefined;
    }
    if (!info.isFile()) return undefined;
    size += info.size;
    if (size > SKILL_BYTES || files.length >= SKILL_FILES)
      return refusal(
        "skill-too-large",
        `'${found.name}' is larger than the office takes (${SKILL_BYTES / 1024} KB and ${SKILL_FILES} files at most).`,
      );
    files.push({ path, bytes: new Uint8Array(await readFile(full)) });
    return undefined;
  };
  for (const path of ["SKILL.md", ...SUPPORT_DIRS]) {
    const stop = await take(path);
    if (stop) return stop;
  }
  const checked = inspect(found.name, files);
  if (!checked.ok) return checked;
  return {
    ok: true,
    name: found.name,
    ...(found.category ? { category: found.category } : {}),
    description: checked.description,
    files,
    size: checked.size,
    hash: skillHash(files),
  };
}

/**
 * The origins that still count: each one's skill is here and is still a copy from the office
 * (`created_by` "office"); a skill of the person's by an old origin's name is theirs.
 */
function liveOrigins(
  origins: Record<string, OfficeOrigin>,
  skills: readonly FoundSkill[],
  usage: Record<string, UsageRecord>,
): Record<string, OfficeOrigin> {
  const live: Record<string, OfficeOrigin> = Object.create(null);
  for (const skill of skills)
    if (
      Object.hasOwn(origins, skill.name) &&
      usage[skill.name]?.created_by === "office"
    )
      live[skill.name] = origins[skill.name];
  return live;
}

/** The name a version replaced by the office's newer one has while it is set aside. */
function setAsideName(
  hash: string,
  skill: { name: string; category?: string },
): string {
  const at = [...(skill.category ? [skill.category] : []), skill.name];
  return `${REPLACED}${randomBytes(6).toString("hex")}-${hash}+${at.map(encodeURIComponent).join("+")}`;
}

/** Where a version set aside was, and the hash it was checked to have, from its name. */
function setAsideMark(entry: string): { hash?: string; at?: string[] } {
  const [head = "", ...parts] = entry.slice(REPLACED.length).split("+");
  const hash = /^[0-9a-f]{12}-([0-9a-f]{64})$/.exec(head)?.[1];
  let at: string[] | undefined;
  try {
    at = parts.map((part) => decodeURIComponent(part));
  } catch {
    at = undefined;
  }
  const fine =
    at !== undefined &&
    at.length >= 1 &&
    at.length <= 2 &&
    at.every(
      (part) => part && !part.startsWith(".") && !/[\\/\u0000]/.test(part),
    ) &&
    isSkillName(at[at.length - 1]);
  return { ...(hash ? { hash } : {}), ...(fine ? { at } : {}) };
}

/** How long ago a file or folder last changed (or was moved), in ms; 0 when it cannot be read. */
/**
 * How long ago a folder was last written, or, for one set aside (`moved`), moved there too: a rename
 * keeps its contents' times and changes only its own status time.
 */
async function ageOf(path: string, moved = false): Promise<number> {
  const info = await stat(path).catch(() => undefined);
  if (!info) return 0;
  return (
    Date.now() - (moved ? Math.max(info.mtimeMs, info.ctimeMs) : info.mtimeMs)
  );
}

/** Whether nothing is at a path but, at most, an empty folder. */
async function emptyOrMissing(path: string): Promise<boolean> {
  return readdir(path).then(
    (entries) => entries.length === 0,
    (error: NodeJS.ErrnoException) => error.code === "ENOENT",
  );
}

/** A file's bytes as text when they are UTF-8. */
function utf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** The threat scan over all of a text, in overlapping windows (one scan looks at 64K at most). */
function scanText(text: string): string | undefined {
  for (let at = 0; ; at += 60_000) {
    const blocked = threatMessage(text.slice(at, at + 64_000));
    if (blocked) return blocked;
    if (at + 64_000 >= text.length) return undefined;
  }
}

/**
 * Whether a skill may go to the office or come from it, file by file: every path one a skill holds,
 * no program, text where text is read (SKILL.md and scripts), nothing the memory threat scan stops
 * (it is read into a session as the clone's own procedure), and SKILL.md naming the skill.
 */
function inspect(
  name: string,
  files: readonly SkillFile[],
): { ok: true; description: string; size: number } | SkillRefusal {
  if (!isSkillName(name))
    return refusal("skill-invalid", `'${name}' is not a skill's name.`);
  if (files.length > SKILL_FILES)
    return refusal(
      "skill-too-large",
      `A shared skill holds at most ${SKILL_FILES} files.`,
    );
  const seen = new Set<string>();
  let size = 0;
  let description = "";
  for (const file of files) {
    const path = skillPath(file.path);
    if (!path || seen.has(path))
      return refusal(
        "skill-invalid",
        `'${file.path}' is not a file a skill holds (SKILL.md, or a file under ${SUPPORT_DIRS.join(", ")}).`,
      );
    seen.add(path);
    size += file.bytes.byteLength;
    if (size > SKILL_BYTES)
      return refusal(
        "skill-too-large",
        `A shared skill holds at most ${SKILL_BYTES / 1024} KB.`,
      );
    if (PROGRAM.test(path))
      return refusal(
        "skill-blocked",
        `${path} is a program; a skill never carries one to or from the office.`,
      );
    const text = utf8(file.bytes);
    if (text === undefined) {
      if (path === "SKILL.md" || path.startsWith("scripts/"))
        return refusal(
          "skill-blocked",
          `${path} is not text; SKILL.md and scripts are always text.`,
        );
      continue;
    }
    const blocked = scanText(text);
    if (blocked) return refusal("skill-blocked", `${path}: ${blocked}`);
    if (path === "SKILL.md") {
      const invalid = validateSkill(name, text.trim(), false);
      if (invalid) return refusal("skill-invalid", `SKILL.md: ${invalid}`);
      description = skillFrontMatter(text).description ?? "";
    }
  }
  if (!seen.has("SKILL.md"))
    return refusal("skill-invalid", "A skill has a SKILL.md.");
  return { ok: true, description, size };
}

/** Files under `dir`, relative to it, recursively. */
async function listFiles(dir: string, prefix = ""): Promise<string[]> {
  let entries: import("node:fs").Dirent[] = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith(".")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      out.push(
        ...(await listFiles(
          join(/*turbopackIgnore: true*/ dir, entry.name),
          rel,
        )),
      );
    else out.push(rel);
  }
  return out;
}

function patchText(
  at: string,
  current: string | undefined,
  label: string,
  op: SkillOp,
): string {
  if (current === undefined)
    throw new Error(`${at}: no file '${label}' to patch.`);
  const oldString = op.old_string ?? "";
  const count = oldString ? current.split(oldString).length - 1 : 0;
  if (count === 0)
    throw new Error(`${at}: old_string was not found in ${label}.`);
  if (count > 1 && !op.replace_all)
    throw new Error(
      `${at}: old_string matches ${count} places in ${label}; make it unique or set replace_all.`,
    );
  return op.replace_all
    ? current.split(oldString).join(op.new_string ?? "")
    : current.replace(oldString, () => op.new_string ?? "");
}

export const SKILL_TOOLS = {
  list: {
    name: "skills_list",
    description:
      "List your skills: name, one-line description and category. Use skill_view(name) to load one.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Optional category to narrow the list.",
        },
      },
    },
  },
  view: {
    name: "skill_view",
    description:
      "Load a skill's SKILL.md plus the list of its files (references/, templates/, scripts/, assets/); call again with file_path to read one of them. Required in this run before you change that skill or that file.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The skill's name (or category/name).",
        },
        file_path: {
          type: "string",
          description:
            "Optional: a file inside the skill, e.g. 'references/format.md'. Omit for SKILL.md.",
        },
      },
      required: ["name"],
    },
  },
  manage: {
    name: "skill_manage",
    description:
      "Create, update, or set aside skills — your procedural memory for recurring kinds of task, done the way your person wants. The call is an operations array (a single edit is a list of one); it applies atomically — any failure rolls every touched file back. Ops: create (full SKILL.md with front matter 'name' and 'description'; optional category, a folder like 'writing', plus category_description for a new category), patch (old_string/new_string — preferred; content alone REPLACES the whole SKILL.md; add file_path to patch a supporting file), write_file/remove_file (supporting files under references/, templates/, scripts/ or assets/), delete (sole op; sets the skill aside in the archive, restorable). Keep the description one sentence of at most 60 characters, trigger first ('Use when <trigger>. <behavior>.'), in your person's language. Write lessons, not logs: imperative rule + why, one rule per lesson, no dates or incident narration. references/ files are named by topic; extend one before adding another. Write in the language your person uses with you and keep their own words.",
    inputSchema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              action: {
                type: "string",
                enum: [
                  "create",
                  "patch",
                  "write_file",
                  "remove_file",
                  "delete",
                ],
              },
              name: {
                type: "string",
                description:
                  "The skill's name: lowercase, hyphens, at most 64 characters.",
              },
              category: {
                type: "string",
                description:
                  "create only: the category folder (lowercase, e.g. 'writing', 'meetings'). Reuse an existing one when it fits.",
              },
              category_description: {
                type: "string",
                description:
                  "create only, for a new category: one line on what it holds.",
              },
              content: {
                type: "string",
                description:
                  "create: the full SKILL.md (front matter + body). patch: a full rewrite of SKILL.md, a last resort.",
              },
              old_string: {
                type: "string",
                description:
                  "patch: text to find (in SKILL.md, or in file_path).",
              },
              new_string: {
                type: "string",
                description: "patch: the replacement; empty deletes the match.",
              },
              replace_all: { type: "boolean" },
              file_path: {
                type: "string",
                description:
                  "write_file/remove_file, or patch of a supporting file: a path inside the skill whose first folder is references/, templates/, scripts/ or assets/, e.g. 'references/format.md'.",
              },
              file_content: {
                type: "string",
                description:
                  "write_file: the whole text of the supporting file.",
              },
            },
            required: ["action", "name"],
          },
        },
      },
      required: ["operations"],
    },
  },
} as const;
