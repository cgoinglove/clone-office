"use client";

// The screen's language, picked by the person: one button with the language in use, and a list
// that opens on it, each language by its own name so anyone can find theirs. First comes following
// the browser, which is where every screen starts (the first of its languages the screen is
// written in, else English). What they pick is also the language their clone works in from then on.
// Each language carries a small flag as a quick mark (features/brand/flags.ts); its own name is
// what is read.

import { Check, ChevronDown, Globe } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FLAGS } from "@/features/brand/flags";
import {
  followBrowserLanguage,
  languagePicked,
  pickLanguage,
} from "@/i18n/client";
import { LOCALE_NAMES, LOCALES, type Locale, pickLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

/** A language's flag, small and with a hairline so a white one keeps its edge. */
export function Flag({
  locale,
  className,
}: {
  locale: Locale;
  className?: string;
}) {
  const flag = FLAGS[locale];
  // The app's own drawing as a picture: nothing typed or fetched ever goes in it.
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${flag.box}" preserveAspectRatio="xMidYMid slice">${flag.svg}</svg>`,
  )}`;
  return (
    // biome-ignore lint/performance/noImgElement: a few hundred bytes of inline drawing, no image to optimise
    <img
      alt=""
      aria-hidden
      src={src}
      width={18}
      height={12}
      className={cn(
        "h-3 w-4.5 shrink-0 rounded-[2.5px] object-cover ring-1 ring-foreground/10",
        className,
      )}
    />
  );
}

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
        className="flex h-8 items-center gap-1.5 rounded-lg pr-2 pl-2.5 text-[13px] text-muted-foreground ring-1 ring-border outline-none ring-inset transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        <Flag locale={locale} />
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
          <Globe className="size-4 shrink-0 text-muted-foreground" />
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
        <div className="h-1.5" />
        {LOCALES.map((value) => (
          <button
            key={value}
            type="button"
            lang={value}
            onClick={() => choose(value)}
            className={cn(row, "h-8.5")}
          >
            <Flag locale={value} />
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
