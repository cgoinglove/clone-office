// Shapes shared by the mini-me server code and the screen that makes a person's mini-me.

/** The parts of ME.md, in the order the file lists them. */
export const LAYERS = [
  "identity",
  "owns",
  "principles",
  "boundaries",
  "voice",
  "menu",
] as const;
export type Layer = (typeof LAYERS)[number];

export type Confidence = "high" | "medium" | "low";

/** The person's call on one drafted line. `fix` keeps the line with their correction. */
export type Verdict = "right" | "fix" | "wrong";

/** What a line rests on: something the person typed, a note, or an app they use. */
export interface Evidence {
  id: number;
  date: string;
  project: string;
  /** The tool or file it came from, such as "Codex" or "~/.claude/CLAUDE.md". */
  source?: string;
  quote: string;
}

/**
 * A ME.md line: drafted from records, or told by the person. Only confirmed lines are written to
 * ME.md; what the person told in their own words counts as confirmed.
 */
export interface Candidate {
  id: string;
  layer: Layer;
  text: string;
  confidence: Confidence;
  evidence: Evidence[];
  verdict?: Verdict;
  corrected?: string;
  /** Kept for the mini-me only and never shown to teammates. */
  private?: boolean;
  decidedAt?: string;
  /** Told by the person, by answering a question or fixing an answer; kept across new drafts. */
  told?: boolean;
}

/** What the mini-me asks while the first draft is written: what records rarely show. */
export const QUESTION_KEYS = ["work", "decide", "people"] as const;
export type QuestionKey = (typeof QUESTION_KEYS)[number];
export const QUESTION_LAYER: Record<QuestionKey, Layer> = {
  work: "identity",
  decide: "owns",
  people: "identity",
};

/**
 * Something the mini-me can learn from, each with its own switch: a folder worked in with AI
 * tools, a tool's conversations that name no folder, the notes about the person, or the apps.
 */
export interface ScanProject {
  /** A folder, `chats:<tool>`, `notes` or `apps`; stable across scans. */
  path: string;
  name: string;
  kind: "folder" | "chats" | "notes" | "apps";
  /** Conversations per tool, such as { "Claude Code": 40, Codex: 3 }. */
  tools: Record<string, number>;
  /** Conversations, note files or apps, by kind. */
  sessions: number;
  lastAt: string;
  included: boolean;
}

/** An app and how much it is used, as far as the system records it. */
export interface AppUse {
  name: string;
  /** Days it was used in the last 30. */
  days?: number;
  /** Times it was opened in all. */
  uses?: number;
  /** Minutes it was in front. */
  minutes?: number;
  lastUsedAt?: string;
}

/** What the mini-me found on the computer before reading anything closely. */
export interface Scan {
  scannedAt: string;
  aiTools: string[];
  /** Used most first. */
  apps: AppUse[];
  projects: ScanProject[];
  sessionsTotal: number;
  firstAt?: string;
  lastAt?: string;
  /** Tools whose records exist but could not be read, with why. */
  unreadable?: { tool: string; reason: string }[];
}

export interface MinimeState {
  scan?: Scan;
  candidates: Candidate[];
  /** The few lines the first run asks about; the rest wait for later. */
  spotlight: string[];
  /** What the records could not show, for questions later. */
  unknown: string[];
  draftedAt?: string;
  /** How often the person said an answer was like them, and how often they fixed it. */
  likeMe?: { yes: number; no: number };
}

/** One line of progress while the draft is made, streamed to the screen as NDJSON. */
export type DraftEvent =
  | {
      type: "progress";
      step: "reading" | "picked" | "writing";
      count?: number;
      total?: number;
    }
  | { type: "done"; state: MinimeState }
  | { type: "error"; message: string };

export interface AskAnswer {
  answer: string;
  /** Candidate ids the answer leaned on. */
  linesUsed: string[];
  /** True when the honest answer is "I would ask the person". */
  wouldAsk: boolean;
}

export const EMPTY_STATE: MinimeState = {
  candidates: [],
  spotlight: [],
  unknown: [],
};
