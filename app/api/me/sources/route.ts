import { readFile } from "node:fs/promises";
import * as z from "zod";
import { atomicWrite } from "@/features/minime/memory/files";
import {
  isExcluded,
  loadExcludes,
  settingsPath,
} from "@/features/minime/server/exclude";
import { refuse } from "@/features/minime/server/guard";
import { projectDirs } from "@/features/minime/server/sources/claude-code";
import {
  folderName,
  isNoise,
  projectRoot,
} from "@/features/minime/server/sources/common";

const DAY = 24 * 60 * 60 * 1000;

// The folders the person worked in most lately (from their AI tools' records), each marked when
// they keep it out, so the first screen can offer "leave this out" before anything is read.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const since = Date.now() - 14 * DAY;
  const excludes = loadExcludes();
  const counts = new Map<string, number>();
  for (const dir of await projectDirs().catch(() => [])) {
    const root = projectRoot(dir.cwd);
    if (isNoise(root)) continue;
    const recent = dir.files.filter((file) => file.mtimeMs >= since).length;
    if (recent) counts.set(root, (counts.get(root) ?? 0) + recent);
  }
  const folders = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, sessions]) => ({
      path,
      name: folderName(path),
      sessions,
      excluded: isExcluded(path, excludes),
    }));
  return Response.json({ folders, exclude: excludes });
}

const Body = z.object({ exclude: z.array(z.string().min(1)).max(200) });

// Saves the folders the person keeps out; the rest of settings.json is kept as it is.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "Bad request." }, { status: 400 });
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    // No settings yet.
  }
  await atomicWrite(
    settingsPath(),
    JSON.stringify(
      { ...settings, exclude: [...new Set(body.data.exclude)] },
      null,
      2,
    ),
  );
  return Response.json({ exclude: body.data.exclude });
}
