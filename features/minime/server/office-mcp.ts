// The office's tools as the AI apps the person added them to start them (bin/ai-apps.mjs): a copy
// of the package's server in the clone's own folder, so an app never points at a file an update
// took away. When the app starts after an update, that copy is brought up to date with the
// package's own, so every app asks with the newer tools without being added again.

import { copyFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { appDir, minimeHome } from "./paths.ts";

export async function refreshOfficeMcp(): Promise<void> {
  const kept = join(
    /*turbopackIgnore: true*/ minimeHome(),
    "mcp",
    "office.mjs",
  );
  const bundled = join(
    /*turbopackIgnore: true*/ appDir(),
    "dist",
    "office-mcp.mjs",
  );
  const [was, now] = await Promise.all([
    readFile(kept).catch(() => undefined),
    readFile(bundled).catch(() => undefined),
  ]);
  // Only a copy some app already uses, and only when the package has its own.
  if (!was || !now || was.equals(now)) return;
  await copyFile(bundled, kept);
}
