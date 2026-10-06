// The hands the mini-me's brain sees as tools: its person's Claude Code conversations, listed and
// asked. Listing is free; asking goes through the trust gate like any tool the person has not
// allowed yet (a permission card, then "don't ask again" if they like).

import { homedir } from "node:os";
import { loadTrust } from "../gate/rules.ts";
import { askSession, listSessions, workSession } from "./sessions.ts";

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

export const WORK_SESSION_TOOL = {
  name: "work_session",
  description:
    "Have one of your person's Claude Code conversations do a piece of work in its project, once your person has taken it on: a change, a fix, a small feature. It works in a copy of that conversation, kept and named after it, so your person can open it later; every file it changes and every command it runs is asked of your person first. Say plainly what to do and why.",
  inputSchema: {
    type: "object",
    properties: {
      session: {
        type: "string",
        description: "The conversation's name or id, from sessions",
      },
      task: {
        type: "string",
        description: "What to do, complete in itself",
      },
    },
    required: ["session", "task"],
  },
};

/** Where a working copy's questions show: with the request they are for, or the conversation. */
function workChat(): string {
  const chat = process.env.MINIME_CHAT_ID ?? "";
  return chat.startsWith("office-request-")
    ? chat.replace("office-request-", "office-work-")
    : chat;
}

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
  if (name === WORK_SESSION_TOOL.name) {
    const work = await workSession(
      String(args.session ?? ""),
      String(args.task ?? ""),
      { chat: workChat(), allow: await loadTrust() },
    );
    return {
      result: work.ok
        ? `"${work.session?.name ?? work.session?.id}" did it, in a copy named "${work.session?.name ?? "conversation"} · clone"${work.copy ? ` (${work.copy})` : ""} that your person can open:\n${work.text}`
        : work.text,
      isError: !work.ok,
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
