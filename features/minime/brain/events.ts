// What the screen hears about a finished call to one of the mini-me's own keeping tools (memory,
// skills, notes), whichever brain made it: what was kept, or why it was refused.

import type { SessionEvent } from "./session.ts";

/** The keeping tools whose results become events on the screen. */
export const WATCHED = new Set([
  "mcp__minime__memory",
  "mcp__minime__skill_manage",
  "mcp__minime__note_write",
]);

/** Reports one keeping tool's result, `raw` being the JSON text the tool server answered. */
export function reportKept(
  tool: string,
  input: Record<string, unknown>,
  raw: string,
  onEvent?: (event: SessionEvent) => void,
): void {
  if (!onEvent || !WATCHED.has(tool)) return;
  let result: {
    success?: boolean;
    error?: string;
    message?: string;
    skills?: string[];
    notes?: string[];
  } = {};
  try {
    result = JSON.parse(raw);
  } catch {
    result = { success: false, error: raw };
  }
  if (tool === "mcp__minime__note_write") {
    onEvent(
      result.success
        ? { type: "note", changes: result.notes ?? [] }
        : { type: "memory-refused", error: result.error ?? raw },
    );
    return;
  }
  if (tool === "mcp__minime__skill_manage") {
    onEvent(
      result.success
        ? { type: "skill", changes: result.skills ?? [] }
        : { type: "memory-refused", error: result.error ?? raw },
    );
    return;
  }
  if (
    result.success &&
    result.message !== "Entry already exists (no duplicate added)."
  )
    onEvent({
      type: "memory",
      target: String(input.target ?? ""),
      action: String(input.action ?? "batch"),
      content: input.content as string | undefined,
      oldText: input.old_text as string | undefined,
      operations: input.operations as never,
    });
  else if (!result.success)
    onEvent({ type: "memory-refused", error: result.error ?? raw });
}
