// Where a mini-me keeps its files, and where the person's AI tools keep the records it learns from.
// Each tool's own environment variable moves its folder, as the tool itself does.

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const pinned = globalThis as typeof globalThis & {
  __cloneOfficeHome?: string;
};

/**
 * The mini-me's own folder. `CLONE_OFFICE_HOME` moves it, for tests and for a second person (an
 * empty value counts as none). Before the app was named Clone Office it kept `~/.sub-office` (and
 * read `SUB_OFFICE_HOME`): a clone kept there (its settings.json is there) stays there, never moved.
 * Decided once per process, so the folder never changes under a running app; the launcher and the
 * plugin decide the same way (bin/clone-office.mjs, plugin/server/office.ts, plugin/hooks/office.ts).
 */
export function minimeHome(): string {
  const moved = process.env.CLONE_OFFICE_HOME || process.env.SUB_OFFICE_HOME;
  if (moved) return moved;
  pinned.__cloneOfficeHome ??= existsSync(
    join(homedir(), ".sub-office", "settings.json"),
  )
    ? join(homedir(), ".sub-office")
    : join(homedir(), ".clone-office");
  return pinned.__cloneOfficeHome;
}

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/** Claude Code's session records, one folder per working directory. */
export function claudeProjectsDir(): string {
  return join(claudeHome(), "projects");
}

/**
 * Where the app's own files are (the guide, the mini-me's tool server): the installed package when
 * it runs from npm, whose launcher says so in CLONE_OFFICE_APP_DIR, or this folder in development.
 */
export function appDir(): string {
  return process.env.CLONE_OFFICE_APP_DIR ?? process.cwd();
}

/** The mini-me's tool server: one bundled file in the package, the TypeScript itself in development. */
export function toolServerPath(): string {
  return process.env.CLONE_OFFICE_APP_DIR
    ? join(
        /*turbopackIgnore: true*/ process.env.CLONE_OFFICE_APP_DIR,
        "dist",
        "mcp-server.mjs",
      )
    : join(
        /*turbopackIgnore: true*/ process.cwd(),
        "features",
        "minime",
        "memory",
        "mcp-server.ts",
      );
}

/** What hands a session's connection to a service its token (connectors/headers.ts). */
export function connectorHeadersPath(): string {
  return process.env.CLONE_OFFICE_APP_DIR
    ? join(
        /*turbopackIgnore: true*/ process.env.CLONE_OFFICE_APP_DIR,
        "dist",
        "connector-headers.mjs",
      )
    : join(
        /*turbopackIgnore: true*/ process.cwd(),
        "features",
        "minime",
        "connectors",
        "headers.ts",
      );
}

/** The relay's server, for an office opened on this computer: bundled in the package, or the source. */
export function relayServerPath(): string {
  return process.env.CLONE_OFFICE_APP_DIR
    ? join(
        /*turbopackIgnore: true*/ process.env.CLONE_OFFICE_APP_DIR,
        "dist",
        "relay.mjs",
      )
    : join(
        /*turbopackIgnore: true*/ process.cwd(),
        "features",
        "relay",
        "server.ts",
      );
}

export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

export function hermesHome(): string {
  return process.env.HERMES_HOME ?? join(homedir(), ".hermes");
}

/** OpenClaw's agent workspace, where it keeps USER.md and MEMORY.md. */
export function openclawWorkspace(): string {
  return (
    process.env.OPENCLAW_WORKSPACE_DIR ??
    join(homedir(), ".openclaw", "workspace")
  );
}

/**
 * Cursor's settings and chat database, where each system keeps an app's data. VSCODE_APPDATA moves
 * it, as it moves the data of every app built on VS Code.
 */
export function cursorUserDir(): string {
  if (process.env.VSCODE_APPDATA)
    return join(process.env.VSCODE_APPDATA, "Cursor", "User");
  if (process.platform === "darwin")
    return join(homedir(), "Library", "Application Support", "Cursor", "User");
  if (process.platform === "win32")
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "Cursor",
      "User",
    );
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "Cursor",
    "User",
  );
}
