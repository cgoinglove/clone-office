// Keeping a long tool-using session inside the model's window without a model call, as Hermes
// Agent's first phase of compression does: when the context is under pressure, earlier tool results
// over a size are cut to a short head with a note that says so (the call that made each one is kept
// whole, so the model can make it again), a result identical to an earlier one is named instead of
// repeated, and the latest results are left as they are. Nothing is cut while there is room: a
// changed history costs the prompt cache, so this runs only when the window is filling.

import type { ModelMessage } from "ai";

/** Share of the window past which earlier tool results are cut. */
export const PRESSURE = 0.5;
/** Results longer than this, in characters, are cut once there is pressure. */
const OVER = 1500;
/** How much of a cut result stays, in characters. */
const HEAD = 400;
/** The latest tool messages left whole. */
const KEEP_LAST = 2;
/** Characters per token when only characters are known: low, so pressure is seen early. */
const CHARS_PER_TOKEN = 3;

type Part = {
  type?: string;
  toolName?: string;
  output?: { type?: string; value?: unknown };
};

/** A tool result's output as plain text, to measure and to quote. */
function outputText(output: Part["output"]): string {
  if (!output) return "";
  return typeof output.value === "string"
    ? output.value
    : JSON.stringify(output.value ?? "");
}

/** Roughly how many tokens the messages take, from their characters. */
export function estimateTokens(messages: ModelMessage[]): number {
  return Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN);
}

/**
 * Whether the window is filling: by the tokens the last step measured when known, else by an
 * estimate from the characters.
 */
export function underPressure(
  messages: ModelMessage[],
  window: number,
  measured?: number,
): boolean {
  return (measured ?? estimateTokens(messages)) > window * PRESSURE;
}

/** Earlier tool results cut to a head with a note, the latest left whole. */
export function pruneToolResults(messages: ModelMessage[]): ModelMessage[] {
  const tools = messages
    .map((message, at) => (message.role === "tool" ? at : -1))
    .filter((at) => at >= 0);
  const whole = new Set(tools.slice(-KEEP_LAST));
  const seen = new Map<string, string>();
  return messages.map((message, at) => {
    if (message.role !== "tool" || whole.has(at)) return message;
    const content = (message.content as Part[]).map((part) => {
      if (part.type !== "tool-result") return part;
      const text = outputText(part.output);
      const tool = part.toolName ?? "a tool";
      if (text.length <= OVER) return part;
      const earlier = seen.get(text);
      if (earlier === undefined) seen.set(text, tool);
      const value =
        earlier !== undefined
          ? `[The same result as an earlier call of ${earlier}.]`
          : `[An earlier result of ${tool}, ${text.length} characters, cut to save room. It began: ${text.slice(0, HEAD)}… Call the tool again if you need it whole.]`;
      return { ...part, output: { type: "text", value } };
    });
    return { ...message, content } as ModelMessage;
  });
}
