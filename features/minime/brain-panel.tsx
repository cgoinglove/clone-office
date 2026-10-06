"use client";

// What the mini-me thinks with (brain/choice.ts), picked the way Thursday's model picker and Hermes
// Agent's setup pick it: the person's own Claude Code, run on this computer with their subscription,
// or a model reached directly with a key they made (or running on this computer). The key is
// checked for free before it is kept, and it never comes back to the page.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useProblem } from "@/i18n/client";
import {
  PROVIDERS,
  type ProviderId,
  provider as providerOf,
} from "./brain/providers";

type Choice =
  | { kind: "claude-code" }
  | { kind: "api"; provider: ProviderId; model: string; baseUrl?: string };

interface State {
  choice: Choice;
  claudeCode: boolean;
  keyed: ProviderId[];
}

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };

export function BrainPanel() {
  const t = useTranslations("brain");
  const problemText = useProblem();
  const [state, setState] = useState<State | null>(null);
  const [kind, setKind] = useState<Choice["kind"]>("claude-code");
  const [vendor, setVendor] = useState<ProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [other, setOther] = useState("");
  const [key, setKey] = useState("");
  const [address, setAddress] = useState(providerOf("local")?.baseUrl ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = (await fetch("/api/me/brain", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as State | null;
    if (!data?.choice) return;
    setState(data);
    setKind(data.choice.kind);
    if (data.choice.kind === "api") {
      setVendor(data.choice.provider);
      const known = providerOf(data.choice.provider)?.models.some(
        (entry) => entry.id === (data.choice as { model: string }).model,
      );
      setModel(known ? data.choice.model : "");
      setOther(known ? "" : data.choice.model);
      if (data.choice.baseUrl) setAddress(data.choice.baseUrl);
    }
  }, []);

  useEffect(() => {
    void load();
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
      return response.ok;
    } finally {
      setBusy(false);
    }
  };

  const entry = providerOf(vendor);
  const keyed = state?.keyed.includes(vendor) ?? false;
  const chosenModel = other.trim() || model;
  const current = state?.choice;
  const inUse =
    current?.kind === "api"
      ? `${providerOf(current.provider)?.name ?? current.provider} · ${
          providerOf(current.provider)?.models.find(
            (m) => m.id === current.model,
          )?.label ?? current.model
        }`
      : t("claudeCode");

  return (
    <details className="rounded-xl border border-border p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {state && (
          <span className="ml-2 font-normal text-muted-foreground">
            {inUse}
          </span>
        )}
      </summary>
      {state && (
        <div className="mt-3 flex flex-col gap-4">
          <p className="text-muted-foreground">{t("intro")}</p>
          <Segmented<Choice["kind"]>
            aria-label={t("title")}
            className="w-full *:flex-1"
            value={kind}
            onChange={(next) => {
              setKind(next);
              setProblem(null);
            }}
            options={[
              { value: "claude-code", label: t("claudeCode") },
              { value: "api", label: t("api") },
            ]}
          />
          {kind === "claude-code" ? (
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">
                {state.claudeCode ? t("claudeCodeNote") : t("claudeMissing")}
              </p>
              {current?.kind !== "claude-code" && (
                <Button
                  size="sm"
                  className="self-start"
                  disabled={busy || !state.claudeCode}
                  onClick={() => void post({ action: "claude-code" })}
                >
                  {t("use")}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <Segmented<ProviderId>
                aria-label={t("service")}
                className="w-full flex-wrap *:flex-1"
                value={vendor}
                onChange={(next) => {
                  setVendor(next);
                  setModel("");
                  setOther("");
                  setKey("");
                  setProblem(null);
                }}
                options={PROVIDERS.map((p) => ({ value: p.id, label: p.name }))}
              />
              {vendor === "local" ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground">{t("localNote")}</p>
                  <Input
                    spellCheck={false}
                    value={address}
                    aria-label={t("address")}
                    placeholder={t("address")}
                    onChange={(event) => setAddress(event.target.value)}
                  />
                </div>
              ) : keyed ? (
                <p className="text-muted-foreground">
                  {t("keySaved")}{" "}
                  <button
                    type="button"
                    className="underline underline-offset-4"
                    disabled={busy}
                    onClick={() =>
                      void post({ action: "forget-key", provider: vendor })
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
                    void post({ action: "key", provider: vendor, key }).then(
                      (ok) => {
                        if (ok) setKey("");
                      },
                    );
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
              )}
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 font-medium">{t("model")}</legend>
                {entry?.models.map((option) => (
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
                    <span className="text-xs text-muted-foreground">
                      {t(`tier.${option.tier}`)}
                    </span>
                  </label>
                ))}
                <Input
                  spellCheck={false}
                  className="mt-1"
                  value={other}
                  aria-label={t("modelOther")}
                  placeholder={
                    vendor === "local" ? t("modelLocal") : t("modelOther")
                  }
                  onChange={(event) => setOther(event.target.value)}
                />
              </fieldset>
              {vendor !== "local" && (
                <p className="text-xs text-muted-foreground">{t("cost")}</p>
              )}
              <Button
                size="sm"
                className="self-start"
                disabled={
                  busy || !chosenModel || (vendor !== "local" && !keyed)
                }
                onClick={() =>
                  void post({
                    action: "use",
                    provider: vendor,
                    model: chosenModel,
                    ...(vendor === "local" ? { baseUrl: address } : {}),
                  })
                }
              >
                {current?.kind === "api" &&
                current.provider === vendor &&
                current.model === chosenModel
                  ? t("inUse")
                  : t("use")}
              </Button>
            </div>
          )}
          {problem && (
            <p className="text-destructive">{problemText(problem)}</p>
          )}
        </div>
      )}
    </details>
  );
}
