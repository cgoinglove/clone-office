// The first transplant: one session in which the clone reads what its person's computer says about
// their work and returns what it learned as a structured answer, saved here (so what is kept never
// depends on the model choosing to call a tool). It learns broadly, so that from the first day it
// knows who they are at work, what they are working on and how they work, and a person does not
// have to teach it the basics: how they work, decide and talk goes to its memory of them
// (USER.md); what surrounds their work, the kinds of work they do again and again, their tools and
// where their work lives, to its memory of their work (MEMORY.md); what they are working on now
// and the people they work with to pages in its notes, dated, which it opens when one comes up and
// keeps current as it works with them (Hermes Agent's wiki of pages, opened by path), and where
// their work lives on the computer to one map page (WORK_MAP), every folder with what it holds, so
// it finds their things by path rather than asking. Who they
// are at work (what they do, look after and work in) is offered for them to confirm onto their
// profile, which is theirs to change and not memory. It also offers three things to do together
// right away, so the first experience is doing work, not filling in a form, and shows what it
// would answer a colleague. What was read and when is recorded, so the next learning reads only
// what is new (f6), and adds to the pages it finds there rather than starting them again.

import { join } from "node:path";
import { brainChoice } from "../brain/choice.ts";
import { contextWindow } from "../brain/context.ts";
import {
  memoryDir,
  notesDir,
  runSession,
  type SessionEvent,
  type SessionResult,
} from "../brain/session.ts";
import { openHistoryForRead } from "../history/db.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { NoteStore, WORK_MAP } from "../memory/notes.ts";
import { MemoryStore, type Target } from "../memory/store.ts";
import { ABOUT_WORDS, CARD_SCHEMA } from "../office/card.ts";
import { keepWorkFolders } from "../office/work-folders.ts";
import { cleanRoutines, type Routine } from "../routine.ts";
import { minimeHome } from "../server/paths.ts";
import { type About, cleanAbout } from "../server/profile.ts";
import { gather, type Material, SOURCE_ORDER } from "./gather.ts";

const LEARN_FILE = "learn.json";

