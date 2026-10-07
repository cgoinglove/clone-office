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

import { mkdir, readdir, rename, rm } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { atomicWrite, readText, withLock } from "./files.ts";
import { threatMessage } from "./threats.ts";

const NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
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
const USAGE = ".usage.json";

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
  created_by: "minime" | "person" | null;
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

export type SkillView =
  | {
      name: string;
      category?: string;
      description: string;
      content: string;
      linked_files?: Partial<Record<(typeof SUPPORT_DIRS)[number], string[]>>;
    }
  | { name: string; file_path: string; content: string };

export function frontMatter(content: string): {
  name?: string;
  description?: string;
} {
  const block = /^---\n([\s\S]*?)\n---/.exec(content.replace(/^﻿/, ""))?.[1];
  if (!block) return {};
  const field = (key: string) => {
    const match = new RegExp(`^${key}:\\s*(.*)$`, "m").exec(block)?.[1]?.trim();
    return match?.replace(/^["']|["']$/g, "");
  };
  return { name: field("name"), description: field("description") };
}

function body(content: string): string {
  return content.replace(/^﻿?---\n[\s\S]*?\n---\n?/, "");
}

function validateSkill(
  name: string,
  content: string,
  isNew: boolean,
): string | undefined {
  if (!NAME.test(name))
    return `Invalid skill name '${name}': lowercase letters, digits, '.', '_' or '-', at most 64 characters, starting with a letter or digit.`;
  if (content.length > MAX_CONTENT)
    return `SKILL.md content is ${content.length.toLocaleString("en-US")} characters (limit: ${MAX_CONTENT.toLocaleString("en-US")}). Keep the always-on rules in SKILL.md and move depth into references/<topic>.md.`;
  const meta = frontMatter(content);
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
  return NAME.test(category)
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
      const description = read.raw && frontMatter(read.raw).description;
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
      description: frontMatter(read.raw).description ?? "",
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
            description: frontMatter(content).description,
          });
          warnings.push(...lint(content, 0));
          continue;
        }
        const found = await this.find(name);
        if (!found)
          throw new Error(`${at}: no skill named '${name}'. Use skills_list.`);
        const record = usage[found.name];
        if (
          this.actor === "review" &&
          (record?.created_by !== "minime" || record.pinned)
        )
          throw new Error(
            `${at}: '${found.name}' is ${record?.pinned ? "pinned" : "your person's own skill"}; it can be changed only in a session with them. Say what should change in your reply instead.`,
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
          description: frontMatter(next).description,
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

  /** Skills at <dir>/<name>/ and <dir>/<category>/<name>/. */
  private async scan(): Promise<
    { name: string; description: string; category?: string; path: string }[]
  > {
    const out: {
      name: string;
      description: string;
      category?: string;
      path: string;
    }[] = [];
    for (const top of await this.entries(this.dir)) {
      const topPath = join(/*turbopackIgnore: true*/ this.dir, top);
      const own = await readText(join(topPath, "SKILL.md"));
      if (own.exists) {
        out.push({
          name: top,
          description: frontMatter(own.raw).description ?? "",
          path: topPath,
        });
        continue;
      }
      for (const inner of await this.entries(topPath)) {
        const read = await readText(join(topPath, inner, "SKILL.md"));
        if (read.exists)
          out.push({
            name: inner,
            description: frontMatter(read.raw).description ?? "",
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
  private async find(
    name: string,
  ): Promise<{ name: string; path: string; category?: string } | undefined> {
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
