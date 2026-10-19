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
  Sun,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { say } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { Logo } from "@/features/brand/logo";
import { setTheme, useTheme } from "@/hooks/use-theme";
import { pickLanguage, useProblem } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locales";
import type { Theme } from "@/lib/theme";
import { useApp } from "../shell/app-state";
import { Group, Groups, Rows } from "./parts";
import { Toggle } from "./preferences-section";

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

const HEADERS = { "x-clone-office": "1" };

/**
 * A newer version once Settings opens, nothing when none: from npm, with the line that starts it;
 * in the desktop app, ready to restart into, or a page to download it from.
 */
function useUpdate() {
  const [update, setUpdate] = useState<{
    newer: string | null;
    command: string | null;
    ready?: boolean;
    download?: string | null;
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
  return update?.newer && (update.command || update.ready || update.download)
    ? update
    : null;
}

/** Restarts the desktop app into the version it has ready; says so when it cannot. */
function useRestartToUpdate() {
  const [restarting, setRestarting] = useState(false);
  const [problem, setProblem] = useState<string>();
  const restart = () => {
    setProblem(undefined);
    setRestarting(true);
    fetch("/api/me/update", {
      method: "POST",
      headers: { ...HEADERS, "content-type": "application/json" },
      body: JSON.stringify({ restart: true }),
    })
      .then(async (response) => {
        if (response.ok) return;
        setRestarting(false);
        setProblem(
          ((await response.json().catch(() => ({}))) as { error?: string })
            .error ?? "update-failed",
        );
      })
      .catch(() => {
        // The app closes as it restarts, and the answer may never come.
      });
  };
  return { restarting, problem, restart };
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

/** Chats the person put away from the column: kept whole, each brought back with one click. */
function ArchivedChats() {
  const t = useTranslations("settings.general");
  // through the conversations' own state, so the column hears of it at once
  const { archiveChat } = useApp().chat;
  const format = useFormatter();
  const [chats, setChats] = useState<
    { id: string; title: string; updated: string }[] | null
  >(null);
  // a page at a time, as the column lists them
  const [limit, setLimit] = useState(50);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  // Read again after each one brought back, so the page fills from what is left and the rest
  // stays reachable however many come back.
  const [version, setVersion] = useState(0);
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    void version;
    let live = true;
    setLoading(true);
    void fetch(`/api/me/chats?archived=1&limit=${limit}`, { headers: HEADERS })
      .then((r) => r.json())
      .then((data) => {
        if (!live) return;
        setChats(data.chats ?? []);
        setMore(Boolean(data.more));
      })
      .catch(() => live && setChats([]))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [limit, version]);
  const restore = (chat: { id: string; title: string }) => {
    setRestoring((all) => new Set(all).add(chat.id));
    void archiveChat(chat.id, false)
      .then((done) => {
        if (!done) return;
        say(t("restored", { title: chat.title }));
        setVersion((was) => was + 1);
      })
      .finally(() =>
        setRestoring((all) => {
          const next = new Set(all);
          next.delete(chat.id);
          return next;
        }),
      );
  };
  if (!chats?.length) return null;
  return (
    <Group title={t("archived")} hint={t("archivedHint")}>
      <Rows className="max-h-72 overflow-y-auto">
        {chats.map((chat) => (
          <li key={chat.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm">{chat.title}</span>
              <span className="text-xs text-muted-foreground">
                {format.dateTime(new Date(chat.updated), {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </span>
            <Button
              size="sm"
              variant="secondary"
              loading={restoring.has(chat.id)}
              onClick={() => restore(chat)}
            >
              {t("restore")}
            </Button>
          </li>
        ))}
      </Rows>
      {more && (
        <Button
          size="sm"
          variant="ghost"
          className="self-start text-muted-foreground"
          loading={loading}
          onClick={() => setLimit((was) => was + 50)}
        >
          {t("archivedMore")}
        </Button>
      )}
    </Group>
  );
}

export function GeneralSection() {
  const t = useTranslations("settings.general");
  const common = useTranslations("common");
  const update = useUpdate();
  const restart = useRestartToUpdate();
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
      <ArchivedChats />
      <Group title={t("about")}>
        {/* the version is said once, at the foot of the sections (10-19 redesign) */}
        <div className="flex flex-col gap-3 rounded-[14px] p-4 shadow-[0_0_0_1px_var(--alpha-10)]">
          <Logo />
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
                <Tip label={copied ? common("copied") : common("copy")}>
                  <button
                    type="button"
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
                </Tip>
              </div>
            </div>
          )}
          {update?.ready && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="flex items-start gap-1.5 text-[13px]">
                <ArrowUpCircle className="mt-0.5 size-3.5 shrink-0" />
                {t("updateReady", { version: update.newer ?? "" })}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                loading={restart.restarting}
                onClick={restart.restart}
              >
                {t("updateRestart")}
              </Button>
              {restart.problem && (
                <p className="text-[13px] text-destructive">
                  {problemText(restart.problem)}
                </p>
              )}
            </div>
          )}
          {update?.download && !update.ready && (
            <div className="flex flex-col gap-2 rounded-lg bg-muted p-3">
              <p className="flex items-start gap-1.5 text-[13px]">
                <ArrowUpCircle className="mt-0.5 size-3.5 shrink-0" />
                {t("updateDownload", { version: update.newer ?? "" })}
              </p>
              <Button
                size="sm"
                variant="secondary"
                className="self-start"
                render={
                  <a href={update.download} target="_blank" rel="noreferrer" />
                }
              >
                {t("updateDownloadButton")}
              </Button>
            </div>
          )}
        </div>
      </Group>
    </Groups>
  );
}
