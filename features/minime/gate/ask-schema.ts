// What the tool server may ask the person through the gate route (app/api/me/gate): one of the
// clone's own questions, or a tool it may not use without asking. Kept apart from the route so
// what it lets through is tested; a field left out here never reaches the person.

import * as z from "zod";

/** The longest reason a question carries under it (gate/tools.ts cuts it there too). */
export const WHY_CHARS = 280;

export const AskSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("question"),
    question: z.string().min(1).max(2000),
    choices: z.array(z.string().min(1).max(200)).max(4).optional(),
    // what the clone checked that bears on it, shown under the question
    why: z.string().min(1).max(WHY_CHARS).optional(),
  }),
  z.object({
    kind: z.literal("permission"),
    tool: z.string().min(1).max(100),
    input: z.record(z.string(), z.unknown()),
  }),
]);