export const LEARN_PROMPT = `This is the first time you meet your person. Below is what their own computer says about their work: hints about who they are, what they wrote for their AI tools, where their work lives (the folders and repositories they changed lately or worked in with AI tools, each with what it holds), what they asked those tools lately and what their conversations were about, their own recent commits, the kinds of documents they opened and the apps they use. Learn from it as much as it shows about who they are at work, so that from today you can do their work with them, find their things without asking, and answer colleagues in their place, without being told the basics. Learn from it; do not copy it.

Write everything in their language, short and concrete, keeping their own names for things and every path exactly as the material writes it. Only what the material shows: never guess a name, a project or a fact, and leave a part empty rather than fill it. Someone who does not write code shows less here (documents, pictures, apps, a few questions to an AI): learn what that shows, and what kind of work it points to. Do not call any tool now; what you return is saved for you.

1. \`about\`: who they are at work, for them to confirm and put on their profile and card (this is not memory; they keep or change it). \`name\` is what to call them, as the material shows it (the name they sign with, on their account or their commits; never a handle when a real name is there; empty if unsure). ${ABOUT_WORDS}

2. \`user\`: how they work, each a short line, at most twelve, each with its kind: how they like things done and reported, and the standards they hold their work to (\`work\`); how they decide, what they weigh, and where they want to be asked first (\`decide\`); how they talk and write, to whom (\`voice\`). Lines that will still be true in months. They are saved to your memory of them, read every time; write each as a fact about them, not an instruction to yourself.

3. \`work\`: what you need to know about the surroundings of their work, each a short line, at most fourteen: the kinds of work they do again and again, the tools, services and technology they work in, the conventions they follow, the team and organisation around them. Saved to your memory of their work, read every time: keep to what holds for weeks; where a piece of work stands goes in its project page, and where things are goes in the map below.

4. \`places\`: the map of where their work lives, kept as one page you open before you look for a file or a project: a \`title\` for it in their language, and \`entries\`, every folder and repository in the material worth knowing (at most thirty, the most used first), each its \`path\` exactly as written and \`about\`, one line on what is there and what it is for ("the Thursday voice agent's code", "pictures for YouTube uploads", "client contracts by year").

5. \`projects\`: what they are working on now, at most twelve, the most active first. For each: its \`name\` as they call it; its \`path\`, the folder or repository it lives in, exactly as written in the material (empty if it lives nowhere on this computer); a \`summary\`, one line saying what it is; \`now\`, one or two lines on where it stands, as the most recent dates in the material show it; and a \`page\`, the page you keep about it, in Markdown in their language: what it is, their part in it, where it lives (the path, the repository's address), how it is made and laid out (what it is built on, its main folders, as the material shows), who else is in it, what they did on it lately with the dates, and what is open. Each becomes a page in your notes, dated today; before relying on one later you check what is current, and you keep it up to date as you work together.

6. \`people\`: the people they work with, as the material names them, at most ten: \`name\`; a \`summary\`, one line on who they are to your person; and a \`page\` in Markdown: their role if shown, what the two of them do together, and how your person deals with them. Each becomes a page in your notes. Never anything private about them.

Then offer, in \`tasks\`, three things you can do for them right now with what you have — their past AI conversations, which you can search and read, your memory and notes, this app's guide, the web, their files when they allow it, and their own Claude Code and Codex conversations, which you can ask — chosen from what they are actually doing: pulling together what they decided or left open in a project, finding how they handled something before, drafting something the way they write it. Each is a short label and why; the label is sent to you as their request when they tap it, so write it as that request.

Then, in \`example\`, show them what you will do for their colleagues: one question a colleague might really ask them about their own current work, as the material shows it, and the short answer you would give in their place, in their language, saying in a few words where you found it ("from your conversations about the payments API yesterday"). Only from what the material shows; if it shows nothing a colleague would ask about, leave it out.

Last, in \`routines\`, at most three things they do at a regular time, read from the times of what they asked (shown in their own time, with the weekday): planning the day on weekday mornings, a report on Friday afternoons. Give each as the request they would send (a label, as for tasks), the days (0 is Sunday, 6 is Saturday), the hour it usually starts, and why. Only when the same kind of request shows up at about the same time at least three times; otherwise give none.`;

/**
 * How much one reading keeps, held by the code as well as asked of the model: lines about the
 * person (USER.md, itself capped at its characters), lines about their work's surroundings
 * (MEMORY.md, likewise), pages of work and of people, and places on the map. The map keeps what
 * earlier readings found too, the newest first, up to MAP_KEPT lines.
 */
export const LEARN_CAPS = {
  user: 12,
  work: 14,
  projects: 12,
  people: 10,
  places: 30,
} as const;
const MAP_KEPT = 60;

/** A page the reading keeps in the clone's notes: a piece of work, or someone they work with. */
const PAGE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    summary: { type: "string" },
    page: { type: "string" },
  },
  required: ["name", "summary", "page"],
};

export const LEARN_SCHEMA = {
  type: "object",
  properties: {
    user: {
      type: "array",
      maxItems: LEARN_CAPS.user,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["work", "decide", "voice"] },
          text: { type: "string" },
        },
        required: ["kind", "text"],
      },
    },
    work: {
      type: "array",
      items: { type: "string" },
      maxItems: LEARN_CAPS.work,
    },
    places: {
      type: "object",
      properties: {
        title: { type: "string" },
        entries: {
          type: "array",
          maxItems: LEARN_CAPS.places,
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              about: { type: "string" },
            },
            required: ["path", "about"],
          },
        },
      },
      required: ["title", "entries"],
    },
    projects: {
      type: "array",
      maxItems: LEARN_CAPS.projects,
      items: {
        ...PAGE_SCHEMA,
        properties: {
          ...PAGE_SCHEMA.properties,
          path: { type: "string" },
          now: { type: "string" },
        },
      },
    },
    people: { type: "array", maxItems: LEARN_CAPS.people, items: PAGE_SCHEMA },
    tasks: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: { label: { type: "string" }, why: { type: "string" } },
        required: ["label", "why"],
      },
    },
    about: {
      type: "object",
      properties: { name: { type: "string" }, ...CARD_SCHEMA.properties },
      required: CARD_SCHEMA.required,
    },
    example: {
      type: "object",
      properties: {
        question: { type: "string" },
        answer: { type: "string" },
      },
      required: ["question", "answer"],
    },
    routines: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          days: {
            type: "array",
            items: { type: "integer", minimum: 0, maximum: 6 },
          },
          hour: { type: "integer", minimum: 0, maximum: 23 },
          why: { type: "string" },
        },
        required: ["label", "days", "hour", "why"],
      },
    },
  },
  required: ["user", "work", "tasks"],
};

