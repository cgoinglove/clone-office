// The mini-me's memory as an MCP server over stdio, so the brain (the person's own Claude Code)
// keeps its memory, skills and notes with tools, the way Hermes Agent does, and can search what
// its person did with their AI tools (../history). Node runs this file
// directly:
//   node features/minime/memory/mcp-server.ts
// MINIME_MEMORY_DIR sets where USER.md and MEMORY.md live (default ~/.clone-office/memories),
// MINIME_SKILLS_DIR where skills live (default ~/.clone-office/skills), MINIME_NOTES_DIR where
// notes live (default ~/.clone-office/notes). MINIME_ACTOR says who is writing: "minime" in a
// session with the person (default), "review" for the background review, which may change only
// what the mini-me made itself. In a conversation with the person, MINIME_GATE_URL,
// MINIME_GATE_SECRET and MINIME_CHAT_ID add the trust gate's tools (../gate/tools.ts).
// The same server can later be added to the person's own Claude Code, so every session they
// run shares what their mini-me knows.

import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { callFlowTool, FLOW_MANAGE_TOOL, FLOWS_TOOL } from "../flows/tools.ts";
import {
  ASK_BY_LINK_TOOL,
  ASK_COLLEAGUE_TOOL,
  ASK_TOOL,
  COLLEAGUES_TOOL,
  callGateTool,
  colleaguesOpen,
  gateOpen,
  PERMISSION_TOOL,
} from "../gate/tools.ts";
import {
  ASK_SESSION_TOOL,
  callHandsTool,
  SESSIONS_TOOL,
  WORK_SESSION_TOOL,
} from "../hands/tools.ts";
import { CONVERSATION_TOOLS, callConversationTool } from "../history/tools.ts";
import { OFFICE_INBOX_TOOL, officeInbox } from "../office/inbox-tool.ts";
import { LEAVE_OUT_TOOL, leaveOut } from "../server/leave-out.ts";
import { appDir, minimeHome } from "../server/paths.ts";
import { GUIDE_TOOL, readGuide } from "./guide.ts";
import { NOTE_TOOLS, NoteStore } from "./notes.ts";
import { type Actor, SKILL_TOOLS, SkillStore } from "./skills.ts";
import { MemoryStore } from "./store.ts";
import { callMemoryTool, MEMORY_TOOL } from "./tool.ts";

const home = minimeHome();
const actor: Actor =
  process.env.MINIME_ACTOR === "review" ? "review" : "minime";
// One store per server process: Claude Code starts one server per session, so the failure count
// that ends a consolidation loop, and what has been read before a write, are per session.
const store = new MemoryStore(
  process.env.MINIME_MEMORY_DIR ?? join(home, "memories"),
);
const skills = new SkillStore(
  process.env.MINIME_SKILLS_DIR ?? join(home, "skills"),
  actor,
);
const notes = new NoteStore(
  process.env.MINIME_NOTES_DIR ?? join(home, "notes"),
  actor === "review" ? "review" : "session",
);

const text = (value: unknown, isError = false) => ({
  content: [
    {
      type: "text" as const,
      text: typeof value === "string" ? value : JSON.stringify(value),
    },
  ],
  isError,
});

const server = new Server(
  { name: "minime", version: "0.2.0" },
  { capabilities: { tools: {} } },
);

// A working copy of the person's conversation is given this server only to ask the person
// before each change: it sees the permission prompt and nothing of the mini-me's.
const permissionOnly = process.env.MINIME_ROLE === "permission";

// Answering a colleague's request, or speaking in a meeting of the clones: the person's own office,
// flows and settings stay out of it, so nothing of other colleagues' requests can reach what goes
// to colleagues, and a colleague's words never change what the person set.
const answering =
  (process.env.MINIME_CHAT_ID ?? "").startsWith("office-request-") ||
  process.env.MINIME_AUDIENCE === "colleagues";
