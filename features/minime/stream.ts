// Reading a route's answer that comes one JSON value per line (the app's streams: a reading's
// progress, a turn's words), as each line arrives.

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

/** Read a route's one-JSON-per-line answer as it arrives. */
export async function stream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: HEADERS,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : `HTTP ${response.status}`,
    );
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let at = buffer.indexOf("\n");
    while (at !== -1) {
      const line = buffer.slice(0, at).trim();
      buffer = buffer.slice(at + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line));
        } catch {
          // A partial or foreign line; skip it.
        }
      }
      at = buffer.indexOf("\n");
    }
  }
}
