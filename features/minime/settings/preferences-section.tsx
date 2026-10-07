"use client";

// Settings › Preferences: how the clone behaves when it works for its person. How much it does
// on its own (after Claude Code's permission modes), where a new kind of request starts, when the
// questions it kept for later come, whether it learns after each conversation, and the lobby.

import { BookOpen, Eye, Feather, Hand, Moon, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { ShinyText } from "@/components/ui/shiny-text";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Autonomy, Preferences, Trust } from "../home/use-preferences";
import { Group, Groups } from "./parts";

const MODES: { value: Autonomy; icon: typeof Hand }[] = [
  { value: "ask", icon: Hand },
  { value: "reads", icon: Eye },
  { value: "auto", icon: Zap },
];

/** The hours a person might want questions at: a working day, with room either side. */
const HOURS = Array.from({ length: 15 }, (_, i) => i + 7);

/** The groups of preferences, each shown where it belongs (settings, the clone's screen). */
export type PreferencePart =
  | "autonomy"
  | "trust"
  | "batch"
  | "learning"
  | "models"
  | "phone"
  | "office";

export function PreferencesSection({
  preferences,
  onChange,
  parts,
}: {
  preferences: Preferences | null;
  onChange: (next: Partial<Preferences>) => Promise<boolean>;
  /** The groups to show; all of them when left out. */
  parts?: PreferencePart[];
}) {
  const show = (part: PreferencePart) => !parts || parts.includes(part);
  const t = useTranslations("settings.preferences");
  const tOffice = useTranslations("office");
  if (!preferences)
    return <ShinyText className="text-sm" text={t("loading")} />;
  const hours = preferences.batchHours;
  const at = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return (
    <Groups>
      {show("autonomy") && (
        <Group title={t("autonomy")} hint={t("autonomyHint")}>
          <div
            className="flex flex-col gap-2"
            role="radiogroup"
            aria-label={t("autonomy")}
          >
            {MODES.map(({ value, icon: Icon }) => {
              const picked = preferences.autonomy === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  onClick={() => void onChange({ autonomy: value })}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border border-border bg-background px-4 py-3 text-left transition-[border-color,box-shadow,background-color] hover:bg-muted/50",
                    picked &&
                      "border-foreground/70 shadow-[0_0_0_1px_var(--foreground)] hover:bg-background",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                      picked ? "bg-foreground text-background" : "bg-muted",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 font-medium">
                      {t(`modes.${value}.title`)}
                      {value === "ask" && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                          {t("default")}
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
                      {t(`modes.${value}.body`)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("always")}
          </p>
        </Group>
      )}

      {show("trust") && (
        <Group title={t("trust")} hint={t("trustHint")}>
          <Segmented<Trust>
            aria-label={t("trust")}
            options={(["auto", "tell", "ask"] as const).map((trust) => ({
              value: trust,
              label: tOffice(`menu.trust.${trust}`),
              title: tOffice(`menu.trustHint.${trust}`),
            }))}
            value={preferences.defaultTrust}
            onChange={(trust) => void onChange({ defaultTrust: trust })}
          />
        </Group>
      )}

      {show("batch") && (
        <Group
          title={t("batch")}
          hint={t("batchHint", { hours: hours.map(at).join(", ") })}
        >
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("batch")}
          >
            {HOURS.map((hour) => {
              const on = hours.includes(hour);
              return (
                <button
                  key={hour}
                  type="button"
                  aria-pressed={on}
                  disabled={on ? hours.length <= 1 : hours.length >= 6}
                  onClick={() =>
                    void onChange({
                      batchHours: on
                        ? hours.filter((h) => h !== hour)
                        : [...hours, hour].sort((a, b) => a - b),
                    })
                  }
                  className={cn(
                    "h-8 min-w-14 rounded-lg border px-2 text-xs tabular-nums transition-colors disabled:cursor-not-allowed",
                    on
                      ? "border-transparent bg-foreground text-background"
                      : "border-border text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40",
                  )}
                >
                  {at(hour)}
                </button>
              );
            })}
          </div>
        </Group>
      )}

      {show("learning") && (
        <Group title={t("learning")}>
          <Toggle
            icon={<BookOpen className="size-4" />}
            title={t("review")}
            body={t("reviewHint")}
            checked={preferences.review}
            onChange={(review) => void onChange({ review })}
          />
        </Group>
      )}

      {show("models") && (
        <Group title={t("models")}>
          <Toggle
            icon={<Feather className="size-4" />}
            title={t("light")}
            body={t("lightHint")}
            checked={preferences.lightBackground}
            onChange={(lightBackground) => void onChange({ lightBackground })}
          />
        </Group>
      )}

      {show("phone") && (
        <Group title={t("phone")}>
          <Toggle
            icon={<Moon className="size-4" />}
            title={t("quiet")}
            body={t("quietHint")}
            checked={preferences.quiet.on}
            onChange={(on) =>
              void onChange({ quiet: { ...preferences.quiet, on } })
            }
          />
          {preferences.quiet.on && (
            <div className="flex flex-wrap items-center gap-2 pl-1 text-sm">
              <span className="text-muted-foreground">{t("quietFrom")}</span>
              <HourSelect
                label={t("quietFrom")}
                value={preferences.quiet.from}
                onChange={(from) =>
                  void onChange({ quiet: { ...preferences.quiet, from } })
                }
              />
              <span className="text-muted-foreground">{t("quietTo")}</span>
              <HourSelect
                label={t("quietTo")}
                value={preferences.quiet.to}
                onChange={(to) =>
                  void onChange({ quiet: { ...preferences.quiet, to } })
                }
              />
            </div>
          )}
        </Group>
      )}

      {show("office") && (
        <Group title={t("office")}>
          <Toggle
            title={t("lobby")}
            body={t("lobbyHint")}
            checked={preferences.lobby}
            onChange={(lobby) => void onChange({ lobby })}
          />
        </Group>
      )}
    </Groups>
  );
}

export function Toggle({
  icon,
  title,
  body,
  checked,
  onChange,
}: {
  icon?: React.ReactNode;
  title: string;
  body: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border px-4 py-3">
      {icon && (
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
          {body}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} className="mt-1" />
    </label>
  );
}

function HourSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (hour: number) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      className="h-8 rounded-lg border border-border bg-background px-2 text-sm tabular-nums outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {Array.from({ length: 24 }, (_, hour) => (
        <option key={hour} value={hour}>
          {`${String(hour).padStart(2, "0")}:00`}
        </option>
      ))}
    </select>
  );
}
