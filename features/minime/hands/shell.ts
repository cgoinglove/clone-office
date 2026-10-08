// The clone's own shell, in the person's own work only (a conversation with them, or one of their
// flows; never while answering a colleague): commands run in its workspace folder
// (~/.clone-office/workspace) inside the operating system's own sandbox, as Claude Code runs its
// commands (Anthropic's sandbox runtime: Seatbelt on macOS, bubblewrap on Linux). A command may read
// what the person may read, except their keys and secrets, the clone's own sealed files and the
// folders they keep out; it may write only in the workspace and the system's temporary folder; and
// it reaches the network through the sandbox's own proxy, which never lets it reach this computer's
// own services or a cloud's metadata. `write_file` puts a file into the workspace in one piece, as
// Thursday's bots have it, because a long file written through the shell is where commands go wrong.
//
// Who decides: by hand ("ask"), every command is shown to the person first, with "from now on" for
// commands in the sandbox; on its own ("auto"), a command in the sandbox runs and is shown in the
// conversation. Where the sandbox cannot run (Windows, a Linux without bubblewrap, or folders kept
// out by name where only paths can be held), every command is asked, and never "from now on".

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { loadTrust } from "../gate/rules.ts";
import { askPermission, gateOpen } from "../gate/tools.ts";
import { loadExcludes } from "../server/exclude.ts";
import { minimeHome, workspaceDir } from "../server/paths.ts";
import { readPreferences } from "../server/preferences.ts";
import { BASH } from "./names.ts";

/** The longest a command may run, and how long when not told. */
const MAX_MS = 10 * 60_000;
const DEFAULT_MS = 2 * 60_000;
/** The most of a command's output kept, and how much of it the model sees (the rest goes to a file). */
const KEEP_BYTES = 8 * 1024 * 1024;
const SHOWN_CHARS = 30_000;

export const BASH_TOOL = {
  name: "bash",
  description:
    "Run a shell command in your workspace folder, inside this computer's sandbox: to work with files (convert, count, search, unzip, render), run a script, or use a command-line tool. It may read your person's files (never their keys, secrets or the folders they keep out) and writes only in the workspace and the temporary folder; make what you make in the workspace and give its path. The network goes through the sandbox and never reaches this computer's own services. Packages install into the workspace (npm, pip and the like keep their caches there). Your person may be asked first; describe in one plain line what the command does and why. Each call is a new shell, in the workspace.",
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      description: {
        type: "string",
        description:
          "One short line for your person: what it does and why, not the command again.",
      },
      timeout_ms: {
        type: "number",
        description: `How long it may take; ${DEFAULT_MS / 1000} seconds if left out, at most ${MAX_MS / 1000}.`,
      },
    },
    required: ["command", "description"],
  },
};

export const WRITE_FILE_TOOL = {
  name: "write_file",
  description:
    "Write a whole file into your workspace folder in one piece (a document, a page, a script, data): far safer than writing a long file through the shell. The path is inside the workspace (relative to it); folders are made as needed; an existing file is replaced. To change your person's own files, ask a conversation of theirs with work_session.",
  inputSchema: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "Inside the workspace, e.g. artifacts/plan/index.html",
      },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
};

// ---- The sandbox ----

/** Folders and files no command reads, wherever it runs: keys, secrets, mail and the clone's own. */
export function secretPaths(home = homedir(), clone = minimeHome()): string[] {
  const own = [
    "secret.key",
    "brain",
    "connectors",
    "messenger",
    "settings.json",
    "browser",
    "relay",
    "office",
  ].map((name) => join(clone, name));
  const theirs = [
    ".ssh",
    ".gnupg",
    ".aws",
    ".azure",
    ".config/gcloud",
    ".kube",
    ".docker",
    ".netrc",
    ".npmrc",
    ".pypirc",
    ".git-credentials",
    ".password-store",
    ".codex/auth.json",
    ".claude/.credentials.json",
    ".hermes/auth.json",
    "Library/Keychains",
    "Library/Cookies",
    "Library/Mail",
    "Library/Messages",
    "Library/Application Support/Google/Chrome",
    "Library/Application Support/Firefox",
    "Library/Application Support/Microsoft Edge",
    "Library/Application Support/BraveSoftware",
    "Library/Safari",
    ".mozilla",
    ".config/google-chrome",
    ".config/chromium",
  ].map((name) => join(home, name));
  return [...own, ...theirs];
}

/**
 * The folders kept out, as the sandbox can hold them: a path always; a name pattern ("client-*")
 * only where the sandbox takes patterns (macOS). `held` is false when some cannot be held here.
 */
