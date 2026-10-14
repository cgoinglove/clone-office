"use client";

// Settings › Office › Ask from the AI you use: the office's tools added to the AI apps on this
// computer (Claude, Claude Code, Codex, Cursor, Gemini CLI), so "ask Minsu's clone" works where the
// person already works, and the answer comes back there (app/api/me/ai-apps, bin/ai-apps.mjs). Only
// the apps found here are listed; one added says so, with taking it out beside it.

import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { say } from "@/components/ui/toast";
import { BrandMark } from "@/features/brand/brand-mark";
import type { MarkId } from "@/features/brand/marks";
import { useProblem } from "@/i18n/client";
import { HEADERS } from "../home/use-office";
import { Group } from "./parts";

interface App {
  id: string;
  name: string;
  mark: MarkId;
  present: boolean;
  added: boolean;
}

export function AiApps() {
  const t = useTranslations("settings.office.aiApps");
  const problemText = useProblem();
  const [apps, setApps] = useState<App[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetch("/api/me/ai-apps", { headers: HEADERS })
      .then((r) => r.json())
      .then((data: { apps?: App[] }) => {
        if (live) setApps(data.apps ?? []);
      })
      .catch(() => {
        if (live) setApps([]);
      });
    return () => {
      live = false;
    };
  }, []);

  const change = useCallback(
    async (app: App, action: "add" | "remove") => {
      setBusy(app.id);
      setProblem(null);
      try {
        const res = await fetch("/api/me/ai-apps", {
          method: "POST",
          headers: { ...HEADERS, "content-type": "application/json" },
          body: JSON.stringify({ action, id: app.id }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          apps?: App[];
          error?: string;
        };
        if (!res.ok) {
          setProblem(data.error ?? "mcp-failed");
          return;
        }
        if (data.apps) setApps(data.apps);
        say(
          action === "add"
            ? t("added", { name: app.name })
            : t("removed", { name: app.name }),
        );
      } finally {
        setBusy(null);
      }
    },
    [t],
  );

  if (!apps) return null;
  const here = apps.filter((app) => app.present);
  return (
    <Group title={t("title")} hint={t("hint")}>
      {here.length ? (
        <ul className="flex flex-col gap-1">
          {here.map((app) => (
            <li
              key={app.id}
              className="flex h-11 items-center gap-3 rounded-[10px] bg-muted/50 px-3.5"
            >
              <BrandMark id={app.mark} className="size-4" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {app.name}
              </span>
              {app.added ? (
                <>
                  <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
                    <Check className="size-3.5" />
                    {t("on")}
                  </span>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void change(app, "remove")}
                    className="shrink-0 text-[13px] text-muted-foreground underline underline-offset-4 hover:text-destructive"
                  >
                    {t("remove")}
                  </button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy !== null}
                  onClick={() => void change(app, "add")}
                >
                  {t("add")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-muted-foreground">{t("none")}</p>
      )}
      {problem && (
        <p className="text-[13px] text-destructive">{problemText(problem)}</p>
      )}
    </Group>
  );
}
