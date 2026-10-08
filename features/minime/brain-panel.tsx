"use client";

// What the clone thinks with (brain/choice.ts), picked vendor first, as Thursday's model picker,
// Hermes Agent's setup and OpenClaw's onboarding pick it: OpenAI (the person's ChatGPT plan, signed
// in to, or an API key), Claude (their Claude subscription through their own Claude Code, or a
// key), Gemini, OpenRouter, or a model running on this computer. What this computer already has is
// marked. A key is checked for free before it is kept and never comes back to the page.

import {
  Check,
  CircleAlert,
  CircleCheck,
  Cpu,
  KeyRound,
  LogIn,
  Terminal,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { BrandMark, type MarkId } from "@/features/brand/brand-mark";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  CLAUDE_CODE_MODELS,
  type ProviderId,
  provider as providerOf,
  VENDORS,
  type Vendor,
  type Way,
} from "./brain/providers";

type Choice =
  | { kind: "claude-code"; model?: string }
  | {
      kind: "api";
      provider: ProviderId;
      model: string;
      baseUrl?: string;
      team?: boolean;
    };

export interface BrainState {
  choice: Choice;
  /** Picked by the person; until then their Claude Code is used. */
  chosen: boolean;
  claudeCode: boolean;
  keyed: ProviderId[];
  chatgpt: {
    email?: string;
    name?: string;
    models: { id: string; label: string }[];
  } | null;
  local: { ollama: boolean; lmstudio: boolean };
  /** The office's team keys, when this clone is in an office (features/relay/team-ai.ts). */
  team: {
    keys: { provider: string; hint: string; by: string }[];
    sealing: boolean;
    calls: { mine: number; all: number };
  } | null;
}

/** Whether the office keeps a key for a vendor. */
const teamHas = (state: BrainState, provider: ProviderId) =>
  Boolean(state.team?.keys.some((key) => key.provider === provider));

/** Whether the chosen brain can think now: the subscription signed in, or the key its vendor needs. */
export function brainReady(state: BrainState | null): boolean {
  if (!state) return false;
  const { choice } = state;
  if (choice.kind === "claude-code") return state.claudeCode;
  if (choice.provider === "chatgpt") return Boolean(state.chatgpt);
  if (choice.team) return teamHas(state, choice.provider);
  return choice.provider === "local" || state.keyed.includes(choice.provider);
}

/** The brain in use, as the person reads it: the vendor and model, or their Claude Code. */
export function brainLabel(state: BrainState, claudeCode: string): string {
  const { choice } = state;
  if (choice.kind !== "api")
    return `${claudeCode} · ${
      CLAUDE_CODE_MODELS.find((m) => m.id === (choice.model ?? "sonnet"))
        ?.label ?? choice.model
    }`;
  const vendor = providerOf(choice.provider);
  const model =
    state.chatgpt?.models.find((m) => m.id === choice.model)?.label ??
    vendor?.models.find((m) => m.id === choice.model)?.label ??
    choice.model;
  return `${vendor?.name ?? choice.provider} · ${model}`;
}

/** The vendor and way a saved choice belongs to. */
function placeOf(choice: Choice): { vendor: Vendor["id"]; way: number } {
  if (choice.kind === "claude-code") return { vendor: "claude", way: 0 };
  for (const vendor of VENDORS) {
    const way = vendor.ways.findIndex((w) =>
      choice.team
        ? w.kind === "team" && w.provider === choice.provider
        : (w.kind === "key" || w.kind === "sign-in") &&
          w.provider === choice.provider,
    );
    if (way >= 0) return { vendor: vendor.id, way };
    if (choice.provider === "local" && vendor.id === "local")
      return { vendor: "local", way: 0 };
  }
  return { vendor: "claude", way: 0 };
}

/** The provider a way reaches models through (Claude Code has none of its own here). */
const providerOfWay = (way: Way): ProviderId | undefined =>
  way.kind === "key" || way.kind === "sign-in" || way.kind === "team"
    ? way.provider
    : way.kind === "local"
      ? "local"
      : undefined;

