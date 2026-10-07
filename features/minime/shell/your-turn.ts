// What waits on the person, wherever it was asked: questions about colleagues' requests (live at
// the gate, or kept for later) and questions in their own conversations. Each knows where it
// belongs, so the sidebar can take the person straight there. Kept questions call the person only
// at the day's batch moments (their phone); on screen they are listed all the same.

import type { useTranslations } from "next-intl";
import { describe, type GateAsk } from "../ask-card";
import type { OfficeState, Waiting } from "../home/use-office";
import type { ChatAsk } from "./app-state";

export interface TurnItem {
  key: string;
  ask: GateAsk;
  /** A request between clones, or one of the person's own conversations. */
  where: { kind: "request"; task?: string } | { kind: "chat"; chat: string };
  /** The colleague the request came from, by member id. */
  from?: string;
  /** Answered through the office (a request's question) or at the gate (a conversation's). */
  waiting?: Waiting;
  chatAsk?: ChatAsk;
}

const REQUEST_CHAT = "office-request-";

/** The request a question belongs to: kept ones carry it, live ones name it in their chat. */
export function taskOf(waiting: Waiting): string | undefined {
  if (waiting.task) return waiting.task;
  return waiting.chat?.startsWith(REQUEST_CHAT)
    ? waiting.chat.slice(REQUEST_CHAT.length)
    : undefined;
}

export function yourTurn(office: OfficeState, chatAsks: ChatAsk[]): TurnItem[] {
  const tasks = office.office?.tasks ?? [];
  const fromRequests = office.waiting.map((waiting): TurnItem => {
    const task = taskOf(waiting);
    return {
      key: `w:${waiting.id}`,
      ask: waiting.ask,
      where: { kind: "request", task },
      // The asker's member id from the request; a kept question names them only by name.
      from: tasks.find((entry) => entry.id === task)?.metadata.from,
      waiting,
    };
  });
  const fromChats = chatAsks.map(
    (chatAsk): TurnItem => ({
      key: `c:${chatAsk.id}`,
      ask: chatAsk.ask,
      where: { kind: "chat", chat: chatAsk.chat },
      chatAsk,
    }),
  );
  return [...fromRequests, ...fromChats];
}

/** The question in one line, in the screen's language. */
export function askLine(
  t: ReturnType<typeof useTranslations<"ask">>,
  ask: GateAsk,
): string {
  if (ask.kind === "question") return ask.question;
  if (ask.kind === "permission")
    return `${t("mayI")} ${describe(t, ask.tool, ask.input)}`;
  return t("rule", { menu: ask.menu });
}

/** Where a waiting question is answered on screen. */
export function turnHref(item: TurnItem): string {
  if (item.where.kind === "chat")
    return `/chat?c=${encodeURIComponent(item.where.chat)}`;
  return item.where.task
    ? `/requests/${encodeURIComponent(item.where.task)}`
    : "/requests";
}
