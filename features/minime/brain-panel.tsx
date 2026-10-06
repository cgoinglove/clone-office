"use client";

// What the clone thinks with (brain/choice.ts), picked vendor first, as Thursday's model picker,
// Hermes Agent's setup and OpenClaw's onboarding pick it: OpenAI (the person's ChatGPT plan, signed
// in to, or an API key), Claude (their Claude subscription through their own Claude Code, or a
// key), Gemini, OpenRouter, or a model running on this computer. What this computer already has is
// marked. A key is checked for free before it is kept and never comes back to the page.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  type ProviderId,
  provider as providerOf,
  VENDORS,
  type Vendor,
  type Way,
} from "./brain/providers";

type Choice =
  | { kind: "claude-code" }
  | { kind: "api"; provider: ProviderId; model: string; baseUrl?: string };

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
}

/** Whether the chosen brain can think now: the subscription signed in, or the key its vendor needs. */
export function brainReady(state: BrainState | null): boolean {
  if (!state) return false;
  const { choice } = state;
  if (choice.kind === "claude-code") return state.claudeCode;
  if (choice.provider === "chatgpt") return Boolean(state.chatgpt);
  return choice.provider === "local" || state.keyed.includes(choice.provider);
}

/** The brain in use, as the person reads it: the vendor and model, or their Claude Code. */
export function brainLabel(state: BrainState, claudeCode: string): string {
  const { choice } = state;
  if (choice.kind !== "api") return claudeCode;
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
    const way = vendor.ways.findIndex(
      (w) =>
        (w.kind === "key" || w.kind === "sign-in") &&
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
  way.kind === "key" || way.kind === "sign-in"
    ? way.provider
    : way.kind === "local"
      ? "local"
      : undefined;

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

/** The panel on the clone's page: what it thinks with, and changing it. */
export function BrainPanel() {
  const t = useTranslations("brain");
  const [state, setState] = useState<BrainState | null>(null);
  return (
    <details className="rounded-xl border border-border p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {state && (
          <span className="ml-2 font-normal text-muted-foreground">
            {brainLabel(state, t("way.claude-code"))}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-4">
        <p className="text-muted-foreground">{t("intro")}</p>
        <BrainChooser onChange={setState} />
      </div>
    </details>
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
    id === "chatgpt" && state.chatgpt?.models.length
      ? state.chatgpt.models.map((m) => ({
          id: m.id,
          label: m.label,
          tier: undefined,
        }))
      : (entry?.models ?? []);
  const chosenModel = other.trim() || model;
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
          : way?.kind === "local"
            ? Boolean(chosenModel)
            : false;
  const isCurrent =
    state.chosen &&
    (way?.kind === "claude-code"
      ? current.kind === "claude-code"
      : current.kind === "api" &&
        current.provider === id &&
        current.model === chosenModel);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup">
        {VENDORS.map((v) => (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={vendorId === v.id}
            className={cn(
              "flex flex-col items-start gap-1 rounded-[10px] border border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
              vendorId === v.id && "border-foreground",
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
            <span className="flex w-full items-center justify-between gap-2">
              <span className="font-medium">{v.name ?? t("local")}</span>
              {inUse(v) ? (
                <span className="text-xs text-muted-foreground">
                  {t("inUse")}
                </span>
              ) : found(v) ? (
                <span className="text-xs text-muted-foreground">
                  {t("found")}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">
              {t(`vendor.${v.id}`)}
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
                label: t(`way.${w.kind}`),
              }))}
            />
          )}
          <p className="text-muted-foreground">{t(`wayNote.${way.kind}`)}</p>

          {way.kind === "claude-code" && (
            <p>
              {state.claudeCode ? t("claudeCodeFound") : t("claudeMissing")}
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
                  disabled={busy || signingIn}
                  loading={signingIn}
                  onClick={() => void signIn()}
                >
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

          {way.kind !== "claude-code" && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 font-medium">{t("model")}</legend>
              {models.map((option) => (
                <label key={option.id} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="brain-model"
                    checked={!other.trim() && model === option.id}
                    onChange={() => {
                      setModel(option.id);
                      setOther("");
                    }}
                  />
                  <span>{option.label}</span>
                  {option.tier && (
                    <span className="text-xs text-muted-foreground">
                      {t(`tier.${option.tier}`)}
                    </span>
                  )}
                </label>
              ))}
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
            size="sm"
            className="self-start"
            disabled={busy || !wayReady || isCurrent}
            onClick={() =>
              void post(
                way.kind === "claude-code"
                  ? { action: "claude-code" }
                  : {
                      action: "use",
                      provider: id,
                      model: chosenModel,
                      ...(way.kind === "local" ? { baseUrl: address } : {}),
                    },
              )
            }
          >
            {isCurrent ? t("inUse") : t("use")}
          </Button>
        </div>
      )}
      {problem && <p className="text-destructive">{problemText(problem)}</p>}
    </div>
  );
}
