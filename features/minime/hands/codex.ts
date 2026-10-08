// The person's own Codex conversations as the clone's hands, as hands/sessions.ts has their Claude
// Code ones. Codex keeps each conversation as a "rollout" file (server/sources/codex.ts), names the
// ones the person named in session_index.jsonl, and `codex exec fork <id>` (August 2026) goes on
// from a copy of one without writing to it; with `--ephemeral` the copy is kept nowhere either.
//
// A run like this has nobody at a terminal, so Codex asks nothing ("never"): what keeps it in
// bounds is Codex's own sandbox, set by a permission profile given with `-c` (a profile, rather
// than `--sandbox`, so files can also be kept from being read):
// - asked something, a copy reads only: anywhere but the folders the person left out and the
//   clone's own secrets, with no network and nothing written;
// - given work, a copy works in a separate copy of the project (hands/copy.ts), the only place it
//   may write; what it changed comes back as one patch that the person sees on a card before
//   anything reaches their folder (hands/tools.ts).
// The person's execpolicy rules are not loaded (an "allow" there runs a command outside the
// sandbox) and no automatic reviewer may approve anything in their place.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import { logRun } from "../brain/runlog.ts";
import { cleanEnv } from "../server/brain.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import { codexHome, minimeHome } from "../server/paths.ts";
import {
  codexRolloutFiles,
  rolloutLineMessage,
} from "../server/sources/codex.ts";
import { clip, streamLines } from "../server/sources/common.ts";
import { mapLimit } from "../server/sources/lines.ts";
import { findOnPath } from "../server/which.ts";
import {
  applyChanges,
  type Changes,
  CopyError,
  changesIn,
  keepPatch,
  makeWorkCopy,
  removeWorkCopy,
  type WorkCopy,
} from "./copy.ts";
import type { HandSession } from "./sessions.ts";

const DAY = 24 * 60 * 60 * 1000;
const ASK_TIMEOUT_MS = 5 * 60 * 1000;
/**
 * Work has to leave the person time to look at what it changed before the brain stops waiting for
 * the tool (eleven minutes), so it gets less than a Claude Code copy, whose changes are asked as
 * it goes.
 */
const WORK_TIMEOUT_MS = 8 * 60 * 1000;
/** How much of a change a card carries; the card shows its first lines, the patch is whole. */
const CARD_DIFF_CHARS = 40_000;
/** The permission profile a copy runs under; made for each run with `-c`, never written down. */
const PROFILE = "clone_office";

interface Command {
  file: string;
  prefix: string[];
}

/**
 * How to start the person's `codex`: from PATH, or where its installer, Homebrew or npm put it
 * when this server was started without the person's shell PATH. On Windows, npm's .cmd wrapper is
 * not started (Node cannot without a shell); the script it runs is started with Node instead.
 */
function codexCommand(): Command | undefined {
  const exe = process.platform === "win32" ? "codex.exe" : "codex";
  const found =
    findOnPath("codex") ??
    [
      join(homedir(), ".local", "bin", exe),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
    ].find((path) => existsSync(path));
  if (!found) return undefined;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(found)) {
    const script = join(
      dirname(found),
      "node_modules",
      "@openai",
      "codex",
      "bin",
      "codex.js",
    );
    return existsSync(script)
      ? { file: process.execPath, prefix: [script] }
      : undefined;
  }
  return { file: found, prefix: [] };
}

/**
 * The environment a copy runs in. A CODEX_API_KEY in the person's shell would make Codex bill
 * that key instead of the sign-in their conversations used, so it is not passed on.
 */
function codexEnv(): NodeJS.ProcessEnv {
  const env = cleanEnv();
  delete env.CODEX_API_KEY;
  return env as NodeJS.ProcessEnv;
}

/** Names the person gave their Codex conversations (`/rename`); the latest one wins, as in Codex. */
async function threadNames(): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const file = join(
    /*turbopackIgnore: true*/ codexHome(),
    "session_index.jsonl",
  );
  if (!existsSync(file)) return names;
  try {
    for await (const line of streamLines(file)) {
      try {
        const row = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
        if (typeof row.id === "string" && typeof row.thread_name === "string")
          if (row.thread_name.trim()) names.set(row.id, row.thread_name.trim());
      } catch {
        // Not a whole record.
      }
    }
  } catch {
    // Unreadable now: the conversations are listed by their first words.
  }
  return names;
}

