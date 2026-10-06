// The mini-me's memory as an MCP server over stdio, so the brain (the person's own Claude Code)
// keeps its memory, skills and notes with tools, the way Hermes Agent does, and can search what
// its person did with their AI tools (../history). Node runs this file
// directly:
//   node features/minime/memory/mcp-server.ts
// MINIME_MEMORY_DIR sets where USER.md and MEMORY.md live (default ~/.sub-office/memories),
// MINIME_SKILLS_DIR where skills live (default ~/.sub-office/skills), MINIME_NOTES_DIR where
// notes live (default ~/.sub-office/notes). MINIME_ACTOR says who is writing: "minime" in a
// session with the person (default), "review" for the background review, which may change only
// what the mini-me made itself. In a conversation with the person, MINIME_GATE_URL,
// MINIME_GATE_SECRET and MINIME_CHAT_ID add the trust gate's tools (../gate/tools.ts).
// The same server can later be added to the person's own Claude Code, so every session they
// run shares what their mini-me knows.

import { homedir } from "node:os";
import { join } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  ASK_COLLEAGUE_TOOL,
  ASK_TOOL,
  COLLEAGUES_TOOL,
  callGateTool,
  colleaguesOpen,
  gateOpen,
  PERMISSION_TOOL,
} from "../gate/tools.ts";
import { CONVERSATION_TOOLS, callConversationTool } from "../history/tools.ts";
import { GUIDE_TOOL, readGuide } from "./guide.ts";
import { NOTE_TOOLS, NoteStore } from "./notes.ts";
import { type Actor, SKILL_TOOLS, SkillStore } from "./skills.ts";
import { MemoryStore } from "./store.ts";
import { callMemoryTool, MEMORY_TOOL } from "./tool.ts";

const home = join(homedir(), ".sub-office");
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

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
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
    ...(gateOpen ? [ASK_TOOL, PERMISSION_TOOL] : []),
    ...(colleaguesOpen ? [COLLEAGUES_TOOL, ASK_COLLEAGUE_TOOL] : []),
  ].map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  const operations = Array.isArray(args.operations) ? args.operations : [];
  switch (request.params.name) {
    case MEMORY_TOOL.name: {
      const result = await callMemoryTool(store, args);
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
        process.env.MINIME_GUIDE_DIR ?? join(process.cwd(), "guide"),
        typeof args.file === "string" ? args.file : undefined,
      );
      return text(guide, "error" in guide);
    }
    case ASK_TOOL.name:
    case PERMISSION_TOOL.name:
    case COLLEAGUES_TOOL.name:
    case ASK_COLLEAGUE_TOOL.name: {
      const { result, isError } = await callGateTool(request.params.name, args);
      return text(result, isError);
    }
    default:
      return text(`Unknown tool: ${request.params.name}`, true);
  }
});

await server.connect(new StdioServerTransport());
