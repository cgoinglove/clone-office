"use client";

// The bar laid over the top of the office: the app's name on the left; on the right what waits on
// the person, a reading under way, their status in the office, the way to their clone and to
// settings. It stays out of the office's way: only its controls take the pointer.

import { Check, ChevronDown, Inbox, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Logo } from "@/features/brand/logo";
import { Bot, type Mood } from "@/features/office";
import { cn } from "@/lib/utils";
import { STATUSES, statusCode } from "../office/room-data";
import type { Learn } from "./use-learn";

export function TopBar({
  waiting,
  learn,
  mood,
  status,
  onStatus,
  side,
  onSide,
  onSettings,
}: {
  /** Questions that wait on the person now. */
  waiting: number;
  learn: Learn;
  mood: Mood;
  /** Their status on their card, when they are in an office. */
  status?: string;
  onStatus?: (status: string) => void;
  /** Which tab of the side panel is open, if any. */
  side: "chat" | "requests" | null;
  onSide: (tab: "chat" | "requests" | null) => void;
  onSettings: () => void;
}) {
  const t = useTranslations("home");
  const tOffice = useTranslations("office");
  const current = statusCode(status);
  return (
    <TooltipProvider delay={400}>
      {/* At the lobby the building has the screen; the bar comes in once clocked in. */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 px-4 transition-opacity duration-500 group-has-[.at-lobby]/home:opacity-0 [&>*]:pointer-events-auto group-has-[.at-lobby]/home:[&>*]:pointer-events-none">
        <Logo className="text-[15px]" />
        {current && onStatus && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex h-7 items-center gap-1.5 rounded-lg px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted"
                />
              }
            >
              <StatusDot status={current} />
              {tOffice(`status.${current}`)}
              <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{t("statusLabel")}</DropdownMenuLabel>
                {STATUSES.map((option) => (
                  <DropdownMenuItem
                    key={option}
                    onClick={() => onStatus(option)}
                  >
                    <StatusDot status={option} />
                    <span className="flex-1">
                      {tOffice(`status.${option}`)}
                    </span>
                    {option === current && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          {learn.stage === "learning" && learn.progress && (
            <span className="flex h-8 items-center gap-2 rounded-lg bg-background/90 px-2.5 text-xs shadow-[0_0_0_1px_var(--alpha-10)] backdrop-blur">
              <span className="relative block h-1 w-14 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-brand transition-[width] duration-500"
                  style={{ width: `${learn.progress.percent}%` }}
                />
              </span>
              <span className="text-muted-foreground">{t("learning")}</span>
              <span className="tabular-nums">{learn.progress.percent}%</span>
            </span>
          )}
          {waiting > 0 && (
            <button
              type="button"
              onClick={() => onSide("requests")}
              className="flex h-8 items-center gap-2 rounded-lg bg-background/90 px-2.5 text-xs font-medium text-waiting shadow-[0_0_0_1px_color-mix(in_oklab,var(--waiting)_35%,transparent)] backdrop-blur transition-colors hover:bg-waiting/8"
            >
              <span className="relative flex size-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-waiting/50 motion-reduce:hidden" />
                <span className="relative size-2 rounded-full bg-waiting" />
              </span>
              {t("waitingCount", { count: waiting })}
            </button>
          )}
          <Tip label={t("requestsTab")}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("requestsTab")}
              aria-pressed={side === "requests"}
              onClick={() => onSide(side === "requests" ? null : "requests")}
              className={cn(
                "bg-background/80 backdrop-blur",
                side === "requests" && "bg-muted",
              )}
            >
              <Inbox />
            </Button>
          </Tip>
          <Tip label={t("settings")}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("settings")}
              onClick={onSettings}
              className="bg-background/80 backdrop-blur"
            >
              <Settings />
            </Button>
          </Tip>
          <Tip label={t("talk")}>
            <button
              type="button"
              aria-label={t("talk")}
              aria-pressed={side === "chat"}
              onClick={() => onSide(side === "chat" ? null : "chat")}
              className={cn(
                "grid size-9 place-items-center rounded-xl transition-colors hover:bg-muted",
                side === "chat" && "bg-muted",
              )}
            >
              <Bot size={26} mood={mood} mine={waiting > 0} />
            </button>
          </Tip>
        </div>
      </header>
    </TooltipProvider>
  );
}

function Tip({
  label,
  children,
}: {
  label: string;
  children: React.ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function StatusDot({ status }: { status: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        // Working is the one point of colour; the rest are the ink, off as a ring.
        status === "working"
          ? "bg-brand"
          : status === "off"
            ? "border border-muted-foreground/60"
            : "bg-muted-foreground/60",
      )}
    />
  );
}
