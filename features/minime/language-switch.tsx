"use client";

// The screen's language, picked by the person: each language by its own name, so anyone can find
// theirs. What they pick is also the language their mini-me works in from then on.

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { pickLanguage } from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale } from "@/i18n/locales";

export function LanguageSwitch() {
  const t = useTranslations("language");
  const locale = useLocale();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 self-end text-xs text-muted-foreground">
      <span>{t("label")}</span>
      <Segmented<Locale>
        size="sm"
        options={LOCALES.map((value) => ({
          value,
          label: LOCALE_NAMES[value],
        }))}
        value={locale}
        onChange={(value) => {
          pickLanguage(value);
          router.refresh();
        }}
      />
    </div>
  );
}
