// A tool the person named (their card, what the reading saw), drawn by its own mark where the app
// has that service's.

import type { MarkId } from "./brand-mark";

/** A tool's own mark, when the app draws that service's: matched by its name, any spelling. */
const TOOL_MARK: Record<string, MarkId> = {
  claudecode: "claudecode",
  claude: "claude",
  codex: "codex",
  cursor: "cursor",
  chatgpt: "openai",
  openai: "openai",
  gemini: "gemini",
  hermes: "hermes",
  hermesagent: "hermes",
  notion: "notion",
  github: "github",
  linear: "linear",
  jira: "jira",
  confluence: "atlassian",
  gmail: "gmail",
  googlecalendar: "googlecalendar",
  googledrive: "googledrive",
  googledocs: "googledocs",
  googlesheets: "googlesheets",
  discord: "discord",
  telegram: "telegram",
};
export const markOf = (tool: string): MarkId | undefined =>
  TOOL_MARK[tool.toLowerCase().replace(/[^a-z]/g, "")];
