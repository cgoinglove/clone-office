// The clone's folder and the app's address in it, decided as the npm launcher decides them
// (bin/clone-office.mjs) and the server itself (features/minime/server/paths.ts): the desktop app
// keeps nothing of the clone's anywhere else, and opens the app already running for that folder
// rather than starting a second one.

import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

export const HOST = "127.0.0.1";
/** The launcher's first port, so the app answers where a person used to find it. */
export const FIRST_PORT = 4417;

/**
 * The clone's folder: CLONE_OFFICE_HOME when set (an empty value counts as none), a ~/.sub-office
 * kept before the app was named Clone Office while it is there, else ~/.clone-office.
 */
export function appHome(
  env = process.env,
  home = homedir(),
  exists = existsSync,
) {
  const moved = env.CLONE_OFFICE_HOME || env.SUB_OFFICE_HOME;
  if (moved) return moved;
  const before = join(home, ".sub-office");
  return exists(join(before, "settings.json"))
    ? before
    : join(home, ".clone-office");
}

/**
 * The port the app for this folder answers on: the one app.json names (written by the server as it
 * starts), while the process that wrote it still runs.
 */
export function lastPort(folder, read = readFileSync, alive = isAlive) {
  try {
    const { url, pid } = JSON.parse(read(join(folder, "app.json"), "utf8"));
    const port = Number(new URL(url).port);
    return Number.isInteger(port) && port > 0 && port < 65536 && alive(pid)
      ? port
      : undefined;
  } catch {
    return undefined;
  }
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // Running as someone else: alive all the same.
    return error?.code === "EPERM";
  }
}

/** Whether nothing listens on the port here. */
export function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
}

/** Whether this app answers on the port (its own routes answer only its own header). */
export async function ours(port, ms = 1500) {
  try {
    const response = await fetch(`http://${HOST}:${port}/api/me/ping`, {
      headers: { "x-clone-office": "1" },
      signal: AbortSignal.timeout(ms),
    });
    return response.ok && (await response.json()).app === "clone-office";
  } catch {
    return false;
  }
}

/**
 * Where the app is or is to be: the port of the one already answering for this folder (started
 * with the computer by npm's service, say), else the first free port from the launcher's (or from
 * `first`, as the launcher's --port gives it). An app on another port is another folder's (a second
 * person's CLONE_OFFICE_HOME), and is passed by.
 */
export async function findApp(
  folder,
  {
    first = FIRST_PORT,
    free: isFree = free,
    ours: answers = ours,
    last = () => lastPort(folder),
  } = {},
) {
  const running = last();
  if (running && (await answers(running)))
    return { port: running, running: true };
  let port = first;
  while (!(await isFree(port))) port += 1;
  return { port, running: false };
}

/** The port asked for with --port, as the launcher takes it; none when not a port. */
export function askedPort(argv = process.argv) {
  const at = argv.indexOf("--port");
  const port = at >= 0 ? Number(argv[at + 1]) : Number.NaN;
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}
