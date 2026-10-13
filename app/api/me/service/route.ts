import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import * as z from "zod";
import { askDesktop, inDesktop } from "@/features/minime/server/desktop";
import { refuse } from "@/features/minime/server/guard";
import { appDir } from "@/features/minime/server/paths";

// Starting with the computer, from Settings › General: the launcher's own `service` command
// (bin/service.mjs), run as `npx clone-office service …` would, so there is one way to do it.
// Inside the desktop app it is the app's own login item instead, which only the app can set
// (server/desktop.ts, desktop/src/login-item.mjs).

interface Result {
  ok: boolean;
  installed?: boolean;
  loaded?: boolean;
  message?: string;
}

/** The launcher of the package this app runs from; none in a checkout of the repository. */
function launcher(): string | undefined {
  const root = appDir();
  const file = join(/*turbopackIgnore: true*/ root, "bin", "clone-office.cjs");
  return existsSync(file) &&
    existsSync(join(/*turbopackIgnore: true*/ root, "app", "server.js"))
    ? file
    : undefined;
}

function service(action: "install" | "uninstall" | "status"): Promise<Result> {
  const file = launcher();
  if (!file) return Promise.resolve({ ok: false, message: "no-build" });
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [file, "service", action, "--json"],
      { timeout: 30_000, env: process.env },
      (_error, stdout) => {
        try {
          resolve(JSON.parse(String(stdout).trim().split("\n").at(-1) ?? ""));
        } catch {
          resolve({ ok: false, message: "service-failed" });
        }
      },
    );
  });
}

/** The desktop app's login item: whether it is on, after setting it when asked to. */
function loginItem(
  on?: boolean,
): Promise<{ ok: boolean; on: boolean } | undefined> {
  return askDesktop<{ ok: boolean; on: boolean }>(
    "login-item",
    on === undefined ? {} : { on },
  );
}

export async function GET(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  if (inDesktop()) {
    const item = await loginItem();
    return Response.json(
      item ? { available: true, on: item.on } : { available: false, on: false },
    );
  }
  if (!launcher()) return Response.json({ available: false, on: false });
  const status = await service("status");
  return Response.json({
    available: true,
    on: Boolean(status.installed && status.loaded),
  });
}

const Body = z.object({ on: z.boolean() });

export async function POST(request: Request) {
  const refused = refuse(request);
  if (refused) return refused;
  const body = Body.safeParse(await request.json().catch(() => undefined));
  if (!body.success)
    return Response.json({ error: "bad-request" }, { status: 400 });
  if (inDesktop()) {
    const item = await loginItem(body.data.on);
    if (!item?.ok || item.on !== body.data.on)
      return Response.json({ error: "login-item-failed" }, { status: 500 });
    return Response.json({ on: item.on });
  }
  const result = await service(body.data.on ? "install" : "uninstall");
  if (!result.ok)
    return Response.json({ error: "service-failed" }, { status: 500 });
  return Response.json({ on: body.data.on });
}
