import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Onboarding } from "@/features/minime/start/onboarding";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("start");
  return { title: `${t("title")} · sub-office` };
}

export default function StartPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <Onboarding />
    </main>
  );
}
