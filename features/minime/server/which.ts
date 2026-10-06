// Finds a command the way a shell would, including the endings Windows adds (.exe, .cmd, …).

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export function findOnPath(
  command: string,
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const endings =
    platform === "win32"
      ? (env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
      : [""];
  // Windows keeps the variable as "Path"; the lookup there ignores case.
  const path =
    env.PATH ??
    Object.entries(env).find(([key]) => key.toLowerCase() === "path")?.[1] ??
    "";
  for (const dir of path.split(platform === "win32" ? ";" : delimiter)) {
    if (!dir) continue;
    for (const ending of endings) {
      const candidate = join(dir, command + ending.toLowerCase());
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}
