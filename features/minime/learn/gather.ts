// What the first transplant reads: the material that says the most about how a person works, in
// the order of how condensed it already is (docs/transplant.local.md, f1–f6):
//   1. what they wrote for their AI tools and what other AIs already noted about them;
//   2. what they typed recently, by the folders they worked in most (from the conversation index);
//   3. their own recent commits in those folders;
//   4. which kinds of documents they opened lately, and the apps they use most.
// Every source has a share of one character budget; a share left unused goes to the next source.
// Every source has a time limit and fails on its own: what could not be read is reported, never
// guessed. Nothing is read from folders the person excluded, and no file's content is read
// beyond notes they wrote for AI tools: documents are counted by kind, never opened.

import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { extname, join, relative, sep } from "node:path";
import { openHistoryForRead } from "../history/db.ts";
import { indexHistory } from "../history/indexer.ts";
import { scanApps } from "../server/apps";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import { folderName } from "../server/sources/common.ts";
import { mapLimit } from "../server/sources/lines.ts";
import { findNoteFiles, readNotes } from "../server/sources/notes";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export interface GatherOptions {
  /**
   * Read what changed after this time; 14 days back by default (f2). Instruction and memory files
   * are all read when it is not given (the first learning), and only those changed after it otherwise.
   */
  since?: number;
  /** All material together, in characters (f4). */
  budget?: number;
  /** How long indexing may run first to catch up on recent conversations. */
  indexBudgetMs?: number;
  now?: number;
  /** Indexing progress: bytes read so far and the bytes that were waiting. */
  onIndexProgress?: (done: number, total: number) => void;
  /** Which source is being read now. */
  onSource?: (id: string) => void;
}

export interface SourceReport {
  id: string;
  label: string;
  items: number;
  chars: number;
  /** Why the source added nothing or stopped early. */
  note?: string;
}

export interface Material {
  text: string;
  sources: SourceReport[];
  since: string;
  ms: number;
}

/** Shares of the budget, in the order sources are read; an unused share flows to the next. */
const SHARES: [string, number][] = [
  ["notes", 0.4],
  ["inputs", 0.4],
  ["commits", 0.1],
  ["work", 0.1],
];

const CODE_EXTENSIONS = new Set(
  "ts tsx js jsx mjs cjs py rb go rs java kt kts swift c h cc cpp hpp cs php sh bash zsh json jsonc yaml yml toml lock map log css scss less sass html htm xml svg vue svelte sql gradle plist ini cfg conf env pyc o a so dylib dll class jar".split(
    " ",
  ),
);

function run(command: string, args: string[], timeout = 5000): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout },
      (error, stdout) => resolve(error ? "" : stdout),
    );
  });
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class Budget {
  private left = 0;
  constructor(
    private readonly total: number,
    private readonly shares: Map<string, number>,
  ) {}
  /** The characters a source may use: its share plus whatever earlier sources left. */
  open(id: string): number {
    this.left += Math.floor(this.total * (this.shares.get(id) ?? 0));
    return this.left;
  }
  spend(chars: number): void {
    this.left = Math.max(0, this.left - chars);
  }
}

/** Notes they wrote for their AI tools and what other AI tools remember about them. */
async function notesSection(
  limit: number,
  excludes: string[],
  changedAfter?: number,
): Promise<{ text: string; report: SourceReport }> {
  // A later learning reads only the files changed since the last one: the rest was read then, and
  // reading it again would only add more copies of the same rules to memory.
  const files = (await findNoteFiles()).filter(
    (file) =>
      (file.group === "notes" || !isExcluded(file.group, excludes)) &&
      (changedAfter === undefined || file.mtimeMs > changedAfter),
  );
  // The person's own words first: instruction files, then AI-written memory.
  files.sort(
    (a, b) => Number(a.memory) - Number(b.memory) || b.mtimeMs - a.mtimeMs,
  );
  const notes = await readNotes(files);
  const lines: string[] = [];
  let used = 0;
  let items = 0;
  for (const note of notes) {
    const where = note.project
      ? `${note.source} (${note.project})`
      : note.source;
    const block = `[${where}, ${note.at.slice(0, 10)}]\n${note.text}\n`;
    if (used + block.length > limit) continue;
    lines.push(block);
    used += block.length;
    items += 1;
  }
  return {
    text: lines.length
      ? `## What they wrote for their AI tools, and what other AIs noted about them\n${lines.join("\n")}`
      : "",
    report: {
      id: "notes",
      label: "Instruction and memory files",
      items,
      chars: used,
      ...(notes.length > items
        ? { note: `${notes.length - items} left out for length` }
        : {}),
      ...(notes.length === 0
        ? {
            note:
              changedAfter === undefined
                ? "none found"
                : "none changed since the last reading",
          }
        : {}),
    },
  };
}

