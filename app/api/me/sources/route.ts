import * as z from "zod";
import { isExcluded, loadExcludes } from "@/features/minime/server/exclude";
import { recentFolders } from "@/features/minime/server/folders";
import { refuse } from "@/features/minime/server/guard";
import { saveExcludes } from "@/features/minime/server/leave-out";

const DAY = 24 * 60 * 60 * 1000;

/** How a left-out entry is shown: a path by its last folder, a name pattern as it is. */
function entryName(pattern: string): string {
  const parts = pattern.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) ?? pattern;
}

// The folders the person worked in lately (from their AI tools' records), each marked when they
// keep it out, and what else they keep out, so the screen can offer "leave this out" before
// anything is read and change it at any time after.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const excludes = loadExcludes();
  const folders = (await recentFolders(Date.now() - 14 * DAY)).map(
    (folder) => ({ ...folder, excluded: isExcluded(folder.path, excludes) }),
  );
  const others = excludes
    .filter((pattern) => !folders.some((folder) => folder.path === pattern))
    .map((pattern) => ({ pattern, name: entryName(pattern) }));
  return Response.json({ folders, exclude: excludes, others });
}

const Body = z.object({
  exclude: z.array(z.string().trim().min(1).max(500)).max(200),
});

// Saves the folders the person keeps out (the rest of settings.json is kept as it is), and removes
// at once what the search index holds from them.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  return Response.json({ exclude: await saveExcludes(body.data.exclude) });
}
