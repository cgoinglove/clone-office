// The tools a mini-me's own loop (loop.ts) gives its model, named and shaped as in a Claude Code
// session so the gate, its cards and "from now on" work alike whichever brain thinks: the
// mini-me's own tool server and the services its person connected (both MCP, reached as Claude
// Code reaches them), and reading their files and the web (Claude Code's Read, Glob, Grep and
// WebFetch). What the person has not let it do alone is asked on their screen through the gate;
// with nobody to ask, it is refused. Folders they kept out stay out whatever is asked.

import { glob, readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import type { Connector } from "../connectors/catalog.ts";
import { accessToken } from "../connectors/oauth.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";

/** A rule's folder as a path: "~/x" from home, "//x" absolute (gate/rules.ts pathRule). */
function rulePath(spec: string): string {
  const folder = spec.replace(/\/\*\*$/, "");
  if (folder === "~") return homedir();
  if (folder.startsWith("~/")) return join(homedir(), folder.slice(2));
  if (folder.startsWith("//")) return folder.slice(1);
  return folder;
}

/** A path the model gave, as a full path: "~" is home, and a bare one is taken from home. */
export function fullPath(path: unknown): string {
  const given = String(path ?? "").trim();
  if (!given || given === "~") return homedir();
  if (given.startsWith("~/")) return join(homedir(), given.slice(2));
  return isAbsolute(given) ? resolve(given) : resolve(homedir(), given);
}

const within = (path: string, folder: string) => {
  const rel = relative(folder, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

/** The file or folder a reading tool's call is about. */
function targetOf(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  if (tool === "Read") return fullPath(input.file_path);
  if (tool === "Glob" || tool === "Grep") return fullPath(input.path);
  return undefined;
}

/**
 * Whether one of these rules (Claude Code's permission syntax, as gate/rules.ts writes them) covers
 * the call: a tool by its name, reading under a folder (Read, Glob, Grep), a site for WebFetch.
 */
export function ruleAllows(
  rules: readonly string[],
  tool: string,
  input: Record<string, unknown>,
): boolean {
  for (const rule of rules) {
    if (rule === tool) return true;
    const found = /^(Read|Edit|WebFetch)\((.+)\)$/.exec(rule);
    if (!found) continue;
    const [, kind, spec] = found;
    const target = targetOf(tool, input);
    if (kind === "Read" && target && within(target, rulePath(spec)))
      return true;
    if (
      kind === "WebFetch" &&
      tool === "WebFetch" &&
      spec.startsWith("domain:")
    )
      try {
        if (new URL(String(input.url)).hostname === spec.slice(7)) return true;
      } catch {
        // Not an address: no rule covers it.
      }
  }
  return false;
}

/** Whether the call reaches into a folder the person kept out. */
export function keptOut(
  deny: readonly string[],
  tool: string,
  input: Record<string, unknown>,
): boolean {
  if (ruleAllows(deny, tool, input)) return true;
  const target = targetOf(tool, input);
  return Boolean(target && isExcluded(target, loadExcludes()));
}

// ---- Reading the person's files and the web, as Claude Code's own tools do ----

const READ_LINES = 2000;
const LINE_CHARS = 2000;
const FILE_BYTES = 5 * 1024 * 1024;
const FOUND_MAX = 200;
const GREP_FILES = 20_000;
const GREP_MATCHES = 100;
const GREP_MS = 15_000;
const SKIPPED = new Set([".git", "node_modules", ".next", "dist", "build"]);
const PAGE_CHARS = 40_000;

async function readTool(input: Record<string, unknown>): Promise<string> {
  const path = fullPath(input.file_path);
  const info = await stat(path).catch(() => undefined);
  if (!info) return `No file at ${path}.`;
  if (info.isDirectory()) return `${path} is a folder: list it with Glob.`;
  if (info.size > FILE_BYTES)
    return `${path} is too large to read (${Math.round(info.size / 1048576)} MB).`;
  const buffer = await readFile(path);
  if (buffer.subarray(0, 8000).includes(0))
    return `${path} is not text (${info.size} bytes).`;
  const lines = buffer.toString("utf8").split("\n");
  const start = Math.max(0, Number(input.offset ?? 1) - 1 || 0);
  const count = Math.max(1, Number(input.limit ?? READ_LINES) || READ_LINES);
  const shown = lines.slice(start, start + count);
  const rest = lines.length - start - shown.length;
  return `${shown
    .map(
      (line, i) =>
        `${String(start + i + 1).padStart(6)}\t${line.length > LINE_CHARS ? `${line.slice(0, LINE_CHARS)}…` : line}`,
    )
    .join(
      "\n",
    )}${rest > 0 ? `\n… ${rest} more lines (read on with offset)` : ""}`;
}

async function globTool(input: Record<string, unknown>): Promise<string> {
  const base = fullPath(input.path);
  const pattern = String(input.pattern ?? "**/*");
  const excludes = loadExcludes();
  const found: string[] = [];
  for await (const entry of glob(pattern, {
    cwd: base,
    exclude: (name: string) => SKIPPED.has(name.split(/[\\/]/).at(-1) ?? ""),
  })) {
    const path = join(base, String(entry));
    if (isExcluded(path, excludes)) continue;
    found.push(path);
    if (found.length >= FOUND_MAX) break;
  }
  return found.length
    ? `${found.join("\n")}${found.length >= FOUND_MAX ? `\n… stopped at ${FOUND_MAX}` : ""}`
    : `Nothing matches ${pattern} under ${base}.`;
}

async function grepTool(input: Record<string, unknown>): Promise<string> {
  const base = fullPath(input.path);
  let pattern: RegExp;
  try {
    pattern = new RegExp(
      String(input.pattern ?? ""),
      input["-i"] || input.case_insensitive ? "i" : "",
    );
  } catch {
    return "That is not a valid regular expression.";
  }
  const only = typeof input.glob === "string" ? input.glob : undefined;
  const nameMatch = only
    ? new RegExp(
        `^${only
          .replace(/[.+^${}()|[\]\\]/g, "\\$&")
          .replaceAll("*", ".*")
          .replaceAll("?", ".")}$`,
        "i",
      )
    : undefined;
  const excludes = loadExcludes();
  const until = Date.now() + GREP_MS;
  const matches: string[] = [];
  const folders = [base];
  let files = 0;
  const one = await stat(base).catch(() => undefined);
  if (one?.isFile()) folders.length = 0;
  const look = async (path: string) => {
    if (matches.length >= GREP_MATCHES) return;
    const info = await stat(path).catch(() => undefined);
    if (!info || info.size > 1024 * 1024) return;
    const text = await readFile(path, "utf8").catch(() => "");
    if (text.includes("\u0000")) return;
    text.split("\n").forEach((line, index) => {
      if (matches.length < GREP_MATCHES && pattern.test(line))
        matches.push(`${path}:${index + 1}:${line.slice(0, 300)}`);
    });
  };
  if (one?.isFile()) await look(base);
  while (
    folders.length &&
    matches.length < GREP_MATCHES &&
    files < GREP_FILES &&
    Date.now() < until
  ) {
    const folder = folders.shift() as string;
    const entries = await readdir(folder, { withFileTypes: true }).catch(
      () => [],
    );
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (SKIPPED.has(entry.name) || isExcluded(path, excludes)) continue;
      if (entry.isDirectory()) folders.push(path);
      else if (entry.isFile() && (!nameMatch || nameMatch.test(entry.name))) {
        files++;
        await look(path);
      }
    }
  }
  return matches.length
    ? matches.join("\n")
    : `No match for ${pattern} under ${base}.`;
}

/** A web page as text: what a person reads of it, without its scripts and markup. */
export function pageText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(
      /<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi,
      "\n",
    )
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

async function webFetchTool(input: Record<string, unknown>): Promise<string> {
  let address: URL;
  try {
    address = new URL(String(input.url ?? ""));
  } catch {
    return "That is not a web address.";
  }
  if (!/^https?:$/.test(address.protocol))
    return "Only http and https pages can be opened.";
  const response = await fetch(address, {
    signal: AbortSignal.timeout(20_000),
    redirect: "follow",
    headers: { "user-agent": "sub-office (a person's clone)" },
  }).catch((error: Error) => error);
  if (response instanceof Error)
    return `The page could not be opened: ${response.message}`;
  const type = response.headers.get("content-type") ?? "";
  const body = (await response.text().catch(() => "")).slice(0, 3_000_000);
  const text = /html/i.test(type) ? pageText(body) : body;
  return `${response.status} ${response.url}\n\n${text.slice(0, PAGE_CHARS)}${text.length > PAGE_CHARS ? "\n…" : ""}`;
}

const LOCAL_TOOLS: Record<
  string,
  {
    description: string;
    schema: Record<string, unknown>;
    run: (input: Record<string, unknown>) => Promise<string>;
  }
> = {
  Read: {
    description:
      "Read a text file on your person's computer, by its full path. Lines come numbered; read a long file in parts with offset (the first line to read) and limit.",
    schema: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "The file's full path" },
        offset: { type: "number" },
        limit: { type: "number" },
      },
      required: ["file_path"],
    },
    run: readTool,
  },
  Glob: {
    description:
      'Find files by name pattern ("**/*.md", "src/**/*.ts") under a folder (path; your person\'s home when left out).',
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string", description: "The folder to look in" },
      },
      required: ["pattern"],
    },
    run: globTool,
  },
  Grep: {
    description:
      'Search inside files for a regular expression, under a folder or in one file (path); glob narrows the file names ("*.md"), -i ignores case. Answers path:line:text.',
    schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        path: { type: "string" },
        glob: { type: "string" },
        "-i": { type: "boolean" },
      },
      required: ["pattern", "path"],
    },
    run: grepTool,
  },
  WebFetch: {
    description:
      "Open a web page and read its text. prompt says what you are looking for there.",
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        prompt: { type: "string" },
      },
      required: ["url"],
    },
    run: webFetchTool,
  },
};

