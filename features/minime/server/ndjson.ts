// A streamed answer of one JSON object per line, as the screen's routes send their progress. The
// work keeps going when the page goes away: a closed stream only stops the sending.

export function ndjson(
  work: (send: (event: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        await work(send);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        send({ type: "error", message, code: errorCode(message) });
      } finally {
        if (open)
          try {
            controller.close();
          } catch {
            // Already closed by the reader.
          }
      }
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

const NAMES = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * The person's language, from the tag their browser asks for ("ja-JP", "pt-BR", "ko"), as the
 * English name a session is told to write in. Any language works; a tag it cannot name pins none,
 * and the mini-me then keeps the language the person writes to it in.
 */
export function languageName(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  try {
    const code = new Intl.Locale(tag).language;
    const name = NAMES.of(code);
    return name && name !== code ? name : undefined;
  } catch {
    return undefined;
  }
}

/** Failures the screen says in the person's language (messages/*.json, "errors"). */
const CODES = new Set([
  "claude-missing",
  "ai-busy",
  "timeout",
  "learn-failed",
  "fix-failed",
  "import-failed",
  "task-failed",
]);

/**
 * The code of a failure the app recognizes, for the screen to say in the person's language: one
 * of its own, an AI service that was busy, or a run that took too long. Anything else has none and
 * is shown as it came.
 */
export function errorCode(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (CODES.has(message)) return message;
  if (/\b(529|503|429)\b|overloaded|rate.?limit/i.test(message))
    return "ai-busy";
  if (/timed? ?out|did not finish in time/i.test(message)) return "timeout";
  return undefined;
}
