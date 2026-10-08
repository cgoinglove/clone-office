import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { HomeScreen } from "@/features/minime/shell/home-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("home")} · Clone Office` };
}

// The first screen: what is happening, what waits on the person, and what to do about it.
export default function HomePage() {
  return <HomeScreen />;
}
