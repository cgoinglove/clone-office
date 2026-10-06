// The hands the mini-me's brain sees as tools: its person's Claude Code conversations, listed and
// asked. Listing is free; asking goes through the trust gate like any tool the person has not
// allowed yet (a permission card, then "don't ask again" if they like).

import { homedir } from "node:os";
import { askSession, listSessions } from "./sessions.ts";

export const SESSIONS_TOOL = {
  name: "sessions",
  description:
    "Your person's recent Claude Code conversations: the name they gave each (or its title), its folder, when it was last used and its size. Each knows its project better than your memory does.",
  inputSchema: { type: "object", properties: {} },
};

export const ASK_SESSION_TOOL = {
  name: "ask_session",
  description:
    "Ask one of your person's Claude Code conversations about its project: how something works, where something is, what was decided there. A copy of it answers, reading files only, so the conversation itself is not touched. Use it for what is in their code or work rather than in your memory. Larger conversations cost more to ask.",
  inputSchema: {
    type: "object",
    properties: {
      session: {
        type: "string",
        description: "The conversation's name or id, from sessions",
      },
      question: {
        type: "string",
        description: "What to ask, complete in itself",
      },
    },
    required: ["session", "question"],
  },
};

const short = (path: string) => {
  const home = homedir();
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path;
};

function ago(iso: string, now = Date.now()): string {
  const hours = Math.round((now - Date.parse(iso)) / 3_600_000);
  if (hours < 1) return "within the hour";
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export async function callHandsTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: string; isError: boolean }> {
  if (name === SESSIONS_TOOL.name) {
    const sessions = await listSessions();
    if (!sessions.length)
      return {
        result:
          "No Claude Code conversations in the last 30 days that you may open.",
        isError: false,
      };
    return {
      result: sessions
        .map(
          (s) =>
            `- ${s.name ? `"${s.name}"${s.named ? "" : " (its title)"}` : "(no name)"} · ${s.id} · ${short(s.cwd)} · ${ago(s.updated)} · ${Math.max(1, Math.round(s.size / 1024))} KB`,
        )
        .join("\n"),
      isError: false,
    };
  }
  const answer = await askSession(
    String(args.session ?? ""),
    String(args.question ?? ""),
  );
  return {
    result: answer.ok
      ? `"${answer.session?.name ?? answer.session?.id}" answered:\n${answer.text}`
      : answer.text,
    isError: !answer.ok,
  };
}
