"use client";

// One quiet line asking for a star on GitHub, once the app has shown what it is for: the clone has
// answered a colleague for its person (after Orca's timing, at the moment of value rather than on
// first launch). Followed or closed, it never comes back on this browser.

import { Star, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const STAR = "clone-office:star";
export const REPO_URL = "https://github.com/cgoinglove/clone-office";

export function StarNote({ ready }: { ready: boolean }) {
  const t = useTranslations("shell.home.star");
  const [done, setDone] = useState(true);
  useEffect(() => {
    try {
      setDone(localStorage.getItem(STAR) === "1");
    } catch {
      setDone(false);
    }
  }, []);
  if (!ready || done) return null;
  const close = () => {
    setDone(true);
    try {
      localStorage.setItem(STAR, "1");
    } catch {}
  };
  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm shadow-[inset_0_0_0_1px_var(--alpha-10)]">
      <Star className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-pretty">{t("text")}</span>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        onClick={close}
        className="shrink-0 rounded-lg px-2.5 py-1 text-sm font-medium shadow-[inset_0_0_0_1px_var(--alpha-15)] transition-colors hover:bg-muted/60"
      >
        {t("action")}
      </a>
      <button
        type="button"
        onClick={close}
        aria-label={t("close")}
        className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
