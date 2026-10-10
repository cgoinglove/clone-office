"use client";

// The keys the app answers, listed where the person's menu says "Keyboard shortcuts" (or `?`).

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCommandKeys } from "@/hooks/use-hotkey";
import { SECTIONS } from "../settings/settings";

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("shell");
  const { label } = useCommandKeys();
  const keys: [string, string][] = [
    [label("KeyK"), t("search")],
    [label("KeyN", true), t("newChat")],
    ["/", t("keys.box")],
    [label("Backslash"), t("keys.fold")],
    [label("Comma"), t("settings")],
    [`${label("Digit1")}–${Math.min(9, SECTIONS.length)}`, t("keys.section")],
    ["?", t("keys.list")],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t("me.shortcuts")}</DialogTitle>
        </DialogHeader>
        <dl className="-mb-1 flex flex-col gap-1">
          {keys.map(([key, what]) => (
            <div
              key={key}
              className="flex h-8 items-center justify-between gap-4"
            >
              <dt className="text-sm">{what}</dt>
              <dd>
                <kbd className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                  {key}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
