// The app's own server: the npm package's standalone Next.js server, carried inside the desktop app
// (desktop/build.mjs) and started as the launcher starts it (bin/clone-office.mjs), with Electron's
// own Node in place of the person's. Everything it starts with the same executable (the clone's tool
// server, the relay, the folder walk) inherits ELECTRON_RUN_AS_NODE and runs as Node too
// (features/minime/server/desktop.ts). A channel stays open between the two: the server asks the
// app what only the app can do, and ends when the app does.

import { spawn } from "node:child_process";
import { join } from "node:path";
import { HOST, ours } from "./home.mjs";

/** The environment the server runs in: this process's (its PATH taken from the login shell), and its own. */
export function serverEnv({ base = process.env, port, appDir }) {
  const env = {
    ...base,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: HOST,
    CLONE_OFFICE_APP_DIR: appDir,
    CLONE_OFFICE_DESKTOP: "1",
  };
  // Options meant for the person's own Node are not for the app's.
  delete env.NODE_OPTIONS;
  return env;
}

/** Starts the server; its output goes to `log` line by line. */
export function startServer({
  execPath = process.execPath,
  appDir,
  port,
  base,
  log = () => {},
  run = spawn,
}) {
  const child = run(execPath, [join(appDir, "app", "server.js")], {
    cwd: join(appDir, "app"),
    env: serverEnv({ base, port, appDir }),
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.setEncoding("utf8");
    let rest = "";
    stream?.on("data", (text) => {
      const lines = (rest + text).split("\n");
      rest = lines.pop() ?? "";
      for (const line of lines) if (line.trim()) log(line);
    });
  }
  return child;
}

/** Waits until the server answers as this app, or it stops, or the time is up. */
export async function waitUntilUp(child, port, ms = 60_000, answers = ours) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (child.exitCode !== null || child.signalCode !== null) return false;
    if (await answers(port)) return true;
    await new Promise((done) => setTimeout(done, 300));
  }
  return false;
}

/** Stops the server: asked first, then made to, so quitting never waits long. */
export function stopServer(child, ms = 5000) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, ms);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