export function keptOut(
  excludes: readonly string[],
  platform = process.platform,
  home = homedir(),
): { paths: string[]; held: boolean } {
  const paths: string[] = [];
  let held = true;
  for (const raw of excludes) {
    const pattern = raw.trim();
    if (!pattern) continue;
    if (pattern.startsWith("~")) paths.push(join(home, pattern.slice(1)));
    else if (isAbsolute(pattern)) paths.push(pattern);
    else if (platform === "darwin") paths.push(`**/${pattern}`);
    else held = false;
  }
  return { paths, held };
}

type Sandbox = { ok: true } | { ok: false; why: string };

let sandbox: Promise<Sandbox> | undefined;

/**
 * Starts the sandbox once for this tool server (a session): its proxies run in this process. A
 * system that cannot sandbox says why, and every command is then asked.
 */
function startSandbox(): Promise<Sandbox> {
  sandbox ??= (async (): Promise<Sandbox> => {
    try {
      const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
      if (!SandboxManager.isSupportedPlatform())
        return { ok: false, why: "no sandbox on this system" };
      const needs = await SandboxManager.checkDependenciesAsync();
      if (needs.errors.length)
        return { ok: false, why: needs.errors.join("; ") };
      const out = keptOut(loadExcludes());
      if (!out.held)
        return {
          ok: false,
          why: "folders kept out by name cannot be held by the sandbox here",
        };
      const workspace = workspaceDir();
      await mkdir(workspace, { recursive: true });
      await SandboxManager.initialize(
        {
          // Only what the person or their mode let run gets here, so the host it reaches is
          // theirs to have let: every host is let through the sandbox's proxy, which on its own
          // refuses this computer's own addresses and a cloud's metadata.
          network: { allowedDomains: [], deniedDomains: [] },
          filesystem: {
            denyRead: [...secretPaths(), ...out.paths],
            allowWrite: [workspace, tmpdir()],
            denyWrite: [],
          },
        },
        async () => true,
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, why: (error as Error).message };
    }
  })();
  return sandbox;
}

// ---- Running ----

/** A variable named like a key, a token or a secret: never handed to a command (after Thursday). */
const SECRET_NAME =
  /KEY|TOKEN|SECRET|PASS|_PWD|CREDENTIAL|_AUTH|_DSN|DATABASE_URL|COOKIE|SESSION/i;
/** What the app set for itself, which a command would mistake for its own. */
const APP_OWN =
  /^(PORT|HOSTNAME|NODE_ENV|INIT_CWD|NEXT_MANUAL_SIG_HANDLE)$|^_*NEXT_|^TURBOPACK|^npm_|^MINIME_|^CLONE_OFFICE_/i;

/** The environment a command runs with: the person's own, less secrets and the app's, caches kept in the workspace. */
export function shellEnv(
  base: NodeJS.ProcessEnv = process.env,
  workspace = workspaceDir(),
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(base))
    if (!SECRET_NAME.test(name) && !APP_OWN.test(name)) env[name] = value;
  const cache = join(workspace, ".cache");
  return {
    ...env,
    TERM: "dumb",
    PAGER: "cat",
    GIT_PAGER: "cat",
    NO_COLOR: "1",
    XDG_CACHE_HOME: cache,
    npm_config_cache: join(cache, "npm"),
    PIP_CACHE_DIR: join(cache, "pip"),
    PLAYWRIGHT_BROWSERS_PATH: join(cache, "ms-playwright"),
  };
}

/** Long output, as the model takes it: the head and the tail, the whole kept in a file it can read. */
export function fold(text: string, file?: string): string {
  if (text.length <= SHOWN_CHARS) return text;
  const head = text.slice(0, Math.floor(SHOWN_CHARS * 0.7));
  const tail = text.slice(-Math.floor(SHOWN_CHARS * 0.3));
  return `${head}\n\n[… ${text.length - head.length - tail.length} characters cut${file ? `; the whole output is in ${file}` : ""} …]\n\n${tail}`;
}

const shell =
  process.platform === "win32"
    ? undefined
    : (["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"].find((path) =>
        existsSync(path),
      ) ?? "/bin/sh");

