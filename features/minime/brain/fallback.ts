// A second model for the app's own loop, after Claude Code's `--fallback-model`: when the model the
// person picked is overloaded, rate-limited or failing on its vendor's side, and the AI SDK's own
// retries (two, with a growing wait) did not get through, the call goes to the fallback model
// instead, and so does the rest of that turn; the next turn tries the picked model first again, as
// Claude Code "re-tries the primary at the start of each user turn". The move happens between two
// calls of one turn, never by running a turn again, so nothing a tool already did is done twice.
// A wrong key, a refusal or a request the model cannot take is not a reason to move: it would fail
// the same way, or say something else, on another model.

import {
  APICallError,
  type JSONValue,
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";

/** The AI SDK's own retries of one call before it gives up (its default). */
export const RETRIES = 2;

type Model = ReturnType<typeof wrapLanguageModel>;
type StreamResult = Awaited<ReturnType<Model["doStream"]>>;
type Part = StreamResult["stream"] extends ReadableStream<infer P> ? P : never;
type CallOptions = Parameters<Model["doStream"]>[0];

/** The error under the AI SDK's own "failed after 3 attempts" one, which keeps the last it saw. */
export function rootError(error: unknown): unknown {
  let at = error;
  for (let depth = 0; depth < 5; depth++) {
    const last = (at as { lastError?: unknown } | null)?.lastError;
    if (!last) break;
    at = last;
  }
  return at;
}

const BUSY =
  /overloaded|rate.?limit|too many requests|server.?error|internal.?error|service.?unavailable|bad gateway|gateway time-?out|temporarily unavailable|capacity/i;

/**
 * Whether a failure is the vendor being busy or failing (429, 5xx, 529 "overloaded", a stream that
 * says so), which another model can get past; never a wrong key or a refused request.
 */
export function fallsBack(error: unknown): boolean {
  const root = rootError(error);
  if (APICallError.isInstance(root)) {
    const status = root.statusCode ?? 0;
    if (status === 429 || status >= 500) return true;
    if (status) return false;
  }
  const said =
    root instanceof Error
      ? `${root.name} ${root.message}`
      : (() => {
          try {
            return JSON.stringify(root);
          } catch {
            return String(root);
          }
        })();
  return BUSY.test(said);
}

/**
 * The stream with its first parts read: a stream that opens with an error (a vendor that answers
 * "overloaded" once streaming has begun) is told apart from one that answers. The parts read are
 * given again, in order, in the stream handed on.
 */
async function opening(
  stream: ReadableStream<Part>,
): Promise<{ error?: unknown; stream: ReadableStream<Part> }> {
  const reader = stream.getReader();
  const seen: Part[] = [];
  let done = false;
  let error: unknown;
  for (;;) {
    const next = await reader.read();
    if (next.done) {
      done = true;
      break;
    }
    seen.push(next.value);
    const type = (next.value as { type?: string }).type;
    if (type === "error") {
      error = (next.value as { error?: unknown }).error ?? "error";
      break;
    }
    if (
      type !== "stream-start" &&
      type !== "response-metadata" &&
      type !== "raw"
    )
      break;
  }
  return {
    error,
    stream: new ReadableStream<Part>({
      start(controller) {
        for (const part of seen) controller.enqueue(part);
        if (done) controller.close();
      },
      async pull(controller) {
        const next = await reader.read();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      },
      cancel(reason) {
        return reader.cancel(reason);
      },
    }),
  };
}

/** The vendor a model or a vendor's own tool belongs to ("anthropic.messages" → "anthropic"). */
const vendorOf = (id: string) => id.split(".")[0] ?? id;

/**
 * The picked model, moving to `fallback` when it is busy or failing after the SDK's retries.
 * `fallback.options` are the fallback's own call options (its cache key, keeping nothing), which
 * stand in for the picked model's; a vendor's own tool (its web search) goes only to its own models.
 * `onMove` hears the move, once.
 */
export function withFallback(
  main: LanguageModel,
  fallback: {
    model: LanguageModel;
    options: Record<string, Record<string, JSONValue>>;
  },
  onMove: () => void,
  retries = RETRIES,
): LanguageModel {
  const other = wrapLanguageModel({
    model: fallback.model as Exclude<LanguageModel, string>,
    middleware: [],
  });
  let failures = 0;
  let moved = false;
  const move = () => {
    if (moved) return;
    moved = true;
    onMove();
  };
  const forOther = (params: CallOptions): CallOptions => ({
    ...params,
    providerOptions: fallback.options,
    tools: params.tools?.filter(
      (tool) =>
        tool.type !== "provider" ||
        vendorOf(tool.id) === vendorOf(other.provider),
    ),
  });
  // Another failure of the picked model: thrown back while the SDK still retries it, else the move.
  // A failure the SDK does not retry (one a stream opens with) moves at once.
  const failed = (error: unknown) => {
    if (!fallsBack(error)) throw error;
    if (APICallError.isInstance(error) && error.isRetryable) {
      failures += 1;
      if (failures <= retries) throw error;
    }
    move();
  };
  const middleware: LanguageModelMiddleware = {
    wrapStream: async ({ doStream, params }) => {
      if (!moved) {
        try {
          const result = await doStream();
          const first = await opening(result.stream);
          if (first.error === undefined || !fallsBack(first.error)) {
            failures = 0;
            return { ...result, stream: first.stream };
          }
          await first.stream.cancel().catch(() => {});
          failed(first.error);
        } catch (error) {
          failed(error);
        }
      }
      return other.doStream(forOther(params));
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      if (!moved) {
        try {
          const result = await doGenerate();
          failures = 0;
          return result;
        } catch (error) {
          failed(error);
        }
      }
      return other.doGenerate(forOther(params));
    },
  };
  return wrapLanguageModel({
    model: main as Exclude<LanguageModel, string>,
    middleware,
  });
}
