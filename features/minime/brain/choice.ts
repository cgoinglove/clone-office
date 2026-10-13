// The brain the person picked, kept in settings.json ("brain"), and the keys they gave, kept apart
// in brain/keys.json for their eyes only. Their own Claude Code is the brain until they pick
// another, so nothing changes for someone who already thinks with it. A key is checked by asking
// the vendor for its list of models, which costs nothing.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { withLock } from "../memory/files.ts";
import { hasClaudeCode } from "../server/brain.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import {
  readSecretJson,
  readSecretJsonOr,
  writeSecretJson,
} from "../server/secret.ts";
import { chatGptAccount } from "./chatgpt.ts";
import { type ProviderId, provider } from "./providers.ts";

export type BrainChoice =
  | {
      kind: "claude-code";
      /** Which Claude the person's Claude Code thinks with (an alias it knows); Sonnet when unset. */
      model?: string;
      /**
       * Another Claude its Claude Code moves to when the first is overloaded or not available
       * (Claude Code's own `--fallback-model`).
       */
      fallback?: string;
    }
  | {
      kind: "api";
      provider: ProviderId;
      model: string;
      /** A model on this computer: where its server answers. */
      baseUrl?: string;
      /** With the office's key, through its relay, rather than one of the person's own. */
      team?: boolean;
      /**
       * A second model the app's own loop moves to when this one is busy, rate-limited or failing
       * on the vendor's side after its retries (fallback.ts).
       */
      fallback?: ApiModel;
    };

/** A model reached by the app's own loop: a vendor's, by the person's key, plan, team or computer. */
export interface ApiModel {
  provider: ProviderId;
  model: string;
  baseUrl?: string;
  team?: boolean;
}

/** The fallback model as a choice of its own, to reach it as the loop reaches any model. */
export const fallbackChoice = (
  fallback: ApiModel,
): Extract<BrainChoice, { kind: "api" }> => ({ kind: "api", ...fallback });

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

/** A model as kept, when it is one: a known vendor and a model's name. */
function apiModel(raw: unknown): ApiModel | undefined {
  const given = raw as Partial<ApiModel> | undefined;
  if (
    typeof given?.provider !== "string" ||
    !provider(given.provider) ||
    typeof given.model !== "string" ||
    !given.model.trim()
  )
    return undefined;
  return {
    provider: given.provider,
    model: given.model.trim(),
    ...(typeof given.baseUrl === "string" && given.baseUrl
      ? { baseUrl: given.baseUrl }
      : {}),
    ...(given.team === true ? { team: true } : {}),
  };
}

/** A Claude its Claude Code knows (an alias or a model's name). */
const claudeModel = (raw: unknown) =>
  typeof raw === "string" && /^[\w.-]{2,60}$/.test(raw) ? raw : undefined;

/** Whether two models are the same one, reached the same way. */
export const sameModel = (a: ApiModel, b: ApiModel) =>
  a.provider === b.provider &&
  a.model === b.model &&
  Boolean(a.team) === Boolean(b.team) &&
  (a.baseUrl ?? "") === (b.baseUrl ?? "");

export async function brainChoice(): Promise<BrainChoice> {
  const raw = (await readSettings()).brain as
    | (Record<string, unknown> & { kind?: string })
    | undefined;
  const main = raw?.kind === "api" ? apiModel(raw) : undefined;
  if (main) {
    const fallback = apiModel(raw?.fallback);
    return {
      kind: "api",
      ...main,
      ...(fallback && !sameModel(fallback, main) ? { fallback } : {}),
    };
  }
  const model = claudeModel(raw?.model);
  const fallback = claudeModel(raw?.fallback);
  return {
    kind: "claude-code",
    ...(model ? { model } : {}),
    ...(fallback && fallback !== (model ?? "sonnet") ? { fallback } : {}),
  };
}

/**
 * Keeps what the clone thinks with. A fallback picked before stays while it still fits: another
 * Claude for Claude Code, another reached model for the app's own loop, never the model itself.
 */
export async function setBrainChoice(choice: BrainChoice): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    const was = (settings.brain ?? {}) as Record<string, unknown>;
    let kept: BrainChoice = choice;
    if (!("fallback" in choice)) {
      if (choice.kind === "api" && was.kind === "api") {
        const fallback = apiModel(was.fallback);
        if (fallback && !sameModel(fallback, choice))
          kept = { ...choice, fallback };
      } else if (choice.kind === "claude-code" && was.kind !== "api") {
        const fallback = claudeModel(was.fallback);
        if (fallback && fallback !== (choice.model ?? "sonnet"))
          kept = { ...choice, fallback };
      }
    }
    await writeSettings(
      `${JSON.stringify({ ...settings, brain: kept }, null, 2)}\n`,
    );
  });
}

/**
 * Sets the fallback model, or takes it away (undefined). It must fit what the clone thinks with:
 * a Claude alias for Claude Code, a reached model for the app's own loop, and not the same one.
 */
export async function setFallback(
  fallback: string | ApiModel | undefined,
): Promise<void> {
  const choice = await brainChoice();
  if (fallback !== undefined) {
    if (choice.kind === "claude-code") {
      if (typeof fallback !== "string" || !claudeModel(fallback))
        throw new BrainError("brain-fallback-unfit");
      if (fallback === (choice.model ?? "sonnet"))
        throw new BrainError("brain-fallback-same");
    } else {
      if (typeof fallback === "string" || !apiModel(fallback))
        throw new BrainError("brain-fallback-unfit");
      if (sameModel(fallback, choice))
        throw new BrainError("brain-fallback-same");
    }
  }
  const { fallback: _was, ...rest } = choice;
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    await writeSettings(
      `${JSON.stringify({ ...settings, brain: fallback === undefined ? rest : { ...rest, fallback } }, null, 2)}\n`,
    );
  });
}

type Keys = Partial<Record<ProviderId, string>>;

/** Sealed (server/secret.ts); a file written before sealing began is read as it is. */
async function readKeys(): Promise<Keys> {
  return readSecretJsonOr<Keys>(keysPath(), {});
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
      // Unreadable (another key, a key file in trouble): refused rather than written over.
      const keys = (await readSecretJson<Keys>(keysPath())) ?? {};
      if (key) keys[id] = key;
      else delete keys[id];
      await writeSecretJson(keysPath(), keys);
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
