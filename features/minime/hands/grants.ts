// "For this task, let it change files in that folder without asking": what a person may give on the
// card that asks whether one of their conversations may do a piece of work (work_session). It is
// kept here, in the app's server process, never in what the brain sends, so the brain cannot give it
// to itself: the tool server takes it once, for the very task the person saw, when the work starts.
// Commands, and files leaving the computer, are still asked every time.

import { createHash } from "node:crypto";

/** Long enough for the work to start after the card; a grant nobody took is gone after it. */
const GRANT_MS = 60 * 60 * 1000;

const holder = globalThis as typeof globalThis & {
  __cloneTaskGrants?: Map<string, number>;
};

function grants(): Map<string, number> {
  holder.__cloneTaskGrants ??= new Map();
  return holder.__cloneTaskGrants;
}

/** The task as the person saw it on its card: its conversation, its words, and where it was asked. */
function keyOf(chat: string | undefined, session: string, task: string) {
  return createHash("sha256")
    .update(`${chat ?? ""}\n${session.trim()}\n${task.trim()}`)
    .digest("hex");
}

export function grantTaskEdits(
  chat: string | undefined,
  session: string,
  task: string,
  now = Date.now(),
): void {
  const all = grants();
  for (const [key, at] of all) if (now - at > GRANT_MS) all.delete(key);
  all.set(keyOf(chat, session, task), now);
}

/** Whether the person gave it for this task; taken, so it covers one piece of work only. */
export function takeTaskGrant(
  chat: string | undefined,
  session: string,
  task: string,
  now = Date.now(),
): boolean {
  const all = grants();
  const key = keyOf(chat, session, task);
  const at = all.get(key);
  all.delete(key);
  return at !== undefined && now - at <= GRANT_MS;
}
