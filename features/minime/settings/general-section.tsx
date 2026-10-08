"use client";

// Settings › General: the screen's language (also the one the clone works in from then on), the
// theme, starting with the computer (bin/service.mjs, through app/api/me/service), and what this
// app is, with where to read how it works and, when npm has a newer version, the line that starts
// it (server/update.ts).

import {
  ArrowUpCircle,
  BookOpen,
  Check,
  Copy,
  Monitor,
  Moon,
  Power,
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { Logo } from "@/features/brand/logo";
import { setTheme, useTheme } from "@/hooks/use-theme";
import { pickLanguage, useProblem } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locales";
import type { Theme } from "@/lib/theme";
import { Group, Groups } from "./parts";
import { Toggle } from "./preferences-section";
import { APP_VERSION } from "./settings";

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

const HEADERS = { "x-clone-office": "1" };

/** npm's newer version and the line that starts it, once Settings opens; nothing when none. */
function useUpdate() {
  const [update, setUpdate] = useState<{
    newer: string | null;
    command: string | null;
  } | null>(null);
  useEffect(() => {
    let live = true;
    fetch("/api/me/update", { headers: HEADERS })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => live && setUpdate(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return update?.newer && update.command ? update : null;
}

/** Whether the app starts with the computer, and turning it on or off; nothing until known. */
function useStartWithComputer() {
  const [state, setState] = useState<{
    available: boolean;
    on: boolean;
  } | null>(null);
  const [problem, setProblem] = useState<string>();
  useEffect(() => {
    let live = true;
    fetch("/api/me/service", { headers: HEADERS })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => live && setState(body))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const change = (on: boolean) => {
    setProblem(undefined);
    setState((was) => (was ? { ...was, on } : was));
    fetch("/api/me/service", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ on }),
    })
      .then(async (response) => {
        if (response.ok) return;
        setState((was) => (was ? { ...was, on: !on } : was));
        setProblem(
          ((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "service-failed",
        );
      })
      .catch(() => {
        setState((was) => (was ? { ...was, on: !on } : was));
        setProblem("service-failed");
      });
  };
  return { state, problem, change };
}

export function GeneralSection() {
  const t = useTranslations("settings.general");
  const common = useTranslations("common");
  const update = useUpdate();
  const [copied, setCopied] = useState(false);
  const locale = useLocale();
  const router = useRouter();
  const theme = useTheme();
  const start = useStartWithComputer();
  const problemText = useProblem();
  return (
    <Groups>
      <Group title={t("language")} hint={t("languageHint")}>
        <Segmented<Locale>
          aria-label={t("language")}
          options={LOCALES.map((value) => ({
            value,
            label: LOCALE_NAMES[value],
          }))}
          value={locale as Locale}
          onChange={(value) => {
            pickLanguage(value);
            router.refresh();
          }}
        />
      </Group>
      <Group title={t("theme")}>
        <Segmented<Theme>
          aria-label={t("theme")}
          options={(["light", "dark", "system"] as const).map((value) => {
            const Icon = THEME_ICONS[value];
            return {
              value,
              label: (
                <span className="flex items-center gap-1.5">
                  <Icon className="size-3.5" />
                  {t(`themes.${value}`)}
                </span>
              ),
            };
          })}
          value={theme}
          onChange={setTheme}
        />
      </Group>
      {start.state && (
        <Group title={t("start")}>
          {start.state.available ? (
            <Toggle
              icon={<Power className="size-4" />}
              title={t("start")}
              body={t("startBody")}
              checked={start.state.on}
              onChange={start.change}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">
              {t("startNone")}
            </p>
          )}
          {start.problem && (
            <p className="text-[13px] text-destructive">
              {problemText(start.problem)}
            </p>
          )}
        </Group>
      )}
      <Group title={t("about")}>
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <Logo />
            {APP_VERSION && (
              <span className="font-mono text-xs text-muted-foreground">
                v{APP_VERSION}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("aboutBody")}
          </p>
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <BookOpen className="size-3.5" />
            {t("guide")}
          </p>
          {update?.command && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="flex items-start gap-1.5 text-[13px]">
                <ArrowUpCircle className="mt-0.5 size-3.5 shrink-0" />
                {t("update", { version: update.newer ?? "" })}
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md bg-background px-2 py-1 font-mono text-xs select-all">
                  {update.command}
                </code>
                <button
                  type="button"
                  aria-label={copied ? common("copied") : common("copy")}
                  title={copied ? common("copied") : common("copy")}
                  onClick={() => {
                    void navigator.clipboard
                      ?.writeText(update.command ?? "")
                      .then(() => setCopied(true))
                      .catch(() => {});
                  }}
                  className="rounded-md p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  {copied ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </Group>
    </Groups>
  );
}
