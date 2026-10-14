// Asking colleagues' clones from the AI apps a person already works in (10-14: everyone keeps their
// own AI; what the office takes over is the questions between people). The office's tools
// (plugin/server, the same server the Claude Code plugin starts) are added to an app as a local MCP
// server, each app in the way it reads one: Claude's desktop app, Cursor and Gemini CLI from a JSON
// file, Codex from its config.toml, Claude Code through its own `claude mcp add`. Only the server
// named clone-office is ever written or taken out; everything else in those files stays as it was,
// and a file that does not read as what it should be is left alone rather than written over.
//
//   npx clone-office mcp                  the server itself, on stdin and stdout
//   npx clone-office mcp list | add <app> | remove <app>   (--json for the app's own Settings)

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const NAME = "clone-office";

/** Where each app keeps what it reads, on this system. */
function places(home = homedir(), platform = process.platform) {
  const appData = process.env.APPDATA || join(home, "AppData", "Roaming");
  const claudeDesktop =
    platform === "darwin"
      ? join(home, "Library", "Application Support", "Claude")
      : platform === "win32"
        ? join(appData, "Claude")
        : join(home, ".config", "Claude");
  return {
    "claude-desktop": {
      folder: claudeDesktop,
      file: join(claudeDesktop, "claude_desktop_config.json"),
    },
    cursor: {
      folder: join(home, ".cursor"),
      file: join(home, ".cursor", "mcp.json"),
    },
    gemini: {
      folder: join(home, ".gemini"),
      file: join(home, ".gemini", "settings.json"),
    },
    codex: {
      folder: join(home, ".codex"),
      file: join(home, ".codex", "config.toml"),
    },
    "claude-code": {
      folder: join(home, ".claude"),
      file: join(home, ".claude.json"),
    },
  };
}

/** The apps, in the order the page lists them. */
export const APPS = [
  { id: "claude-desktop", name: "Claude", mark: "claude" },
  { id: "claude-code", name: "Claude Code", mark: "claudecode" },
  { id: "codex", name: "Codex", mark: "codex" },
  { id: "cursor", name: "Cursor", mark: "cursor" },
  { id: "gemini", name: "Gemini CLI", mark: "gemini" },
];

