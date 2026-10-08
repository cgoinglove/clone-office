"use client";

// What the clone thinks with (brain/choice.ts), picked vendor first, as Thursday's model picker,
// Hermes Agent's setup and OpenClaw's onboarding pick it: OpenAI (the person's ChatGPT plan, signed
// in to, or an API key), Claude (their Claude subscription through their own Claude Code, or a
// key), Gemini, OpenRouter, or a model running on this computer. What this computer already has is
// marked. A key is checked for free before it is kept and never comes back to the page.

import {
  Check,
  ChevronsUpDown,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { BrandMark, type MarkId } from "@/features/brand/brand-mark";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  CLAUDE_CODE_MODELS,
  type ModelChoice,
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
function VendorMark({
  vendor,
  small,
}: {
  vendor: Vendor["id"];
  small?: boolean;
}) {
  if (vendor === "local")
    return small ? (
      <BrandMark id="ollama" className="size-4" />
    ) : (
      <span className="flex items-center gap-0.5">
        <BrandMark id="ollama" className="size-3.5" />
        <BrandMark id="lmstudio" className="size-3.5" />
      </span>
    );
  return <BrandMark id={vendor} className={small ? "size-4" : "size-5"} />;
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

/** A model as the lists show it; one read from the ChatGPT plan has no size. */
type ModelRow = Omit<ModelChoice, "tier"> & { tier?: ModelChoice["tier"] };

/** Where a brain is picked: the state as it stands, the vendor and way being looked at, and saving. */
function useBrainChoice(onChange?: (state: BrainState) => void) {
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

  const vendor = VENDORS.find((v) => v.id === vendorId);
  const way = vendor?.ways[Math.min(wayAt, vendor.ways.length - 1)];
  const id = way ? providerOfWay(way) : undefined;
  const entry = id ? providerOf(id) : undefined;
  const models: ModelRow[] =
    way?.kind === "claude-code"
      ? CLAUDE_CODE_MODELS
      : id === "chatgpt" && state?.chatgpt?.models.length
        ? state.chatgpt.models.map((m) => ({ id: m.id, label: m.label }))
        : (entry?.models ?? []);
  // The model a way starts on when nothing is picked yet: the vendor's middle one, as Thursday's
  // picker and Hermes Agent's setup suggest one, so "Use this" is one press away.
  const suggested = models.find((m) => m.tier === "mid") ?? models[0];
  const chosenModel = other.trim() || model || suggested?.id || "";
  // Whether the way being looked at can think now: signed in, a key kept, Claude Code here, or a
  // model on this computer to name; only then are its models offered.
  const wayOpen = !state
    ? false
    : way?.kind === "claude-code"
      ? state.claudeCode
      : way?.kind === "sign-in"
        ? Boolean(state.chatgpt)
        : way?.kind === "key"
          ? state.keyed.includes(way.provider)
          : way?.kind === "team"
            ? teamHas(state, way.provider)
            : way?.kind === "local";
  const isCurrentModel = (modelId: string) =>
    Boolean(state?.chosen) &&
    (way?.kind === "claude-code"
      ? state?.choice.kind === "claude-code" &&
        (state.choice.model ?? "sonnet") === modelId
      : state?.choice.kind === "api" &&
        state.choice.provider === id &&
        state.choice.model === modelId &&
        Boolean(state.choice.team) === (way?.kind === "team"));

  /** Keeps the way being looked at, with this model, as what the clone thinks with. */
  const use = (modelId: string) =>
    way
      ? post(
          way.kind === "claude-code"
            ? { action: "claude-code", model: modelId }
            : {
                action: "use",
                provider: id,
                model: modelId,
                ...(way.kind === "local" ? { baseUrl: address } : {}),
                ...(way.kind === "team" ? { team: true } : {}),
              },
        )
      : Promise.resolve(undefined);

  const lookAt = (next: Vendor["id"]) => {
    setVendorId(next);
    setWayAt(0);
    setModel("");
    setOther("");
    setKey("");
    setProblem(null);
  };
  const lookAtWay = (at: number) => {
    setWayAt(at);
    setModel("");
    setOther("");
    setProblem(null);
  };

  return {
    state,
    vendor,
    way,
    id,
    entry,
    models,
    suggested,
    model,
    setModel,
    other,
    setOther,
    key,
    setKey,
    address,
    setAddress,
    chosenModel,
    wayOpen,
    isCurrentModel,
    busy,
    signingIn,
    problem,
    post,
    signIn,
    use,
    lookAt,
    lookAtWay,
  };
}

type BrainChoice = ReturnType<typeof useBrainChoice>;

/** What the vendor this computer already has means, for the mark beside it. */
function foundHere(state: BrainState, v: Vendor) {
  return v.id === "claude"
    ? state.claudeCode
    : v.id === "local"
      ? state.local.ollama || state.local.lmstudio
      : v.id === "openai"
        ? Boolean(state.chatgpt)
        : false;
}

/** What a way needs before its models: Claude Code here, the sign-in, a key, the team's key, an address. */
function WayBody({
  choice,
  compact,
}: {
  choice: BrainChoice;
  compact?: boolean;
}) {
  const t = useTranslations("brain");
  const { state, way, entry, busy, signingIn, key, setKey, post } = choice;
  if (!state || !way) return null;
  const keyForm = (action: "key" | "team-key", provider: ProviderId) => (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void post({ action, provider, key }).then((ok) => {
          if (ok) setKey("");
        });
      }}
    >
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        className={cn("min-w-0 flex-1", compact && "h-8 text-[13px]")}
        value={key}
        aria-label={t("key")}
        placeholder={t("keyPlaceholder")}
        onChange={(event) => setKey(event.target.value)}
      />
      <Button
        type="submit"
        size={compact ? "default" : "sm"}
        disabled={busy || key.trim().length < 8}
      >
        {t("save")}
      </Button>
    </form>
  );
  return (
    <>
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
              size={compact ? "default" : "lg"}
              disabled={busy || signingIn}
              loading={signingIn}
              onClick={() => void choice.signIn()}
            >
              {!signingIn && <BrandMark id="openai" />}
              {t("chatgpt.signIn")}
            </Button>
            {signingIn && (
              <p className="text-muted-foreground">{t("chatgpt.signingIn")}</p>
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
          <div className="flex flex-col gap-2">
            {keyForm("key", way.provider)}
            {entry?.keysAt && (
              <a
                href={entry.keysAt}
                target="_blank"
                rel="noreferrer"
                className="self-start text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
              >
                {t("makeKey")}
              </a>
            )}
          </div>
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
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground">{t("team.add")}</p>
            {keyForm("team-key", way.provider)}
          </div>
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
            className={cn(compact && "h-8 text-[13px]")}
            value={choice.address}
            aria-label={t("address")}
            placeholder={t("address")}
            onChange={(event) => choice.setAddress(event.target.value)}
          />
        </div>
      )}
    </>
  );
}

