import { homedir } from "node:os";
import { refuse } from "@/features/minime/server/guard";
import { minimeHome } from "@/features/minime/server/paths";
import { storedFiles } from "@/features/minime/server/stored";

// Every file the mini-me keeps, with the text of each text file, read fresh each time.
export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const home = minimeHome();
  const user = homedir();
  return Response.json({
    home: home.startsWith(user) ? `~${home.slice(user.length)}` : home,
    files: await storedFiles(home),
  });
}