const PERSON_ONLY = new Set([
  "flows",
  "office_inbox",
  "flow_manage",
  "leave_out_folder",
]);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: (permissionOnly
    ? [PERMISSION_TOOL]
    : [
        MEMORY_TOOL,
        SKILL_TOOLS.list,
        SKILL_TOOLS.view,
        SKILL_TOOLS.manage,
        NOTE_TOOLS.search,
        NOTE_TOOLS.view,
        NOTE_TOOLS.write,
        CONVERSATION_TOOLS.search,
        CONVERSATION_TOOLS.read,
        GUIDE_TOOL,
        ...(answering ? [] : [FLOWS_TOOL, OFFICE_INBOX_TOOL]),
        ...(gateOpen
          ? [
              ASK_TOOL,
              PERMISSION_TOOL,
              SESSIONS_TOOL,
              ASK_SESSION_TOOL,
              WORK_SESSION_TOOL,
              ...(answering ? [] : [LEAVE_OUT_TOOL, FLOW_MANAGE_TOOL]),
            ]
          : []),
        ...(colleaguesOpen
          ? [COLLEAGUES_TOOL, ASK_COLLEAGUE_TOOL, ASK_BY_LINK_TOOL]
          : []),
      ]
  ).map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const operations = Array.isArray(args.operations) ? args.operations : [];
  if (
    (permissionOnly && request.params.name !== PERMISSION_TOOL.name) ||
    (answering && PERSON_ONLY.has(request.params.name))
  )
    return text(`Unknown tool: ${request.params.name}`, true);
  switch (request.params.name) {
    case MEMORY_TOOL.name: {
      const result = await callMemoryTool(store, args, actor === "review");
      return text(result, !result.success);
    }
    case SKILL_TOOLS.list.name:
      return text(
        await skills.list(
          typeof args.category === "string" ? args.category : undefined,
        ),
      );
    case SKILL_TOOLS.view.name: {
      const view = await skills.view(
        String(args.name ?? ""),
        typeof args.file_path === "string" && args.file_path
          ? args.file_path
          : undefined,
      );
      return text(view, "error" in view);
    }
    case SKILL_TOOLS.manage.name: {
      const result = await skills.apply(operations);
      return text(result, !result.success);
    }
    case NOTE_TOOLS.search.name:
      return text(await notes.search(String(args.query ?? "")));
    case NOTE_TOOLS.view.name: {
      const view = await notes.view(String(args.path ?? ""));
      return text(view, "error" in view);
    }
    case NOTE_TOOLS.write.name: {
      const result = await notes.apply(operations);
      return text(result, !result.success);
    }
    case CONVERSATION_TOOLS.search.name:
    case CONVERSATION_TOOLS.read.name: {
      const { result, isError } = await callConversationTool(
        request.params.name,
        args,
      );
      return text(result, isError);
    }
    case GUIDE_TOOL.name: {
      const guide = await readGuide(
        process.env.MINIME_GUIDE_DIR ?? join(appDir(), "guide"),
        typeof args.file === "string" ? args.file : undefined,
      );
      return text(guide, "error" in guide);
    }
    case SESSIONS_TOOL.name:
    case ASK_SESSION_TOOL.name:
    case WORK_SESSION_TOOL.name: {
      const { result, isError } = await callHandsTool(
        request.params.name,
        args,
      );
      return text(result, isError);
    }
    case OFFICE_INBOX_TOOL.name: {
      const { result, isError } = await officeInbox(args);
      return text(result, isError);
    }
    case FLOWS_TOOL.name:
    case FLOW_MANAGE_TOOL.name: {
      const { result, isError } = await callFlowTool(request.params.name, args);
      return text(result, isError);
    }
    case LEAVE_OUT_TOOL.name: {
      const { result, isError } = await leaveOut(args);
      return text(result, isError);
    }
    case ASK_TOOL.name:
    case PERMISSION_TOOL.name:
    case COLLEAGUES_TOOL.name:
    case ASK_COLLEAGUE_TOOL.name:
    case ASK_BY_LINK_TOOL.name: {
      const { result, isError } = await callGateTool(request.params.name, args);
      return text(result, isError);
    }
    default:
      return text(`Unknown tool: ${request.params.name}`, true);
  }
});

await server.connect(new StdioServerTransport());