/** Picking the brain on a page of its own (Settings): a vendor, its way in, then a model. */
export function BrainChooser({
  onChange,
}: {
  /** Hears the brain as it stands, after it is read and after each change. */
  onChange?: (state: BrainState) => void;
}) {
  const t = useTranslations("brain");
  const problemText = useProblem();
  const choice = useBrainChoice(onChange);
  const {
    state,
    vendor,
    way,
    id,
    models,
    suggested,
    model,
    other,
    chosenModel,
    busy,
    problem,
  } = choice;

  if (!state) return null;
  const inUse = (v: Vendor) =>
    state.chosen && placeOf(state.choice).vendor === v.id;
  const wayReady = choice.wayOpen && Boolean(chosenModel);
  const isCurrent = choice.isCurrentModel(chosenModel);

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
            aria-checked={vendor?.id === v.id}
            className={cn(
              "flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left transition-[border-color,background-color,box-shadow] hover:bg-muted/50",
              vendor?.id === v.id &&
                "border-foreground/70 shadow-[0_0_0_1px_var(--foreground)] hover:bg-background",
            )}
            onClick={() => choice.lookAt(v.id)}
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
                ) : foundHere(state, v) ? (
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
              value={String(vendor.ways.indexOf(way))}
              onChange={(next) => choice.lookAtWay(Number(next))}
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

          <WayBody choice={choice} />

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
                          choice.setModel(option.id);
                          choice.setOther("");
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
                onChange={(event) => choice.setOther(event.target.value)}
              />
            </fieldset>
          )}

          <Button
            variant={isCurrent ? "outline" : "brand"}
            className="self-start"
            disabled={busy || !wayReady || isCurrent}
            onClick={() => void choice.use(chosenModel)}
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