// ---- MCP servers: the mini-me's own, and the services connected ----

/** A tool's name as Claude Code gives it: mcp__<server>__<tool>, within what every vendor takes. */
export const mcpToolName = (server: string, tool: string) =>
  `mcp__${server}__${tool.replace(/[^a-zA-Z0-9_-]/g, "_")}`.slice(0, 64);

/** What a tool call answered, as text for the model. */
function resultText(result: { content?: unknown; isError?: unknown }): string {
  const parts = Array.isArray(result.content) ? result.content : [];
  const text = parts
    .map(
      (part: { type?: string; text?: string; resource?: { text?: string } }) =>
        part.type === "text"
          ? (part.text ?? "")
          : part.type === "resource"
            ? (part.resource?.text ?? "[resource]")
            : part.type
              ? `[${part.type}]`
              : "",
    )
    .join("");
  return result.isError ? `Error: ${text}` : text;
}

export interface Servers {
  clients: { name: string; client: Client }[];
  close: () => Promise<void>;
}

/** Connects the mini-me's own tool server and the services connected; a service that fails is left out. */
export async function connectServers(options: {
  toolServer: { command: string; args: string[]; env: Record<string, string> };
  connectors: Connector[];
  /** Stands in for a server in tests. */
  extra?: { name: string; transport: Transport }[];
}): Promise<Servers> {
  const clients: { name: string; client: Client }[] = [];
  const join = async (name: string, transport: Transport) => {
    const client = new Client({ name: "sub-office", version: "1" });
    await client.connect(transport, { timeout: 30_000 });
    clients.push({ name, client });
  };
  await join(
    "minime",
    new StdioClientTransport({
      command: options.toolServer.command,
      args: options.toolServer.args,
      env: options.toolServer.env,
      stderr: "ignore",
    }),
  );
  for (const entry of options.connectors) {
    const token = await accessToken(entry.id).catch(() => undefined);
    if (!token) continue;
    await join(
      entry.id,
      new StreamableHTTPClientTransport(new URL(entry.url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    ).catch(() => {});
  }
  for (const server of options.extra ?? [])
    await join(server.name, server.transport);
  return {
    clients,
    close: async () => {
      await Promise.allSettled(clients.map(({ client }) => client.close()));
    },
  };
}

// ---- The gate ----

/** Where questions go: the app's gate route, as the tool server reaches it (gate/tools.ts). */
export interface LoopGate {
  url: string;
  secret: string;
  chat?: string;
}

type Answer =
  | { answered: true; answer: string; always?: boolean }
  | { answered: false };

/** Puts a question to the person and waits, asking again while the app says it is still waiting. */
export async function askGate(
  gate: LoopGate,
  ask: Record<string, unknown>,
): Promise<Answer> {
  const post = async (body: unknown) => {
    const response = await fetch(gate.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-sub-office": "1",
        "x-minime-gate": gate.secret,
      },
      body: JSON.stringify(body),
    });
    return (await response.json().catch(() => ({}))) as Record<string, unknown>;
  };
  let reply = await post({ chat: gate.chat, ask });
  while (reply.waiting) reply = await post({ id: reply.id });
  return reply.answered
    ? {
        answered: true,
        answer: String(reply.answer ?? ""),
        always: Boolean(reply.always),
      }
    : { answered: false };
}

