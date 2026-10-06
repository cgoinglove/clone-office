// The person's own Claude Code conversations as one of the mini-me's hands (product 2.6): it finds
// one by the name the person gave it, or by its folder, and asks it something. Asking forks a copy
// of the conversation (`--resume <id> --fork-session`, kept nowhere) with read-only tools, so the
// conversation itself is never touched, while the copy knows the project as that conversation did
// (spike S2, 10/4). The copy loads the person's user settings only, so a project's own hooks do not
// run, and no MCP server. Folders the person left out are never listed or opened, and the mini-me's
// own sessions are not its person's.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, sep } from "node:path";
import { logRun } from "../brain/runlog.ts";
import { denyRules } from "../gate/rules.ts";
import { claudeCommand, cleanEnv, defaultModel } from "../server/brain.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import { projectDirs } from "../server/sources/claude-code.ts";
import { streamLines } from "../server/sources/common.ts";

export interface ClaudeSession {
  id: string;
  /** The name the person gave it (`--name`, `/rename`), else the title Claude Code gave it. */
  name?: string;
  named: boolean;
  cwd: string;
  updated: string;
  /** The transcript's size in bytes: a long conversation costs more to ask. */
  size: number;
}

const DAY = 24 * 60 * 60 * 1000;
/** A transcript larger than this is listed without reading it for its name. */
const MAX_SCAN_BYTES = 30 * 1024 * 1024;
const ASK_TIMEOUT_MS = 5 * 60 * 1000;

async function titlesOf(
  file: string,
): Promise<{ custom?: string; ai?: string }> {
  const titles: { custom?: string; ai?: string } = {};
  for await (const line of streamLines(file)) {
    if (!line.includes('"custom-title"') && !line.includes('"ai-title"'))
      continue;
    try {
      const row = JSON.parse(line) as {
        type?: string;
        customTitle?: string;
        aiTitle?: string;
      };
      // The latest one wins, as in Claude Code.
      if (row.type === "custom-title" && row.customTitle)
        titles.custom = row.customTitle;
      if (row.type === "ai-title" && row.aiTitle) titles.ai = row.aiTitle;
    } catch {
      // Not a whole record.
    }
  }
  return titles;
}

/** The person's recent Claude Code conversations, newest first, as the mini-me may see them. */
export async function listSessions(
  options: { days?: number; limit?: number } = {},
): Promise<ClaudeSession[]> {
  const excludes = loadExcludes();
  const home = minimeHome();
  const since = Date.now() - (options.days ?? 30) * DAY;
  const found: {
    cwd: string;
    file: { path: string; mtimeMs: number; size: number };
  }[] = [];
  for (const { cwd, files } of await projectDirs()) {
    if (isExcluded(cwd, excludes)) continue;
    if (cwd === home || cwd.startsWith(`${home}${sep}`)) continue;
    for (const file of files) {
      if (file.mtimeMs < since) break;
      found.push({ cwd, file });
    }
  }
  found.sort((a, b) => b.file.mtimeMs - a.file.mtimeMs);
  const sessions: ClaudeSession[] = [];
  for (const { cwd, file } of found.slice(0, options.limit ?? 30)) {
    const titles = file.size <= MAX_SCAN_BYTES ? await titlesOf(file.path) : {};
    sessions.push({
      id: basename(file.path, ".jsonl"),
      ...(titles.custom || titles.ai
        ? { name: titles.custom ?? titles.ai }
        : {}),
      named: Boolean(titles.custom),
      cwd,
      updated: new Date(file.mtimeMs).toISOString(),
      size: file.size,
    });
  }
  return sessions;
}

/** A conversation by its id, or the name the person gave it (the newest, when two share it). */
export function findSession(
  sessions: ClaudeSession[],
  wanted: string,
): ClaudeSession | undefined {
  const key = wanted.trim().toLowerCase();
  return (
    sessions.find((s) => s.id === wanted.trim()) ??
    sessions.find((s) => s.named && s.name?.toLowerCase() === key) ??
    sessions.find((s) => s.name?.toLowerCase() === key)
  );
}

export function askPrompt(question: string): string {
  return `Your person's clone asks, for a task or a colleague's request: ${question}

Answer from what this conversation knows and from the files, in a few sentences. Read only: change nothing, run nothing.`;
}

/** Ask a copy of one of the person's conversations; the conversation itself stays as it was. */
export async function askSession(
  wanted: string,
  question: string,
): Promise<{ ok: boolean; text: string; session?: ClaudeSession }> {
  const session = findSession(
    await listSessions({ days: 90, limit: 200 }),
    wanted,
  );
  if (!session)
    return {
      ok: false,
      text: `No conversation called "${wanted}" in the last 90 days that the clone may open. Look at sessions for the names.`,
    };
  if (!existsSync(session.cwd))
    return {
      ok: false,
      text: `The folder of that conversation is no longer there (${session.cwd}).`,
      session,
    };
  const command = claudeCommand();
  if (!command)
    return { ok: false, text: "Claude Code was not found.", session };
  const deny = denyRules(loadExcludes());
  const args = [
    "-p",
    "--resume",
    session.id,
    "--fork-session",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--model",
    defaultModel(),
    "--setting-sources",
    "user",
    "--strict-mcp-config",
    "--tools",
    "Read,Glob,Grep",
    "--allowedTools",
    "Read,Glob,Grep",
    "--disallowedTools",
    ["SendMessage", "ListAgents", ...deny].join(","),
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    "12",
  ];
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd: session.cwd,
      env: cleanEnv() as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (ok: boolean, text: string, cost?: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logRun({
        at: new Date(started).toISOString(),
        purpose: "session",
        brain: "claude-code",
        model: defaultModel(),
        session: session.id,
        ok,
        ...(ok ? {} : { error: text.slice(0, 200) }),
        ms: Date.now() - started,
        cost_usd: cost,
      });
      resolve({ ok, text, session });
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(false, "The conversation did not answer in time.");
    }, ASK_TIMEOUT_MS);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(false, error.message));
    child.on("close", () => {
      try {
        const out = JSON.parse(stdout) as {
          result?: string;
          is_error?: boolean;
          total_cost_usd?: number;
        };
        if (out.is_error || !out.result)
          finish(
            false,
            out.result || "The conversation could not answer.",
            out.total_cost_usd,
          );
        else finish(true, out.result, out.total_cost_usd);
      } catch {
        finish(
          false,
          stderr.trim().slice(-300) || "The conversation could not answer.",
        );
      }
    });
    child.stdin.end(askPrompt(question));
  });
}

