// How much a brain can hold, and when a conversation or a request is carried into a fresh session
// before it fills up. Hermes Agent compresses at a share of the model's window (three quarters for
// windows under 512K tokens); this does the same with what is known of the brain the person picked:
// Claude Code's models hold at least 200K tokens (the Claude 5 models 1M; the 100K cap below decides
// either way), a cloud service's current models at least 128K, and a model
// on the person's own computer is assumed to hold 32K (Ollama and LM Studio run with less than the
// model could hold unless it is set higher). CLONE_OFFICE_CONTEXT_TOKENS says it when it is known
// better, and CLONE_OFFICE_CARRY_AT sets the point itself.

import { type BrainChoice, brainChoice } from "./choice.ts";

const fromEnv = (name: string) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

/** The tokens the picked brain's model can hold, as far as is known. */
export function contextWindow(choice: BrainChoice): number {
  const said = fromEnv("CLONE_OFFICE_CONTEXT_TOKENS");
  if (said) return said;
  if (choice.kind === "claude-code") return 200_000;
  return choice.provider === "local" ? 32_000 : 128_000;
}

/**
 * Tokens of context past which a conversation goes on in a fresh session: three quarters of the
 * window, and never past 100K, where a long conversation costs more than a summary loses.
 */
export function carryPoint(choice: BrainChoice): number {
  return (
    fromEnv("CLONE_OFFICE_CARRY_AT") ??
    Math.min(100_000, Math.floor(contextWindow(choice) * 0.75))
  );
}

/** The carry point for the brain the person picked now. */
export async function carryAt(): Promise<number> {
  return carryPoint(await brainChoice());
}

/**
 * The brain no longer has the session (it was deleted, the brain changed, or it grew past the
 * model's window), in the words Claude Code and the services use. Only then does work go on from
 * its own record: a busy service, a time out or a wrong key would fail the same way again, and the
 * session it has is worth keeping.
 */
export function sessionLost(error: string | undefined): boolean {
  return /session-missing|no conversation found|prompt is too long|context.{0,20}(length|window|limit)|maximum context|too many tokens|input token count|exceeds the maximum number of tokens|context_length_exceeded|request too large|reduce the length/i.test(
    error ?? "",
  );
}