const HEADERS = { "content-type": "application/json", "x-clone-office": "1" };

/** Each vendor's own mark; a model on this computer shows the two apps that run one. */
function VendorMark({ vendor }: { vendor: Vendor["id"] }) {
  if (vendor === "local")
    return (
      <span className="flex items-center gap-0.5">
        <BrandMark id="ollama" className="size-3.5" />
        <BrandMark id="lmstudio" className="size-3.5" />
      </span>
    );
  return <BrandMark id={vendor} className="size-5" />;
}

const WAY_ICONS = {
  "sign-in": LogIn,
  "claude-code": Terminal,
  key: KeyRound,
  team: Users,
  local: Cpu,
} as const;

function WayIcon({ kind }: { kind: Way["kind"] }) {
  const Icon = WAY_ICONS[kind];
  return <Icon className="size-3.5" aria-hidden />;
}

/** Whose model it is: the vendor's own, or for OpenRouter the maker its id names. */
const MAKERS: Record<string, MarkId> = {
  anthropic: "claude",
  openai: "openai",
  google: "gemini",
  "meta-llama": "meta",
  deepseek: "deepseek",
  mistralai: "mistral",
  qwen: "qwen",
  "x-ai": "xai",
  "z-ai": "zai",
  moonshotai: "kimi",
};
const PROVIDER_MARKS: Partial<Record<ProviderId, MarkId>> = {
  chatgpt: "openai",
  openai: "openai",
  anthropic: "claude",
  google: "gemini",
};
function modelMark(model: string, provider: ProviderId): MarkId | undefined {
  if (provider === "openrouter") return MAKERS[model.split("/")[0]];
  return PROVIDER_MARKS[provider];
}

/** Settings › Brain: what the clone thinks with, and changing it. */
export function BrainPanel() {
  return (
    <div className="flex flex-col gap-4 text-sm">
      <BrainChooser />
    </div>
  );
}

