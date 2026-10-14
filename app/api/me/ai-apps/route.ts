import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { nodeEnv } from "@/features/minime/server/desktop";
import { refuse } from "@/features/minime/server/guard";
import { appDir, minimeHome } from "@/features/minime/server/paths";

// Asking colleagues from the AI apps the person works in, from Settings › Office: the launcher's
// own `mcp` command (bin/ai-apps.mjs), run as `npx clone-office mcp …` would, so there is one way
// to do it. The apps are listed with whether each is on this computer and has the office's tools.

interface App {
  id: string;
  name: string;
  mark: string;
  present: boolean;
  added: boolean;
}

interface Result {
  ok: boolean;
  apps?: App[];
  message?: string;
}

function mcp(args: string[]): Promise<Result> {
  const file = join(
    /*turbopackIgnore: true*/ appDir(),
    "bin",
    "clone-office.mjs",
  );
  if (!existsSync(file))
    return Promise.resolve({ ok: false, message: "no-launcher" });
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [file, "mcp", ...args, "--json"],
      {
        timeout: 40_000,
        env: { ...process.env, ...nodeEnv(), CLONE_OFFICE_HOME: minimeHome() },
      },
      (_error, stdout) => {
        try {
          resolve(JSON.parse(String(stdout).trim().split("\n").at(-1) ?? ""));
        } catch {
          resolve({ ok: false, message: "mcp-failed" });
        }
      },
    );
  });
}

export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const result = await mcp(["list"]);
  return Response.json({ apps: result.apps ?? [] });
}

const Body = z.object({
  action: z.enum(["add", "remove"]),
  id: z.enum(["claude-desktop", "claude-code", "codex", "cursor", "gemini"]),
});

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  const result = await mcp([body.data.action, body.data.id]);
  if (!result.ok)
    return Response.json(
      { error: result.message ?? "mcp-failed" },
      { status: 500 },
    );
  return Response.json({ apps: (await mcp(["list"])).apps ?? [] });
}
