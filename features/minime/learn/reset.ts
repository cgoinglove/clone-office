// Starting over with a mini-me: what it keeps (memory, skills, notes) and the record of its last
// learning are moved into backup/<time>/ under its folder, never deleted, so the first screen
// starts from the beginning and everything can be put back by moving it back. The person's
// settings (folders left out) and the conversation index (rebuilt from the records anyway) stay.
//
// When what it keeps is only what a reading of their records gave (they have not talked with it,
// it made no skill or note, and its memory has not changed since that reading), there is nothing
// of theirs to keep: it is cleared instead, as a new reading brings it back.

import { mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimeHome } from "../server/paths.ts";

const KEPT = ["memories", "skills", "notes", "learn.json"];

/** Whether a file whose name matches is anywhere under `dir`. */
async function holds(
  dir: string,
  name: (file: string) => boolean,
): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = join(/*turbopackIgnore: true*/ dir, entry.name);
    if (entry.isDirectory() ? await holds(full, name) : name(entry.name))
      return true;
  }
  return false;
}

/**
 * Whether everything the mini-me keeps came from reading the person's records: no conversation
 * with it, no skill or note, and no memory written after the last reading (brought from another
 * AI, corrected by them, or learned in a conversation).
 */
export async function onlyRead(home = minimeHome()): Promise<boolean> {
  const at = (name: string) => join(/*turbopackIgnore: true*/ home, name);
  if (await holds(at("chats"), (file) => file.endsWith(".jsonl"))) return false;
  if (await holds(at("skills"), (file) => file === "SKILL.md")) return false;
  if (
    await holds(
      at("notes"),
      (file) =>
        file.endsWith(".md") &&
        file !== "index.md" &&
        !/^log(-\d{4})?\.md$/.test(file),
    )
  )
    return false;
  const read = await stat(at("learn.json")).catch(() => undefined);
  for (const name of ["USER.md", "MEMORY.md"]) {
    const memory = await stat(
      join(/*turbopackIgnore: true*/ home, "memories", name),
    ).catch(() => undefined);
    // The reading writes its record after the lines it keeps.
    if (memory && (!read || memory.mtimeMs > read.mtimeMs)) return false;
  }
  return true;
}

export async function startOver(now = new Date()): Promise<{
  /** Where it was moved; none when there was nothing of theirs and it was cleared. */
  backup?: string;
  moved: string[];
  cleared: string[];
}> {
  const home = minimeHome();
  const present: string[] = [];
  for (const name of KEPT)
    if (
      await stat(join(/*turbopackIgnore: true*/ home, name)).then(
        () => true,
        () => false,
      )
    )
      present.push(name);
  if (await onlyRead(home)) {
    for (const name of present)
      await rm(join(/*turbopackIgnore: true*/ home, name), {
        recursive: true,
        force: true,
      });
    return { moved: [], cleared: present };
  }
  const backup = join(
    /*turbopackIgnore: true*/ home,
    "backup",
    now.toISOString().replace(/[:.]/g, "-"),
  );
  for (const name of present) {
    await mkdir(backup, { recursive: true });
    await rename(
      join(/*turbopackIgnore: true*/ home, name),
      join(/*turbopackIgnore: true*/ backup, name),
    );
  }
  return {
    backup: present.length ? backup : undefined,
    moved: present,
    cleared: [],
  };
}
