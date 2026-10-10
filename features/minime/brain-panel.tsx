"use client";

// What the clone thinks with (brain/choice.ts), picked vendor first, as Thursday's model picker,
// Hermes Agent's setup and OpenClaw's onboarding pick it: OpenAI (the person's ChatGPT plan, signed
// in to, or an API key), Claude (their Claude subscription through their own Claude Code, or a
// key), Gemini, OpenRouter, or a model running on this computer. What this computer already has is
// marked. A key is checked for free before it is kept and never comes back to the page.
//
// It is one field wherever it is picked (the first steps, Settings › AI model): a button with what
// is in use, opening on two columns, the vendors and what the one in hand offers. The models the
// office's team keys reach are offered first, as the team's; the keys themselves are kept in
// Settings › Office (`TeamKeys`), never here.

import {
  Check,
  ChevronsUpDown,
  CircleAlert,
  ExternalLink,
  Loader2,
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
  vendorOf,
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

/** The vendor and way a saved choice belongs to; a team key's model is the team's, not a way. */
function placeOf(choice: Choice): {
  vendor: Vendor["id"];
  way: number;
  team: boolean;
} {
  if (choice.kind === "claude-code")
    return { vendor: "claude", way: 0, team: false };
  const vendor = vendorOf(choice.provider);
  const ways = VENDORS.find((v) => v.id === vendor)?.ways ?? [];
  const way = ways.findIndex(
    (w) =>
      (w.kind === "key" || w.kind === "sign-in") &&
      w.provider === choice.provider,
  );
  return { vendor, way: Math.max(0, way), team: Boolean(choice.team) };
}

/** The provider a way reaches models through (Claude Code has none of its own here). */
const providerOfWay = (way: Way): ProviderId | undefined =>
  way.kind === "key" || way.kind === "sign-in"
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

/** Settings › AI model: what the clone thinks with, the same one field as the first steps. */
export function BrainPanel() {
  return <BrainPicker />;
}

/** A model as the lists show it; one read from the ChatGPT plan has no size. */
type ModelRow = Omit<ModelChoice, "tier"> & { tier?: ModelChoice["tier"] };

/** Where a brain is picked: the state as it stands, the vendor and way being looked at, and saving. */
function useBrainChoice(onChange?: (state: BrainState) => void) {
  const [state, setState] = useState<BrainState | null>(null);
  const [vendorId, setVendorId] = useState<Vendor["id"] | null>(null);
  const [wayAt, setWayAt] = useState(0);
  const [other, setOther] = useState("");
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
      if (data.choice.kind === "api" && data.choice.baseUrl)
        setAddress(data.choice.baseUrl);
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
  // picker and Hermes Agent's setup suggest one.
  const suggested = models.find((m) => m.tier === "mid") ?? models[0];
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
          : way?.kind === "local";
  const isCurrentModel = (modelId: string) =>
    Boolean(state?.chosen) &&
    (way?.kind === "claude-code"
      ? state?.choice.kind === "claude-code" &&
        (state.choice.model ?? "sonnet") === modelId
      : state?.choice.kind === "api" &&
        !state.choice.team &&
        state.choice.provider === id &&
        state.choice.model === modelId);

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
              },
        )
      : Promise.resolve(undefined);

  const lookAt = (next: Vendor["id"]) => {
    setVendorId(next);
    setWayAt(0);
    setOther("");
    setProblem(null);
  };
  const lookAtWay = (at: number) => {
    setWayAt(at);
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
    other,
    setOther,
    address,
    setAddress,
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

/**
 * A key typed in, with its own save inside the field: pasted, then Enter or Save. It is checked
 * with the vendor before it is kept, and never shown again.
 */
function KeyField({
  busy,
  onSave,
}: {
  busy: boolean;
  onSave: (key: string) => Promise<unknown>;
}) {
  const t = useTranslations("brain");
  const [key, setKey] = useState("");
  return (
    <form
      className="relative"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave(key.trim()).then((ok) => {
          if (ok) setKey("");
        });
      }}
    >
      <Input
        type="password"
        autoComplete="off"
        spellCheck={false}
        className="h-9 pr-17 text-[13px]"
        value={key}
        aria-label={t("key")}
        placeholder={t("keyPlaceholder")}
        onChange={(event) => setKey(event.target.value)}
      />
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        loading={busy}
        disabled={busy || key.trim().length < 8}
        className="absolute top-1/2 right-1 h-7 -translate-y-1/2 px-2.5"
      >
        {t("save")}
      </Button>
    </form>
  );
}