export interface Task {
  label: string;
  why: string;
}

/** What the clone would answer a colleague in its person's place: shown so they see what it is for. */
export interface Example {
  question: string;
  answer: string;
}

/** An example as the model gave it, or none when it is not one. */
export function cleanExample(value: unknown): Example | undefined {
  const raw = value as Partial<Example> | undefined;
  const question = typeof raw?.question === "string" ? raw.question.trim() : "";
  const answer = typeof raw?.answer === "string" ? raw.answer.trim() : "";
  return question && answer
    ? { question: question.slice(0, 400), answer: answer.slice(0, 800) }
    : undefined;
}

/** How they work, as kept in the clone's memory of them, by kind. */
export interface Trait {
  kind: "work" | "decide" | "voice";
  text: string;
}

/** A page the reading kept in the clone's notes, as the screen lists it. */
export interface Page {
  name: string;
  summary: string;
  /** Where a piece of work stands, as the reading saw it. */
  now?: string;
  /** The page's path in the notes (projects/…, people/…). */
  path: string;
  /** Where a piece of work lives on the computer, as the reading wrote it. */
  folder?: string;
}

/** One place on the map of where the person's work lives. */
export interface Spot {
  path: string;
  about: string;
}

/** What one reading learned, for the screen: everything it kept, where it kept it. */
export interface Knows {
  user: Trait[];
  work: string[];
  projects: Page[];
  people: Page[];
  /** Where their work lives, as kept on the map page (WORK_MAP). */
  places?: Spot[];
}

export const NO_KNOWS: Knows = {
  user: [],
  work: [],
  projects: [],
  people: [],
  places: [],
};

/** Who they are at work as a reading saw it: the profile's parts, and what to call them. */
export type Seen = About & { name?: string };

export interface LearnResult {
  ok: boolean;
  error?: string;
  material: Pick<Material, "sources" | "since" | "ms">;
  /** The entries this learning added to memory. */
  kept: string[];
  /** All it learned, by where it went. */
  knows: Knows;
  tasks: Task[];
  routines: Routine[];
  example?: Example;
  /** Who they are at work, as the reading saw it, for them to confirm (not memory). */
  about?: Seen;
  sessionId?: string;
}

interface LearnRecord {
  last?: {
    at: string;
    since: string;
    sessionId?: string;
    kept?: string[];
    knows?: Knows;
    tasks?: Task[];
    routines?: Routine[];
    example?: Example;
    about?: Seen;
  };
}

export function learnPath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), LEARN_FILE);
}

export async function lastLearn(): Promise<LearnRecord["last"]> {
  const read = await readText(learnPath());
  try {
    return read.raw ? (JSON.parse(read.raw) as LearnRecord).last : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Save what a session chose to keep about the person, through the same store and limits as the
 * memory tool, and report each saved entry as the tool's calls are reported. Returns the entries
 * that were added (an entry already kept is not added again).
 */
export async function keep(
  entries: unknown[],
  onEvent?: (event: SessionEvent) => void,
  /** What kept them, recorded beside each line: the first reading, or another AI's memory. */
  from: "reading" | "import" = "reading",
  /** Their memory of the person (USER.md), or of the person's work (MEMORY.md). */
  target: Target = "user",
): Promise<string[]> {
  const store = new MemoryStore(memoryDir(), undefined, { from });
  const added: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== "string" || !entry.trim()) continue;
    const before = await store.entries(target);
    const saved = await store.add(target, entry);
    if (!saved.success)
      onEvent?.({ type: "memory-refused", error: saved.error });
    else if (saved.entry_count > before.length) {
      added.push(entry.trim());
      onEvent?.({
        type: "memory",
        target,
        action: "add",
        content: entry.trim(),
      });
    }
  }
  return added;
}

