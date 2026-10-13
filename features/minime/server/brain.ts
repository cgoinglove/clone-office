// The mini-me's brain is the person's own Claude Code: the unmodified `claude` they installed and
// signed in to. We run it with documented options only and never touch its login. Here: where it
// is, the model it starts on, and the environment it runs in (sessions run in brain/session.ts).

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { nodeEnv } from "./desktop.ts";
import { findOnPath } from "./which.ts";

/** The model a mini-me thinks with; `CLONE_OFFICE_MODEL` changes it. */
export function defaultModel(): string {
  return process.env.CLONE_OFFICE_MODEL ?? "sonnet";
}

interface Command {
  file: string;
  /** Arguments that go before Claude Code's own. */
  prefix: string[];
}

/**
 * How to start the person's `claude`: from PATH, or where the native installer puts it when this
 * server was started without the person's shell PATH. On Windows, npm installs a .cmd wrapper that
 * Node cannot start without a shell, which would garble the JSON arguments; the script the wrapper
 * runs is started with Node instead.
 */
export function claudeCommand(): Command | undefined {
  const exe = process.platform === "win32" ? "claude.exe" : "claude";
  const found =
    findOnPath("claude") ??
    [
      join(homedir(), ".local", "bin", exe),
      join(homedir(), ".claude", "local", exe),
    ].find((path) => existsSync(path));
  if (!found) return undefined;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(found)) {
    const script = join(
      dirname(found),
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "cli.js",
    );
    return existsSync(script)
      ? { file: process.execPath, prefix: [script] }
      : undefined;
  }
  return { file: found, prefix: [] };
}

export function hasClaudeCode(): boolean {
  return Boolean(claudeCommand());
}

// The person's shell can carry an API key or a provider override. Left in place, Claude Code would
// bill that key instead of the person's subscription, so a mini-me never passes them on.
/**
 * The environment for another program the app starts (Claude Code, Codex). `appNode`: the program
 * runs on the app's own executable (an npm-installed one on Windows), which inside the desktop app
 * needs ELECTRON_RUN_AS_NODE; otherwise it is never passed on.
 */
export function cleanEnv(appNode = false): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      /^(CLAUDECODE|CLAUDE_|ANTHROPIC_|MCP_|OTEL_)/.test(key) &&
      key !== "CLAUDE_CONFIG_DIR"
    )
      continue;
    // The desktop app's own: any Electron app a command started would run as Node.
    if (key === "NODE_OPTIONS" || key === "ELECTRON_RUN_AS_NODE") continue;
    env[key] = value;
  }
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = "1";
  if (appNode) Object.assign(env, nodeEnv());
  return env;
}