interface PromptRow {
  project: string | null;
  at: number;
  text: string;
}

/** What they typed lately, by the folders they worked in most (f5), newest first in each. */
// What the person said to their mini-me is not material here: each of those conversations is looked
// back on when it ends (the review).
export function inputsSection(
  since: number,
  limit: number,
): { text: string; report: SourceReport; projects: string[] } {
  const db = openHistoryForRead();
  if (!db)
    return {
      text: "",
      projects: [],
      report: {
        id: "inputs",
        label: "What they typed to AI tools",
        items: 0,
        chars: 0,
        note: "no conversation index yet",
      },
    };
  try {
    const counts = db
      .prepare(
        `SELECT f.project AS project, COUNT(*) AS n FROM messages m JOIN files f ON f.id = m.file_id
         WHERE m.role = 'user' AND m.at >= ? AND f.tool != 'mini-me' GROUP BY f.project ORDER BY n DESC LIMIT 8`,
      )
      .all(since) as { project: string | null; n: number }[];
    const prompts = db.prepare(
      `SELECT f.project AS project, m.at AS at, m.text AS text FROM messages m JOIN files f ON f.id = m.file_id
       WHERE m.role = 'user' AND m.at >= ? AND f.project IS ? AND f.tool != 'mini-me' ORDER BY m.at DESC LIMIT 80`,
    );
    const total = counts.reduce((sum, row) => sum + row.n, 0);
    const blocks: string[] = [];
    let used = 0;
    let items = 0;
    for (const { project, n } of counts) {
      // Each folder gets room in proportion to how much they worked there.
      const room = Math.max(600, Math.floor((limit * n) / Math.max(total, 1)));
      const rows = prompts.all(since, project) as unknown as PromptRow[];
      const name = project ? folderName(project) : "folderless chats";
      const lines: string[] = [];
      let size = 0;
      for (const row of rows) {
        const said = row.text.replace(/\s+/g, " ").trim();
        const line = `- ${new Date(row.at).toISOString().slice(0, 16).replace("T", " ")} · ${said.length > 280 ? `${said.slice(0, 280)}…` : said}`;
        if (size + line.length > room || used + size + line.length > limit)
          break;
        lines.push(line);
        size += line.length + 1;
      }
      if (!lines.length) continue;
      blocks.push(
        `### ${name} (${n} prompts; ${lines.length} newest shown)\n${lines.join("\n")}`,
      );
      used += size;
      items += lines.length;
    }
    return {
      text: blocks.length
        ? `## What they typed to their AI tools recently, by folder\n${blocks.join("\n\n")}`
        : "",
      projects: counts
        .map((row) => row.project)
        .filter((p): p is string => Boolean(p)),
      report: {
        id: "inputs",
        label: "What they typed to AI tools",
        items,
        chars: used,
        ...(items === 0 ? { note: "nothing typed in this period" } : {}),
      },
    };
  } finally {
    db.close();
  }
}