/** What the person first asked in a conversation, as its title when they gave it no name. */
async function firstRequest(file: string): Promise<string | undefined> {
  let seen = 0;
  try {
    for await (const line of streamLines(file)) {
      if (++seen > 400) return undefined;
      const said = rolloutLineMessage(line);
      if (said?.role === "user") return clip(said.text.split("\n")[0], 80);
    }
  } catch {
    // Unreadable now.
  }
  return undefined;
}

/** The person's recent Codex conversations, newest first, as the clone may see them. */
export async function listCodexSessions(
  options: { days?: number; limit?: number } = {},
): Promise<HandSession[]> {
  const excludes = loadExcludes();
  const home = minimeHome();
  const files = (
    await codexRolloutFiles({
      since: Date.now() - (options.days ?? 30) * DAY,
      archived: false,
    }).catch(() => [])
  )
    .flatMap(({ cwd, ...file }) =>
      cwd &&
      !isExcluded(cwd, excludes) &&
      cwd !== home &&
      !cwd.startsWith(`${home}${sep}`)
        ? [{ ...file, cwd }]
        : [],
    )
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, options.limit ?? 30);
  const names = await threadNames();
  return mapLimit(files, 8, async (file): Promise<HandSession> => {
    const named = names.get(file.session);
    const title = named ?? (await firstRequest(file.path));
    return {
      tool: "codex",
      id: file.session,
      ...(title ? { name: title } : {}),
      named: Boolean(named),
      cwd: file.cwd,
      updated: new Date(file.mtimeMs).toISOString(),
      size: file.size,
    };
  });
}

/**
 * What a copy may not read: the folders the person left out (those written as paths, as for
 * Claude Code) and the clone's own secrets, which together would give its keys back in the clear.
 */
function deniedPaths(
  excludes: readonly string[],
  home = minimeHome(),
): string[] {
  const secrets = ["secret.key", "brain", "connectors"].map((name) =>
    join(home, name),
  );
  const left = excludes
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.includes("/") || pattern.includes(sep))
    .map((pattern) =>
      pattern.startsWith("~") ? `${homedir()}${pattern.slice(1)}` : pattern,
    )
    .filter((path) => isAbsolute(path))
    .map((path) => path.replace(/[/\\]+$/, ""));
  // A path that is not there is left out: some sandboxes cannot mask what does not exist.
  return [...new Set([...secrets, ...left])].filter((path) => existsSync(path));
}

/**
 * The `-c` settings a copy runs under: a permission profile of its own (read anywhere but `deny`;
 * write only in `write`, its git folder excepted, and the temporary folders; no network), approvals
 * never asked and never given by an automatic reviewer.
 */
function sandboxConfig(deny: readonly string[], write?: string) {
  const key = (path: string) => JSON.stringify(path);
  const files = ['":root"="read"'];
  if (write)
    files.push(
      '":tmpdir"="write"',
      '":slash_tmp"="write"',
      `${key(write)}="write"`,
      `${key(join(write, ".git"))}="read"`,
    );
  for (const path of deny) files.push(`${key(path)}="deny"`);
  return [
    "-c",
    `default_permissions=${key(PROFILE)}`,
    "-c",
    `permissions.${PROFILE}.filesystem={${files.join(",")}}`,
    "-c",
    `permissions.${PROFILE}.network={enabled=false}`,
    "-c",
    'approval_policy="never"',
    "-c",
    'approvals_reviewer="user"',
  ];
}

/** `codex exec` going on from a copy of one conversation, in `cwd`, kept nowhere. */
function forkArgs(
  session: HandSession,
  cwd: string,
  config: string[],
): string[] {
  return [
    "exec",
    "--json",
    "--color",
    "never",
    "--ephemeral",
    "--ignore-rules",
    "--skip-git-repo-check",
    "-C",
    cwd,
    ...config,
    "fork",
    session.id,
    // The request comes on stdin, so it is never in the process list.
    "-",
  ];
}

interface RunResult {
  ok: boolean;
  text: string;
  usage?: Record<string, number>;
}

