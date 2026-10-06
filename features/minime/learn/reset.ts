// Starting over with a mini-me: what it keeps (memory, skills, notes) and the record of its last
// learning are moved into backup/<time>/ under its folder, never deleted, so the first screen
// starts from the beginning and everything can be put back by moving it back. The person's
// settings (folders left out) and the conversation index (rebuilt from the records anyway) stay.

import { mkdir, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimeHome } from "../server/paths.ts";

const KEPT = ["memories", "skills", "notes", "learn.json"];

export async function startOver(
  now = new Date(),
): Promise<{ backup: string; moved: string[] }> {
  const home = minimeHome();
  const backup = join(
    /*turbopackIgnore: true*/ home,
    "backup",
    now.toISOString().replace(/[:.]/g, "-"),
  );
  const moved: string[] = [];
  for (const name of KEPT) {
    const from = join(/*turbopackIgnore: true*/ home, name);
    const exists = await stat(from).then(
      () => true,
      () => false,
    );
    if (!exists) continue;
    await mkdir(backup, { recursive: true });
    await rename(from, join(/*turbopackIgnore: true*/ backup, name));
    moved.push(name);
  }
  return { backup, moved };
}
