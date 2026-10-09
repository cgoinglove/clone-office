"use client";

// When the office cannot be reached, the screens that show it say so, with what to do and where
// to look, rather than drawing an empty office as if nothing were happening.

import { CloudOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { useApp } from "./app-state";

export function OfficeTrouble({ className }: { className?: string }) {
  const t = useTranslations("shell.trouble");
  const problemText = useProblem();
  const app = useApp();
  const office = app.office.office;
  if (!office?.joined || !office.problem) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 shadow-[inset_0_0_0_1px_var(--alpha-12)]",
        className,
      )}
    >
      {/* the red is the dot alone, as on a clone's mark: the line itself is not an alarm */}
      <span className="relative shrink-0">
        <CloudOff className="size-4 text-muted-foreground" />
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-destructive ring-[1.5px] ring-background"
        />
      </span>
      <span className="min-w-0 flex-1 text-sm leading-snug">
        {problemText(office.problem)}
      </span>
      {/* the office is looked at again on its own, so that it is under way says so */}
      <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
        {t("retrying")}
      </span>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => app.setSettings("office")}
      >
        {t("open")}
      </Button>
    </div>
  );
}