/** Their own commits in the folders they worked in most, when those are git repositories. */
async function commitsSection(
  projects: string[],
  since: number,
  limit: number,
): Promise<{ text: string; report: SourceReport }> {
  const globalEmail = (
    await run("git", ["config", "--global", "user.email"])
  ).trim();
  const results = await mapLimit(projects.slice(0, 6), 3, async (project) => {
    const isRepo = await stat(join(project, ".git")).then(
      () => true,
      () => false,
    );
    if (!isRepo) return undefined;
    const email =
      (await run("git", ["-C", project, "config", "user.email"])).trim() ||
      globalEmail;
    if (!email) return undefined;
    const log = await run("git", [
      "-C",
      project,
      "log",
      `--since=${new Date(since).toISOString()}`,
      "--no-merges",
      `--author=${email}`,
      "--date=short",
      "--format=%ad%x09%s",
      "-n",
      "25",
    ]);
    const lines = log.split("\n").filter(Boolean);
    return lines.length ? { project, lines } : undefined;
  });
  const blocks: string[] = [];
  let used = 0;
  let items = 0;
  for (const result of results) {
    if (!result) continue;
    const kept: string[] = [];
    for (const line of result.lines) {
      const entry = `- ${line.replace("\t", " · ")}`;
      if (used + entry.length > limit) break;
      kept.push(entry);
      used += entry.length + 1;
    }
    if (!kept.length) continue;
    items += kept.length;
    blocks.push(`### ${folderName(result.project)}\n${kept.join("\n")}`);
  }
  return {
    text: blocks.length
      ? `## Their own recent commits\n${blocks.join("\n\n")}`
      : "",
    report: {
      id: "commits",
      label: "Their git commits",
      items,
      chars: used,
      ...(items === 0 ? { note: "no recent commits, or no git" } : {}),
    },
  };
}

/** Documents opened lately, by kind and folder only: names and contents are never read. */
async function recentDocuments(
  since: number,
  excludes: string[],
): Promise<string[]> {
  const home = homedir();
  if (process.platform === "darwin") {
    const days = Math.max(1, Math.ceil((Date.now() - since) / DAY));
    const out = await run(
      "mdfind",
      ["-onlyin", home, `kMDItemLastUsedDate >= $time.today(-${days})`],
      10_000,
    );
    return out.split("\n").filter(Boolean).slice(0, 20_000);
  }
  if (process.platform === "win32") {
    const recent = join(
      process.env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Recent",
    );
    const names = await readdir(recent).catch(() => [] as string[]);
    const out: string[] = [];
    for (const name of names.slice(0, 5000)) {
      if (!name.toLowerCase().endsWith(".lnk")) continue;
      const info = await stat(join(recent, name)).catch(() => undefined);
      if (info && info.mtimeMs >= since)
        out.push(join(recent, name.slice(0, -4)));
    }
    return out.filter((path) => !isExcluded(path, excludes));
  }
  const xbel = await readFile(
    join(home, ".local", "share", "recently-used.xbel"),
    "utf8",
  ).catch(() => "");
  const out: string[] = [];
  for (const match of xbel.matchAll(
    /<bookmark[^>]*href="file:\/\/([^"]+)"[^>]*modified="([^"]+)"/g,
  )) {
    if (Date.parse(match[2]) >= since) out.push(decodeURIComponent(match[1]));
  }
  return out;
}

