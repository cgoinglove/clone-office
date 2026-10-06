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
