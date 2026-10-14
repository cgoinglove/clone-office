// Taking back one thing the first reading kept, from the screen that shows what it understood, as
// the person sees fit: a line of memory is removed as it is (as the clone's page removes one), a
// page goes to the notes' archive (never deleted), a place comes off the map. The reading's own
// record forgets it too, so the screen does not show it again.

import { memoryDir, notesDir } from "../brain/session.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { NoteStore, WORK_MAP } from "../memory/notes.ts";
import { MemoryStore } from "../memory/store.ts";
import { keepWorkFolders } from "../office/work-folders.ts";
import { type Known, withoutKnown } from "./known.ts";
import { learnPath, MAP_LINE } from "./learn.ts";

/** Whether it was taken back (or was already gone). */
export async function forgetKnown(item: Known): Promise<boolean> {
  if ("text" in item) {
    const store = new MemoryStore(memoryDir());
    const target = item.kind === "user" ? "user" : "memory";
    const entries = await store.entries(target);
    if (entries.includes(item.text.trim())) {
      const removed = await store.remove(target, item.text);
      if (!removed.success) return false;
    }
  } else if (item.kind === "places") {
    const notes = new NoteStore(notesDir(), "person");
    const seen = await notes.view(WORK_MAP);
    if (!("error" in seen)) {
      const lines = seen.content
        .replace(/^---[\s\S]*?---\s*/, "")
        .split("\n")
        .filter((line) => MAP_LINE.exec(line.trim())?.[1] !== item.path);
      // The page's line in the notes' index names its first places, as keepMap writes it.
      const summary = lines
        .flatMap((line) => MAP_LINE.exec(line.trim())?.[1] ?? [])
        .slice(0, 4)
        .join(", ")
        .slice(0, 150);
      const done = await notes.apply([
        {
          action: "rewrite",
          path: WORK_MAP,
          body: lines.join("\n").trim(),
          ...(summary ? { summary } : {}),
        },
      ]);
      if (!done.success) return false;
    }
    // and what a colleague's request may read with it (office/work-folders.ts)
    await keepWorkFolders([], [item.path]).catch(() => {});
  } else {
    // Only a page the reading writes, by its own path: nothing else in the notes is reached here.
    const { path } = item;
    if (!path.startsWith(`${item.kind}/`) || /(^|\/)\.\.(\/|$)/.test(path))
      return false;
    const notes = new NoteStore(notesDir(), "person");
    const seen = await notes.view(path);
    if (!("error" in seen)) {
      const done = await notes.apply([{ action: "archive", path }]);
      if (!done.success) return false;
    }
  }
  await forgetInRecord(item);
  return true;
}

async function forgetInRecord(item: Known): Promise<void> {
  const read = await readText(learnPath());
  if (!read.ok || !read.raw) return;
  try {
    const record = JSON.parse(read.raw) as {
      last?: { kept?: string[]; knows?: Parameters<typeof withoutKnown>[0] };
    };
    const last = record.last;
    if (!last) return;
    if (last.knows) last.knows = withoutKnown(last.knows, item);
    if ("text" in item && last.kept)
      last.kept = last.kept.filter((line) => line !== item.text);
    await atomicWrite(learnPath(), JSON.stringify(record, null, 2));
  } catch {
    // A record that cannot be read is left as it is; what was taken back stays taken back.
  }
}
