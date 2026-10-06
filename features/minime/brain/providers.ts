// The brains a mini-me can think with, as its person picks one (after Thursday's model picker and
// Hermes Agent's providers): their own Claude Code, run on this computer with their subscription;
// or a model reached directly, with a key they made at the vendor or one their team set, or a model
// running on this computer. Names and model ids are the vendors' own, smallest first; a person may
// type any other model the vendor serves. No imports: the page lists it too.

export type ProviderId =
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
  /** Where the person makes a key. A model on this computer needs none. */
  keysAt?: string;
  models: ModelChoice[];
  /** Where a model on this computer answers (Ollama's OpenAI-compatible server by default). */
  baseUrl?: string;
}

export const PROVIDERS: Provider[] = [
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
      { id: "gemini-3.5-flash-lite", label: "3.5 Flash Lite", tier: "small" },
      { id: "gemini-3.8-flash", label: "3.8 Flash", tier: "mid" },
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