/** The brain in use as one field's words: the vendor's mark, its name, the model and the way in. */
function PickedLabel({ state }: { state: BrainState }) {
  const t = useTranslations("brain");
  const place = placeOf(state.choice);
  const vendor = VENDORS.find((v) => v.id === place.vendor);
  const way = vendor?.ways[place.way];
  const label = brainLabel(state, "Claude Code");
  const modelName =
    state.choice.kind === "claude-code"
      ? (CLAUDE_CODE_MODELS.find(
          (m) =>
            m.id === ((state.choice as { model?: string }).model ?? "sonnet"),
        )?.label ?? label)
      : label.split(" · ").slice(1).join(" · ");
  const vendorName = vendor?.name ?? t("local");
  return (
    <>
      <VendorMark vendor={place.vendor} />
      {/* "Claude · Claude Sonnet" says the vendor twice: a model named after it stands alone. */}
      {!modelName.startsWith(`${vendorName} `) && (
        <>
          <span className="max-w-fit min-w-0 shrink truncate text-muted-foreground">
            {vendorName}
          </span>
          <span className="text-muted-foreground/50" aria-hidden>
            ·
          </span>
        </>
      )}
      <span className="min-w-0 truncate font-medium">{modelName}</span>
      <span className="flex-1" />
      {way && (
        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
          {t(`way.${way.kind}`)}
        </span>
      )}
    </>
  );
}

/**
 * The brain as one field, after Thursday's model picker: a button with what is in use, opening on
 * two columns, the vendors and what the one in hand offers (its ways in, what a way needs first,
 * then its models). Looking at another vendor changes nothing; a model pressed is the pick. The
 * screen around it never grows. Below it, what this computer already has, one press away.
 */
