import { readFile } from "node:fs/promises";
import { loadOffice, problemCode, task } from "@/features/minime/office/client";
import { takeFiles } from "@/features/minime/office/files";
import { refuse } from "@/features/minime/server/guard";

// A file that went with a request, for the person to save from their page: the copy taken onto
// this computer, taken now if it was not yet. It is a colleague's file, so it is only ever saved,
// never shown here as a page.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const url = new URL(request.url);
  const id = url.searchParams.get("task") ?? "";
  const file = url.searchParams.get("id") ?? "";
  if (!/^[\w-]{1,80}$/.test(id) || !/^[\w-]{4,64}$/.test(file))
    return Response.json({ error: "bad-request" }, { status: 400 });
  const office = await loadOffice();
  if (!office)
    return Response.json({ error: "not-in-office" }, { status: 409 });
  try {
    const ref = (await task(office, id)).history
      .flatMap((message) => message.files ?? [])
      .find((one) => one.id === file);
    if (!ref) return Response.json({ error: "file-missing" }, { status: 404 });
    const [taken] = await takeFiles(office, id, [ref]);
    return new Response(new Uint8Array(await readFile(taken.path)), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ref.name)}`,
        "content-security-policy": "sandbox",
        "x-content-type-options": "nosniff",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: problemCode(error) }, { status: 502 });
  }
}