const WORK_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * The tool server a working copy is given: the mini-me's own, offering only the permission prompt,
 * so each change the copy wants to make is asked of the person on their screen (in `chat`).
 */
function permissionServer(chat: string): string {
  return JSON.stringify({
    mcpServers: {
      minime: {
        command: process.execPath,
        args: ["--no-warnings", process.argv[1] ?? ""],
        env: {
          MINIME_ROLE: "permission",
          MINIME_GATE_URL: process.env.MINIME_GATE_URL ?? "",
          MINIME_GATE_SECRET: process.env.MINIME_GATE_SECRET ?? "",
          MINIME_CHAT_ID: chat,
        },
      },
    },
  });
}

export function workPrompt(task: string): string {
  return `Your person's clone hands you this task, which your person has taken on: ${task}

Do it in this project. Every change you make and every command you run is asked of your person first, so do only what the task needs. When done, say in a few lines what you changed, what you checked and how, and anything left to do. Say that tests pass only if you ran them.`;
}

/**
 * Have one of the person's conversations do work: a copy of it that is kept, named after it
 * ("<name> · mini-me"), so the conversation itself is never written to and the person can open
 * the copy later and go on from it. The copy may read alone; every edit and command is asked of the
 * person on their screen, through the trust gate, in `chat`.
 */
export async function workSession(
  wanted: string,
  task: string,
  options: { chat: string; allow: string[] },
): Promise<{
  ok: boolean;
  text: string;
  session?: ClaudeSession;
  copy?: string;
}> {
  const session = findSession(
    await listSessions({ days: 90, limit: 200 }),
    wanted,
  );
  if (!session)
    return {
      ok: false,
      text: `No conversation called "${wanted}" in the last 90 days that the clone may open. Look at sessions for the names.`,
    };
  if (!existsSync(session.cwd))
    return {
      ok: false,
      text: `The folder of that conversation is no longer there (${session.cwd}).`,
      session,
    };
  if (!process.env.MINIME_GATE_URL)
    return {
      ok: false,
      text: "Nobody can be asked now, so nothing can be changed.",
      session,
    };
  const command = claudeCommand();
  if (!command)
    return { ok: false, text: "Claude Code was not found.", session };
  const excludes = loadExcludes();
  const args = [
    "-p",
    "--resume",
    session.id,
    "--fork-session",
    "--name",
    `${session.name ?? "conversation"} · clone`,
    "--output-format",
    "json",
    "--model",
    defaultModel(),
    "--setting-sources",
    "user",
    "--mcp-config",
    permissionServer(options.chat),
    "--strict-mcp-config",
    "--tools",
    "Read,Glob,Grep,Edit,Write,Bash",
    "--allowedTools",
    ["Read", "Glob", "Grep", ...options.allow].join(","),
    "--disallowedTools",
    ["SendMessage", "ListAgents", ...denyRules(excludes)].join(","),
    "--permission-mode",
    "default",
    "--permission-prompt-tool",
    "mcp__minime__permission_prompt",
    "--max-turns",
    "40",
  ];
  const started = Date.now();
  return new Promise((resolve) => {
    const env = cleanEnv();
    // Each change waits for the person's answer on their screen.
    env.MCP_TOOL_TIMEOUT = String(11 * 60 * 1000);
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd: session.cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (
      ok: boolean,
      text: string,
      copy?: string,
      cost?: number,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logRun({
        at: new Date(started).toISOString(),
        purpose: "work",
        brain: "claude-code",
        model: defaultModel(),
        session: copy ?? session.id,
        ok,
        ...(ok ? {} : { error: text.slice(0, 200) }),
        ms: Date.now() - started,
        cost_usd: cost,
      });
      resolve({ ok, text, session, copy });
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(false, "The work did not finish in time.");
    }, WORK_TIMEOUT_MS);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => finish(false, error.message));
    child.on("close", () => {
      try {
        const out = JSON.parse(stdout) as {
          result?: string;
          is_error?: boolean;
          session_id?: string;
          total_cost_usd?: number;
        };
        finish(
          Boolean(out.result) && !out.is_error,
          out.result || "The conversation could not do it.",
          out.session_id,
          out.total_cost_usd,
        );
      } catch {
        finish(
          false,
          stderr.trim().slice(-300) || "The conversation could not do it.",
        );
      }
    });
    child.stdin.end(workPrompt(task));
  });
}
