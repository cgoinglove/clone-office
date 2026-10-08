"use client";

// The screen's language, picked by the person: one button with the language in use, and a list
// that opens on it, each language by its own name so anyone can find theirs. First comes following
// the browser, which is where every screen starts (the first of its languages the screen is
// written in, else English). What they pick is also the language their clone works in from then on.

import { Check, ChevronDown, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  followBrowserLanguage,
  languagePicked,
  pickLanguage,
} from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale, pickLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** Each language's name in English, beside its own, for someone who reads neither. */
const ENGLISH_NAMES: Record<Locale, string> = {
  en: "English",
  ko: "Korean",
  zh: "Chinese",
  ja: "Japanese",
  es: "Spanish",
  pt: "Portuguese",
};

export function LanguageSwitch() {
  const t = useTranslations("language");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(false);
  const [browser, setBrowser] = useState<Locale>("en");
  useEffect(() => {
    setPicked(languagePicked());
    setBrowser(pickLocale(navigator.languages.join(",")));
  }, []);

  const choose = (next: Locale | "browser") => {
    if (next === "browser") followBrowserLanguage();
    else pickLanguage(next);
    setPicked(next !== "browser");
    setOpen(false);
    router.refresh();
  };

  const row =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={t("label")}
        className="flex h-8 items-center gap-1.5 rounded-lg pr-2 pl-2.5 text-[13px] text-muted-foreground ring-1 ring-border outline-none ring-inset transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        <Globe className="size-3.5" />
        {LOCALE_NAMES[locale]}
        <ChevronDown className="size-3.5 opacity-70" />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 gap-0 rounded-xl p-1.5"
        aria-label={t("label")}
      >
        <button
          type="button"
          onClick={() => choose("browser")}
          className={cn(row, "h-11", !picked && "bg-muted")}
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[13.5px] font-medium">
              {t("browser")}
            </span>
            <span className="block truncate text-[11.5px] text-muted-foreground">
              {t("browserNote", { name: LOCALE_NAMES[browser] })}
            </span>
          </span>
          {!picked && <Check className="size-4 shrink-0" />}
        </button>
        <div className="mx-1 my-1.5 h-px bg-border" />
        {LOCALES.map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            onClick={() => choose(value)}
            className={cn(row, "h-8.5")}
          >
            <span className="flex-1 text-[13.5px]">{LOCALE_NAMES[value]}</span>
            {picked && value === locale ? (
              <Check className="size-4 shrink-0" />
            ) : (
              <span className="text-xs text-muted-foreground" lang="en">
                {ENGLISH_NAMES[value]}
              </span>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