/** Run a copy and read what it said from Codex's JSON events. */
function runCodex(
  command: Command,
  args: string[],
  cwd: string,
  prompt: string,
  timeoutMs: number,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command.file, [...command.prefix, ...args], {
      cwd,
      env: codexEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let said = "";
    let failed = "";
    let usage: Record<string, number> | undefined;
    let settled = false;
    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const read = (line: string) => {
      let event: {
        type?: string;
        item?: { type?: string; text?: unknown };
        usage?: Record<string, number>;
        error?: { message?: unknown };
        message?: unknown;
      };
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }
      if (
        event.type === "item.completed" &&
        event.item?.type === "agent_message" &&
        typeof event.item.text === "string"
      )
        said = event.item.text;
      if (event.type === "turn.completed") usage = event.usage;
      if (event.type === "turn.failed")
        failed = String(event.error?.message ?? "The turn failed.");
      if (event.type === "error" && typeof event.message === "string")
        failed = event.message;
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ ok: false, text: "The conversation did not finish in time." });
    }, timeoutMs);
    timer.unref?.();
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buffer += chunk;
      let at = buffer.indexOf("\n");
      while (at !== -1) {
        read(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
        at = buffer.indexOf("\n");
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (error) => finish({ ok: false, text: error.message }));
    child.on("close", (code) => {
      if (buffer.trim()) read(buffer);
      if (said && !failed && code === 0)
        finish({ ok: true, text: said, usage });
      else
        finish({
          ok: false,
          text:
            failed ||
            stderr.trim().split("\n").slice(-6).join("\n") ||
            "Codex could not answer.",
          usage,
        });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
  });
}

function logged(
  purpose: string,
  session: HandSession,
  started: number,
  run: RunResult,
) {
  const usage = run.usage;
  return logRun({
    at: new Date(started).toISOString(),
    purpose,
    brain: "codex",
    model: "default",
    session: session.id,
    ok: run.ok,
    ...(run.ok ? {} : { error: run.text.slice(0, 200) }),
    ms: Date.now() - started,
    ...(usage
      ? {
          usage: {
            input_tokens: usage.input_tokens ?? 0,
            output_tokens: usage.output_tokens ?? 0,
            cache_read_input_tokens: usage.cached_input_tokens ?? 0,
          },
        }
      : {}),
  }).catch(() => {});
}

const NOT_FOUND = "Codex was not found on this computer.";

/** Ask a copy of one of the person's Codex conversations; the conversation stays as it was. */
export async function askCodex(
  session: HandSession,
  prompt: string,
): Promise<{ ok: boolean; text: string }> {
  const command = codexCommand();
  if (!command) return { ok: false, text: NOT_FOUND };
  const started = Date.now();
  const run = await runCodex(
    command,
    forkArgs(session, session.cwd, sandboxConfig(deniedPaths(loadExcludes()))),
    session.cwd,
    prompt,
    ASK_TIMEOUT_MS,
  );
  await logged("session", session, started, run);
  return { ok: run.ok, text: run.text };
}

function codexWorkPrompt(task: string, copy: WorkCopy): string {
  return `Your person's clone hands you this task, which your person has taken on: ${task}

Work in the copy of this project at ${copy.dir}: make every change there, at the same paths. Your person's own folder, ${copy.root}, stays as it is and cannot be written to. When you are done, what you changed in the copy is shown to your person as one change, and reaches their folder only if they allow it. Commands run in a sandbox without network. What git ignores (dependencies such as node_modules, .env, build output) and the project's git history are not in the copy; read them in ${copy.root} when you need them. Do only what the task needs. When done, say in a few lines what you changed, what you checked and how, and anything left to do. Say that tests pass only if you ran them.`;
}

/** What the person decides on, as the card for applying changes shows it. */
export interface ChangeCard {
  session: string;
  folder: string;
  changed: string[];
  diff: string;
  copy: string;
}

/**
 * Put the change to the person. `within` says whether every file it changes is inside the
 * conversation's own folder (the one its work card named) and none in a folder they left out: only
 * then may a task they let change files there go in without this card.
 */
export type Approve = (
  card: ChangeCard,
  scope: { within: boolean },
) => Promise<"allow" | "deny" | "unanswered">;

