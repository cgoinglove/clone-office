// The header a session's connection to a service's MCP server carries, made each time Claude Code
// connects (its headersHelper, run by the session): the access token, refreshed first when it has
// run out. It prints {} when there is none, so the service turns the connection away and the
// session goes on without that service, rather than failing.
//
//   node headers.ts <connector id>

import { accessToken } from "./oauth.ts";

const id = process.argv[2] ?? process.env.CLAUDE_CODE_MCP_SERVER_NAME ?? "";
try {
  const token = await accessToken(id);
  process.stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
} catch (error) {
  process.stderr.write(`sub-office ${id}: ${(error as Error).message}\n`);
  process.stdout.write("{}");
}
