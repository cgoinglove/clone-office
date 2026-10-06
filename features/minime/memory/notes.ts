// Notes: what the mini-me knows about one person, one piece of work or one topic, a page each.
// Pages are opened by path when needed, never all at once, so the notes can grow without
// growing every prompt. The layout follows the LLM Wiki pattern Hermes Agent ships as a skill
// (skills/research/llm-wiki, MIT, Nous Research; after Andrej Karpathy):
//   notes/index.md                 every page with a one-line summary
//   notes/log.md                   what changed when; rotated to log-YYYY.md at 500 entries
//   notes/people/<slug>.md         someone the person works with
//   notes/projects/<slug>.md       ongoing work: a project, a client, a case, a product
//   notes/topics/<slug>.md         a subject the person deals with again and again
//   notes/_archive/<section>/...   pages that are over: out of the index, kept
// The Hermes skill leaves the index and the log to the model and names skipping them as how a
// wiki degrades, so here code keeps both and the model writes only the pages. A page is made
// when someone or something matters to the person's work (it comes up more than once, or is
// central to a task), never one per folder on disk.

import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, readText, withLock } from "./files.ts";
import { threatMessage } from "./threats.ts";

export const SECTIONS = ["people", "projects", "topics"] as const;
export type Section = (typeof SECTIONS)[number];
const SECTION_TITLE: Record<Section, string> = {
  people: "People",
  projects: "Projects",
  topics: "Topics",
};

const SLUG = /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u;
const MAX_TITLE = 80;
const MAX_SUMMARY = 160;
const MAX_SOURCE = 80;
const MAX_BODY = 40_000;
/** Past this a page should be split into linked pages (LLM Wiki page threshold). */
const LONG_PAGE_LINES = 200;
/** A section longer than this is grouped by first letter in the index. */
const SECTION_SPLIT = 50;
/** log.md is rotated once it holds this many entries. */
const LOG_ROTATE = 500;
const KEEP_SOURCES = 10;
const ARCHIVE = "_archive";

export interface NotePage {
  path: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
  sources: string[];
  body: string;
}

export interface NoteOp {
  action?: string;
  path?: string;
  title?: string;
  summary?: string;
  body?: string;
  source?: string;
  old_string?: string;
  new_string?: string;
  replace_all?: boolean;
}

export interface NoteChange {
  action: "create" | "patch" | "rewrite" | "archive";
  path: string;
  summary?: string;
}

export type NoteResult =
  | { success: true; message: string; notes: string[]; warnings?: string[] }
  | { success: false; error: string };

const today = () => new Date().toISOString().slice(0, 10);

/** "people/Park Jimin.md" → "people/park-jimin"; undefined when it is not a page path. */
export function normalizePath(raw: string): { path?: string; error?: string } {
  const trimmed = raw.trim().normalize("NFC").replace(/\.md$/i, "");
  const [section, ...rest] = trimmed.split("/");
  if (!(SECTIONS as readonly string[]).includes(section))
    return {
      error: `A page path is <section>/<name>, with section one of ${SECTIONS.join(", ")}. Got: '${raw}'.`,
    };
  if (rest.length !== 1)
    return {
      error: `A page path has exactly one folder: '${section}/<name>'. Got: '${raw}'.`,
    };
  const slug = rest[0].toLocaleLowerCase().replace(/\s+/g, "-");
  if (!SLUG.test(slug))
    return {
      error: `Invalid page name '${rest[0]}': letters, digits, '.', '_' or '-', at most 64 characters, starting with a letter or digit.`,
    };
  return { path: `${section}/${slug}` };
}

function render(page: NotePage): string {
  const yaml = (value: string) => JSON.stringify(value);
  return [
    "---",
    `title: ${yaml(page.title)}`,
    `summary: ${yaml(page.summary)}`,
    `created: ${page.created}`,
    `updated: ${page.updated}`,
    "sources:",
    ...page.sources.map((source) => `  - ${yaml(source)}`),
    "---",
    "",
    page.body.trim(),
    "",
  ].join("\n");
}