async function workSection(
  since: number,
  limit: number,
  excludes: string[],
): Promise<{ text: string; report: SourceReport }> {
  const lines: string[] = [];
  let items = 0;
  try {
    const paths = (await recentDocuments(since, excludes)).filter((path) => {
      if (isExcluded(path, excludes)) return false;
      const parts = path.split(sep);
      if (
        parts.some(
          (part) =>
            part.startsWith(".") ||
            part === "node_modules" ||
            part === "Library" ||
            part.endsWith(".app"),
        )
      )
        return false;
      const ext = extname(path).slice(1).toLowerCase();
      return ext !== "" && !CODE_EXTENSIONS.has(ext);
    });
    const kinds = new Map<string, number>();
    const folders = new Map<string, number>();
    for (const path of paths) {
      const ext = extname(path).toLowerCase();
      kinds.set(ext, (kinds.get(ext) ?? 0) + 1);
      const rel = relative(homedir(), path).split(sep).slice(0, 2).join(sep);
      if (rel && !rel.startsWith(".."))
        folders.set(rel, (folders.get(rel) ?? 0) + 1);
    }
    const top = (map: Map<string, number>, n: number) =>
      [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    if (kinds.size) {
      lines.push(
        `- Documents opened lately, by kind: ${top(kinds, 12)
          .map(([k, n]) => `${k} ${n}`)
          .join(", ")}`,
      );
      lines.push(
        `- In folders: ${top(folders, 6)
          .map(([f, n]) => `~/${f} (${n})`)
          .join(", ")}`,
      );
      items += paths.length;
    }
  } catch {
    // Reported below as nothing found.
  }
  try {
    const apps = (await scanApps()).slice(0, 15);
    if (apps.length) {
      lines.push(
        `- Apps used most: ${apps
          .map((app) =>
            app.days ? `${app.name} (${app.days} of 30 days)` : app.name,
          )
          .join(", ")}`,
      );
      items += apps.length;
    }
  } catch {
    // Same.
  }
  let text = lines.length ? `## What they work in\n${lines.join("\n")}` : "";
  if (text.length > limit) text = text.slice(0, limit);
  return {
    text,
    report: {
      id: "work",
      label: "Kinds of documents and apps",
      items,
      chars: text.length,
      ...(items === 0 ? { note: "nothing readable" } : {}),
    },
  };
}

/** Everything the first transplant reads, within its budgets. */
export async function gather(options: GatherOptions = {}): Promise<Material> {
  const started = Date.now();
  const now = options.now ?? started;
  const since = options.since ?? now - 14 * DAY;
  const budget = new Budget(options.budget ?? 60_000, new Map(SHARES));
  const excludes = loadExcludes();

  // Index only the conversations this reading needs (those touched since \`since\`), in bounded
  // passes, so learning starts within seconds; the rest of the search window is read afterwards in
  // the background (catchUpIndex). Progress is counted against what was waiting at the first pass.
  const recentHours = Math.max(1, Math.ceil((now - since) / HOUR));
  const indexDeadline = Date.now() + (options.indexBudgetMs ?? 20_000);
  let readBefore = 0;
  let waiting = 0;
  const onProgress = (done: number, total: number) => {
    if (!waiting) waiting = total;
    options.onIndexProgress?.(
      readBefore + done,
      Math.max(waiting, readBefore + total),
    );
  };
  let index = await indexHistory({
    budgetMs: 8000,
    recentHours,
    now,
    onProgress,
  });
  while (!index.complete && !index.busy && Date.now() < indexDeadline) {
    readBefore += index.bytes;
    index = await indexHistory({
      budgetMs: Math.min(8000, indexDeadline - Date.now()),
      recentHours,
      now,
      onProgress,
    });
  }

  const sections: string[] = [];
  const sources: SourceReport[] = [];

  options.onSource?.("notes");
  const notes = await notesSection(
    budget.open("notes"),
    excludes,
    options.since,
  ).catch(() => undefined);
  if (notes) {
    sections.push(notes.text);
    sources.push(notes.report);
    budget.spend(notes.report.chars);
  }

  options.onSource?.("inputs");
  const inputs = inputsSection(since, budget.open("inputs"));
  sections.push(inputs.text);
  sources.push(
    index.complete
      ? inputs.report
      : {
          ...inputs.report,
          note: [
            inputs.report.note,
            "the index was not complete; the newest were read first",
          ]
            .filter(Boolean)
            .join(" · "),
        },
  );
  budget.spend(inputs.report.chars);

  options.onSource?.("commits");
  const commits = await commitsSection(
    inputs.projects,
    since,
    budget.open("commits"),
  ).catch(() => undefined);
  if (commits) {
    sections.push(commits.text);
    sources.push(commits.report);
    budget.spend(commits.report.chars);
  }

  options.onSource?.("work");
  const work = await workSection(since, budget.open("work"), excludes).catch(
    () => undefined,
  );
  if (work) {
    sections.push(work.text);
    sources.push(work.report);
    budget.spend(work.report.chars);
  }

  return {
    text: sections.filter(Boolean).join("\n\n"),
    sources,
    since: day(since),
    ms: Date.now() - started,
  };
}
