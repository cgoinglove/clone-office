#!/usr/bin/env node
// sub-office from npm: start the app on this computer, or a relay for a team.
//
//   npx sub-office              the app, at http://127.0.0.1:<port>/me, opened in the browser
//   npx sub-office relay [...]  a relay for an office (--port, --host, --database, --key)
//
// The app listens on this computer only. Its port is the first free one from 4417, unless
// --port says otherwise; --no-open leaves the browser alone. When the app is already running on
// that port, it is opened instead of started twice.

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const FIRST_PORT = 4417;

const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error(
    `sub-office needs Node.js 22.13 or later; this is ${process.versions.node}. Get it from https://nodejs.org`,
  );
  process.exit(1);
}

const args = process.argv.slice(2);

if (args[0] === "relay") {
  const relay = spawn(
    process.execPath,
    ["--no-warnings", join(root, "dist", "relay.mjs"), ...args.slice(1)],
    { stdio: "inherit" },
  );
  passSignals(relay);
  relay.on("exit", (code) => process.exit(code ?? 0));
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:
  sub-office [--port <n>] [--no-open]   start the app on this computer
  sub-office relay [--port <n>] [--host <address>] [--database <postgres url | folder>] [--key <office key>]
                                        start a relay for an office`);
} else {
  await startApp();
}

function option(name) {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
}

function passSignals(child) {
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
}

function free(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, HOST, () => server.close(() => resolve(true)));
  });
}

/** Whether this app answers on the port already (its own routes answer only its own header). */
async function ours(port) {
  try {
    const response = await fetch(`http://${HOST}:${port}/api/me/ping`, {
      headers: { "x-sub-office": "1" },
      signal: AbortSignal.timeout(1500),
    });
    return response.ok && (await response.json()).app === "sub-office";
  } catch {
    return false;
  }
}

function open(url) {
  const [command, list] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(command, list, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // No browser to open: the address is printed.
  }
}

async function startApp() {
  const asked = option("--port");
  let port = asked ? Number(asked) : FIRST_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error(`Not a port: ${asked}`);
    process.exit(1);
  }
  const url = () => `http://${HOST}:${port}/me`;
  if (!(await free(port))) {
    if (await ours(port)) {
      console.log(`Your mini-me is already running at ${url()}`);
      if (!args.includes("--no-open")) open(url());
      return;
    }
    if (asked) {
      console.error(`Port ${port} is in use.`);
      process.exit(1);
    }
    while (!(await free(port))) port += 1;
  }
  const app = spawn(process.execPath, [join(root, "app", "server.js")], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: HOST,
      SUB_OFFICE_APP_DIR: root,
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  passSignals(app);
  app.on("exit", (code) => process.exit(code ?? 0));
  const deadline = Date.now() + 60_000;
  while (!(await ours(port))) {
    if (Date.now() > deadline || app.exitCode !== null) {
      console.error("The app did not start.");
      app.kill();
      process.exit(1);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  console.log(`Your mini-me is at ${url()}
It runs on this computer only. Keep this window open; press Ctrl+C to stop.`);
  if (!args.includes("--no-open")) open(url());
}
