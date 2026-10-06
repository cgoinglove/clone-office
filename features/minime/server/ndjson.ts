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
        send({
          type: "error",
          message: error instanceof Error ? error.message : String(error),
        });
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
