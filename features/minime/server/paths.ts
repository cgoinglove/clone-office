// Where a mini-me keeps its files, and where the person's AI tools keep the records it learns from.
// Each tool's own environment variable moves its folder, as the tool itself does.

import { homedir } from "node:os";
import { join } from "node:path";

/** The mini-me's own folder. `SUB_OFFICE_HOME` moves it, for tests and for a second person. */
export function minimeHome(): string {
  return process.env.SUB_OFFICE_HOME ?? join(homedir(), ".sub-office");
}

export function claudeHome(): string {
  return process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");
}

/** Claude Code's session records, one folder per working directory. */
export function claudeProjectsDir(): string {
  return join(claudeHome(), "projects");
}

export function codexHome(): string {
  return process.env.CODEX_HOME ?? join(homedir(), ".codex");
}

export function geminiHome(): string {
  return join(homedir(), ".gemini");
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

/** Cursor's settings and chat database, where each system keeps an app's data. */
export function cursorUserDir(): string {
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