/** What a way needs before its models, in a line or a field: Claude Code here, the sign-in, a key, an address. */
function WaySetup({ choice }: { choice: BrainChoice }) {
  const t = useTranslations("brain");
  const { state, way, entry, busy, signingIn, post } = choice;
  if (!state || !way) return null;
  const line = "px-1 text-xs leading-relaxed text-muted-foreground";
  if (way.kind === "claude-code")
    return state.claudeCode ? null : (
      <p className="flex items-start gap-2 rounded-lg bg-waiting/8 px-2.5 py-2 text-xs leading-relaxed text-waiting">
        <CircleAlert className="mt-px size-3.5 shrink-0" />
        <span>
          {t("claudeMissing")}{" "}
          <a
            href="https://claude.com/code"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4"
          >
            claude.com/code
          </a>
        </span>
      </p>
    );
  if (way.kind === "sign-in")
    return state.chatgpt ? (
      <p className={line}>
        {state.chatgpt.email
          ? t("chatgpt.signedIn", { email: state.chatgpt.email })
          : t("chatgpt.signedInNoEmail")}{" "}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          disabled={busy}
          onClick={() => void post({ action: "chatgpt-sign-out" })}
        >
          {t("chatgpt.signOut")}
        </button>
      </p>
    ) : (
      <div className="flex flex-col gap-1.5">
        <Button
          variant="secondary"
          className="h-9 w-full"
          disabled={busy || signingIn}
          onClick={() => void choice.signIn()}
        >
          {signingIn ? (
            <Loader2 className="animate-spin" />
          ) : (
            <BrandMark id="openai" />
          )}
          {t("chatgpt.signIn")}
        </Button>
        {signingIn && <p className={line}>{t("chatgpt.signingIn")}</p>}
      </div>
    );
  if (way.kind === "key")
    return state.keyed.includes(way.provider) ? (
      <p className={line}>
        {t("keySaved")}{" "}
        <button
          type="button"
          className="underline underline-offset-4 hover:text-foreground"
          disabled={busy}
          onClick={() =>
            void post({ action: "forget-key", provider: way.provider })
          }
        >
          {t("forgetKey")}
        </button>
      </p>
    ) : (
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between gap-2 px-1 text-xs">
          <span className="font-medium">{t("key")}</span>
          {entry?.keysAt && (
            <a
              href={entry.keysAt}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              {t("makeKey")}
              <ExternalLink className="size-3" />
            </a>
          )}
        </span>
        <KeyField
          busy={busy}
          onSave={(key) => post({ action: "key", provider: way.provider, key })}
        />
      </div>
    );
  return (
    <div className="flex flex-col gap-1.5">
      <p className={line}>
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
        className="h-8 text-[13px]"
        value={choice.address}
        aria-label={t("address")}
        placeholder={t("address")}
        onChange={(event) => choice.setAddress(event.target.value)}
      />
    </div>
  );
}

