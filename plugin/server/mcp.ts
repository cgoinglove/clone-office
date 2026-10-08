// A minimal MCP server over stdio: JSON-RPC 2.0, one message per line (the MCP stdio transport).
// It answers initialize, ping, tools/list and tools/call, which is all a tool server needs, and
// sends progress while a tool waits. Written by hand so the plugin carries no dependencies: an
// installed plugin is copied on its own, without node_modules.

import { createInterface } from "node:readline";

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** MCP's own place for more: `anthropic/alwaysLoad` keeps a tool out of Claude Code's tool search. */
  _meta?: Record<string, unknown>;
}

export interface ToolResult {
  content: { type: "text"; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

/** Reports how a long call is going; shown where the client shows a tool's progress. */
export type Progress = (message: string) => void;

export interface ServerSpec {
  name: string;
  version: string;
  instructions: string;
  tools: Tool[];
  call: (
    name: string,
    args: Record<string, unknown>,
    progress: Progress,
  ) => Promise<ToolResult>;
}

type Id = string | number;

interface Request {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

function write(message: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

export function text(value: string, isError = false): ToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(isError ? { isError } : {}),
  };
}

export function serve(spec: ServerSpec): void {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    if (!line.trim()) return;
    let request: Request;
    try {
      request = JSON.parse(line);
    } catch {
      write({ id: null, error: { code: -32700, message: "Parse error" } });
      return;
    }
    void handle(spec, request);
  });
  lines.on("close", () => process.exit(0));
}

async function handle(spec: ServerSpec, request: Request): Promise<void> {
  const { id, method, params = {} } = request;
  // A notification (no id) asks for no answer: initialized, cancelled.
  if (id === undefined) return;
  try {
    if (method === "initialize") {
      write({
        id,
        result: {
          protocolVersion:
            typeof params.protocolVersion === "string"
              ? params.protocolVersion
              : "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: spec.name, version: spec.version },
          instructions: spec.instructions,
        },
      });
    } else if (method === "ping") {
      write({ id, result: {} });
    } else if (method === "tools/list") {
      write({ id, result: { tools: spec.tools } });
    } else if (method === "tools/call") {
      const name = String(params.name ?? "");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const token = (params._meta as { progressToken?: Id } | undefined)
        ?.progressToken;
      let step = 0;
      const progress: Progress = (message) => {
        if (token === undefined) return;
        step += 1;
        write({
          method: "notifications/progress",
          params: { progressToken: token, progress: step, message },
        });
      };
      write({ id, result: await spec.call(name, args, progress) });
    } else {
      write({ id, error: { code: -32601, message: `No method ${method}` } });
    }
  } catch (error) {
    // A tool's own failure is a result the model reads, not a protocol error.
    if (method === "tools/call")
      write({ id, result: text((error as Error).message, true) });
    else
      write({ id, error: { code: -32603, message: (error as Error).message } });
  }
}