/** Picking the brain: a vendor, its way in, then a model. */
export function BrainChooser({
  onChange,
}: {
  /** Hears the brain as it stands, after it is read and after each change. */
  onChange?: (state: BrainState) => void;
}) {
  const t = useTranslations("brain");
  const problemText = useProblem();
  const [state, setState] = useState<BrainState | null>(null);
  const [vendorId, setVendorId] = useState<Vendor["id"] | null>(null);
  const [wayAt, setWayAt] = useState(0);
  const [model, setModel] = useState("");
  const [other, setOther] = useState("");
  const [key, setKey] = useState("");
  const [address, setAddress] = useState(providerOf("local")?.baseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const waiting = useRef<ReturnType<typeof setInterval>>(undefined);
  const placed = useRef(false);

  const load = useCallback(async () => {
    const data = (await fetch("/api/me/brain", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as BrainState | null;
    if (!data?.choice) return undefined;
    setState(data);
    onChange?.(data);
    // The vendor in use is opened once, when the person has picked one before.
    if (!placed.current && data.chosen) {
      placed.current = true;
      const place = placeOf(data.choice);
      setVendorId(place.vendor);
      setWayAt(place.way);
      if (data.choice.kind === "api") {
        const known =
          providerOf(data.choice.provider)?.models.some(
            (m) => m.id === (data.choice as { model: string }).model,
          ) ||
          data.chatgpt?.models.some(
            (m) => m.id === (data.choice as { model: string }).model,
          );
        setModel(known ? data.choice.model : "");
        setOther(known ? "" : data.choice.model);
        if (data.choice.baseUrl) setAddress(data.choice.baseUrl);
      } else if (data.choice.model) {
        // The Claude their Claude Code thinks with: one of its aliases, or a name typed in.
        const known = CLAUDE_CODE_MODELS.some(
          (m) => m.id === (data.choice as { model?: string }).model,
        );
        setModel(known ? data.choice.model : "");
        setOther(known ? "" : data.choice.model);
      }
    }
    return data;
  }, [onChange]);

  useEffect(() => {
    void load();
    return () => clearInterval(waiting.current);
  }, [load]);

  const post = async (body: unknown) => {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/me/brain", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setProblem(String(data.error ?? response.status));
      else await load();
      return response.ok ? data : undefined;
    } finally {
      setBusy(false);
    }
  };

  const signIn = async () => {
    // Opened at the press, so the browser lets the tab open; the address comes a moment later.
    const tab = window.open("about:blank", "_blank");
    const data = (await post({ action: "chatgpt-sign-in" })) as
      | { authorize?: string }
      | undefined;
    if (!data?.authorize) {
      tab?.close();
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = data.authorize;
    } else window.location.href = data.authorize;
    setSigningIn(true);
    clearInterval(waiting.current);
    const until = Date.now() + 5 * 60 * 1000;
    waiting.current = setInterval(async () => {
      const next = await load();
      if (next?.chatgpt || Date.now() > until) {
        clearInterval(waiting.current);
        setSigningIn(false);
      }
    }, 2000);
  };

  if (!state) return null;
  const vendor = VENDORS.find((v) => v.id === vendorId);
  const way = vendor?.ways[Math.min(wayAt, vendor.ways.length - 1)];
  const id = way ? providerOfWay(way) : undefined;
  const entry = id ? providerOf(id) : undefined;
  const models =
    way?.kind === "claude-code"
      ? CLAUDE_CODE_MODELS
      : id === "chatgpt" && state.chatgpt?.models.length
        ? state.chatgpt.models.map((m) => ({
            id: m.id,
            label: m.label,
            tier: undefined,
          }))
        : (entry?.models ?? []);
  // The model a way starts on when nothing is picked yet: the vendor's middle one, as Thursday's
  // picker and Hermes Agent's setup suggest one, so "Use this" is one press away.
  const suggested = models.find((m) => m.tier === "mid") ?? models[0];
  const chosenModel = other.trim() || model || suggested?.id || "";
  const current = state.choice;
  const found = (v: Vendor) =>
    v.id === "claude"
      ? state.claudeCode
      : v.id === "local"
        ? state.local.ollama || state.local.lmstudio
        : v.id === "openai"
          ? Boolean(state.chatgpt)
          : false;
  const inUse = (v: Vendor) => state.chosen && placeOf(current).vendor === v.id;
  // The way picked is ready to think: signed in, a key kept, Claude Code here, or a local model named.
  const wayReady =
    way?.kind === "claude-code"
      ? state.claudeCode
      : way?.kind === "sign-in"
        ? Boolean(state.chatgpt) && Boolean(chosenModel)
        : way?.kind === "key"
          ? state.keyed.includes(way.provider) && Boolean(chosenModel)
          : way?.kind === "team"
            ? teamHas(state, way.provider) && Boolean(chosenModel)
            : way?.kind === "local"
              ? Boolean(chosenModel)
              : false;
  const isCurrent =
    state.chosen &&
    (way?.kind === "claude-code"
      ? current.kind === "claude-code" &&
        (current.model ?? "sonnet") === chosenModel
      : current.kind === "api" &&
        current.provider === id &&
        current.model === chosenModel &&
        Boolean(current.team) === (way?.kind === "team"));

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div
        className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label={t("title")}
      >
        {VENDORS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={vendorId === v.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-[border-color,background-color,box-shadow] hover:bg-muted/50",
              vendorId === v.id &&
                "border-foreground/70 shadow-[0_0_0_1px_var(--foreground)] hover:bg-background",
            )}
            onClick={() => {
              setVendorId(v.id);
              setWayAt(0);
              setModel("");
              setOther("");
              setKey("");
              setProblem(null);
            }}
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-background">
              <VendorMark vendor={v.id} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {v.name ?? t("local")}
                </span>
                {inUse(v) ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-brand">
                    <CircleCheck className="size-3.5" />
                    {t("inUse")}
                  </span>
                ) : found(v) ? (
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {t("found")}
                  </span>
                ) : null}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {t(`vendor.${v.id}`)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {vendor && way && (
        <div className="flex flex-col gap-3">
          {vendor.ways.length > 1 && (
            <Segmented<string>
              aria-label={vendor.name ?? t("local")}
              className="w-full *:flex-1"
              value={String(wayAt)}
              onChange={(next) => {
                setWayAt(Number(next));
                setModel("");
                setOther("");
                setProblem(null);
              }}
              options={vendor.ways.map((w, at) => ({
                value: String(at),
                label: (
                  <span className="flex items-center justify-center gap-1.5">
                    <WayIcon kind={w.kind} />
                    {t(`way.${w.kind}`)}
                  </span>
                ),
              }))}
            />
          )}
          <p className="text-muted-foreground">{t(`wayNote.${way.kind}`)}</p>

          {way.kind === "claude-code" && (
            <p
              className={cn(
                "flex items-start gap-2 rounded-lg px-3 py-2",
                state.claudeCode ? "bg-muted" : "bg-waiting/8 text-waiting",
              )}
            >
              {state.claudeCode ? (
                <BrandMark id="claudecode" className="mt-0.5" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
              )}
              <span>
                {state.claudeCode ? t("claudeCodeFound") : t("claudeMissing")}
              </span>
            </p>
          )}

          {way.kind === "sign-in" &&
            (state.chatgpt ? (
              <p>
                {state.chatgpt.email
                  ? t("chatgpt.signedIn", { email: state.chatgpt.email })
                  : t("chatgpt.signedInNoEmail")}{" "}
                <button
                  type="button"
                  className="text-muted-foreground underline underline-offset-4"
                  disabled={busy}
                  onClick={() => void post({ action: "chatgpt-sign-out" })}
                >
                  {t("chatgpt.signOut")}
                </button>
              </p>
            ) : (
              <div className="flex flex-col items-start gap-2">
                <Button
                  size="lg"
                  disabled={busy || signingIn}
                  loading={signingIn}
                  onClick={() => void signIn()}
                >
                  {!signingIn && <BrandMark id="openai" />}
                  {t("chatgpt.signIn")}
                </Button>
                {signingIn && (
                  <p className="text-muted-foreground">
                    {t("chatgpt.signingIn")}
                  </p>
                )}
              </div>
            ))}

          {way.kind === "key" &&
            (state.keyed.includes(way.provider) ? (
              <p className="text-muted-foreground">
                {t("keySaved")}{" "}
                <button
                  type="button"
                  className="underline underline-offset-4"
                  disabled={busy}
                  onClick={() =>
                    void post({ action: "forget-key", provider: way.provider })
                  }
                >
                  {t("forgetKey")}
                </button>
              </p>
            ) : (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post({
                    action: "key",
                    provider: way.provider,
                    key,
                  }).then((ok) => {
                    if (ok) setKey("");
                  });
                }}
              >
                <Input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1"
                  value={key}
                  aria-label={t("key")}
                  placeholder={t("keyPlaceholder")}
                  onChange={(event) => setKey(event.target.value)}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy || key.trim().length < 8}
                >
                  {t("save")}
                </Button>
                {entry?.keysAt && (
                  <a
                    href={entry.keysAt}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground underline underline-offset-4"
                  >
                    {t("makeKey")}
                  </a>
                )}
              </form>
            ))}

          {way.kind === "team" &&
            (!state.team ? (
              <p className="text-muted-foreground">{t("team.notIn")}</p>
            ) : teamHas(state, way.provider) ? (
              <div className="flex flex-col gap-1 text-muted-foreground">
                {state.team.keys
                  .filter((kept) => kept.provider === way.provider)
                  .map((kept) => (
                    <p key={kept.provider}>
                      {t("team.kept", { hint: kept.hint, name: kept.by })}{" "}
                      <button
                        type="button"
                        className="underline underline-offset-4"
                        disabled={busy}
                        onClick={() =>
                          void post({
                            action: "forget-team-key",
                            provider: way.provider,
                          })
                        }
                      >
                        {t("team.remove")}
                      </button>
                    </p>
                  ))}
                <p className="text-xs">
                  {t("team.calls", {
                    mine: state.team.calls.mine,
                    all: state.team.calls.all,
                  })}
                </p>
              </div>
            ) : !state.team.sealing ? (
              <p className="text-muted-foreground">{t("team.unsealed")}</p>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void post({
                    action: "team-key",
                    provider: way.provider,
                    key,
                  }).then((ok) => {
                    if (ok) setKey("");
                  });
                }}
              >
                <p className="text-muted-foreground">{t("team.add")}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="password"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1"
                    value={key}
                    aria-label={t("key")}
                    placeholder={t("keyPlaceholder")}
                    onChange={(event) => setKey(event.target.value)}
                  />
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || key.trim().length < 8}
                  >
                    {t("save")}
                  </Button>
                </div>
              </form>
            ))}

          {way.kind === "local" && (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">
                {state.local.ollama || state.local.lmstudio
                  ? t("localRunning", {
                      name: [
                        state.local.ollama ? "Ollama" : "",
                        state.local.lmstudio ? "LM Studio" : "",
                      ]
                        .filter(Boolean)
                        .join(", "),
                    })
                  : t("localMissing")}
              </p>
              <Input
                spellCheck={false}
                value={address}
                aria-label={t("address")}
                placeholder={t("address")}
                onChange={(event) => setAddress(event.target.value)}
              />
            </div>
          )}

          {(way.kind !== "claude-code" || state.claudeCode) && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 font-medium">{t("model")}</legend>
              <div className="flex flex-col overflow-hidden rounded-xl border border-border">
                {models.map((option) => {
                  const picked =
                    !other.trim() && (model || suggested?.id) === option.id;
                  const mark =
                    way.kind === "claude-code"
                      ? ("claude" as const)
                      : id
                        ? modelMark(option.id, id)
                        : undefined;
                  return (
                    <label
                      key={option.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 border-b border-border/70 px-3 py-2.5 transition-colors last:border-b-0 hover:bg-muted/50",
                        picked && "bg-muted/70 hover:bg-muted/70",
                      )}
                    >
                      <input
                        type="radio"
                        name="brain-model"
                        className="sr-only"
                        checked={picked}
                        onChange={() => {
                          setModel(option.id);
                          setOther("");
                        }}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-4 shrink-0 place-items-center rounded-full border",
                          picked
                            ? "border-foreground bg-foreground"
                            : "border-foreground/30",
                        )}
                      >
                        {picked && (
                          <span className="size-1.5 rounded-full bg-background" />
                        )}
                      </span>
                      {mark && <BrandMark id={mark} />}
                      <span className="min-w-0 flex-1 truncate">
                        {option.label}
                      </span>
                      {option.id === suggested?.id && (
                        <span className="shrink-0 rounded-md bg-brand/10 px-1.5 py-0.5 text-[11px] font-medium text-brand">
                          {t("suggested")}
                        </span>
                      )}
                      {option.tier && (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                          {t(`tier.${option.tier}`)}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <Input
                spellCheck={false}
                className="mt-1"
                value={other}
                aria-label={t("modelOther")}
                placeholder={
                  way.kind === "local" ? t("modelLocal") : t("modelOther")
                }
                onChange={(event) => setOther(event.target.value)}
              />
            </fieldset>
          )}

          <Button
            variant={isCurrent ? "outline" : "brand"}
            className="self-start"
            disabled={busy || !wayReady || isCurrent}
            onClick={() =>
              void post(
                way.kind === "claude-code"
                  ? { action: "claude-code", model: chosenModel }
                  : {
                      action: "use",
                      provider: id,
                      model: chosenModel,
                      ...(way.kind === "local" ? { baseUrl: address } : {}),
                      ...(way.kind === "team" ? { team: true } : {}),
                    },
              )
            }
          >
            {isCurrent && <Check />}
            {isCurrent ? t("inUse") : t("use")}
          </Button>
        </div>
      )}
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </div>
  );
}
