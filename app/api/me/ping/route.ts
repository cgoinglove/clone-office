import { refuse } from "@/features/minime/server/guard";

// Answers this app's own header only, so the npm launcher can tell that the app it started (or one
// already running on the port) is up, without reading anything.
export function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  return Response.json({ app: "sub-office" });
}
