// Where the person's office work stands, as the mini-me's tool `office_inbox`: questions kept for
// them to answer (from colleagues' requests), the requests they sent and what came back, and the
// requests colleagues sent them lately and how each was answered. It reads the relay with the
// mini-me's own office key and its own office state, so it works in a conversation and in a flow
// alike (a morning catch-up), and it shows only what the person already sees on their page.

import {
  loadOffice,
  members,
  problemCode,
  type Task,
  tasks,
} from "./client.ts";
import { loadState } from "./state.ts";

const DAY = 24 * 60 * 60 * 1000;
const FINAL = new Set(["COMPLETED", "FAILED", "CANCELED", "REJECTED"]);

export const OFFICE_INBOX_TOOL = {
  name: "office_inbox",
  description:
    'Where your person\'s office work stands: questions kept for them to answer, the requests they sent and what came back, and the requests colleagues sent them lately and what was answered. For catching them up ("what is waiting for me"). Says so when they are in no office.',
  inputSchema: {
    type: "object",
    properties: {
      days: {
        type: "integer",
        minimum: 1,
        maximum: 30,
        description: "How many days back for finished requests; 3 by default.",
      },
    },
  },
};

function clip(text: string, max = 600): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function said(task: Task, role: "user" | "agent"): string {
  const messages = task.history.filter((message) => message.role === role);
  const message = role === "user" ? messages[0] : messages.at(-1);
  return message?.parts.map((part) => part.text).join("\n") ?? "";
}

export async function officeInbox(
  args: Record<string, unknown>,
  now = Date.now(),
): Promise<{ result: unknown; isError: boolean }> {
  const office = await loadOffice();
  if (!office)
    return { result: "Your person is in no office.", isError: false };
  const days = Math.min(30, Math.max(1, Number(args.days) || 3));
  const since = now - days * DAY;
  let all: Task[];
  let names: Map<string, string>;
  try {
    const [found, people] = await Promise.all([tasks(office), members(office)]);
    all = found.tasks;
    names = new Map(people.members.map((m) => [m.id, m.card.name]));
  } catch (error) {
    return {
      result: `The office could not be reached just now (${problemCode(error)}).`,
      isError: true,
    };
  }
  const name = (id: string) => names.get(id) ?? id;
  const open = new Set(
    all.filter((task) => !FINAL.has(task.status.state)).map((task) => task.id),
  );
  const recent = all.filter(
    (task) => open.has(task.id) || Date.parse(task.status.timestamp) >= since,
  );
  const shape = (task: Task, other: string) => ({
    [task.metadata.from === office.member ? "to" : "from"]: name(other),
    request: clip(said(task, "user")),
    state: task.status.state,
    answer: clip(said(task, "agent")) || null,
    updated: task.status.timestamp,
  });
  const state = await loadState();
  return {
    result: {
      waiting_for_them: Object.values(state.later)
        .filter((kept) => open.has(kept.task))
        .map((kept) => ({
          from: kept.from ?? null,
          question: kept.question,
          since: kept.at,
        })),
      they_asked: recent
        .filter((task) => task.metadata.from === office.member)
        .map((task) => shape(task, task.metadata.to)),
      asked_of_them: recent
        .filter((task) => task.metadata.to === office.member)
        .map((task) => shape(task, task.metadata.from)),
    },
    isError: false,
  };
}
