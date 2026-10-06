import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Home } from "@/features/minime/home/home";
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
  const t = await getTranslations("home");
  return { title: `${t("title")} · sub-office` };
}

// The app's main screen: the person's office, with their clone at its desk. Someone who has not
// been through the first steps is sent there first.
export const dynamic = "force-dynamic";

export default function OfficePage() {
  if (!isOnboarded()) redirect("/start");
  return (
    <div className={`${hand.variable} flex min-h-0 flex-1 flex-col`}>
      <Home />
    </div>
  );
}
