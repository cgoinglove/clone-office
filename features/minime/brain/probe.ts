// One look at whether the brain the person picked answers, before anything relies on it. The free
// checks come first (Claude Code installed and signed in, a key kept, a ChatGPT sign-in), then one
// word is asked of it through the same path every session takes, so a missing login, a model their
// plan does not include or a local server that is off shows on the step where they pick it, with
// what to do, rather than as a failed reading a minute later. It reports what failed as it is.

import { spawn } from "node:child_process";
import { claudeCommand, cleanEnv } from "../server/brain.ts";
import { errorCode } from "../server/ndjson.ts";
import { brainChoice, brainProblem } from "./choice.ts";
import { runSession } from "./session.ts";

export interface BrainProbe {
  ok: boolean;
  /** An error code the screen words in the person's language. */
  problem?: string;
  /** What the brain or its service said, as it said it, when that explains the problem. */
  detail?: string;
  ms?: number;
}

export const PROBE_PROMPT =
  "This is a check that you can answer. Reply with the single word OK and nothing else.";

/**
 * Whether the person's Claude Code is signed in, from its own `claude auth status`, which calls no
 * model; unknown when this Claude Code cannot say.
 */
export function claudeSignedIn(): Promise<boolean | undefined> {
  const command = claudeCommand();
  if (!command) return Promise.resolve(false);
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(
      command.file,
      [...command.prefix, "auth", "status", "--json"],
      {
        env: cleanEnv() as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const timer = setTimeout(() => {
      child.kill();
      resolve(undefined);
    }, 15_000);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk;
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve(undefined);
    });
    child.on("close", () => {
      clearTimeout(timer);
      try {
        const loggedIn = JSON.parse(out)?.loggedIn;
        resolve(typeof loggedIn === "boolean" ? loggedIn : undefined);
      } catch {
        resolve(undefined);
      }
    });
  });
}

/** What a failed answer means for the person, from the error the brain or its service gave. */
export function probeProblem(
  error: string | undefined,
  brain: { claudeCode: boolean; local: boolean },
): string {
  const known = errorCode(error);
  if (known) return known;
  const text = error ?? "";
  if (
    /\/login|not logged in|log ?in|401|unauthori[sz]ed|invalid.{0,12}(api )?key|authentication/i.test(
      text,
    )
  )
    return brain.claudeCode ? "claude-signed-out" : "brain-key-wrong";
  if (
    /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up/i.test(
      text,
    )
  )
    return brain.local ? "brain-local-unreachable" : "brain-unreachable";
  return "brain-no-answer";
}

export async function probeBrain(): Promise<BrainProbe> {
  const choice = await brainChoice();
  const missing = await brainProblem(choice);
  if (missing) return { ok: false, problem: missing };
  const claudeCode = choice.kind === "claude-code";
  if (claudeCode && (await claudeSignedIn()) === false)
    return { ok: false, problem: "claude-signed-out" };
  const started = Date.now();
  const result = await runSession({
    prompt: PROBE_PROMPT,
    maxTurns: 1,
    timeoutMs: 90_000,
    purpose: "probe",
  });
  const ms = Date.now() - started;
  if (result.ok && result.text.trim()) return { ok: true, ms };
  const local = choice.kind === "api" && choice.provider === "local";
  return {
    ok: false,
    problem: probeProblem(result.error, { claudeCode, local }),
    ...(result.error ? { detail: result.error.slice(0, 400) } : {}),
    ms,
  };
}