export const REFUSED = {
  no: "Your person said no. Do not try another way to do the same thing; tell them what you could not do.",
  late: "Your person did not answer in time. Tell them what you wanted to do and why.",
  alone:
    "Not done: your person has not let you do this without asking, and nobody is here to ask. Say plainly what you could not do.",
  out: "Not done: that is in a folder your person keeps out of everything. Do not look for another way in.",
} as const;

export interface Guard {
  /** Rules the call may go by alone (Claude Code permission syntax), names of free tools among them. */
  allow: string[];
  /** Folders kept out, as rules no answer overrides. */
  deny: string[];
  /** Asks the person; without it, what is not allowed is refused. */
  gate?: LoopGate;
}

/** Runs a call as the person's rules allow it: alone, after asking them, or not at all. */
export async function guarded(
  guard: Guard,
  tool: string,
  input: Record<string, unknown>,
  run: () => Promise<string>,
): Promise<string> {
  if (keptOut(guard.deny, tool, input)) return REFUSED.out;
  if (!ruleAllows(guard.allow, tool, input)) {
    if (!guard.gate) return REFUSED.alone;
    const answer = await askGate(guard.gate, {
      kind: "permission",
      tool,
      input,
    });
    if (!answer.answered) return REFUSED.late;
    if (answer.answer !== "allow") return REFUSED.no;
  }
  return run();
}

