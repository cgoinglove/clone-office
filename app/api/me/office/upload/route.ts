import {
  loadOffice,
  OfficeError,
  problemCode,
  putFile,
} from "@/features/minime/office/client";
import { SEND_BYTES } from "@/features/minime/office/files";
import { refuse } from "@/features/minime/server/guard";

// A file the person picked on their page to send with a request: put at the relay as it is, to be
// named on the request that goes next. They chose it themselves, so no card asks about it.
export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const size = Number(request.headers.get("content-length") ?? 0);
  if (size > SEND_BYTES)
    return Response.json({ error: "file-too-large" }, { status: 413 });
  const office = await loadOffice();
  if (!office)
    return Response.json({ error: "not-in-office" }, { status: 409 });
  let name = "file";
  try {
    name = decodeURIComponent(request.headers.get("x-file-name") ?? "file");
  } catch {
    // Not encoded as asked: it keeps a plain name.
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > SEND_BYTES)
    return Response.json(
      { error: bytes.byteLength ? "file-too-large" : "bad-request" },
      { status: 400 },
    );
  try {
    const type = (request.headers.get("content-type") ?? "").split(";")[0];
    return Response.json({
      file: await putFile(office, {
        name,
        type: type || "application/octet-stream",
        bytes,
      }),
    });
  } catch (error) {
    return Response.json(
      { error: problemCode(error) },
      { status: error instanceof OfficeError ? 400 : 502 },
    );
  }
}
