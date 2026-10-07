// The header a session's connection to a service's MCP server carries, made each time Claude Code
// connects (its headersHelper, run by the session): the access token, refreshed first when it has
// run out. It prints {} when there is none, so the service turns the connection away and the
// session goes on without that service, rather than failing.
//
//   node headers.ts <connector id> [<the clone's folder>]
//
// The folder comes as an argument, so the helper finds the clone's tokens whatever environment
// Claude Code runs its helpers with (it narrows that environment for some kinds of helper).

export {};

const id = process.argv[2] ?? process.env.CLAUDE_CODE_MCP_SERVER_NAME ?? "";
if (process.argv[3]) process.env.SUB_OFFICE_HOME = process.argv[3];
try {
  const { accessToken } = await import("./oauth.ts");
  const token = await accessToken(id);
  process.stdout.write(JSON.stringify({ Authorization: `Bearer ${token}` }));
} catch (error) {
  process.stderr.write(`sub-office ${id}: ${(error as Error).message}\n`);
  process.stdout.write("{}");
}
