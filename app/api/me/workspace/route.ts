import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { refuse } from "@/features/minime/server/guard";
import { workspaceDir } from "@/features/minime/server/paths";

/** The largest file the page opens from the workspace. */
const MAX_BYTES = 25 * 1024 * 1024;

const TYPES: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".tsv": "text/tab-separated-values; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

// A file the clone made in its workspace (hands/shell.ts), for the page that shows it (/files/…).
// Only inside the workspace, links leading out of it refused; always as an attachment and sandboxed,
// so a page the clone wrote can never run as this app, even when opened by its address.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const asked = new URL(request.url).searchParams.get("path") ?? "";
  const workspace = workspaceDir();
  const path = resolve(workspace, asked);
  const rel = relative(workspace, path);
  if (!asked || !rel || rel.startsWith("..") || isAbsolute(rel))
    return Response.json({ error: "not-found" }, { status: 404 });
  const [real, root] = await Promise.all([
    realpath(path).catch(() => undefined),
    realpath(workspace).catch(() => workspace),
  ]);
  if (!real || !real.startsWith(root + sep))
    return Response.json({ error: "not-found" }, { status: 404 });
  const info = await stat(real).catch(() => undefined);
  if (!info?.isFile())
    return Response.json({ error: "not-found" }, { status: 404 });
  if (info.size > MAX_BYTES)
    return Response.json({ error: "file-too-large" }, { status: 413 });
  const name = rel.split(sep).at(-1) ?? "file";
  return new Response(new Uint8Array(await readFile(real)), {
    headers: {
      "content-type":
        TYPES[extname(real).toLowerCase()] ?? "application/octet-stream",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
    },
  });
}