/** A page name as the notes take it: the words of a name, lower case, joined by "-". */
export function pageSlug(name: string, fallback: string): string {
  const slug = name
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[^\p{L}\p{N}]+|-+$/gu, "")
    .slice(0, 64);
  return slug || fallback;
}

/**
 * Keep pages in the clone's notes: a new one is made; one the notes already hold (a later reading,
 * or a page the clone made while working) gets what this reading saw added under today's date, so
 * nothing written there before is lost.
 */
export async function keepPages(
  section: "projects" | "people",
  raw: unknown,
  source: string,
  onEvent?: (event: SessionEvent) => void,
): Promise<Page[]> {
  if (!Array.isArray(raw)) return [];
  const notes = new NoteStore(notesDir(), "transplant");
  const kept: Page[] = [];
  for (const [at, item] of raw.entries()) {
    const value = item as Partial<
      Record<"name" | "summary" | "page" | "now" | "path", unknown>
    >;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const summary =
      typeof value.summary === "string"
        ? value.summary.trim().slice(0, 160)
        : "";
    const folder =
      typeof value.path === "string" ? value.path.trim().slice(0, 300) : "";
    const written = typeof value.page === "string" ? value.page.trim() : "";
    // Where a piece of work lives heads its page, so the clone can go back to it by path.
    const body =
      folder && written && !written.includes(folder)
        ? `\`${folder}\`\n\n${written}`
        : written;
    const now = typeof value.now === "string" ? value.now.trim() : "";
    if (!name || !body) continue;
    const path = `${section}/${pageSlug(name, `${section}-${at + 1}`)}`;
    const title = name.slice(0, 80);
    const made = await notes.apply([
      {
        action: "create",
        path,
        title,
        summary: summary || title,
        body,
        source,
      },
    ]);
    if (!made.success) {
      const seen = await notes.view(path);
      if ("error" in seen) continue;
      const before = seen.content.replace(/^---[\s\S]*?---\s*/, "").trim();
      const today = new Date().toISOString().slice(0, 10);
      const added = await notes.apply([
        {
          action: "rewrite",
          path,
          summary: summary || undefined,
          body: `${before}\n\n## ${today}\n\n${body}`,
          source,
        },
      ]);
      if (!added.success) continue;
    }
    onEvent?.({ type: "note", changes: [path] } as SessionEvent);
    kept.push({
      name: title,
      summary,
      ...(now ? { now } : {}),
      path,
      ...(folder ? { folder } : {}),
    });
  }
  return kept;
}

