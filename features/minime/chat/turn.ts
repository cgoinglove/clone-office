// One turn of a conversation with the mini-me, recorded in the conversation's own file.
//
// A long conversation is carried into a fresh brain session before it fills the model's context,
// the way Claude Code compacts and Hermes compresses: first the mini-me looks back and keeps what is
// worth keeping (Hermes' memory flush), then it writes itself a summary, and the next session starts
// from that summary. When the brain has lost its session (Claude Code deletes old transcripts), the
// conversation goes on from its own record instead. After the answer, the session is looked back on
// (the review), and what it kept is recorded in the conversation as well.

import { carryAt, sessionLost } from "../brain/context.ts";
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
import { steerText, takeNotes, working } from "./steer.ts";
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

/**
 * What the mini-me writes itself before a long conversation goes on in a fresh session, after the
 * sections Hermes Agent's compressor asks for and what Claude Code's compaction keeps: the goal,
 * what was settled and corrected (quoted), what was done as past facts, what is open, and what it
 * relies on by name so it can open it again. The person's own words are added by code, as said.
 */
export const SUMMARY_PROMPT = `This conversation will go on in a fresh session that sees only what you write now, with your person's own messages added word for word after it. Write it for yourself, in their language, under these headings, leaving out any with nothing under it:

Goal: what they are after in this conversation.
Settled: what they decided and why, and every correction or preference they gave, quoted.
Done: what you did and found, as past facts, with the names, numbers, places, paths and links.
Open: what is still to do or answer, and what you were in the middle of.
In use: what this relies on, by name, so you can open it again: files, colleagues and their requests, flows, their Claude Code conversations, skills.

If this conversation began from an earlier summary, keep everything in it that still matters. Be specific and as short as that allows, at most about 500 words. Write only the summary, with nothing about this request.`;

/** The person's own messages in a stretch of conversation, word for word, newest kept first. */
export function theirWords(
  messages: ChatMessage[],
  max = 6000,
  each = 1500,
): string {
  const lines: string[] = [];
  let used = 0;
  for (const message of [...messages].reverse()) {
    if (message.role !== "me") continue;
    const line = `- ${message.text.length > each ? `${message.text.slice(0, each)}…` : message.text}`;
    if (used + line.length > max) break;
    lines.unshift(line);
    used += line.length;
  }
  return lines.join("\n");
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
  /** A word the person wrote while it worked was read (chat/steer.ts). */
  | { type: "stepped"; id: string }
  /** The answer is done and the next turn, on words that came meanwhile, begins. */
  | { type: "next" }
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
        : m.person
          ? `${m.text} (written by that colleague themselves, not their clone)`
          : m.text,
    );
}

function withNews(news: string[], text: string): string {
  return news.length
    ? `Since your last answer, from the office:\n${news.map((n) => `- ${n}`).join("\n")}\n\n---\n\n${text}`
    : text;
}

/**
 * How a fresh session starts: the summary the conversation was carried over with, then what was said
 * since. The summary is background; what the person says last is what to do now (as Hermes Agent's
 * handoff says, so a fresh session does not pick up work that was already done).
 */
function opening(summary: string | undefined, earlier: string, text: string) {
  const parts: string[] = [];
  if (summary)
    parts.push(
      `Earlier in this conversation, in your own summary (reference only: what was asked there is done or decided, and what they say last is what to do now; where it differs from your memory or their profile, those are right):\n${summary}`,
    );
  if (earlier)
    parts.push(
      `${summary ? "Since then" : "Earlier in this conversation"}:\n${earlier}`,
    );
  return parts.length ? `${parts.join("\n\n")}\n\n---\n\n${text}` : text;
}

export { sessionLost };

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
  // What the person writes while this answer is made waits for it (chat/steer.ts).
  const end = working(info.id);
  try {
    await answer();
  } finally {
    end();
  }

  async function answer(): Promise<void> {
    const record = (event: SessionEvent) => {
      if (event.type === "text") return;
      send({ type: "saved", event });
      const line = savedText(event as unknown as Record<string, unknown>);
      if (line) appendMessage(info.id, "saved", line).catch(() => {});
    };

    let session = info.session;
    let summary = info.summary;
    if (session && (info.context ?? 0) > (await carryAt())) {
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
      const since = before.slice(info.carriedFrom ?? 0);
      const words = theirWords(since);
      // No summary came (the session may be too full to write one): it goes on from the record
      // instead, the earlier summary and the end of what was said, as Hermes hands off without one.
      summary =
        written.ok && written.text.trim()
          ? `${written.text.trim()}${words ? `\n\nWhat they said in it, word for word, oldest first:\n${words}` : ""}`
          : [
              info.summary,
              `What was said, oldest first:\n${recap(since, 12_000)}`,
            ]
              .filter(Boolean)
              .join("\n\n");
      await carryOver(info.id, summary);
      session = undefined;
      send({ type: "carried" });
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
    // Read between the brain's steps: kept in the conversation where it came, and marked read.
    const steer = async () => {
      const notes = takeNotes(info.id);
      if (!notes.length) return undefined;
      for (const note of notes) {
        await appendMessage(info.id, "me", note.text);
        send({ type: "stepped", id: note.id });
      }
      return steerText(notes);
    };
    let result: Awaited<ReturnType<typeof runSession>>;
    try {
      result = await runSession({
        prompt: session ? said : opening(summary, "", said),
        resume: session,
        language,
        maxTurns: 16,
        purpose: "task",
        gate,
        connectors: true,
        steer,
        onEvent,
      });
      if (!result.ok && session && !result.text && sessionLost(result.error)) {
        // The brain no longer has the session: go on from the conversation's own record, the summary
        // it was carried over with and what was said since.
        result = await runSession({
          prompt: opening(
            summary,
            recap(summary ? before.slice(info.carriedFrom ?? 0) : before),
            said,
          ),
          language,
          maxTurns: 16,
          purpose: "task",
          gate,
          connectors: true,
          steer,
          onEvent,
        });
      }
    } finally {
      stop();
    }
    if (result.ok && !result.text.trim()) {
      // Nothing to read is no answer: said as a failure, never kept as an empty line.
      result = { ...result, ok: false, error: "empty-answer" };
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
    // Words that came after the last step, or to a brain that takes none mid-way (Claude Code): the
    // next turn, at once, in the same conversation.
    const left = takeNotes(info.id);
    if (left.length) {
      for (const note of left) send({ type: "stepped", id: note.id });
      send({ type: "next" });
      await runTurn({
        ...options,
        chat: info.id,
        text: left.map((note) => note.text).join("\n\n"),
      });
      return;
    }
    send({ type: "done", chat: info.id });
    const review = await reviewSession(
      result.sessionId,
      record,
      result.systemPrompt,
    );
    if (review.ok) await markReviewed(info.id, result.sessionId);
    send({ type: "reviewed", ok: review.ok });
  }
}