export function BrainPicker({
  onChange,
  suggest = false,
}: {
  /** Hears the brain as it stands, after it is read and after each change. */
  onChange?: (state: BrainState) => void;
  /** Offers what this computer already has while nothing is picked. */
  suggest?: boolean;
}) {
  const t = useTranslations("brain");
  const problemText = useProblem();
  const choice = useBrainChoice(onChange);
  const [open, setOpen] = useState(false);
  const { state, vendor, way, id, models, suggested, busy, problem } = choice;
  if (!state) return <div className="h-12 rounded-[10px] bg-muted/60" />;

  const shown = vendor ?? VENDORS[0];
  const pick = async (modelId: string) => {
    if (!modelId.trim()) return;
    const ok = await choice.use(modelId.trim());
    if (ok) {
      choice.setOther("");
      setOpen(false);
    }
  };
  // Claude Code on this computer, or a ChatGPT plan already signed in: one press away.
  const offer =
    suggest && !state.chosen
      ? state.claudeCode
        ? {
            mark: "claude" as const,
            title: t("offer.claudeCode"),
            note: t("offer.claudeCodeNote"),
            take: () =>
              void choice.post({ action: "claude-code", model: "sonnet" }),
          }
        : state.chatgpt
          ? {
              mark: "openai" as const,
              title: t("offer.chatgpt"),
              note: t("offer.chatgptNote"),
              take: () =>
                void choice.post({
                  action: "use",
                  provider: "chatgpt",
                  model:
                    state.chatgpt?.models[0]?.id ??
                    providerOf("chatgpt")?.models.find((m) => m.tier === "mid")
                      ?.id,
                }),
            }
          : null
      : null;

  return (
    <div className="flex flex-col gap-3">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Opens on the vendor in use, else the first one this computer has, else the first.
          if (next && !vendor)
            choice.lookAt(
              state.chosen
                ? placeOf(state.choice).vendor
                : (VENDORS.find((v) => foundHere(state, v))?.id ??
                    VENDORS[0].id),
            );
        }}
      >
        <PopoverTrigger
          aria-label={t("title")}
          className="flex h-12 w-full min-w-0 items-center gap-2.5 rounded-[10px] bg-background pr-3 pl-3.5 text-left text-[14.5px] ring-1 ring-foreground/15 outline-none ring-inset transition-shadow hover:ring-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:ring-foreground/40 aria-expanded:shadow-[0_0_0_3px_var(--alpha-08)]"
        >
          {state.chosen ? (
            <PickedLabel state={state} />
          ) : (
            <span className="flex-1 text-muted-foreground">{t("pick")}</span>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          className="h-68 w-(--anchor-width) min-w-[26rem] flex-row gap-0 overflow-hidden rounded-xl p-0"
        >
          <div className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/40 p-1.5">
            {VENDORS.map((v) => {
              const inUse =
                state.chosen && placeOf(state.choice).vendor === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => choice.lookAt(v.id)}
                  className={cn(
                    "flex h-9.5 shrink-0 items-center gap-2.5 rounded-lg px-2 text-left text-[13.5px] outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                    v.id === shown.id
                      ? "bg-muted font-medium"
                      : "hover:bg-muted/60",
                  )}
                >
                  <span className="grid size-5 place-items-center">
                    <VendorMark vendor={v.id} small />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {v.name ?? t("local")}
                  </span>
                  {inUse ? (
                    <Check
                      className="size-3.5 shrink-0"
                      aria-label={t("inUse")}
                    />
                  ) : foundHere(state, v) ? (
                    <span
                      className="size-1.5 shrink-0 rounded-full bg-foreground/45"
                      title={t("found")}
                      role="img"
                      aria-label={t("found")}
                    />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2 text-[13px]">
            {vendor && way && (
              <>
                {vendor.ways.length > 1 && (
                  <Segmented<string>
                    view
                    size="sm"
                    aria-label={vendor.name ?? t("local")}
                    className="w-full shrink-0 *:flex-1"
                    value={String(vendor.ways.indexOf(way))}
                    onChange={(next) => choice.lookAtWay(Number(next))}
                    options={vendor.ways.map((w, at) => ({
                      value: String(at),
                      label: t(`way.${w.kind}`),
                    }))}
                  />
                )}
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  {t(`wayNote.${way.kind}`)}
                </p>
                {!(way.kind === "claude-code" && state.claudeCode) && (
                  <div className="flex flex-col gap-2 px-1">
                    <WayBody choice={choice} compact />
                  </div>
                )}
                {choice.wayOpen ? (
                  <div className="flex flex-col gap-0.5">
                    {models.map((option) => {
                      const mark =
                        way.kind === "claude-code"
                          ? ("claude" as const)
                          : id
                            ? modelMark(option.id, id)
                            : undefined;
                      const on = choice.isCurrentModel(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          disabled={busy}
                          onClick={() => void pick(option.id)}
                          className={cn(
                            "flex h-10 shrink-0 items-center gap-2 rounded-lg px-2.5 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                            on ? "bg-muted" : "hover:bg-muted/60",
                          )}
                        >
                          {mark && <BrandMark id={mark} className="size-3.5" />}
                          <span className="min-w-0 truncate text-[13.5px] font-medium">
                            {option.label}
                          </span>
                          {option.tier && (
                            <span className="shrink-0 rounded-md px-1.5 text-[10.5px] leading-4 text-muted-foreground ring-1 ring-border ring-inset">
                              {t(`tier.${option.tier}`)}
                            </span>
                          )}
                          {option.id === suggested?.id && (
                            <span className="shrink-0 rounded-md bg-brand/10 px-1.5 text-[10.5px] leading-4 font-medium text-brand">
                              {t("suggested")}
                            </span>
                          )}
                          <span className="flex-1" />
                          {on && <Check className="size-3.5 shrink-0" />}
                        </button>
                      );
                    })}
                    <form
                      className="mt-1 px-1 pb-1"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void pick(choice.other);
                      }}
                    >
                      <Input
                        spellCheck={false}
                        className="h-8 text-[13px]"
                        value={choice.other}
                        aria-label={t("modelOther")}
                        placeholder={
                          way.kind === "local"
                            ? t("modelLocal")
                            : t("modelOther")
                        }
                        onChange={(event) =>
                          choice.setOther(event.target.value)
                        }
                      />
                    </form>
                  </div>
                ) : (
                  <p className="mx-1 border-t border-dashed border-border pt-2.5 text-xs text-muted-foreground">
                    {t("modelsAfter")}
                  </p>
                )}
                {problem && (
                  <p className="px-1 text-xs text-destructive">
                    {problemText(problem)}
                  </p>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {offer && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 py-3 pr-3 pl-4 ring-1 ring-foreground/5 ring-inset">
          <BrandMark id={offer.mark} className="size-5" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{offer.title}</span>
            <span className="block text-xs text-muted-foreground">
              {offer.note}
            </span>
          </span>
          <Button variant="outline" disabled={busy} onClick={offer.take}>
            {t("use")}
          </Button>
        </div>
      )}
    </div>
  );
}