/** Runs one command, sandboxed when it can be, and answers what it printed and how it ended. */
async function run(
  command: string,
  sandboxed: boolean,
  timeoutMs: number,
): Promise<string> {
  const workspace = workspaceDir();
  await mkdir(workspace, { recursive: true });
  const id = randomUUID();
  let line = command;
  if (sandboxed) {
    const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
    line = await SandboxManager.wrapWithSandbox(
      command,
      shell,
      undefined,
      undefined,
      {
        commandId: id,
      },
    );
  }
  const output = await new Promise<{
    text: string;
    code: number | null;
    timedOut: boolean;
  }>((done) => {
    const child = spawn(line, {
      shell: shell ?? true,
      cwd: workspace,
      env: shellEnv() as NodeJS.ProcessEnv,
      stdio: ["ignore", "pipe", "pipe"],
      // Its own group, so a timeout ends everything it started.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    let size = 0;
    const take = (chunk: Buffer) => {
      if (size >= KEEP_BYTES) return;
      chunks.push(chunk);
      size += chunk.length;
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid && process.platform !== "win32")
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      done({ text: error.message, code: null, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ text: Buffer.concat(chunks).toString("utf8"), code, timedOut });
    });
  });
  let text = output.text;
  if (sandboxed) {
    const { SandboxManager } = await import("@anthropic-ai/sandbox-runtime");
    text = SandboxManager.annotateStderrWithSandboxFailures(id, text);
    SandboxManager.cleanupAfterCommand();
  }
  let file: string | undefined;
  if (text.length > SHOWN_CHARS) {
    file = join(workspace, ".outputs", `${id}.txt`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, text).catch(() => {
      file = undefined;
    });
  }
  const ended = output.timedOut
    ? `stopped after ${Math.round(timeoutMs / 1000)} seconds`
    : `exit code ${output.code ?? "none"}`;
  return `${fold(text, file).trimEnd() || "(no output)"}\n\n[${ended}${sandboxed ? "" : "; ran outside the sandbox"}]`;
}

/** Whether a command may run without asking: in the sandbox, and let by the person's mode or a rule. */
async function mayRunAlone(sandboxed: boolean): Promise<boolean> {
  if (!sandboxed) return false;
  if ((await readPreferences()).autonomy === "auto") return true;
  return (await loadTrust()).includes(BASH);
}

export async function callShellTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  if (name === WRITE_FILE_TOOL.name) return writeInWorkspace(args);
  const command = String(args.command ?? "").trim();
  if (!command) return { result: "Give a command.", isError: true };
  const description = String(args.description ?? "").slice(0, 300);
  const timeoutMs = Math.min(
    MAX_MS,
    Math.max(1_000, Number(args.timeout_ms) || DEFAULT_MS),
  );
  const box = await startSandbox();
  const sandboxed = box.ok;
  if (!(await mayRunAlone(sandboxed))) {
    if (!gateOpen)
      return {
        result:
          "Not run: your person has not let you run commands without asking, and nobody is here to ask. Say plainly what you could not do.",
        isError: true,
      };
    const answer = await askPermission(BASH, {
      command,
      description,
      sandboxed,
      ...(box.ok ? {} : { why: box.why }),
    }).catch(() => "unanswered" as const);
    if (answer !== "allow")
      return {
        result:
          answer === "deny"
            ? "Your person said no. Do not try another way to do the same thing; tell them what you could not do."
            : "Your person did not answer in time. Tell them what you wanted to run and why.",
        isError: true,
      };
  }
  try {
    return { result: await run(command, sandboxed, timeoutMs), isError: false };
  } catch (error) {
    return {
      result: `Could not run it: ${(error as Error).message}`,
      isError: true,
    };
  }
}

/** A path inside the workspace, or why not; links leading out of it are refused. */
export async function insideWorkspace(
  given: string,
  workspace = workspaceDir(),
): Promise<{ path: string } | { error: string }> {
  const trimmed = given.trim();
  if (!trimmed) return { error: "Give a path inside the workspace." };
  const path = isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(workspace, trimmed);
  const rel = relative(workspace, path);
  if (!rel || rel.startsWith("..") || isAbsolute(rel))
    return { error: `Only inside the workspace (${workspace}).` };
  // The deepest folder that already exists must itself be inside, so a link cannot lead out.
  let existing = dirname(path);
  while (
    !(await stat(existing).then(
      () => true,
      () => false,
    ))
  )
    existing = dirname(existing);
  const real = await realpath(existing).catch(() => existing);
  const realWorkspace = await realpath(workspace).catch(() => workspace);
  if (real !== realWorkspace && !real.startsWith(realWorkspace + sep))
    return { error: "That folder leads out of the workspace." };
  return { path };
}

async function writeInWorkspace(
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  const workspace = workspaceDir();
  await mkdir(workspace, { recursive: true });
  const where = await insideWorkspace(String(args.path ?? ""), workspace);
  if ("error" in where) return { result: where.error, isError: true };
  const content = String(args.content ?? "");
  if (Buffer.byteLength(content, "utf8") > 10 * 1024 * 1024)
    return { result: "Too large for one file (10 MB).", isError: true };
  await mkdir(dirname(where.path), { recursive: true });
  await writeFile(where.path, content);
  return {
    result: `Wrote ${relative(workspace, where.path).split(sep).join("/")} (${content.length} characters) in the workspace: ${where.path}`,
    isError: false,
  };
}
