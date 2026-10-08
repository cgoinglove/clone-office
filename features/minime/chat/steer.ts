// Stepping in while the clone works, in the person's own conversation, after Thursday's step-in:
// what they write while an answer is being made waits here, and the clone reads it before its next
// step (the app's own loop, through `steer`), or, where the brain cannot take it mid-way (Claude
// Code), as soon as the answer is done. Until it is read it can be taken back. Kept in the server
// process only: a word waits seconds or minutes, never across a restart.

export interface Note {
  id: string;
  text: string;
  at: number;
}

const pinned = globalThis as typeof globalThis & {
  __cloneOfficeSteer?: {
    running: Map<string, number>;
    notes: Map<string, Note[]>;
  };
};
// A count per conversation: a turn still looking back after its answer and the next turn the
// person already started run at once, and the first to end must not end the other's.
const state = (pinned.__cloneOfficeSteer ??= {
  running: new Map<string, number>(),
  notes: new Map<string, Note[]>(),
});

let made = 0;

/** A conversation's turn begins: words for it wait from now on. Returns its end. */
export function working(chat: string): () => void {
  state.running.set(chat, (state.running.get(chat) ?? 0) + 1);
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    const left = (state.running.get(chat) ?? 1) - 1;
    if (left > 0) state.running.set(chat, left);
    else state.running.delete(chat);
  };
}

export const isWorking = (chat: string) => (state.running.get(chat) ?? 0) > 0;

/** Keeps a word for a conversation the clone is working in; undefined when it is not working. */
export function addNote(chat: string, text: string): Note | undefined {
  if (!isWorking(chat)) return undefined;
  const note = {
    id: `n${Date.now().toString(36)}${(++made).toString(36)}`,
    text,
    at: Date.now(),
  };
  state.notes.set(chat, [...(state.notes.get(chat) ?? []), note]);
  return note;
}

/** Takes a word back while it is unread; false once it was read. */
export function takeBack(chat: string, id: string): boolean {
  const notes = state.notes.get(chat) ?? [];
  const left = notes.filter((note) => note.id !== id);
  state.notes.set(chat, left);
  return left.length < notes.length;
}

/** The words waiting for a conversation, taken: from here on they are read. */
export function takeNotes(chat: string): Note[] {
  const notes = state.notes.get(chat) ?? [];
  state.notes.delete(chat);
  return notes;
}

/** How the words read to the clone, said between its steps. */
export const steerText = (notes: Note[]) =>
  `While you were working, your person added:\n${notes.map((note) => note.text).join("\n\n")}\n\nTake this into account from here on.`;
