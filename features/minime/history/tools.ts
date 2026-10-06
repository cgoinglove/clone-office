// The two tools the mini-me uses to recall what its person did with their AI tools: search (or
// list recent) and read. Shapes follow Hermes Agent's session_search: discovery by words, browse
// without them, and scrolling inside one conversation around a message.
// Before answering, the index takes a short look at sessions changed in the last two days, at
// most once a minute, so "what did I do today" includes this morning.

import { openHistoryForRead } from "./db.ts";
import { indexHistory } from "./indexer.ts";
import { readSession, searchSessions } from "./search.ts";

const REFRESH_EVERY_MS = 60_000;
let lastRefresh = 0;

async function refresh(): Promise<void> {
  if (Date.now() - lastRefresh < REFRESH_EVERY_MS) return;
  lastRefresh = Date.now();
  // Another process may be indexing (busy); its work is just as good.
  await indexHistory({ budgetMs: 2500, recentHours: 48 }).catch(
    () => undefined,
  );
}

export const CONVERSATION_TOOLS = {
  search: {
    name: "conversation_search",
    description:
      "Recall what your person did with their AI tools on this computer (Claude Code, Codex): find past conversations by words, or list recent ones. With `query`: the best-matching conversations, each with the message that matched (`match_message_id`); open one with conversation_read. Without `query`: the most recent conversations, e.g. after='today' for today's work. Results are the actual messages, not summaries. Use it for 'what did I do today', 'where did we leave X', 'how did I handle Y before' — before asking your person. Folders they excluded are never included.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "Words to find (any language; every word must appear). Omit to list recent conversations.",
        },
        after: {
          type: "string",
          description:
            "Only from this time on: 'today', a span such as '24h', '7d', '2w', or an ISO date.",
        },
        before: {
          type: "string",
          description: "Only before this time, in the same forms.",
        },
        limit: {
          type: "integer",
          description: "How many conversations (default 5, at most 10).",
        },
        sort: {
          type: "string",
          enum: ["newest"],
          description:
            "'newest' for where things were left; omit for best match.",
        },
      },
    },
  },
  read: {
    name: "conversation_read",
    description:
      "Read inside one conversation found with conversation_search: give `session` and `around_message_id` for the messages around it, or `session` alone for its start and end. Each message is clipped to 2,000 characters; scroll around an id for more.",
    inputSchema: {
      type: "object",
      properties: {
        session: { type: "string" },
        around_message_id: { type: "integer" },
        window: {
          type: "integer",
          description:
            "Messages on each side of the anchor (default 5, at most 20).",
        },
      },
      required: ["session"],
    },
  },
} as const;

/** Run one conversation tool; the result is JSON-ready, with `error` when it failed. */
export async function callConversationTool(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: unknown; isError: boolean }> {
  await refresh();
  const db = openHistoryForRead();
  if (!db)
    return {
      result: {
        error:
          "The conversation index is not built yet. It fills in the background; try again shortly.",
      },
      isError: true,
    };
  try {
    if (name === CONVERSATION_TOOLS.search.name) {
      const result = searchSessions(db, {
        query: typeof args.query === "string" ? args.query : "",
        after: typeof args.after === "string" ? args.after : undefined,
        before: typeof args.before === "string" ? args.before : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
        sort: args.sort === "newest" ? "newest" : undefined,
      });
      return { result, isError: false };
    }
    const result = readSession(db, {
      session: String(args.session ?? ""),
      around:
        typeof args.around_message_id === "number"
          ? args.around_message_id
          : undefined,
      window: typeof args.window === "number" ? args.window : undefined,
    });
    return { result, isError: "error" in result };
  } catch (error) {
    return { result: { error: (error as Error).message }, isError: true };
  } finally {
    db.close();
  }
}
