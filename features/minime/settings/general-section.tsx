"use client";

// Settings › General: the screen's language (also the one the clone works in from then on), the
// theme, and what this app is, with where to read how it works.

import { BookOpen, Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { Logo } from "@/features/brand/logo";
import { setTheme, useTheme } from "@/hooks/use-theme";
import { pickLanguage } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locales";
import type { Theme } from "@/lib/theme";
import { Group, Groups } from "./parts";
import { APP_VERSION } from "./settings";

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

export function GeneralSection() {
  const t = useTranslations("settings.general");
  const locale = useLocale();
  const router = useRouter();
  const theme = useTheme();
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
      <Group title={t("about")}>
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div className="flex items-center justify-between gap-3">
            <Logo />
            {APP_VERSION && (
              <span className="font-mono text-xs text-muted-foreground">
                v{APP_VERSION}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            {t("aboutBody")}
          </p>
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <BookOpen className="size-3.5" />
            {t("guide")}
          </p>
        </div>
      </Group>
    </Groups>
  );
}
