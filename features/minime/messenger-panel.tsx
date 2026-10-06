"use client";

// The person's messenger on their page: their own Discord or Telegram bot, set up once with its
// token, and the one person it talks with, let in by the code their phone was sent. The service's
// own pages make the bot (Discord's Developer Portal, Telegram's @BotFather); this panel walks
// through it in a few steps, the way Thursday's reach guide does, and asks about whoever wrote to
// the bot first.

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useProblem } from "@/i18n/client";

type Service = "discord" | "telegram";

interface Status {
  configured: boolean;
  service?: Service;
  state: "off" | "connecting" | "on" | "failed" | "elsewhere";
  bot?: string;
  invite?: string;
  owner?: string;
  asking?: { code: string; name: string };
  problem?: string;
}

const HEADERS = { "content-type": "application/json", "x-sub-office": "1" };
/** Where each service makes a bot, and what it is called (a name, not a word to translate). */
const SERVICES: Record<Service, { name: string; portal: string }> = {
  discord: {
    name: "Discord",
    portal: "https://discord.com/developers/applications",
  },
  telegram: { name: "Telegram", portal: "https://t.me/BotFather" },
};

export function MessengerPanel() {
  const t = useTranslations("messenger");
  const problemText = useProblem();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [service, setService] = useState<Service>("discord");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = (await fetch("/api/me/messenger", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null)) as Status | null;
    if (data && typeof data.configured === "boolean") setStatus(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // While something may change soon (connecting, someone about to write), it looks again.
  const settling =
    status?.configured && (status.state === "connecting" || !status.owner);
  useEffect(() => {
    if (!open || !settling) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [open, settling, load]);

  const post = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/me/messenger", {
        method: "POST",
        headers: HEADERS,
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) setError(String(data.error ?? response.status));
      else if (typeof data.configured === "boolean") setStatus(data);
      return response.ok;
    } finally {
      setBusy(false);
    }
  };

  const problem = error ?? status?.problem;
  const asking = status?.asking;
  // Set up, the bot's own service; before, the one being set up.
  const using = status?.service ?? service;

  return (
    <details
      className="rounded-xl border border-border p-4 text-sm"
      onToggle={(event) =>
        setOpen((event.currentTarget as HTMLDetailsElement).open)
      }
    >
      <summary className="cursor-pointer font-medium">
        {t("title")}
        {status?.owner && (
          <span className="ml-2 text-muted-foreground">
            {SERVICES[using].name}
          </span>
        )}
        {asking && (
          <span className="ml-2 text-xs font-medium text-waiting tabular-nums">
            {asking.code}
          </span>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-muted-foreground">{t("intro")}</p>
        {status && !status.configured && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void post({ action: "connect", service, token }).then((ok) => {
                if (ok) setToken("");
              });
            }}
          >
            <Segmented<Service>
              aria-label={t("title")}
              className="w-full *:flex-1"
              value={service}
              onChange={(next) => {
                setService(next);
                setError(null);
              }}
              options={(["discord", "telegram"] as const).map((value) => ({
                value,
                label: SERVICES[value].name,
              }))}
            />
            <ol className="flex list-decimal flex-col gap-2 pl-5">
              <li>
                {t(`${service}.step1`)}{" "}
                <a
                  href={SERVICES[service].portal}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground underline underline-offset-4"
                >
                  {t(`${service}.portal`)}
                </a>
              </li>
              <li>{t("step2")}</li>
            </ol>
            <label className="flex flex-col gap-1">
              <span>{t("token")}</span>
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                placeholder={t(`${service}.tokenPlaceholder`)}
                onChange={(event) => setToken(event.target.value)}
              />
            </label>
            <Button
              type="submit"
              className="self-start"
              disabled={busy || token.trim().length < 20}
              loading={busy}
            >
              {t("connect")}
            </Button>
          </form>
        )}
        {status?.configured && (
          <>
            {status.state === "connecting" && (
              <p className="text-muted-foreground">{t("connecting")}</p>
            )}
            {status.state === "elsewhere" && (
              <p className="text-muted-foreground">{t("elsewhere")}</p>
            )}
            {status.state === "on" && !status.owner && (
              <>
                <p>{t("connected", { bot: status.bot ?? "" })}</p>
                <ol className="flex list-decimal flex-col gap-2 pl-5" start={3}>
                  <li className="flex flex-col items-start gap-2">
                    <span>{t(`${using}.step3`)}</span>
                    {status.invite && (
                      <a
                        href={status.invite}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonVariants({
                          size: "sm",
                          variant: "outline",
                        })}
                      >
                        {t(`${using}.addBot`)}
                      </a>
                    )}
                  </li>
                  {using === "discord" && <li>{t("discord.step4")}</li>}
                </ol>
              </>
            )}
            {status.owner && status.state !== "failed" && (
              <>
                <p>
                  {t("paired", {
                    bot: status.bot ?? SERVICES[using].name,
                    name: status.owner,
                    service: using,
                  })}
                </p>
                <p className="text-muted-foreground">
                  {t("pushNote", { service: using })}
                </p>
              </>
            )}
            {asking && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-waiting/40 bg-waiting/5 px-3 py-2">
                <span className="min-w-0 flex-1">
                  {t("asking", { name: asking.name, code: asking.code })}
                </span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void post({ action: "allow", code: asking.code })
                  }
                >
                  {t("allow")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void post({ action: "decline", code: asking.code })
                  }
                >
                  {t("decline")}
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="self-start text-muted-foreground"
              disabled={busy}
              onClick={() => void post({ action: "disconnect" })}
            >
              {t("disconnect")}
            </Button>
          </>
        )}
        {problem && <p className="text-destructive">{problemText(problem)}</p>}
      </div>
    </details>
  );
}
