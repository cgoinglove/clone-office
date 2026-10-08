// The mini-me's routes read the person's records and spend their Claude usage, so they answer only
// this app's own pages: a request must carry our header and come from the same origin. A web page
// elsewhere cannot add the header without a CORS preflight, which these routes never grant.

export const MINIME_HEADER = "x-clone-office";

export function refuse(request: Request): Response | undefined {
  if (request.headers.get(MINIME_HEADER) !== "1") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  // Compare with the Host header the browser sent: the server may know itself by another name
  // (localhost rather than 127.0.0.1), so `request.url` is not a safe reference.
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host && new URL(origin).host !== host) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  return undefined;
}
