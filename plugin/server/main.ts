// The plugin's MCP server, which Claude Code starts from ../.mcp.json: node server/main.ts
// (Node 22.18 or later runs TypeScript as it is).

import { serve } from "./mcp.ts";
import { callTool, INSTRUCTIONS, TOOLS } from "./office.ts";

serve({
  name: "clone-office",
  version: "0.1.0",
  instructions: INSTRUCTIONS,
  tools: TOOLS,
  call: callTool,
});
