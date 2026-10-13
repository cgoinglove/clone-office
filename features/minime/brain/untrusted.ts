// Text from outside the person (a web page, a connected service, a colleague's clone), marked so
// the model reads it as information and never as instructions, with what hides in it removed. Used
// on both brains: the app's own loop for what its tools bring, and every brain for colleagues.

/**
 * Invisible and bidirectional control characters (zero-width ones, bidi embeddings, overrides and
 * isolates, tag characters): they make a text read one way to a person and another to the model,
 * so they are dropped from what comes from outside (Hermes Agent's source hygiene).
 */
const HIDDEN =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]|[\u{E0000}-\u{E007F}]/gu;

/** A text without the characters that read one way to a person and another to the model. */
export function withoutHidden(text: string): string {
  return text.replace(HIDDEN, "");
}

/**
 * What a web page, a connected service or a colleague wrote, marked as coming from outside: the
 * system prompt says such text is information, never instructions (session.ts, "What comes from
 * outside"). A closing mark inside it cannot end the mark early.
 */
export function untrusted(source: string, text: string): string {
  const from = source.replace(/["<>\n]/g, " ").slice(0, 200);
  const body = withoutHidden(text).replace(
    /<\/untrusted\s*>/gi,
    "</ untrusted>",
  );
  return `<untrusted source="${from}">\n${body}\n</untrusted>`;
}

const MARKED = /^(<untrusted source="[^"]*">)\n([\s\S]*)\n<\/untrusted>$/;

/** What a marked text holds and how its mark opens, or nothing for a text not marked. */
export function unmark(
  text: string,
): { open: string; body: string } | undefined {
  const marked = MARKED.exec(text);
  return marked ? { open: marked[1], body: marked[2] } : undefined;
}

/**
 * A part of a text (its start, a piece of it), marked again when the text was marked, so the part
 * never leaves a mark open and the app's own words that follow it are not read as outside text.
 */
export function partOf(text: string, part: (body: string) => string): string {
  const marked = unmark(text);
  return marked
    ? `${marked.open}\n${part(marked.body)}\n</untrusted>`
    : part(text);
}
