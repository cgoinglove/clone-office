// `npx clone-office doctor`: what works and what does not on this computer, each with what to do,
// so "it doesn't work" becomes one line to act on (after OpenClaw's and Paperclip's doctor
// commands, kept small). It changes nothing and calls no AI model: Claude Code is asked whether it
// is signed in with its own `claude auth status`, and the office's relay with the member's token.

import { spawnSync } from "node:child_process";
import { accessSync, constants, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

const OK = "✓";
const WARN = "!";
const BAD = "✗";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** The person's `claude`, where the app looks for it (features/minime/server/brain.ts). */
function findClaude() {
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const names =
    process.platform === "win32"
      ? ["claude.exe", "claude.cmd", "claude"]
      : ["claude"];
  for (const dir of (process.env.PATH ?? "").split(delimiter).filter(Boolean))
    for (const name of names)
      if (existsSync(join(dir, name))) return join(dir, name);
  return [
    join(homedir(), ".local", "bin", exe),
    join(homedir(), ".claude", "local", exe),
  ].find((path) => existsSync(path));
}

async function get(url, headers = {}) {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    return {
      status: response.status,
      ok: response.ok,
      body: await response.text(),
    };
  } catch (error) {
    return { status: 0, ok: false, body: String(error?.message ?? error) };
  }
}

/** Every check, in order; each a sign, what was found, and what to do when it is not right. */
export async function doctor({ appHome, version, service }) {
  const lines = [];
  const say = (sign, text, todo) =>
    lines.push({ sign, text, ...(todo ? { todo } : {}) });

  say(OK, `Node.js ${process.versions.node}`);

  if (!existsSync(appHome))
    say(
      WARN,
      `No clone yet in ${appHome}`,
      "Start it once with `npx -y clone-office`.",
    );
  else {
    try {
      accessSync(appHome, constants.W_OK);
      say(OK, `Your clone's folder: ${appHome}`);
    } catch {
      say(
        BAD,
        `Your clone's folder cannot be written: ${appHome}`,
        "Give your user account write access to it.",
      );
    }
  }
  const settings = readJson(join(appHome, "settings.json")) ?? {};

  // The app: where it last said it answers.
  const here = readJson(join(appHome, "app.json"));
  const ping = here?.url
    ? await get(`${here.url}/api/me/ping`, { "x-clone-office": "1" })
    : undefined;
  if (ping?.ok) say(OK, `Running at ${here.url}`);
  else
    say(
      WARN,
      "Not running now: colleagues' requests wait until it is",
      "Start it with `npx -y clone-office`, or have it start with the computer: `npx -y clone-office service install`.",
    );

  // What it thinks with.
  const brain = settings.brain;
  if (brain?.kind === "api") {
    const keys = join(appHome, "brain", "keys.json");
    const signIn = join(appHome, "brain", "chatgpt.json");
    const how = brain.team
      ? "the office's team key"
      : brain.provider === "chatgpt"
        ? existsSync(signIn)
          ? "your ChatGPT sign-in"
          : undefined
        : existsSync(keys) || brain.provider === "local"
          ? brain.provider === "local"
            ? "a model on this computer"
            : "your key"
          : undefined;
    if (how)
      say(OK, `AI model: ${brain.model} (${brain.provider}), with ${how}`);
    else
      say(
        BAD,
        `AI model: ${brain.model} (${brain.provider}), with nothing to sign in with`,
        "Open Settings › AI model and sign in again or give the key.",
      );
  } else {
    const claude = findClaude();
    if (!claude)
      say(
        BAD,
        "AI model: your Claude Code, which is not installed",
        "Install it from https://claude.com/code, or pick another model in Settings › AI model.",
      );
    else {
      const status = spawnSync(claude, ["auth", "status", "--json"], {
        encoding: "utf8",
        timeout: 15_000,
        shell: process.platform === "win32" && /\.cmd$/i.test(claude),
      });
      let loggedIn;
      try {
        loggedIn = JSON.parse(status.stdout ?? "").loggedIn;
      } catch {
        loggedIn = undefined;
      }
      if (loggedIn === true)
        say(OK, `AI model: your Claude Code (${claude}), signed in`);
      else if (loggedIn === false)
        say(
          BAD,
          "AI model: your Claude Code, signed out",
          "Run `claude` in a terminal and sign in once.",
        );
      else
        say(
          WARN,
          `AI model: your Claude Code (${claude}); could not tell whether it is signed in`,
          "Run `claude` once to check.",
        );
    }
  }

  // The office.
  const office = settings.office;
  if (!office?.relay || !office?.token)
    say(
      OK,
      "No office yet: your clone works for you alone",
      "Settings › Office opens one or joins one with an invite link.",
    );
  else {
    const reach = await get(`${office.relay}/members`, {
      authorization: `Bearer ${office.token}`,
    });
    if (reach.ok)
      say(OK, `Office: ${office.relay}, reachable, you are a member`);
    else if (reach.status === 401)
      say(
        BAD,
        `Office: ${office.relay} no longer knows you`,
        "Join it again with a new invite link (Settings › Office).",
      );
    else if (reach.status === 0)
      say(
        BAD,
        `Office: ${office.relay} cannot be reached`,
        settings.host
          ? "It is opened on this computer: start the app, and colleagues must be on the same network."
          : "Check the network (a VPN can block it), or ask whoever runs the office whether it is up.",
      );
    else
      say(
        WARN,
        `Office: ${office.relay} answered ${reach.status}`,
        "Try again in a moment.",
      );
  }

  // Phone and the login item: only said, never a fault.
  if (settings.messenger?.service)
    say(
      OK,
      `Phone: ${settings.messenger.service}${settings.messenger.on === false ? " (off)" : ""}`,
    );
  const login = service("status");
  say(
    login.installed ? OK : WARN,
    login.installed
      ? "Starts with this computer"
      : "Does not start with this computer",
    login.installed
      ? undefined
      : "`npx -y clone-office service install` keeps your clone answering with no window open.",
  );

  // A newer version.
  const latest = await get("https://registry.npmjs.org/clone-office/latest");
  const newer = latest.ok ? readJsonText(latest.body)?.version : undefined;
  if (newer && newer !== version)
    say(
      WARN,
      `Clone Office ${version}; ${newer} is out`,
      "Close it and start it with `npx -y clone-office@latest`.",
    );
  else if (version) say(OK, `Clone Office ${version}`);

  return lines;
}

function readJsonText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** The checks as the terminal shows them; true when nothing is broken. */
export function printDoctor(lines) {
  for (const line of lines) {
    console.log(`${line.sign} ${line.text}`);
    if (line.todo && line.sign !== OK) console.log(`  → ${line.todo}`);
  }
  return !lines.some((line) => line.sign === BAD);
}