function parse(path: string, raw: string): NotePage {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw.replace(/^﻿/, ""));
  const head = match?.[1] ?? "";
  const value = (key: string) => {
    const found =
      new RegExp(`^${key}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim() ?? "";
    try {
      return found.startsWith('"') ? JSON.parse(found) : found;
    } catch {
      return found;
    }
  };
  const sources = [...head.matchAll(/^\s+-\s+(.*)$/gm)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return m[1];
    }
  });
  return {
    path,
    title: value("title") || path.split("/")[1],
    summary: value("summary"),
    created: value("created"),
    updated: value("updated"),
    sources,
    body: (match ? match[2] : raw).trim(),
  };
}

function checkFields(page: NotePage): string | undefined {
  if (!page.title.trim()) return "title is required.";
  if (page.title.length > MAX_TITLE)
    return `title is longer than ${MAX_TITLE} characters.`;
  if (!page.summary.trim())
    return "summary is required: one line on who or what this is.";
  if (page.summary.length > MAX_SUMMARY)
    return `summary is longer than ${MAX_SUMMARY} characters; it is the page's line in the index.`;
  if (page.body.length > MAX_BODY)
    return `The page is ${page.body.length.toLocaleString("en-US")} characters (limit ${MAX_BODY.toLocaleString("en-US")}). Split it into linked pages.`;
  return threatMessage(`${page.title}\n${page.summary}\n${page.body}`);
}

export class NoteStore {
  readonly dir: string;
  /** Who writes, recorded as a page source and in the log: "session", "review", "transplant". */
  readonly actor: string;
  private readonly viewed = new Set<string>();
  readonly changes: NoteChange[] = [];

  constructor(dir: string, actor = "session") {
    this.dir = dir;
    this.actor = actor;
  }

  private file(path: string): string {
    return join(/*turbopackIgnore: true*/ this.dir, `${path}.md`);
  }

  async pages(): Promise<NotePage[]> {
    const out: NotePage[] = [];
    for (const section of SECTIONS) {
      let names: string[] = [];
      try {
        names = (
          await readdir(join(/*turbopackIgnore: true*/ this.dir, section))
        ).filter((name) => name.endsWith(".md") && !name.startsWith("."));
      } catch {
        continue;
      }
      for (const name of names.sort()) {
        const path = `${section}/${name.slice(0, -3)}`;
        const read = await readText(this.file(path));
        if (read.exists) out.push(parse(path, read.raw));
      }
    }
    return out;
  }

  /** A page (marked read, so it may be changed in this run), or the index with path "index". */
  async view(
    raw: string,
  ): Promise<{ path: string; content: string } | { error: string }> {
    if (raw.trim().replace(/\.md$/, "") === "index") {
      const read = await readText(
        join(/*turbopackIgnore: true*/ this.dir, "index.md"),
      );
      return { path: "index", content: read.raw || "(no notes yet)" };
    }
    const { path, error } = normalizePath(raw);
    if (!path) return { error: error ?? "Invalid path." };
    const read = await readText(this.file(path));
    if (!read.exists)
      return {
        error: `No page '${path}'. Use note_search or note_view('index').`,
      };
    this.viewed.add(path);
    return { path, content: read.raw };
  }

  /** Pages matching any of the words, best first: title, then summary, then body. */
  async search(
    query: string,
    limit = 10,
  ): Promise<
    { path: string; title: string; summary: string; lines: string[] }[]
  > {
    const terms = query
      .normalize("NFC")
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 0);
    if (!terms.length) return [];
    const scored = (await this.pages())
      .map((page) => {
        const title = page.title.toLocaleLowerCase();
        const summary = page.summary.toLocaleLowerCase();
        const bodyLines = page.body.split("\n");
        let score = 0;
        const lines: string[] = [];
        for (const term of terms) {
          if (title.includes(term) || page.path.includes(term)) score += 5;
          if (summary.includes(term)) score += 3;
          for (const line of bodyLines)
            if (line.toLocaleLowerCase().includes(term)) {
              score += 1;
              if (lines.length < 3 && !lines.includes(line.trim()))
                lines.push(line.trim().slice(0, 160));
            }
        }
        return { page, score, lines };
      })
      .filter((hit) => hit.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || b.page.updated.localeCompare(a.page.updated),
      );
    return scored.slice(0, limit).map(({ page, lines }) => ({
      path: page.path,
      title: page.title,
      summary: page.summary,
      lines,
    }));
  }

  /** What a session starts with: how many pages there are and the most recently changed ones. */
  async overview(recent = 8): Promise<string> {
    const pages = await this.pages();
    if (!pages.length) return "";
    const counts = SECTIONS.map(
      (section) =>
        `${section} ${pages.filter((page) => page.path.startsWith(`${section}/`)).length}`,
    ).join(" · ");
    const latest = [...pages]
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, recent)
      .map((page) => `- ${page.path} — ${page.summary}`);
    return `<notes pages="${pages.length}">\n${counts}\nRecently updated:\n${latest.join("\n")}\n</notes>`;
  }

  /** Applies every operation or none; the index and the log are rewritten by code afterwards. */
  async apply(operations: NoteOp[]): Promise<NoteResult> {
    if (!operations.length)
      return { success: false, error: "operations list is empty." };
    return withLock(this.dir, () => this.applyLocked(operations));
  }

  private async applyLocked(operations: NoteOp[]): Promise<NoteResult> {
    const originals = new Map<string, string | undefined>();
    const changes: NoteChange[] = [];
    const warnings: string[] = [];
    const remember = async (file: string) => {
      if (originals.has(file)) return originals.get(file);
      const read = await readText(file);
      if (!read.ok)
        throw new Error(`could not read ${file}; nothing was changed.`);
      originals.set(file, read.exists ? read.raw : undefined);
      return originals.get(file);
    };
    const date = today();
    const source = (op: NoteOp) => {
      const said = op.source?.trim().slice(0, MAX_SOURCE);
      return `${date} · ${said || this.actor}`;
    };
    try {
      for (const [i, op] of operations.entries()) {
        const at = `Operation ${i + 1} (${op.action ?? "unknown"})`;
        const { path, error } = normalizePath(op.path ?? "");
        if (!path) throw new Error(`${at}: ${error}`);
        const file = this.file(path);
        const current = await remember(file);
        if (op.action === "create") {
          if (current !== undefined)
            throw new Error(
              `${at}: '${path}' exists already — view it with note_view and patch it.`,
            );
          const page: NotePage = {
            path,
            title: (op.title ?? "").trim(),
            summary: (op.summary ?? "").trim(),
            created: date,
            updated: date,
            sources: [source(op)],
            body: (op.body ?? "").trim(),
          };
          const invalid = checkFields(page);
          if (invalid) throw new Error(`${at}: ${invalid}`);
          await atomicWrite(file, render(page));
          this.viewed.add(path);
          changes.push({ action: "create", path, summary: page.summary });
          if (page.body.split("\n").length > LONG_PAGE_LINES)
            warnings.push(
              `long-page: ${path} is over ${LONG_PAGE_LINES} lines; split it into linked pages.`,
            );
          continue;
        }
        if (current === undefined) throw new Error(`${at}: no page '${path}'.`);
        if (!this.viewed.has(path))
          throw new Error(
            `${at}: read before write — call note_view('${path}') in this run, then base the change on what it returned.`,
          );
        const page = parse(path, current);
        if (op.action === "archive") {
          let dest = join(
            /*turbopackIgnore: true*/ this.dir,
            ARCHIVE,
            `${path}.md`,
          );
          if ((await readText(dest)).exists)
            dest = dest.replace(/\.md$/, `-${Date.now()}.md`);
          await remember(dest);
          await atomicWrite(dest, current);
          await rm(file, { force: true });
          changes.push({ action: "archive", path });
          continue;
        }
        let nextBody: string;
        if (op.action === "patch") {
          const oldString = op.old_string ?? "";
          const count = oldString ? page.body.split(oldString).length - 1 : 0;
          if (count === 0)
            throw new Error(`${at}: old_string was not found in ${path}.`);
          if (count > 1 && !op.replace_all)
            throw new Error(
              `${at}: old_string matches ${count} places in ${path}; make it unique or set replace_all.`,
            );
          nextBody = op.replace_all
            ? page.body.split(oldString).join(op.new_string ?? "")
            : page.body.replace(oldString, () => op.new_string ?? "");
        } else if (op.action === "rewrite") {
          if (op.body === undefined)
            throw new Error(`${at}: body is required.`);
          nextBody = op.body;
        } else {
          throw new Error(
            `${at}: unknown action. Use create, patch, rewrite or archive.`,
          );
        }
        const next: NotePage = {
          ...page,
          title: op.title?.trim() || page.title,
          summary: op.summary?.trim() || page.summary,
          updated: date,
          sources: [
            ...page.sources.filter((s) => s !== source(op)),
            source(op),
          ].slice(-KEEP_SOURCES),
          body: nextBody.trim(),
        };
        const invalid = checkFields(next);
        if (invalid) throw new Error(`${at}: ${invalid}`);
        await atomicWrite(file, render(next));
        changes.push({ action: op.action, path, summary: next.summary });
        if (next.body.split("\n").length > LONG_PAGE_LINES)
          warnings.push(
            `long-page: ${path} is over ${LONG_PAGE_LINES} lines; split it into linked pages.`,
          );
      }
    } catch (error) {
      for (const [file, original] of originals) {
        if (original === undefined) await rm(file, { force: true });
        else await atomicWrite(file, original);
      }
      return {
        success: false,
        error: `${(error as Error).message} Nothing was changed (all-or-nothing).`,
      };
    }
    await this.writeIndex();
    await this.appendLog(changes);
    this.changes.push(...changes);
    return {
      success: true,
      message: `Applied ${operations.length} operation(s); the index and log are updated. This update is complete — do not repeat it.`,
      notes: changes.map((change) => `${change.action} ${change.path}`),
      ...(warnings.length ? { warnings } : {}),
    };
  }

  private async writeIndex(): Promise<void> {
    const pages = await this.pages();
    const lines = [
      "# Notes index",
      "",
      "> Every page with a one-line summary. Kept by the app; the pages are the place to edit.",
      `> Last updated: ${today()} | Pages: ${pages.length}`,
    ];
    for (const section of SECTIONS) {
      const inSection = pages
        .filter((page) => page.path.startsWith(`${section}/`))
        .sort((a, b) => a.title.localeCompare(b.title));
      lines.push("", `## ${SECTION_TITLE[section]} (${inSection.length})`);
      const line = (page: NotePage) =>
        `- [${page.title}](${encodeURI(page.path)}.md) — ${page.summary}`;
      if (inSection.length <= SECTION_SPLIT) {
        lines.push(...inSection.map(line));
        continue;
      }
      let letter = "";
      for (const page of inSection) {
        const first = page.title.charAt(0).toLocaleUpperCase();
        if (first !== letter) {
          letter = first;
          lines.push("", `### ${letter}`);
        }
        lines.push(line(page));
      }
    }
    await atomicWrite(
      join(/*turbopackIgnore: true*/ this.dir, "index.md"),
      `${lines.join("\n")}\n`,
    );
  }

  private async appendLog(changes: NoteChange[]): Promise<void> {
    const path = join(/*turbopackIgnore: true*/ this.dir, "log.md");
    let raw = (await readText(path)).raw;
    if ((raw.match(/^## \[/gm) ?? []).length >= LOG_ROTATE) {
      let rotated = join(
        /*turbopackIgnore: true*/ this.dir,
        `log-${new Date().getFullYear()}.md`,
      );
      if ((await readText(rotated)).exists)
        rotated = rotated.replace(/\.md$/, `-${Date.now()}.md`);
      await rename(path, rotated);
      raw = "";
    }
    if (!raw)
      raw =
        "# Notes log\n\n> What changed when. Append-only; rotated at 500 entries.\n";
    const entries = changes.map(
      (change) =>
        `\n## [${today()}] ${change.action} | ${change.path}${change.summary ? ` — ${change.summary}` : ""} (${this.actor})`,
    );
    await atomicWrite(path, `${raw.trimEnd()}\n${entries.join("")}\n`);
  }
}

export const NOTE_TOOLS = {
  view: {
    name: "note_view",
    description:
      "Open one notes page by path (e.g. 'people/kim-minsu', 'projects/spring-launch'), or 'index' for every page with its one-line summary. Required in this run before you change that page.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  search: {
    name: "note_search",
    description:
      "Find notes pages about a person, a piece of work or a topic. Returns paths, summaries and matching lines; open a page with note_view.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Words to look for (names, terms).",
        },
      },
      required: ["query"],
    },
  },
  write: {
    name: "note_write",
    description:
      "Create or update notes pages: one page per person your person works with (people/), per piece of ongoing work — project, client, case, product (projects/) — or per recurring subject (topics/). The index and the log are kept for you. The call is an operations array applied all or nothing. Ops: create (path, title, summary, body), patch (path, old_string/new_string — preferred), rewrite (path, body), archive (path; for work that is over). Make a page only for someone or something that matters to your person's work — it came up more than once or is central to a task; otherwise add to an existing page or skip. Search before creating. Keep a page to what stays true: who someone is, what they care about, how to deal with them, what a piece of work is for and standing decisions about it. Never status, progress, plans, dates or anything you can look up again — it goes stale and misleads; look it up when needed. Never store secrets, health details or private details about other people. Write in your person's language.",
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
                enum: ["create", "patch", "rewrite", "archive"],
              },
              path: {
                type: "string",
                description:
                  "'<section>/<name>' with section people, projects or topics.",
              },
              title: {
                type: "string",
                description: "create: the name as your person writes it.",
              },
              summary: {
                type: "string",
                description:
                  "create (optional on others): one line, at most 160 characters — the page's line in the index.",
              },
              body: {
                type: "string",
                description: "create/rewrite: the page in markdown.",
              },
              old_string: {
                type: "string",
                description: "patch: text to find in the page.",
              },
              new_string: {
                type: "string",
                description: "patch: the replacement.",
              },
              replace_all: { type: "boolean" },
              source: {
                type: "string",
                description:
                  "Optional: where this came from, short (e.g. 'said in session', 'Claude Code history').",
              },
            },
            required: ["action", "path"],
          },
        },
      },
      required: ["operations"],
    },
  },
} as const;
