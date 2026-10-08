"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Logo } from "@/features/brand/logo";

// A screen that failed while drawing: what the clone keeps is untouched, and the person can try the
// screen again or go Home. The error itself is in the server's and the browser's console.
export default function Failed({ reset }: { reset: () => void }) {
  const t = useTranslations("page.failed");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo />
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("body")}</p>
      <div className="flex items-center gap-3">
        <Button onClick={() => reset()}>{t("again")}</Button>
        <Link href="/home" className="text-sm underline underline-offset-4">
          {t("home")}
        </Link>
      </div>
    </main>
  );
}
