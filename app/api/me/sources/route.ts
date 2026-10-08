import * as z from "zod";
import { isExcluded, loadExcludes } from "@/features/minime/server/exclude";
import { refuse } from "@/features/minime/server/guard";
import { saveExcludes } from "@/features/minime/server/leave-out";
import { findPlaces, publicPlace } from "@/features/minime/server/places";

/** How a left-out entry is shown: a path by its last folder, a name pattern as it is. */
function entryName(pattern: string): string {
  const parts = pattern.replaceAll("\\", "/").split("/").filter(Boolean);
  return parts.at(-1) ?? pattern;
}

// Where the person's work lives (server/places.ts: the folders they changed lately and worked in
// with their AI tools), each marked when they keep it out, and what else they keep out, so the
// screen can offer the folders to read before anything is read and change them at any time after.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const excludes = loadExcludes();
  const folders = (await findPlaces()).map((place) => ({
    ...publicPlace(place),
    excluded: isExcluded(place.path, excludes),
  }));
  const others = excludes
    .filter((pattern) => !folders.some((folder) => folder.path === pattern))
    .map((pattern) => ({ pattern, name: entryName(pattern) }));
  return Response.json({ folders, exclude: excludes, others });
}

const Body = z.object({
  exclude: z.array(z.string().trim().min(1).max(500)).max(200),
});

// Saves the folders the person keeps out (the rest of settings.json is kept as it is), and removes
// at once what the search index holds from them. A folder taken back in is walked again, so what
// it holds is there for the next reading.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => ({})));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const before = loadExcludes();
  const exclude = await saveExcludes(body.data.exclude);
  if (before.some((pattern) => !exclude.includes(pattern)))
    void findPlaces({ fresh: true });
  return Response.json({ exclude });
}
