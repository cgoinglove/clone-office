// The person's ME.md: how to work with them, as AGENTS.md says how to work in a repository. Its
// shared part is their card: who they are and what they look after, the lines on how to work with
// them that they added one by one (the mini-me drafts them from what it knows; only the lines the
// person adds are kept), and the requests they take. The file is written from the card whenever it
// changes, so they, and anyone they hand it to, read it as it stands.

import { join } from "node:path";
import { atomicWrite } from "../memory/files.ts";
import { minimeHome } from "../server/paths.ts";
import type { Card } from "./client.ts";
import type { MenuItem } from "./menu.ts";

export function mePath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "ME.md");
}

export function meMarkdown(card: Card, menu: MenuItem[]): string {
  const lines = [`# ${card.name}`, ""];
  if (card.description) lines.push(card.description, "");
  if (card.howToWork?.length)
    lines.push(
      "## How to work with me",
      "",
      ...card.howToWork.map((line) => `- ${line}`),
      "",
    );
  if (menu.length)
    lines.push(
      "## What you can ask me for",
      "",
      ...menu.map(
        (item) =>
          `- **${item.name}**${item.description ? `: ${item.description}` : ""}`,
      ),
      "",
    );
  lines.push(
    "---",
    "",
    `Written by sub-office from ${card.name}'s card; ${card.name} added every line.`,
    "",
  );
  return lines.join("\n");
}

export async function writeMe(card: Card, menu: MenuItem[]): Promise<void> {
  await atomicWrite(mePath(), meMarkdown(card, menu));
}