/** A model's row: its maker's mark and name, then on the right what it is and whether it is in use. */
function ModelButton({
  mark,
  label,
  sub,
  tier,
  suggested,
  on,
  busy,
  onPick,
}: {
  mark?: MarkId;
  label: string;
  sub?: string;
  tier?: ModelChoice["tier"];
  suggested?: boolean;
  on: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("brain");
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-lg px-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
        sub ? "min-h-11 py-1.5" : "h-10",
        on ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      {mark && <BrandMark id={mark} className="size-3.5" />}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">
          {label}
        </span>
        {sub && (
          <span className="block truncate text-[11.5px] text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      {suggested && (
        <span className="shrink-0 rounded-full bg-brand/10 px-2 text-[10.5px] leading-4.5 font-medium text-brand">
          {t("suggested")}
        </span>
      )}
      {tier && (
        <span className="shrink-0 rounded-full px-2 text-[10.5px] leading-4.5 text-muted-foreground ring-1 ring-border ring-inset">
          {t(`tier.${tier}`)}
        </span>
      )}
      <span className="grid size-3.5 shrink-0 place-items-center">
        {on && <Check className="size-3.5" />}
      </span>
    </button>
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
      {(place.team || way) && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          {place.team ? t("ourTeam") : way && t(`way.${way.kind}`)}
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
/**
 * Arrow keys in a picker of columns (vendors, then what the one in hand offers), as Thursday's model
 * picker moves: up and down within a column, the vendor in view following the focus; left and right
 * between columns, landing on what is picked there; Home and End to a column's ends. A field keeps
 * its own arrows.
 */
function roveColumns(event: React.KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea")) return;
  const column = target.closest<HTMLElement>("[data-column]");
  if (!column) return;
  const columns = [
    ...event.currentTarget.querySelectorAll<HTMLElement>("[data-column]"),
  ];
  const items = (in_: HTMLElement) =>
    [...in_.querySelectorAll<HTMLElement>("button:not([disabled])")].filter(
      (item) => item.offsetParent !== null,
    );
  const here = items(column);
  const at = here.indexOf(target.closest("button") as HTMLElement);
  let next: HTMLElement | undefined;
  if (event.key === "ArrowDown") next = here[Math.min(here.length - 1, at + 1)];
  else if (event.key === "ArrowUp") next = here[Math.max(0, at - 1)];
  else if (event.key === "Home") next = here[0];
  else if (event.key === "End") next = here.at(-1);
  else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
    const other =
      columns[columns.indexOf(column) + (event.key === "ArrowRight" ? 1 : -1)];
    if (!other) return;
    const there = items(other);
    next =
      there.find(
        (item) =>
          item.hasAttribute("data-picked") ||
          item.getAttribute("aria-pressed") === "true",
      ) ?? there[0];
  } else return;
  if (!next) return;
  event.preventDefault();
  next.focus();
  // Moving down the vendors shows each one's models, as pointing at it would.
  if (columns.indexOf(column) === 0 && column.contains(next)) next.click();
}

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
  // "Our team" in the left column: the models the office's own keys reach, first when there are any.
  const [teamView, setTeamView] = useState(false);
  const { state, vendor, way, id, models, suggested, busy, problem } = choice;
  if (!state) return <div className="h-12 rounded-[10px] bg-muted/60" />;

  const teamModels = (state.team?.keys ?? []).flatMap((key) => {
    const entry = providerOf(key.provider as ProviderId);
    if (!entry || entry.signIn) return [];
    return entry.models.map((model) => ({
      provider: entry.id,
      vendor: entry.name,
      ...model,
    }));
  });
  const teamFirst =
    teamModels.find((model) => model.tier === "mid") ?? teamModels[0];
  const onTeam = (provider: ProviderId, model: string) =>
    state.chosen &&
    state.choice.kind === "api" &&
    Boolean(state.choice.team) &&
    state.choice.provider === provider &&
    state.choice.model === model;
  const pickTeam = async (provider: ProviderId, model: string) => {
    const ok = await choice.post({
      action: "use",
      provider,
      model,
      team: true,
    });
    if (ok) setOpen(false);
  };
  const pick = async (modelId: string) => {
    if (!modelId.trim()) return;
    const ok = await choice.use(modelId.trim());
    if (ok) {
      choice.setOther("");
      setOpen(false);
    }
  };
  // The team's own model, Claude Code on this computer, or a ChatGPT plan already signed in: one
  // press away.
  const offer =
    suggest && !state.chosen
      ? teamFirst
        ? {
            mark: (modelMark(teamFirst.id, teamFirst.provider) ??
              "claude") as MarkId,
            title: t("offer.team"),
            note: t("offer.teamNote", { model: teamFirst.label }),
            take: () => void pickTeam(teamFirst.provider, teamFirst.id),
          }
        : state.claudeCode
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
                      providerOf("chatgpt")?.models.find(
                        (m) => m.tier === "mid",
                      )?.id,
                  }),
              }
            : null
      : null;

  const column =
    "flex h-9.5 shrink-0 items-center gap-2.5 rounded-lg px-2 text-left text-[13.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div className="flex flex-col gap-3">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          // Opens on the team's models when the office has keys and nothing else is picked, else on
          // the vendor in use, else the first one this computer has, else the first.
          if (next)
            setTeamView(
              teamModels.length > 0 &&
                (!state.chosen ||
                  (state.choice.kind === "api" && Boolean(state.choice.team))),
            );
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
          // Its name and what is picked, so a screen reader hears both.
          aria-label={
            state.chosen
              ? `${t("title")}: ${brainLabel(state, "Claude Code")}`
              : t("title")
          }
          className="flex h-12 w-full min-w-0 items-center gap-2.5 rounded-[10px] bg-background pr-3 pl-3.5 text-left text-[14.5px] ring-1 ring-foreground/15 outline-none ring-inset transition-colors hover:ring-foreground/25 focus-visible:ring-2 focus-visible:ring-ring aria-expanded:ring-foreground/40"
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
          className="h-76 w-(--anchor-width) min-w-[min(28rem,calc(100vw-2rem))] flex-row gap-0 overflow-hidden rounded-[12px] p-0"
          onKeyDown={roveColumns}
        >
          <div
            data-column
            className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-muted/40 p-1.5"
          >
            {teamModels.length > 0 && (
              <button
                type="button"
                onClick={() => setTeamView(true)}
                className={cn(
                  column,
                  "mb-1.5",
                  teamView ? "bg-muted font-medium" : "hover:bg-muted/60",
                )}
              >
                <span className="grid size-5 place-items-center">
                  <Users className="size-4 text-foreground/80" />
                </span>
                <span className="min-w-0 flex-1 truncate">{t("ourTeam")}</span>
              </button>
            )}
            {VENDORS.map((v) => {
              const inUse =
                state.chosen &&
                !placeOf(state.choice).team &&
                placeOf(state.choice).vendor === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  data-picked={
                    v.id === vendor?.id && !teamView ? "" : undefined
                  }
                  onClick={() => {
                    setTeamView(false);
                    choice.lookAt(v.id);
                  }}
                  className={cn(
                    column,
                    v.id === vendor?.id && !teamView
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
          <div
            data-column
            className="flex min-w-0 flex-1 flex-col gap-2.5 overflow-y-auto p-2 text-[13px]"
          >
            {teamView && (
              <div className="flex flex-col gap-0.5">
                {teamModels.map((option) => (
                  <ModelButton
                    key={`${option.provider}:${option.id}`}
                    mark={modelMark(option.id, option.provider)}
                    label={option.label}
                    sub={t("teamVia", { vendor: option.vendor })}
                    suggested={option === teamFirst}
                    on={onTeam(option.provider, option.id)}
                    busy={busy}
                    onPick={() => void pickTeam(option.provider, option.id)}
                  />
                ))}
              </div>
            )}
            {!teamView && vendor && way && (
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
                <WaySetup choice={choice} />
                {choice.wayOpen ? (
                  <div className="flex flex-col gap-0.5">
                    {models.map((option) => (
                      <ModelButton
                        key={option.id}
                        mark={
                          way.kind === "claude-code"
                            ? "claude"
                            : id
                              ? modelMark(option.id, id)
                              : undefined
                        }
                        label={option.label}
                        tier={option.tier}
                        suggested={option.id === suggested?.id}
                        on={choice.isCurrentModel(option.id)}
                        busy={busy}
                        onPick={() => void pick(option.id)}
                      />
                    ))}
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
                  <p className="px-1 text-xs text-muted-foreground">
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
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 py-3 pr-3 pl-4">
          <BrandMark id={offer.mark} className="size-5" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{offer.title}</span>
            <span className="block text-xs text-muted-foreground">
              {offer.note}
            </span>
          </span>
          <Button variant="secondary" disabled={busy} onClick={offer.take}>
            {t("use")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The vendors an office can keep a key for: every one that takes a key. */
const TEAM_PROVIDERS: ProviderId[] = [
  "anthropic",
  "openai",
  "google",
  "openrouter",
];

/**
 * Settings › Office: the office's own keys, one per vendor, that every clone in it may think with
 * (team billing, features/relay/team-ai.ts). Each is checked with the vendor and kept sealed on the
 * office's server; this page only sees its last characters and who added it.
 */
export function TeamKeys() {
  const t = useTranslations("brain.team");
  const tBrain = useTranslations("brain");
  const problemText = useProblem();
  const choice = useBrainChoice();
  const [adding, setAdding] = useState<ProviderId>("anthropic");
  const { state, busy, problem } = choice;
  if (!state?.team) return null;
  const team = state.team;
  const free = TEAM_PROVIDERS.filter((p) => !teamHas(state, p));
  const vendorName = (p: string) => providerOf(p as ProviderId)?.name ?? p;
  const pickFirstFree = free.includes(adding) ? adding : free[0];
  return (
    <section className="flex flex-col gap-3">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {t("hint")}
        </p>
      </div>
      {team.keys.length > 0 && (
        <ul className="flex flex-col gap-1">
          {team.keys.map((kept) => (
            <li
              key={kept.provider}
              className="flex h-11 items-center gap-3 rounded-[10px] bg-muted/50 px-3.5"
            >
              <BrandMark
                id={PROVIDER_MARKS[kept.provider as ProviderId] ?? "openrouter"}
                className="size-4"
              />
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">{vendorName(kept.provider)}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {t("kept", { hint: kept.hint, name: kept.by })}
                </span>
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void choice.post({
                    action: "forget-team-key",
                    provider: kept.provider,
                  })
                }
                className="shrink-0 text-[13px] text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!team.sealing ? (
        <p className="text-[13px] text-muted-foreground">{t("unsealed")}</p>
      ) : (
        pickFirstFree && (
          <div className="flex flex-col gap-2">
            <Segmented<string>
              view
              size="sm"
              aria-label={t("title")}
              className="w-full *:flex-1"
              value={pickFirstFree}
              onChange={(next) => setAdding(next as ProviderId)}
              options={free.map((p) => ({ value: p, label: vendorName(p) }))}
            />
            <KeyField
              busy={busy}
              onSave={(key) =>
                choice.post({
                  action: "team-key",
                  provider: pickFirstFree,
                  key,
                })
              }
            />
            {providerOf(pickFirstFree)?.keysAt && (
              <a
                href={providerOf(pickFirstFree)?.keysAt}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 self-start text-xs text-muted-foreground hover:text-foreground"
              >
                {tBrain("makeKey")}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        )
      )}
      {team.keys.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t("calls", { mine: team.calls.mine, all: team.calls.all })}
        </p>
      )}
      {problem && (
        <p className="text-xs text-destructive">{problemText(problem)}</p>
      )}
    </section>
  );
}