/** The map's lines as kept on its page: "- `path` — what is there". */
export const MAP_LINE = /^- `([^`]+)` — (.+)$/;

/**
 * Keeps the map of where the person's work lives as one page (WORK_MAP). A later reading adds
 * the places it found and says anew what one it found again is, so a place it no longer sees stays
 * on the map until the clone or the person takes it off.
 */
export async function keepMap(
  raw: unknown,
  source: string,
  onEvent?: (event: SessionEvent) => void,
): Promise<Spot[]> {
  const value = raw as { title?: unknown; entries?: unknown } | undefined;
  const entries = (Array.isArray(value?.entries) ? value.entries : [])
    .map((entry) => entry as Partial<Record<"path" | "about", unknown>>)
    .map((entry) => ({
      path: typeof entry.path === "string" ? entry.path.trim() : "",
      about:
        typeof entry.about === "string"
          ? entry.about.replace(/\s+/g, " ").trim().slice(0, 200)
          : "",
    }))
    .filter((entry) => entry.path && entry.about && !entry.path.includes("`"))
    .slice(0, LEARN_CAPS.places);
  if (!entries.length) return [];
  const notes = new NoteStore(notesDir(), "transplant");
  const seen = await notes.view(WORK_MAP);
  const kept = new Map<string, string>();
  if (!("error" in seen))
    for (const line of seen.content.split("\n")) {
      const found = MAP_LINE.exec(line.trim());
      if (found) kept.set(found[1], found[2]);
    }
  // What this reading found first, then what earlier ones found and it did not, up to the map's size.
  for (const entry of entries) kept.delete(entry.path);
  const earlier = [...kept];
  kept.clear();
  for (const entry of entries) kept.set(entry.path, entry.about);
  for (const [path, about] of earlier)
    if (kept.size < MAP_KEPT) kept.set(path, about);
  const title =
    typeof value?.title === "string" && value.title.trim()
      ? value.title.trim().slice(0, 80)
      : "Where work lives";
  const body = [...kept]
    .map(([path, about]) => `- \`${path}\` — ${about}`)
    .join("\n");
  const summary = [...kept.keys()].slice(0, 4).join(", ").slice(0, 150);
  const result = await notes.apply([
    "error" in seen
      ? { action: "create", path: WORK_MAP, title, summary, body, source }
      : { action: "rewrite", path: WORK_MAP, summary, body, source },
  ]);
  if (!result.success) return [];
  // The folders themselves, kept by code apart from the page: what this reading found and what the
  // person's earlier readings kept, never what the page gained since, which a session may write
  // (office/work-folders.ts).
  await keepWorkFolders(entries.map((entry) => entry.path)).catch(() => {});
  onEvent?.({ type: "note", changes: [WORK_MAP] } as SessionEvent);
  return [...kept].map(([path, about]) => ({ path, about }));
}

/** Everything a structured answer says the clone learned, saved where each part belongs. */
export async function keepKnowledge(
  structured: Record<string, unknown>,
  from: "reading" | "import",
  onEvent?: (event: SessionEvent) => void,
): Promise<{ kept: string[]; knows: Knows }> {
  const traits = (Array.isArray(structured.user) ? structured.user : [])
    .map((item) => item as Partial<Trait>)
    .filter(
      (item): item is Trait =>
        typeof item?.text === "string" &&
        Boolean(item.text.trim()) &&
        ["work", "decide", "voice"].includes(item.kind as string),
    );
  const userKept = await keep(
    traits.slice(0, LEARN_CAPS.user).map((trait) => trait.text),
    onEvent,
    from,
    "user",
  );
  const workKept = await keep(
    Array.isArray(structured.work)
      ? structured.work.slice(0, LEARN_CAPS.work)
      : [],
    onEvent,
    from,
    "memory",
  );
  const source = from === "import" ? "another AI's memory" : "first reading";
  const pages = (raw: unknown, most: number) =>
    Array.isArray(raw) ? raw.slice(0, most) : [];
  const projects = await keepPages(
    "projects",
    pages(structured.projects, LEARN_CAPS.projects),
    source,
    onEvent,
  );
  const people = await keepPages(
    "people",
    pages(structured.people, LEARN_CAPS.people),
    source,
    onEvent,
  );
  const places = await keepMap(structured.places, source, onEvent);
  return {
    kept: [...userKept, ...workKept],
    knows: {
      user: traits
        .filter((trait) => userKept.includes(trait.text.trim()))
        .map((trait) => ({ kind: trait.kind, text: trait.text.trim() })),
      work: workKept,
      projects,
      people,
      places,
    },
  };
}

export type LearnPhase = "index" | "read" | "learn";

export interface LearnProgress {
  phase: LearnPhase;
  /** A rough estimate for the screen, 0–100: right in order of magnitude, not to the percent. */
  percent: number;
  /** For "read", the source being read. */
  source?: string;
}

