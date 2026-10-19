"use client";

// Asking for a star on GitHub once, as news at the bottom right, when the app has shown what it is
// for: the clone has answered a colleague for its person (after Orca's timing, at the moment of
// value rather than on first launch). Shown once on this browser, never as a band on Home (10-19).

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { notify } from "@/components/ui/toast";

const STAR = "clone-office:star";
export const REPO_URL = "https://github.com/cgoinglove/clone-office";

export function StarNote({ ready }: { ready: boolean }) {
  const t = useTranslations("shell.home.star");
  useEffect(() => {
    if (!ready) return;
    try {
      if (localStorage.getItem(STAR) === "1") return;
      localStorage.setItem(STAR, "1");
    } catch {
      return;
    }
    notify(t("title"), t("text"), {
      lead: <Star className="size-4 text-muted-foreground" />,
      open: {
        label: t("action"),
        run: () => window.open(REPO_URL, "_blank", "noreferrer"),
      },
      closeLabel: t("close"),
      timeout: 20_000,
    });
  }, [ready, t]);
  return null;
}
