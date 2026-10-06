import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FirstRun } from "@/features/minime/first-run";
import "@/features/office/office.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("firstRun");
  return { title: `${t("title")} · sub-office` };
}

export default function MinimePage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <FirstRun />
    </main>
  );
}
