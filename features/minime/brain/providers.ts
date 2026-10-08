// The brains a clone can think with, vendor first, as Thursday, Hermes Agent and OpenClaw offer
// them: for each vendor, the ways in (a subscription signed in to, an API key, or a model on this
// computer), then the model. OpenAI by the person's ChatGPT plan (Sign in with ChatGPT) or a key;
// Claude by their Claude subscription through their own Claude Code, or a key; Gemini and
// OpenRouter by a key; Ollama or LM Studio on this computer. Names and model ids are the vendors'
// own, smallest first; a person may type any other model the vendor serves. No imports: the page
// lists it too.

export type ProviderId =
  | "chatgpt"
  | "anthropic"
  | "openai"
  | "google"
  | "openrouter"
  | "local";

export interface ModelChoice {
  id: string;
  label: string;
  /** Size, not quality: a label rather than a price, because prices move. */
  tier: "small" | "mid" | "large";
}

export interface Provider {
  id: ProviderId;
  /** The vendor's own name; never translated. */
  name: string;
  /** Where the person makes a key. A plan signed in to, or a model on this computer, needs none. */
  keysAt?: string;
  /** Reached by signing in to the person's plan rather than with a key. */
  signIn?: true;
  models: ModelChoice[];
  /** Where a model on this computer answers (Ollama's OpenAI-compatible server by default). */
  baseUrl?: string;
}

export const PROVIDERS: Provider[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    signIn: true,
    // What the plan offers is listed by OpenAI once signed in; these stand in until then.
    models: [
      { id: "gpt-6-luna", label: "GPT 6 Luna", tier: "small" },
      { id: "gpt-6.1-sol", label: "GPT 6.1 Sol", tier: "mid" },
      { id: "gpt-6-astra", label: "GPT 6 Astra", tier: "large" },
    ],
  },
  {
    id: "anthropic",
    name: "Claude",
    keysAt: "https://platform.claude.com/settings/keys",
    models: [
      { id: "claude-haiku-4-5", label: "Haiku 4.5", tier: "small" },
      { id: "claude-sonnet-5-5", label: "Sonnet 5.5", tier: "mid" },
      { id: "claude-opus-5-5", label: "Opus 5.5", tier: "large" },
    ],
  },
  {
    id: "openai",
    name: "OpenAI",
    keysAt: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-6-luna", label: "GPT 6 Luna", tier: "small" },
      { id: "gpt-6.1-sol", label: "GPT 6.1 Sol", tier: "mid" },
      { id: "gpt-6-astra", label: "GPT 6 Astra", tier: "large" },
    ],
  },
  {
    id: "google",
    name: "Gemini",
    keysAt: "https://aistudio.google.com/apikey",
    models: [
      {
        id: "gemini-3.5-flash-lite",
        label: "Gemini 3.5 Flash Lite",
        tier: "small",
      },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", tier: "mid" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    keysAt: "https://openrouter.ai/settings/keys",
    models: [
      { id: "z-ai/glm-5.3-flash", label: "GLM 5.3 Flash", tier: "small" },
      {
        id: "google/gemini-3.8-flash",
        label: "Gemini 3.8 Flash",
        tier: "small",
      },
      {
        id: "anthropic/claude-sonnet-5.5",
        label: "Claude Sonnet 5.5",
        tier: "mid",
      },
      { id: "openai/gpt-6.1-sol", label: "GPT 6.1 Sol", tier: "mid" },
      { id: "moonshotai/kimi-k3", label: "Kimi K3", tier: "mid" },
      {
        id: "anthropic/claude-opus-5.5",
        label: "Claude Opus 5.5",
        tier: "large",
      },
    ],
  },
  {
    id: "local",
    name: "Ollama / LM Studio",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: [],
  },
];

export function provider(id: string): Provider | undefined {
  return PROVIDERS.find((entry) => entry.id === id);
}

/** One way into a vendor's models. */
export type Way =
  | { kind: "sign-in"; provider: "chatgpt" }
  | { kind: "claude-code" }
  | { kind: "key"; provider: ProviderId }
  /** The office's own key for the vendor, used through its relay (features/relay/team-ai.ts). */
  | { kind: "team"; provider: ProviderId }
  | { kind: "local" };

export interface Vendor {
  id: "openai" | "claude" | "gemini" | "openrouter" | "local";
  /** The vendor's own name; the one on this computer is named in the person's language. */
  name?: string;
  ways: Way[];
}

/** The vendors as the person picks among them, each with its ways in, the plan first. */
/** The Claudes a person's own Claude Code can think with, by the aliases it knows. */
export const CLAUDE_CODE_MODELS: ModelChoice[] = [
  { id: "haiku", label: "Claude Haiku", tier: "small" },
  { id: "sonnet", label: "Claude Sonnet", tier: "mid" },
  { id: "opus", label: "Claude Opus", tier: "large" },
];

/** A vendor's lighter model, for background work when the person wants it light. */
export function lighterModel(id: ProviderId, model: string): string {
  const small = provider(id)?.models.find((one) => one.tier === "small");
  return small?.id ?? model;
}

export const VENDORS: Vendor[] = [
  {
    id: "openai",
    name: "OpenAI",
    ways: [
      { kind: "sign-in", provider: "chatgpt" },
      { kind: "key", provider: "openai" },
      { kind: "team", provider: "openai" },
    ],
  },
  {
    id: "claude",
    name: "Claude",
    ways: [
      { kind: "claude-code" },
      { kind: "key", provider: "anthropic" },
      { kind: "team", provider: "anthropic" },
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    ways: [
      { kind: "key", provider: "google" },
      { kind: "team", provider: "google" },
    ],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    ways: [
      { kind: "key", provider: "openrouter" },
      { kind: "team", provider: "openrouter" },
    ],
  },
  { id: "local", ways: [{ kind: "local" }] },
];
