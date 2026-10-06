// The folders the person worked in lately, from every AI tool's records (Claude Code, Codex,
// Cursor, Hermes Agent), by how many conversations ran there: what the screen offers to leave out,
// before anything is read and at any time after. Only the tools' lists are read, never what was
// said in them.

import { projectDirs } from "./sources/claude-code.ts";
import { codexRolloutFiles } from "./sources/codex.ts";
import { folderName, isNoise, projectRoot } from "./sources/common.ts";
import { cursorChats } from "./sources/cursor.ts";
import { hermesSessions } from "./sources/hermes.ts";

export interface RecentFolder {
  path: string;
  name: string;
  /** Conversations that ran there since the time asked about. */
  sessions: number;
}

export async function recentFolders(
  since: number,
  limit = 10,
): Promise<RecentFolder[]> {
  const counts = new Map<string, number>();
  const add = (cwd: string | undefined, at: number) => {
    if (!cwd || at < since) return;
    const root = projectRoot(cwd);
    if (isNoise(root)) return;
    counts.set(root, (counts.get(root) ?? 0) + 1);
  };
  const [claude, codex, cursor] = await Promise.all([
    projectDirs().catch(() => []),
    codexRolloutFiles().catch(() => []),
    cursorChats().catch(() => []),
  ]);
  for (const dir of claude)
    for (const file of dir.files) add(dir.cwd, file.mtimeMs);
  for (const file of codex) add(file.cwd, file.mtimeMs);
  for (const chat of cursor) add(chat.folder, chat.updatedMs);
  try {
    for (const session of hermesSessions())
      add(session.folder, session.updatedMs);
  } catch {
    // Hermes Agent's file is busy or unreadable now.
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([path, sessions]) => ({ path, name: folderName(path), sessions }));
}
