// Notes about how the person works: the personal instructions they wrote for their AI tools and
// what Claude Code's own memory wrote down about them. What they bring from another AI's memory is
// not read here: it is kept as it comes in (learn/import.ts), and the pasted text is not stored.
// Shared project files such as CLAUDE.md or AGENTS.md are left out: a team or an AI often wrote
// those. Only notes about the person count from Claude Code's memory; notes about a project do not.

import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { claudeHome, codexHome, hermesHome, openclawWorkspace } from "../paths";
import { projectDirs } from "./claude-code";
import { clip, folderName, projectRoot } from "./common";
import { readHead } from "./lines";

/** The scan group for notes that are about every project. */
export const NOTES_GROUP = "notes";

export interface NoteFile {
  path: string;
  /** Where it came from, as the person would find it. */
  source: string;
  /** A folder, or NOTES_GROUP for notes about every project. */
  group: string;
  project: string;
  mtimeMs: number;
  /** Claude Code memory files hold notes about projects too; only some kinds are kept. */
  memory: boolean;
}

export interface Note {
  source: string;
  group: string;
  project: string;
  at: string;
  text: string;
}

const NOTE_MAX = 500;
const FILE_MAX = 8000;
const KEPT_MEMORY = new Set(["user", "feedback"]);

function tilde(path: string): string {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
}

/** A Claude Code memory note's kind, from its front matter, at the top or under `metadata`. */
export function memoryKind(text: string): string | undefined {
  const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1];
  return front ? /^\s*type:\s*(\w+)/m.exec(front)?.[1] : undefined;
}

/** A note file cut into pieces small enough to cite one at a time, without its front matter. */
export function splitNote(text: string, max = NOTE_MAX): string[] {
  const body = text.replace(/^---\n[\s\S]*?\n---\n?/, "");
  const pieces: string[] = [];
  let current: string[] = [];
  const flush = () => {
    const piece = current.join("\n").trim();
    // Headings and dividers on their own say nothing.
    const says = current.some(
      (line) => line.trim() && !/^\s*(#{1,6}\s|[-*_]{3,}\s*$)/.test(line),
    );
    if (says && piece.replace(/\s/g, "").length >= 8)
      pieces.push(clip(piece, max));
    current = [];
  };
  for (const line of body.split("\n")) {
    const size = current.join("\n").length;
    if (size + line.length + 1 > max || (!line.trim() && size >= max / 2))
      flush();
    current.push(line);
  }
  flush();
  return pieces;
}

async function fileAt(
  path: string,
  fields: Omit<NoteFile, "path" | "mtimeMs">,
): Promise<NoteFile | undefined> {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0
      ? { path, mtimeMs: info.mtimeMs, ...fields }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Every note file found, for the scan to count and for the draft to read. */
export async function findNoteFiles(): Promise<NoteFile[]> {
  const everywhere = { group: NOTES_GROUP, project: "", memory: false };
  const candidates: Promise<NoteFile | undefined>[] = [
    join(claudeHome(), "CLAUDE.md"),
    join(codexHome(), "AGENTS.md"),
    join(homedir(), ".gemini", "GEMINI.md"),
    join(hermesHome(), "memories", "USER.md"),
    join(hermesHome(), "memories", "MEMORY.md"),
    join(openclawWorkspace(), "USER.md"),
    join(openclawWorkspace(), "MEMORY.md"),
  ].map((path) => fileAt(path, { ...everywhere, source: tilde(path) }));
  for (const { dir, cwd } of await projectDirs()) {
    const root = projectRoot(cwd);
    const inFolder = { group: root, project: folderName(root) };
    candidates.push(
      fileAt(join(root, "CLAUDE.local.md"), {
        ...inFolder,
        source: tilde(join(root, "CLAUDE.local.md")),
        memory: false,
      }),
    );
    let names: string[] = [];
    try {
      names = await readdir(join(dir, "memory"));
    } catch {
      continue;
    }
    for (const name of names)
      if (name.endsWith(".md") && name !== "MEMORY.md")
        candidates.push(
          fileAt(join(dir, "memory", name), {
            ...inFolder,
            source: `Claude Code memory: ${name}`,
            memory: true,
          }),
        );
  }
  const found = (await Promise.all(candidates)).filter(
    (file): file is NoteFile => Boolean(file),
  );
  const kept: NoteFile[] = [];
  for (const file of found) {
    if (file.memory) {
      const head = await readHead(file.path, 4096).catch(() => "");
      if (!KEPT_MEMORY.has(memoryKind(head) ?? "")) continue;
    }
    kept.push(file);
  }
  // Worktrees share their repository's CLAUDE.local.md; read each file once.
  return [...new Map(kept.map((file) => [file.path, file])).values()];
}

export async function readNotes(files: NoteFile[]): Promise<Note[]> {
  const notes: Note[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = (await readHead(file.path, FILE_MAX * 4)).slice(0, FILE_MAX);
    } catch {
      continue;
    }
    const at = new Date(file.mtimeMs).toISOString();
    for (const piece of splitNote(text))
      notes.push({
        source: file.source,
        group: file.group,
        project: file.project,
        at,
        text: piece,
      });
  }
  return notes;
}
