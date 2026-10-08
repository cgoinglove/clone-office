import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { OfficeScreen } from "@/features/minime/shell/office-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("office")} · Clone Office` };
}

// The office: the drawing, its lobby once a day, and what waits on the person over it.
export default function OfficePage() {
  return <OfficeScreen />;
}
