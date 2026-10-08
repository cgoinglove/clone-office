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

/**
 * What a web page, a connected service or a colleague wrote, marked as coming from outside: the
 * system prompt says such text is information, never instructions (session.ts, "What comes from
 * outside"). A closing mark inside it cannot end the mark early.
 */
export function untrusted(source: string, text: string): string {
  const from = source.replace(/["<>\n]/g, " ").slice(0, 200);
  const body = text
    .replace(HIDDEN, "")
    .replace(/<\/untrusted\s*>/gi, "</ untrusted>");
  return `<untrusted source="${from}">\n${body}\n</untrusted>`;
}
