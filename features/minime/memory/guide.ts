// The app's guide for the person using it (`guide/` at the repository root), which the mini-me
// reads when an answer depends on how Clone Office works, the way Claude Code reads its own
// documentation. It is read-only to the mini-me; a change the person would
// notice updates `guide/` in the same change (AGENTS.md).

import { join } from "node:path";
import { readText } from "./files.ts";

const FILE = /^[a-z][a-z-]*\.md$/;

export const GUIDE_TOOL = {
  name: "guide_read",
  description:
    "How Clone Office works for your person: what you can do for them now, what you keep and never keep, what you read from their computer and how they leave something out, what to do when something fails. Read index.md first, then the one file that covers the question; answer from it rather than from what you assume, in a sentence or two.",
  inputSchema: {
    type: "object",
    properties: {
      file: {
        type: "string",
        description: "A guide file such as 'memory.md'; omit for index.md.",
      },
    },
  },
} as const;

/** One guide file's text, or an error naming what exists. */
export async function readGuide(
  dir: string,
  file = "index.md",
): Promise<{ file: string; content: string } | { error: string }> {
  const name = file.trim() || "index.md";
  if (!FILE.test(name))
    return {
      error: `No guide file '${name}'. Start with index.md, which lists the others.`,
    };
  const read = await readText(join(/*turbopackIgnore: true*/ dir, name));
  if (!read.exists)
    return {
      error: `No guide file '${name}'. Start with index.md, which lists the others.`,
    };
  return { file: name, content: read.raw };
}
