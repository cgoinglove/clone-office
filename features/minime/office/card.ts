// A first draft of the person's card for their office, so they correct a line instead of writing
// it from nothing (product 2.2): what they do, what they look after and the tools they work in, so a
// colleague's clone knows when to come to them. The mini-me writes it from what it knows of them and their recent
// conversations; nothing is shared until the person joins with the line they settled on.

import { runSession } from "../brain/session.ts";
import { cleanAbout } from "../server/profile.ts";

export const CARD_SCHEMA = {
  type: "object",
  properties: {
    description: { type: "string" },
    owns: { type: "array", items: { type: "string" }, maxItems: 4 },
    tools: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["description", "owns", "tools"],
};

/** What a teammate would read about the person, as both the first reading and a draft ask it. */
export const ABOUT_WORDS = `\`description\` is the one line on their card: what they do, as they would put it ("Backend developer on the payments team", "Freelance illustrator"), at most about 100 characters. \`owns\` is up to four things they look after that colleagues would come to them for: a system, a product area, a kind of work ("payments API", "Android releases", "client contracts"), never a task in progress or its status. \`tools\` is up to six tools they work in every day, by name (apps, services, AI tools). Only what you can see clearly; leave a list empty rather than guess.`;

export const CARD_PROMPT = `Your person's colleagues, and their clones, find whom to ask by each person's card. Draft what goes on theirs, from what you know of them and their recent conversations (search them). ${ABOUT_WORDS} Write in their language, in plain words, in the first person for the line. Leave out anything private and anything they would be surprised to see shared.`;

export interface CardDraft {
  description: string;
  owns: string[];
  tools: string[];
}

export async function draftCard(
  language?: string,
): Promise<CardDraft | undefined> {
  const result = await runSession({
    prompt: CARD_PROMPT,
    jsonSchema: CARD_SCHEMA,
    language,
    maxTurns: 8,
    purpose: "card",
  });
  if (!result.ok) return undefined;
  const about = cleanAbout({
    ...(result.structured as Record<string, unknown> | undefined),
    role: (result.structured as { description?: unknown } | undefined)
      ?.description,
  });
  return about
    ? { description: about.role, owns: about.owns, tools: about.tools }
    : undefined;
}

export const WAYS_SCHEMA = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["lines"],
};

export const WAYS_PROMPT = `Your person's colleagues, and their clones, read your person's card to know how to work with them: their ME.md, as AGENTS.md says how to work in a repository. Draft up to five lines for "how to work with me", from what you know of them (your memory, your notes, their past conversations, which you can search) and the requests they take: how they like to be asked (what to include, in what form), when to expect an answer, what they decide on their own and what to bring them early, what they do not take on. Only what helps a colleague work with them: never anything private (health, family, money, personal plans or goals), nothing about other people, and nothing that changes (projects, their status, dates). Each one line, in their language, in the first person, as they would put it. When you know too little, give fewer lines, or none.`;

/** Lines for how to work with the person, for them to add one by one or leave out. */
export async function draftWays(language?: string): Promise<string[]> {
  const result = await runSession({
    prompt: WAYS_PROMPT,
    jsonSchema: WAYS_SCHEMA,
    language,
    maxTurns: 10,
    purpose: "card",
  });
  const lines = (result.structured as { lines?: unknown[] } | undefined)?.lines;
  return result.ok && Array.isArray(lines)
    ? lines
        .filter((line): line is string => typeof line === "string")
        .map((line) => line.trim().slice(0, 240))
        .filter(Boolean)
        .slice(0, 5)
    : [];
}

export const MENU_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          examples: { type: "array", items: { type: "string" } },
          trust: { type: "string", enum: ["auto", "tell", "ask"] },
        },
        required: ["name", "description", "trust"],
      },
    },
  },
  required: ["items"],
};

export const MENU_PROMPT = `Your person is setting out the kinds of request their colleagues' clones can bring them, so those know what to ask for. Draft three to five, from what you know of them, their recent conversations (search them) and requests they have answered: what colleagues actually come to them for. For each: a name of a few words; a description saying what it is and what the one asking should include; up to two short examples as a colleague would ask; and how much you may do alone — auto for information that is theirs to give and binds them to nothing (how their part works, where something is), ask for anything that commits them (a date, money, scope, taking on work), a review of work in their field, or that speaks for them outside the team, and tell for the rest. Write in their language, in plain words.`;

/** A first menu, for the person to correct rather than write from nothing. */
export async function draftMenu(language?: string): Promise<unknown[]> {
  const result = await runSession({
    prompt: MENU_PROMPT,
    jsonSchema: MENU_SCHEMA,
    language,
    maxTurns: 10,
    purpose: "card",
  });
  const items = (result.structured as { items?: unknown[] } | undefined)?.items;
  return result.ok && Array.isArray(items) ? items : [];
}