/** Read, learn, and record what was read. `language` is the screen's, e.g. "Korean". */
export async function learn(options: {
  language?: string;
  model?: string;
  onEvent?: (event: SessionEvent) => void;
  onMaterial?: (material: Pick<Material, "sources" | "since" | "ms">) => void;
  onProgress?: (progress: LearnProgress) => void;
  since?: number;
}): Promise<LearnResult> {
  const report = options.onProgress ?? (() => {});
  const previous = await lastLearn();
  const since =
    options.since ?? (previous ? Date.parse(previous.at) : undefined);
  report({ phase: "index", percent: 2 });
  // Indexing is most of the waiting when the records are large; reading the rest is quick.
  const order = SOURCE_ORDER;
  // What it reads is sized to what the picked model can hold: under half its window, about 2.5
  // characters a token, never past what a long first reading needs.
  const window = contextWindow(await brainChoice());
  const material = await gather({
    since,
    budget: Math.max(
      20_000,
      Math.min(120_000, Math.floor(window * 0.45 * 2.5)),
    ),
    onIndexProgress: (done, total) =>
      report({
        phase: "index",
        percent: 2 + Math.round(38 * (total ? Math.min(1, done / total) : 1)),
      }),
    onSource: (source) =>
      report({
        phase: "read",
        percent: 40 + 3 * (order.indexOf(source) + 1),
        source,
      }),
  });
  const meta = {
    sources: material.sources,
    since: material.since,
    ms: material.ms,
  };
  options.onMaterial?.(meta);
  if (material.sources.every((source) => source.items === 0))
    return {
      ok: false,
      error: "nothing-to-read",
      material: meta,
      kept: [],
      knows: NO_KNOWS,
      tasks: [],
      routines: [],
    };
  // The model's time cannot be known in advance: the estimate rises towards 95% over about a
  // minute and jumps to 100% when it answers.
  const started = Date.now();
  report({ phase: "learn", percent: 52 });
  const ticker = setInterval(() => {
    const seconds = (Date.now() - started) / 1000;
    report({
      phase: "learn",
      percent: Math.min(
        95,
        Math.round(52 + 43 * (1 - Math.exp(-seconds / 25))),
      ),
    });
  }, 1000);
  let result: SessionResult;
  try {
    result = await runSession({
      prompt: `${LEARN_PROMPT}\n\n---\n\n${material.text}`,
      jsonSchema: LEARN_SCHEMA,
      language: options.language,
      model: options.model,
      maxTurns: 30,
      timeoutMs: 6 * 60 * 1000,
      purpose: "learn",
      onEvent: options.onEvent,
    });
  } finally {
    clearInterval(ticker);
  }
  const structured = (result.structured ?? {}) as Record<string, unknown> & {
    tasks?: Task[];
    routines?: unknown;
    example?: unknown;
    about?: { description?: unknown; name?: unknown };
  };
  const tasks = Array.isArray(structured.tasks) ? structured.tasks : [];
  const routines = cleanRoutines(structured.routines);
  const example = cleanExample(structured.example);
  const seen = cleanAbout({
    ...structured.about,
    role: structured.about?.description,
  });
  const name =
    typeof structured.about?.name === "string"
      ? structured.about.name.trim().slice(0, 80)
      : "";
  const about: Seen | undefined = name
    ? { ...(seen ?? { role: "", owns: [], tools: [] }), name }
    : seen;
  const { kept, knows } = result.ok
    ? await keepKnowledge(structured, "reading", options.onEvent)
    : { kept: [], knows: NO_KNOWS };
  if (result.ok)
    await atomicWrite(
      learnPath(),
      JSON.stringify(
        {
          last: {
            at: new Date().toISOString(),
            since: material.since,
            sessionId: result.sessionId,
            kept,
            knows,
            tasks,
            routines,
            ...(example ? { example } : {}),
            ...(about ? { about } : {}),
          },
        },
        null,
        2,
      ),
    );
  return {
    ok: result.ok,
    error: result.error,
    material: meta,
    kept,
    knows,
    tasks,
    routines,
    ...(example ? { example } : {}),
    ...(about ? { about } : {}),
    sessionId: result.sessionId,
  };
}

/**
 * How many of the person's conversations with their AI tools went on after `since`, by the search
 * index (their conversations with the mini-me itself are not counted: each is looked back on when
 * it ends). It is what the screen offers to read again.
 */
export function freshConversations(since: number): number {
  const db = openHistoryForRead();
  if (!db) return 0;
  try {
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM files WHERE last > ? AND tool != 'mini-me'",
      )
      .get(since) as { n: number } | undefined;
    return Number(row?.n ?? 0);
  } catch {
    return 0;
  } finally {
    db.close();
  }
}
