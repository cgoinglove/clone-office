// One turn of a conversation with the mini-me, recorded in the conversation's own file.
//
// A long conversation is carried into a fresh brain session before it fills the model's context,
// the way Claude Code compacts and Hermes compresses: first the mini-me looks back and keeps what is
// worth keeping (Hermes' memory flush), then it writes itself a summary, and the next session starts
// from that summary. When the brain has lost its session (Claude Code deletes old transcripts), the
// conversation goes on from its own record instead. After the answer, the session is looked back on
// (the review), and what it kept is recorded in the conversation as well.

import { reviewSession } from "../brain/review.ts";
import {
  runSession,
  type SessionEvent,
  type SessionGate,
} from "../brain/session.ts";
import { type Ask, gateSecret, onAsk } from "../gate/gate.ts";
import { denyRules, loadTrust } from "../gate/rules.ts";
import { savedText } from "../saved-text.ts";
import { loadExcludes } from "../server/exclude.ts";
import { errorCode } from "../server/ndjson.ts";
import {
  appendMessage,
  type ChatInfo,
  type ChatMessage,
  carryOver,
  createChat,
  markReviewed,
  readChat,
  setSession,
} from "./store.ts";

export const SUMMARY_PROMPT = `This conversation will go on in a fresh session that sees only what you write now. Write it for yourself: what your person asked and decided, what you did and found, what is still open, and how they want it done. Be specific (names, numbers, places), write in their language, and keep it as short as that allows, at most about 300 words. Write only the summary itself, as plain sentences or short points, with no title and nothing about this request.`;

/** Context, in tokens, past which a conversation is carried into a fresh session. */
export function carryAt(): number {
  const value = Number(process.env.SUB_OFFICE_CARRY_AT);
  return Number.isFinite(value) && value > 0 ? value : 100_000;
}

export type TurnEvent =
  | { type: "chat"; id: string; title: string }
  | { type: "carrying" }
  | { type: "carried" }
  | { type: "text"; text: string }
  | { type: "done"; chat: string }
  | { type: "saved"; event: SessionEvent }
  | { type: "ask"; id: string; ask: Ask }
  | { type: "reviewed"; ok: boolean }
  | { type: "error"; message: string; code?: string };

/** The end of a conversation's own record, for a session that starts without the brain's copy. */
export function recap(messages: ChatMessage[], max = 6000): string {
  const lines: string[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    if (message.role !== "me" && message.role !== "minime") continue;
    const line = `${message.role === "me" ? "They" : "You"}: ${message.text}`;
    if (used + line.length > max) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines.join("\n\n");
}

/** What colleagues' mini-mes answered in this conversation since the mini-me last spoke. */
export function newsSince(messages: ChatMessage[]): string[] {
  const lastAnswer = messages.map((m) => m.role).lastIndexOf("minime");
  return messages
    .slice(lastAnswer + 1)
    .filter((m) => m.role === "office" || m.role === "told")
    .map((m) =>
      m.role === "told"
        ? `You answered a colleague for them: ${m.text}`
        : m.text,
    );
}

function withNews(news: string[], text: string): string {
  return news.length
    ? `Since your last answer, from the office:\n${news.map((n) => `- ${n}`).join("\n")}\n\n---\n\n${text}`
    : text;
}

function opening(summary: string | undefined, earlier: string, text: string) {
  if (summary)
    return `Earlier in this conversation, in your own summary:\n${summary}\n\n---\n\n${text}`;
  if (earlier)
    return `Earlier in this conversation:\n${earlier}\n\n---\n\n${text}`;
  return text;
}

export async function runTurn(options: {
  text: string;
  chat?: string;
  language?: string;
  /** The app's gate route, for questions to the person; without it the mini-me cannot ask or read. */
  gateUrl?: string;
  /** What it may do without asking in this conversation besides what the person allowed. */
  allow?: string[];
  send: (event: TurnEvent) => void;
}): Promise<void> {
  const { text, language, send } = options;
  const found = options.chat ? await readChat(options.chat) : undefined;
  const info: ChatInfo = found?.info ?? (await createChat(text));
  const before = found?.messages ?? [];
  send({ type: "chat", id: info.id, title: info.title });
  await appendMessage(info.id, "me", text);
  const said = withNews(newsSince(before), text);

  const record = (event: SessionEvent) => {
    if (event.type === "text") return;
    send({ type: "saved", event });
    const line = savedText(event as unknown as Record<string, unknown>);
    if (line) appendMessage(info.id, "saved", line).catch(() => {});
  };

  let session = info.session;
  let summary = info.summary;
  if (session && (info.context ?? 0) > carryAt()) {
    send({ type: "carrying" });
    // Keep what is worth keeping before the details are summed up, unless that was done already.
    if (info.reviewed !== session) await reviewSession(session, record);
    const written = await runSession({
      resume: session,
      fork: true,
      prompt: SUMMARY_PROMPT,
      language,
      maxTurns: 1,
      purpose: "summary",
    });
    if (written.ok && written.text.trim()) {
      summary = written.text.trim();
      await carryOver(info.id, summary);
      session = undefined;
      send({ type: "carried" });
    }
  }

  // The person's questions for this conversation go to its screen while the answer is made.
  const gate: SessionGate | undefined = options.gateUrl
    ? {
        url: options.gateUrl,
        secret: gateSecret(),
        chat: info.id,
        allow: [...(await loadTrust()), ...(options.allow ?? [])],
        deny: denyRules(loadExcludes()),
        colleagues: true,
      }
    : undefined;
  const stop = onAsk((pending) => {
    if (pending.chat === info.id)
      send({ type: "ask", id: pending.id, ask: pending.ask });
  });
  const onEvent = (event: SessionEvent) =>
    event.type === "text" ? send(event) : record(event);
  let result: Awaited<ReturnType<typeof runSession>>;
  try {
    result = await runSession({
      prompt: session ? said : opening(summary, "", said),
      resume: session,
      language,
      maxTurns: 16,
      purpose: "task",
      gate,
      onEvent,
    });
    if (!result.ok && session && !result.text) {
      // The brain no longer has the session: go on from the conversation's own record.
      result = await runSession({
        prompt: opening(summary, recap(before), said),
        language,
        maxTurns: 16,
        purpose: "task",
        gate,
        onEvent,
      });
    }
  } finally {
    stop();
  }
  if (!result.ok || !result.sessionId) {
    const message = result.error ?? "task-failed";
    const code = errorCode(message);
    // Kept as its code when it has one, so the conversation reads in the person's language.
    await appendMessage(info.id, "error", code ?? message);
    send({ type: "error", message, code });
    return;
  }
  await appendMessage(info.id, "minime", result.text);
  await setSession(info.id, result.sessionId, result.context);
  send({ type: "done", chat: info.id });
  const review = await reviewSession(
    result.sessionId,
    record,
    result.systemPrompt,
  );
  if (review.ok) await markReviewed(info.id, result.sessionId);
  send({ type: "reviewed", ok: review.ok });
}