/** A command on the PATH, or none. */
function onPath(command) {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], {
      stdio: "ignore",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

/** A JSON file as an object; none when it is not there; an error when it does not read as one. */
function readJson(file) {
  if (!existsSync(file)) return {};
  const raw = readFileSync(file, "utf8");
  if (!raw.trim()) return {};
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("not-an-object");
  return value;
}

/**
 * Writes a file whole or not at all, where it really is (a dotfile kept as a link stays a link)
 * and as private as it was: a settings file holding other servers' keys keeps its 0600.
 */
function writeWhole(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  let target = file;
  let mode = 0o600;
  try {
    target = realpathSync(file);
    mode = statSync(target).mode & 0o777;
  } catch {
    // a new file: for its person alone
  }
  const next = `${target}.${process.pid}.tmp`;
  writeFileSync(next, text, { mode });
  chmodSync(next, mode);
  renameSync(next, target);
}

/** Runs the claude command, which on Windows npm puts in as a .cmd only a shell starts. */
function claude(args) {
  const windows = process.platform === "win32";
  const quoted = (arg) => `"${String(arg).replace(/"/g, '""')}"`;
  execFileSync(
    windows ? "claude.cmd" : "claude",
    windows ? args.map(quoted) : args,
    {
      stdio: "ignore",
      timeout: 20_000,
      shell: windows,
    },
  );
}

/** The table Codex reads the server from, as a TOML section's header. */
const TOML_HEADER =
  /^\s*\[\s*mcp_servers\s*\.\s*"?clone-office"?\s*\]\s*(#.*)?$/;
/** It, or a table of its own (`[mcp_servers.clone-office.env]`), which goes with it. */
const TOML_OURS =
  /^\s*\[\s*mcp_servers\s*\.\s*"?clone-office"?\s*(\.[^\]]*)?\]\s*(#.*)?$/;

/** A config.toml without the clone-office section (its header to the next table's). */
export function withoutTomlServer(text) {
  const lines = text.split("\n");
  const out = [];
  let skipping = false;
  // comments and blank lines met while skipping: they belong to whatever table comes next
  let held = [];
  for (const line of lines) {
    if (TOML_OURS.test(line)) {
      skipping = true;
      held = [];
      continue;
    }
    if (skipping && /^\s*\[/.test(line)) {
      skipping = false;
      out.push(...held);
      held = [];
    }
    if (!skipping) out.push(line);
    else if (/^\s*(#.*)?$/.test(line)) held.push(line);
    else held = [];
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** A TOML basic string: JSON's escapes, and the delete character too, which TOML forbids bare. */
const tomlString = (value) => {
  const text = String(value);
  if (
    /[\uD800-\uDFFF]/.test(text.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, ""))
  )
    throw new Error("not-text");
  return JSON.stringify(text).replace(/\u007f/g, "\\u007F");
};

/** The clone-office section Codex reads. */
export function tomlServer(server) {
  const env = Object.entries(server.env ?? {});
  return [
    `[mcp_servers.${NAME}]`,
    `command = ${tomlString(server.command)}`,
    `args = [${server.args.map(tomlString).join(", ")}]`,
    ...(env.length
      ? [
          `env = { ${env.map(([key, value]) => `${key} = ${tomlString(value)}`).join(", ")} }`,
        ]
      : []),
  ].join("\n");
}

/** Whether the app has the server now. */
function added(id, at, home) {
  try {
    if (id === "codex")
      return (
        existsSync(at.file) &&
        readFileSync(at.file, "utf8")
          .split("\n")
          .some((line) => TOML_HEADER.test(line))
      );
    if (id === "claude-code") {
      if (readJson(at.file).mcpServers?.[NAME]) return true;
      // the plugin brings the same tools (and later answers into the conversation)
      const plugins = join(
        home,
        ".claude",
        "plugins",
        "installed_plugins.json",
      );
      return Object.keys(readJson(plugins).plugins ?? {}).some((key) =>
        key.startsWith(`${NAME}@`),
      );
    }
    return Boolean(readJson(at.file).mcpServers?.[NAME]);
  } catch {
    return false;
  }
}

/** Each app: whether it is on this computer, and whether it has the office's tools. */
export function listApps({
  home = homedir(),
  platform = process.platform,
} = {}) {
  const at = places(home, platform);
  return APPS.map((app) => {
    const where = at[app.id];
    const present =
      existsSync(where.folder) ||
      (app.id === "claude-code" && onPath("claude")) ||
      (app.id === "codex" && onPath("codex"));
    return { ...app, present, added: present && added(app.id, where, home) };
  });
}

/**
 * The server as an app starts it: this Node (or Electron run as Node, for the desktop app), the
 * server's file kept in the clone's own folder so an update of the package never leaves an app
 * pointing at a file that is gone, and the clone's folder named, so the office found is this one.
 */
export function serverEntry({ root, appHome }) {
  const bundled = join(root, "dist", "office-mcp.mjs");
  let file = join(root, "plugin", "server", "main.ts");
  if (existsSync(bundled)) {
    file = join(appHome, "mcp", "office.mjs");
    mkdirSync(dirname(file), { recursive: true });
    copyFileSync(bundled, file);
  }
  return {
    // The desktop app's own executable as Node; an AppImage's from where it lies, not where it
    // was mounted this time, which is gone once the app quits.
    command:
      process.versions.electron && process.env.APPIMAGE
        ? process.env.APPIMAGE
        : process.execPath,
    args: [file],
    env: {
      CLONE_OFFICE_HOME: appHome,
      ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
  };
}

/** Adds the office's tools to one app; what it answers says what happened. */
export function addApp(
  id,
  { root, appHome, home = homedir(), platform = process.platform },
) {
  const app = APPS.find((one) => one.id === id);
  if (!app) return { ok: false, message: "unknown-app" };
  const at = places(home, platform)[id];
  const server = serverEntry({ root, appHome });
  try {
    if (id === "claude-code") {
      if (!onPath("claude")) return { ok: false, message: "app-missing" };
      // The name before -e, which takes every value after it.
      const add = [
        "mcp",
        "add",
        "--scope",
        "user",
        NAME,
        ...Object.entries(server.env).flatMap(([key, value]) => [
          "-e",
          `${key}=${value}`,
        ]),
        "--",
        server.command,
        ...server.args,
      ];
      try {
        claude(add);
      } catch {
        // there already: taken out only now, so a failure never leaves it with none
        claude(["mcp", "remove", "--scope", "user", NAME]);
        claude(add);
      }
      return { ok: true, message: "added" };
    }
    if (id === "codex") {
      const text = existsSync(at.file) ? readFileSync(at.file, "utf8") : "";
      const kept = withoutTomlServer(text).trimEnd();
      writeWhole(
        at.file,
        `${kept ? `${kept}\n\n` : ""}${tomlServer(server)}\n`,
      );
      return { ok: true, message: "added" };
    }
    let config;
    try {
      config = readJson(at.file);
    } catch {
      return { ok: false, message: "config-unreadable" };
    }
    const servers =
      config.mcpServers && typeof config.mcpServers === "object"
        ? config.mcpServers
        : {};
    writeWhole(
      at.file,
      `${JSON.stringify({ ...config, mcpServers: { ...servers, [NAME]: server } }, null, 2)}\n`,
    );
    return { ok: true, message: "added" };
  } catch {
    return { ok: false, message: "add-failed" };
  }
}

/** Takes the office's tools out of one app, and nothing else. */
export function removeApp(
  id,
  { home = homedir(), platform = process.platform } = {},
) {
  const app = APPS.find((one) => one.id === id);
  if (!app) return { ok: false, message: "unknown-app" };
  const at = places(home, platform)[id];
  try {
    if (id === "claude-code") {
      if (onPath("claude")) claude(["mcp", "remove", "--scope", "user", NAME]);
      return { ok: true, message: "removed" };
    }
    if (!existsSync(at.file)) return { ok: true, message: "removed" };
    if (id === "codex") {
      writeWhole(at.file, withoutTomlServer(readFileSync(at.file, "utf8")));
      return { ok: true, message: "removed" };
    }
    let config;
    try {
      config = readJson(at.file);
    } catch {
      return { ok: false, message: "config-unreadable" };
    }
    if (!config.mcpServers?.[NAME]) return { ok: true, message: "removed" };
    const { [NAME]: _gone, ...rest } = config.mcpServers;
    writeWhole(
      at.file,
      `${JSON.stringify({ ...config, mcpServers: rest }, null, 2)}\n`,
    );
    return { ok: true, message: "removed" };
  } catch {
    return { ok: false, message: "remove-failed" };
  }
}
