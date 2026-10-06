import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { FirstRun } from "@/features/minime/first-run";
import { isOnboarded } from "@/features/minime/server/onboarded";
import "@/features/office/office.css";

// The office's handwriting (its notes on the floor), loaded only where it is drawn.
const hand = Caveat({
  variable: "--font-caveat",
  subsets: ["latin"],
  weight: ["600"],
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("firstRun");
  return { title: `${t("title")} · sub-office` };
}

// Someone new is sent through the first steps before their clone's page.
export const dynamic = "force-dynamic";

export default function MinimePage() {
  if (!isOnboarded()) redirect("/start");
  return (
    <main className={`${hand.variable} flex min-h-0 flex-1 flex-col`}>
      <FirstRun />
    </main>
  );
}