/**
 * The tools a session's model may call: its own tool server's (as allowed for the session), the
 * connected services', and reading files and the web when the session may read at all.
 */
export async function loopTools(options: {
  servers: Servers;
  guard: Guard;
  /** Claude Code's reading tools are offered: a session with the gate or standing rules. */
  reads: boolean;
  /** Only these of the mini-me's own tools are offered (a session with nobody to ask or answer). */
  only?: Set<string>;
  /** A call that finished: its name, input and the text it answered. */
  onResult?: (
    tool: string,
    input: Record<string, unknown>,
    text: string,
  ) => void;
}): Promise<ToolSet> {
  const tools: ToolSet = {};
  for (const { name: server, client } of options.servers.clients) {
    let cursor: string | undefined;
    do {
      const page = await client.listTools(cursor ? { cursor } : {});
      for (const tool of page.tools) {
        // The gate's own way in for Claude Code; this loop asks the gate itself.
        if (server === "minime" && tool.name === "permission_prompt") continue;
        const name = mcpToolName(server, tool.name);
        if (options.only && !options.only.has(name)) continue;
        tools[name] = dynamicTool({
          description: tool.description ?? "",
          inputSchema: jsonSchema(
            (tool.inputSchema ?? { type: "object" }) as never,
          ),
          execute: async (raw) => {
            const input = (raw ?? {}) as Record<string, unknown>;
            const text = await guarded(options.guard, name, input, async () =>
              resultText(
                (await client.callTool(
                  { name: tool.name, arguments: input },
                  undefined,
                  // A question to the person can wait ten minutes inside one call.
                  { timeout: 11 * 60_000, resetTimeoutOnProgress: true },
                )) as { content?: unknown; isError?: unknown },
              ),
            );
            options.onResult?.(name, input, text);
            return text;
          },
        });
      }
      cursor = page.nextCursor;
    } while (cursor);
  }
  if (options.reads)
    for (const [name, local] of Object.entries(LOCAL_TOOLS))
      tools[name] = dynamicTool({
        description: local.description,
        inputSchema: jsonSchema(local.schema as never),
        execute: async (raw) => {
          const input = (raw ?? {}) as Record<string, unknown>;
          const text = await guarded(options.guard, name, input, () =>
            local.run(input).catch((error: Error) => `Error: ${error.message}`),
          );
          options.onResult?.(name, input, text);
          return text;
        },
      });
  return tools;
}
