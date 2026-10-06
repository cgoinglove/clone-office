// The brain the person picked, kept in settings.json ("brain"), and the keys they gave, kept apart
// in brain/keys.json for their eyes only. Their own Claude Code is the brain until they pick
// another, so nothing changes for someone who already thinks with it. A key is checked by asking
// the vendor for its list of models, which costs nothing.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { hasClaudeCode } from "../server/brain.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import { chatGptAccount } from "./chatgpt.ts";
import { type ProviderId, provider } from "./providers.ts";

export type BrainChoice =
  | { kind: "claude-code" }
  | {
      kind: "api";
      provider: ProviderId;
      model: string;
      /** A model on this computer: where its server answers. */
      baseUrl?: string;
    };

/** A failure the page says in the person's language. */
export class BrainError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

export const keysPath = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "brain", "keys.json");

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

/** Whether the person picked a brain themselves; until then their Claude Code is used. */
export async function brainChosen(): Promise<boolean> {
  return Boolean((await readSettings()).brain);
}

export async function brainChoice(): Promise<BrainChoice> {
  const raw = (await readSettings()).brain as
    | Partial<Extract<BrainChoice, { kind: "api" }>>
    | undefined;
  if (
    raw?.kind === "api" &&
    typeof raw.provider === "string" &&
    provider(raw.provider) &&
    typeof raw.model === "string" &&
    raw.model.trim()
  )
    return {
      kind: "api",
      provider: raw.provider,
      model: raw.model.trim(),
      ...(typeof raw.baseUrl === "string" && raw.baseUrl
        ? { baseUrl: raw.baseUrl }
        : {}),
    };
  return { kind: "claude-code" };
}

export async function setBrainChoice(choice: BrainChoice): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    await writeSettings(
      `${JSON.stringify({ ...settings, brain: choice }, null, 2)}\n`,
    );
  });
}

async function readKeys(): Promise<Partial<Record<ProviderId, string>>> {
  const read = await readText(keysPath());
  try {
    return read.raw ? JSON.parse(read.raw) : {};
  } catch {
    return {};
  }
}

export async function providerKey(id: ProviderId): Promise<string | undefined> {
  const key = (await readKeys())[id];
  return typeof key === "string" && key ? key : undefined;
}

/** The vendors the person gave a key for. */
export async function keyedProviders(): Promise<ProviderId[]> {
  const keys = await readKeys();
  return (Object.keys(keys) as ProviderId[]).filter((id) => keys[id]);
}

/** Keeps a key for a vendor, or forgets it. */
export async function setProviderKey(
  id: ProviderId,
  key: string | undefined,
): Promise<void> {
  await withLock(
    join(/*turbopackIgnore: true*/ minimeHome(), "brain"),
    async () => {
      const keys = await readKeys();
      if (key) keys[id] = key;
      else delete keys[id];
      await atomicWrite(keysPath(), JSON.stringify(keys, null, 2), {
        mode: 0o600,
      });
    },
  );
}

/**
 * Asks the vendor for its models with the key, which is free: a wrong key fails here rather than in
 * the middle of the person's first request. `fetcher` stands in for the network in tests.
 */
export async function checkKey(
  id: ProviderId,
  key: string,
  baseUrl?: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (id === "chatgpt") throw new BrainError("brain-key-wrong");
  const ask: Record<Exclude<ProviderId, "chatgpt">, () => Promise<Response>> = {
    anthropic: () =>
      fetcher("https://api.anthropic.com/v1/models?limit=1", {
        headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      }),
    openai: () =>
      fetcher("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${key}` },
      }),
    google: () =>
      fetcher(
        "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
        { headers: { "x-goog-api-key": key } },
      ),
    openrouter: () =>
      fetcher("https://openrouter.ai/api/v1/key", {
        headers: { authorization: `Bearer ${key}` },
      }),
    local: () =>
      fetcher(
        `${(baseUrl ?? provider("local")?.baseUrl ?? "").replace(/\/+$/, "")}/models`,
        key ? { headers: { authorization: `Bearer ${key}` } } : {},
      ),
  };
  let response: Response;
  try {
    response = await ask[id]();
  } catch {
    throw new BrainError(
      id === "local" ? "brain-local-unreachable" : "brain-unreachable",
    );
  }
  if (response.status === 401 || response.status === 403)
    throw new BrainError("brain-key-wrong");
  if (!response.ok)
    throw new BrainError(
      id === "local" ? "brain-local-unreachable" : "brain-unreachable",
    );
}

/**
 * Whether the chosen brain can think now: Claude Code installed for it, or a key for the vendor
 * (a model on this computer needs none). Answers the code the page says it with.
 */
export async function brainProblem(
  choice?: BrainChoice,
): Promise<
  | "claude-missing"
  | "brain-key-missing"
  | "brain-chatgpt-signed-out"
  | undefined
> {
  const chosen = choice ?? (await brainChoice());
  if (chosen.kind === "claude-code")
    return hasClaudeCode() ? undefined : "claude-missing";
  if (chosen.provider === "local") return undefined;
  if (chosen.provider === "chatgpt")
    return (await chatGptAccount()) ? undefined : "brain-chatgpt-signed-out";
  return (await providerKey(chosen.provider)) ? undefined : "brain-key-missing";
}
