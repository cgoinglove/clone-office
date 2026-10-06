// The mini-me's brain is the person's own Claude Code: the unmodified `claude` they installed and
// signed in to. We run it with documented options only and never touch its login. Each call here
// is one tool-free, settings-free turn that returns JSON matching a schema.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { findOnPath } from "./which";

export interface BrainCall {
  prompt: string;
  schema: Record<string, unknown>;
  /** Folder the turn runs in. It should hold no CLAUDE.md, so nothing else is read. */
  cwd: string;
  model?: string;
  timeoutMs?: number;
}

export interface BrainResult<T> {
  ok: boolean;
  value?: T;
  error?: string;
  durationMs: number;
  usage?: {
    input: number;
    cacheWrite: number;
    cacheRead: number;
    output: number;
  };
}

/** The model a mini-me thinks with; `SUB_OFFICE_MODEL` changes it. */
export function defaultModel(): string {
  return process.env.SUB_OFFICE_MODEL ?? "sonnet";
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
export function cleanEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (
      /^(CLAUDECODE|CLAUDE_|ANTHROPIC_|MCP_|OTEL_)/.test(key) &&
      key !== "CLAUDE_CONFIG_DIR"
    )
      continue;
    if (key === "NODE_OPTIONS") continue;
    env[key] = value;
  }
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS = "1";
  return env;
}

export function runClaudeJson<T>(call: BrainCall): Promise<BrainResult<T>> {
  const started = Date.now();
  mkdirSync(call.cwd, { recursive: true });
  const args = [
    "-p",
    "--output-format",
    "json",
    "--model",
    call.model ?? defaultModel(),
    "--setting-sources",
    "project",
    "--strict-mcp-config",
    "--tools",
    "",
    "--disallowedTools",
    "SendMessage,ListAgents",
    "--permission-mode",
    "dontAsk",
    "--no-session-persistence",
    "--max-turns",
    "3",
    "--json-schema",
    JSON.stringify(call.schema),
  ];
  const command = claudeCommand();
  if (!command)
    return Promise.resolve({
      ok: false,
      error: "Claude Code was not found.",
      durationMs: 0,
    });
  return new Promise((resolve) => {
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd: call.cwd,
      env: cleanEnv() as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: Omit<BrainResult<T>, "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ...result, durationMs: Date.now() - started });
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, error: "Claude Code did not answer in time." });
    }, call.timeoutMs ?? 180_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      finish({
        ok: false,
        error: `Could not start Claude Code: ${error.message}`,
      }),
    );
    child.on("close", (code) => {
      let message: Record<string, unknown> | undefined;
      try {
        message = JSON.parse(stdout);
      } catch {
        return finish({
          ok: false,
          error: `Claude Code exited (${code}): ${stderr.trim().slice(-300) || "no output"}`,
        });
      }
      const usage = message?.usage as Record<string, number> | undefined;
      const shaped = usage && {
        input: usage.input_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
      };
      if (message?.is_error || !message?.structured_output) {
        const said = typeof message?.result === "string" ? message.result : "";
        return finish({
          ok: false,
          error:
            said ||
            `Claude Code returned no answer (${message?.subtype ?? code}).`,
          usage: shaped,
        });
      }
      finish({
        ok: true,
        value: message.structured_output as T,
        usage: shaped,
      });
    });
    child.stdin.end(call.prompt);
  });
}
