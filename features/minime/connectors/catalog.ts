// The services a mini-me can work in, each through its vendor's own MCP server (after Hermes
// Agent's optional-mcps and Claude Code's remote servers): only official, vendor-hosted servers,
// reached over HTTP. How each is signed in to differs:
//   "oauth"       the server registers this app itself (dynamic client registration), so the
//                 person only approves, in their browser (Notion, Linear, Atlassian)
//   "team-oauth"  the vendor wants an OAuth client registered first: someone on the team does it
//                 once (Google's client id and secret), then each person approves with their own
//                 account; the tokens stay on their computer
//   "token"       a personal token the person makes at the vendor and pastes (GitHub)
// No imports: the page lists it too.

export type ConnectorAuth =
  | { kind: "oauth" }
  | {
      kind: "team-oauth";
      provider: "google";
      scopes: string[];
      /** What the team's Google Cloud project turns on: the product's API and its MCP server. */
      apis: string[];
    }
  | { kind: "token"; make: string };

export interface Connector {
  /** Also its MCP server's name in a session: its tools read mcp__<id>__<tool>. */
  id: string;
  /** The vendor's own name for it; never translated. */
  name: string;
  url: string;
  auth: ConnectorAuth;
  docs: string;
}

const google = (api: string, scopes: string[]): ConnectorAuth => ({
  kind: "team-oauth",
  provider: "google",
  scopes: scopes.map((scope) => `https://www.googleapis.com/auth/${scope}`),
  apis: [
    `${api}.googleapis.com`,
    `${api.replace(/-json$/, "")}mcp.googleapis.com`,
  ],
});

export const CONNECTORS: Connector[] = [
  {
    id: "notion",
    name: "Notion",
    url: "https://mcp.notion.com/mcp",
    auth: { kind: "oauth" },
    docs: "https://developers.notion.com/docs/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    url: "https://mcp.linear.app/mcp",
    auth: { kind: "oauth" },
    docs: "https://linear.app/docs/mcp",
  },
  {
    id: "atlassian",
    name: "Jira & Confluence",
    url: "https://mcp.atlassian.com/v1/mcp/authv2",
    auth: { kind: "oauth" },
    docs: "https://support.atlassian.com/rovo/docs/getting-started-with-the-atlassian-remote-mcp-server/",
  },
  {
    id: "github",
    name: "GitHub",
    url: "https://api.githubcopilot.com/mcp/",
    auth: {
      kind: "token",
      make: "https://github.com/settings/personal-access-tokens/new",
    },
    docs: "https://github.com/github/github-mcp-server",
  },
  {
    id: "gmail",
    name: "Gmail",
    url: "https://gmailmcp.googleapis.com/mcp/v1",
    auth: google("gmail", ["gmail.readonly", "gmail.compose"]),
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "calendar",
    name: "Google Calendar",
    url: "https://calendarmcp.googleapis.com/mcp/v1",
    auth: google("calendar-json", [
      "calendar.calendarlist.readonly",
      "calendar.events.freebusy",
      "calendar.events.readonly",
    ]),
    docs: "https://developers.google.com/workspace/calendar/api/guides/configure-mcp-server",
  },
  {
    id: "drive",
    name: "Google Drive",
    url: "https://drivemcp.googleapis.com/mcp/v1",
    auth: google("drive", ["drive.readonly", "drive.file"]),
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "docs",
    name: "Google Docs",
    url: "https://docsmcp.googleapis.com/mcp/v1",
    auth: google("docs", [
      "drive.readonly",
      "drive.file",
      "documents.readonly",
      "documents",
    ]),
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
  {
    id: "sheets",
    name: "Google Sheets",
    url: "https://sheetsmcp.googleapis.com/mcp/v1",
    auth: google("sheets", [
      "drive.readonly",
      "drive.file",
      "spreadsheets.readonly",
      "spreadsheets",
    ]),
    docs: "https://developers.google.com/workspace/guides/configure-mcp-servers",
  },
];

export function connector(id: string): Connector | undefined {
  return CONNECTORS.find((entry) => entry.id === id);
}

/** The connector a tool belongs to, from its name in a session (mcp__<id>__<tool>). */
export function connectorOfTool(
  tool: string,
): { connector: Connector; tool: string } | undefined {
  const found = /^mcp__([a-z0-9-]+)__(.+)$/.exec(tool);
  const entry = found ? connector(found[1]) : undefined;
  return entry && found ? { connector: entry, tool: found[2] } : undefined;
}