/** Whether each changed path is in the conversation's folder within the copy, and none left out. */
export function withinFolder(
  copy: Pick<WorkCopy, "dir" | "cwd" | "root">,
  changed: Changes["changed"],
  excludes: readonly string[],
): boolean {
  const at = relative(copy.dir, copy.cwd).replaceAll(sep, "/");
  if (at.startsWith("..")) return false;
  return changed.every(({ path }) => {
    const inside = !at || path === at || path.startsWith(`${at}/`);
    return inside && !isExcluded(join(copy.root, path), excludes);
  });
}

const listOf = (changes: Changes) =>
  changes.changed.map(({ status, path }) => `${status} ${path}`);

/**
 * Have a copy of one of the person's Codex conversations do work in a separate copy of its
 * project, then put what it changed to the person (`approve`), and apply it to their folder only if
 * they allow it. The copy of the project is removed once that is decided; changes not applied are
 * kept as a patch file. The text is for the clone's brain.
 */
export async function workCodex(
  session: HandSession,
  task: string,
  approve: Approve,
): Promise<{ ok: boolean; text: string }> {
  const command = codexCommand();
  if (!command) return { ok: false, text: NOT_FOUND };
  const home = minimeHome();
  const excludes = loadExcludes();
  let copy: WorkCopy;
  try {
    copy = await makeWorkCopy(session.cwd, { home, excludes });
  } catch (error) {
    if (error instanceof CopyError && error.reason === "not-git")
      return {
        ok: false,
        text: `The folder of that conversation (${session.cwd}) is not in a git repository, so its work cannot be kept apart and shown to your person before it reaches their files. It can only be asked (ask_session); say so to your person.`,
      };
    return {
      ok: false,
      text: `Could not make a copy of the project to work in: ${(error as Error).message}`,
    };
  }
  try {
    const started = Date.now();
    const run = await runCodex(
      command,
      forkArgs(
        session,
        copy.cwd,
        sandboxConfig(deniedPaths(excludes), copy.dir),
      ),
      copy.cwd,
      codexWorkPrompt(task, copy),
      WORK_TIMEOUT_MS,
    );
    await logged("work", session, started, run);
    if (!run.ok)
      return {
        ok: false,
        text: `The conversation could not do it, and nothing in your person's files changed: ${run.text}`,
      };
    const changes = await changesIn(copy);
    if (!changes.changed.length)
      return {
        ok: true,
        text: `The conversation changed no files. It said:\n${run.text}`,
      };
    const changed = listOf(changes);
    let answer: Awaited<ReturnType<Approve>>;
    try {
      answer = await approve(
        {
          session: session.name ?? session.id,
          folder: copy.root,
          changed,
          diff: clip(changes.patch.toString("utf8"), CARD_DIFF_CHARS),
          copy: copy.dir,
        },
        { within: withinFolder(copy, changes.changed, excludes) },
      );
    } catch (error) {
      const kept = await keepPatch(home, changes.patch);
      return {
        ok: false,
        text: `Your person could not be asked (${(error as Error).message}), so nothing in their folder changed. The changes are kept in ${kept} (\`git apply\` in ${copy.root} applies them). The conversation said:\n${run.text}`,
      };
    }
    if (answer === "allow") {
      const applied = await applyChanges(copy.root, changes.patch);
      if (applied.ok)
        return {
          ok: true,
          text: `It did it in a separate copy of the project, and your person allowed the changes, now in their folder ${copy.root}:\n${changed.join("\n")}\nThe conversation said:\n${run.text}`,
        };
      const kept = await keepPatch(home, changes.patch);
      return {
        ok: false,
        text: `Your person allowed the changes, but git could not apply them to their folder as it is now (a file they touch changed since the work began), so nothing in it changed: ${applied.error}\nThe changes are kept in ${kept}.`,
      };
    }
    const kept = await keepPatch(home, changes.patch);
    return {
      ok: false,
      text: `${answer === "deny" ? "Your person did not let the changes into their files" : "Your person did not answer in time"}, so nothing in their folder changed. The changes are kept in ${kept} (\`git apply\` in ${copy.root} applies them). The conversation said:\n${run.text}`,
    };
  } catch (error) {
    return {
      ok: false,
      text: `The work could not be finished, and nothing in your person's files changed: ${(error as Error).message}`,
    };
  } finally {
    await removeWorkCopy(copy, home);
  }
}
