// A first draft of the person's card for their office, so they correct a line instead of writing
// it from nothing (product 2.2): what they do and look after, in a line, so a colleague's mini-me
// knows when to come to them. The mini-me writes it from what it knows of them and their recent
// conversations; nothing is shared until the person joins with the line they settled on.

import { runSession } from "../brain/session.ts";

export const CARD_SCHEMA = {
  type: "object",
  properties: { description: { type: "string" } },
  required: ["description"],
};

export const CARD_PROMPT = `Your person is joining their team's office, where colleagues' mini-mes find whom to ask by each person's card. Draft the one line on their card: what they do and what they look after, so a colleague's mini-me knows when to come to them. Use what you know of them and their recent conversations (search them). Write it in their language, in plain words, at most about 100 characters, in the first person as they would put it. Leave out anything private and anything they would be surprised to see shared.`;

export async function draftCard(
  language?: string,
): Promise<string | undefined> {
  const result = await runSession({
    prompt: CARD_PROMPT,
    jsonSchema: CARD_SCHEMA,
    language,
    maxTurns: 8,
    purpose: "card",
  });
  const draft = (result.structured as { description?: string } | undefined)
    ?.description;
  return result.ok && draft?.trim() ? draft.trim().slice(0, 200) : undefined;
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

export const MENU_PROMPT = `Your person is setting out the kinds of request their colleagues' mini-mes can bring them, so those know what to ask for. Draft three to five, from what you know of them, their recent conversations (search them) and requests they have answered: what colleagues actually come to them for. For each: a name of a few words; a description saying what it is and what the one asking should include; up to two short examples as a colleague would ask; and how much you may do alone — auto for information that is theirs to give and binds them to nothing (how their part works, where something is), ask for anything that commits them (a date, money, scope, taking on work), a review of work in their field, or that speaks for them outside the team, and tell for the rest. Write in their language, in plain words.`;

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
