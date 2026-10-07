// An invite waiting to be used: `npx sub-office join <invite link>` keeps the link in
// `settings.json` (`invite`) and starts the app, whose first steps (or Settings › Office) offer to
// join with it. Joining or opening an office uses it up.

import { readFile } from "node:fs/promises";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import { parseInvite } from "./invite.ts";

export interface PendingInvite {
  link: string;
  /** Who sent it, as the link names them. */
  from?: string;
}

async function readAll(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function readInvite(): Promise<PendingInvite | undefined> {
  const kept = (await readAll()).invite as { link?: unknown } | undefined;
  const link = typeof kept?.link === "string" ? kept.link : "";
  if (!parseInvite(link)) return undefined;
  const from = new URL(link).searchParams.get("from")?.trim().slice(0, 80);
  return { link, ...(from ? { from } : {}) };
}

export async function clearInvite(): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readAll();
    if (!("invite" in settings)) return;
    delete settings.invite;
    await writeSettings(`${JSON.stringify(settings, null, 2)}\n`);
  });
}
