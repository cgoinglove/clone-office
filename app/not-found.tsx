import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/features/brand/logo";

// A page the app does not have: said in the person's language, with the way Home.
export default async function NotFound() {
  const t = await getTranslations("page.notFound");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <Logo />
      <h1 className="text-xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-sm text-sm text-muted-foreground">{t("body")}</p>
      <Link href="/home" className="text-sm underline underline-offset-4">
        {t("home")}
      </Link>
    </main>
  );
}
