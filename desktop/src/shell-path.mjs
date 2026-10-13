// An app opened from the Dock, the Finder or a Linux menu does not inherit the PATH the person's
// shell builds (Homebrew, nvm, ~/.local/bin), so their `claude`, `codex` and `git` would not be
// found. As Orca (src/main/startup/hydrate-shell-path.ts) and VS Code do, the person's login shell
// is asked once what its PATH is, its entries put first; common places are added after, in case the
// shell is slow or prints nothing. Windows apps get the person's PATH from the system already.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter as pathDelimiter } from "node:path";

/** Marks the values in the shell's output, which profile banners and greetings surround. */
const MARK = "__CLONE_OFFICE_ENV__";

/** As long as a loaded profile can take (nvm, conda, and the like on a busy computer). */
const SHELL_MS = 10_000;

/** A terminal's colour codes, which some profiles print. */
const COLOURS = /\x1b\[[0-9;?]*[A-Za-z]/g;

/** What a login shell is asked to print: its PATH and LANG between marks. */
export function shellCommand() {
  return `printf '%s' '${MARK}'; printf '%s' "$PATH"; printf '%s' '${MARK}'; printf '%s' "$LANG"; printf '%s' '${MARK}'`;
}

/** The PATH and LANG in a login shell's output, or undefined when the marks are not all there. */
export function readShellOutput(stdout) {
  const parts = stdout.replace(COLOURS, "").split(MARK);
  if (parts.length < 4) return undefined;
  const path = parts[1].trim();
  const lang = parts[2].trim();
  return path ? { path, lang: lang || undefined } : undefined;
}

/** Asks the person's login shell; undefined when it fails, prints nothing usable or takes too long. */
export function askLoginShell({
  shell = process.env.SHELL ||
    (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash"),
  ms = SHELL_MS,
  run = spawn,
} = {}) {
  // Nushell keeps PATH as a list, which a POSIX line does not print.
  if (/(^|\/)nu$/.test(shell)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    let stdout = "";
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(value);
    };
    let child;
    try {
      child = run(shell, ["-ilc", shellCommand()], {
        // The shell's own banners and errors are not the app's.
        stdio: ["ignore", "pipe", "ignore"],
        env: { ...process.env, CLONE_OFFICE_SHELL_PROBE: "1" },
        windowsHide: true,
      });
    } catch {
      resolve(undefined);
      return;
    }
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(undefined);
    }, ms);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => finish(undefined));
    child.on("close", () => finish(readShellOutput(stdout)));
  });
}

/** Where people's tools are commonly installed, for when the shell says nothing. */
export function commonPlaces(home, platform = process.platform) {
  if (platform === "win32") return [];
  return [
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    ...(platform === "linux"
      ? ["/snap/bin", "/home/linuxbrew/.linuxbrew/bin"]
      : []),
    "/nix/var/nix/profiles/default/bin",
    join(home, ".local", "bin"),
    join(home, "bin"),
    join(home, ".claude", "local"),
    join(home, ".npm-global", "bin"),
    join(home, ".volta", "bin"),
    join(home, ".bun", "bin"),
    join(home, ".nix-profile", "bin"),
  ];
}

/**
 * The PATH to run with: the shell's entries first, in its order, then what the app was started
 * with, then the common places neither has; each once.
 */
export function mergePath(
  current = "",
  fromShell = "",
  common = [],
  delimiter = pathDelimiter,
) {
  const seen = new Set();
  const merged = [];
  for (const entry of [
    ...fromShell.split(delimiter),
    ...current.split(delimiter),
    ...common,
  ]) {
    const value = entry.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    merged.push(value);
  }
  return merged.join(delimiter);
}

/**
 * Gives this process (and so the app's server) the person's PATH, and their LANG when it has
 * none. Returns whether the shell answered, for the log.
 */
export async function takeShellPath({
  env = process.env,
  home,
  platform = process.platform,
  ask = askLoginShell,
  exists = existsSync,
} = {}) {
  if (platform === "win32") return true;
  const said = await ask();
  env.PATH = mergePath(
    env.PATH,
    said?.path,
    commonPlaces(home, platform).filter((place) => exists(place)),
  );
  if (said?.lang && !env.LANG) env.LANG = said.lang;
  return Boolean(said);
}
