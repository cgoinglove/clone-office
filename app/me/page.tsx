import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { getTranslations } from "next-intl/server";
import { FirstRun } from "@/features/minime/first-run";
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

export default function MinimePage() {
  return (
    <main className={`${hand.variable} flex min-h-0 flex-1 flex-col`}>
      <FirstRun />
    </main>
  );
}
