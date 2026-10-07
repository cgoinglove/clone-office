"use client";

// When the office cannot be reached, the screens that show it say so, with what to do and where
// to look, rather than drawing an empty office as if nothing were happening.

import { CloudOff } from "lucide-react";
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
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-destructive/30 px-4 py-3",
        className,
      )}
    >
      <CloudOff className="size-4 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1 text-sm leading-snug">
        {problemText(office.problem)}
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => app.setSettings("office")}
      >
        {t("open")}
      </Button>
    </div>
  );
}
