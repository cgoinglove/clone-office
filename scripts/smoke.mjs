// Does the package start for a person on this system? What they do, with nothing of theirs
// touched: `npx clone-office` from the package (scripts/pack.mjs), in a folder of its own, then
// the app's own ping and its first page. CI runs it on Linux, macOS and Windows
// (.github/workflows/ci.yml), after Hermes Agent's install tests.
//
//   node scripts/smoke.mjs [path/to/clone-office-<version>.tgz]

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const windows = process.platform === "win32";
const given = process.argv[2];
const found = readdirSync("dist")
  .filter((name) => /^clone-office-.+\.tgz$/.test(name))
  .sort();
const tgz = resolve(given ?? join("dist", found.at(-1) ?? ""));
if (!given && !found.length) {
  console.error("No dist/clone-office-*.tgz: run node scripts/pack.mjs first.");
  process.exit(1);
}

const place = mkdtempSync(join(tmpdir(), "clone-office-smoke-"));
const port = 4917;
const base = `http://127.0.0.1:${port}`;
// Every folder the app reads or keeps, inside the trial's own: no record of whoever runs it.
const env = {
  ...process.env,
  CLONE_OFFICE_HOME: join(place, "home"),
  CLAUDE_CONFIG_DIR: join(place, "claude"),
  CODEX_HOME: join(place, "codex"),
  HERMES_HOME: join(place, "hermes"),
  npm_config_cache: join(place, "npm-cache"),
};
const args = [
  "-y",
  `--package=${tgz}`,
  "clone-office",
  "--no-open",
  "--port",
  String(port),
];
console.log(`==> npx ${args.join(" ")}`);
// npx is a .cmd on Windows, which Node starts only through a shell.
const app = spawn(
  windows ? `npx ${args.map((arg) => `"${arg}"`).join(" ")}` : "npx",
  windows ? [] : args,
  { cwd: place, env, shell: windows, detached: !windows },
);
let output = "";
for (const stream of [app.stdout, app.stderr])
  stream.on("data", (chunk) => {
    output += chunk;
    process.stdout.write(chunk);
  });
let exited = null;
app.on("exit", (code) => {
  exited = code ?? -1;
});

function stop() {
  if (exited !== null) return;
  if (windows)
    spawnSync("taskkill", ["/pid", String(app.pid), "/T", "/F"], {
      stdio: "ignore",
    });
  else
    try {
      process.kill(-app.pid, "SIGTERM");
    } catch {}
}

async function ask(path, headers = {}) {
  try {
    const response = await fetch(`${base}${path}`, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    return { status: response.status, text: await response.text() };
  } catch {
    return null;
  }
}

let ok = false;
let reason = "it did not answer within five minutes";
const until = Date.now() + 5 * 60_000;
while (Date.now() < until) {
  if (exited !== null) {
    reason = `it stopped (exit ${exited}) before it answered`;
    break;
  }
  const ping = await ask("/api/me/ping", { "x-clone-office": "1" });
  if (ping?.status === 200 && JSON.parse(ping.text).app === "clone-office") {
    // The front door sends someone new to the first steps.
    const front = await ask("/");
    const page = await ask("/start");
    ok =
      Boolean(front) &&
      [200, 307, 308].includes(front.status) &&
      page?.status === 200 &&
      page.text.includes("Clone Office");
    reason = ok
      ? ""
      : `the pages did not come (/ ${front?.status}, /start ${page?.status})`;
    break;
  }
  await new Promise((done) => setTimeout(done, 2000));
}

stop();
await new Promise((done) => setTimeout(done, 1500));
rmSync(place, { recursive: true, force: true, maxRetries: 3 });
if (!ok) {
  console.error(`\nNot working on ${process.platform}: ${reason}.`);
  if (!output.trim()) console.error("It printed nothing.");
  process.exit(1);
}
console.log(
  `\nWorks on ${process.platform}: it starts and opens its first steps.`,
);
process.exit(0);
