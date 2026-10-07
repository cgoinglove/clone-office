import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequestsScreen } from "@/features/minime/shell/requests-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("requests")} · sub-office` };
}

// The requests between the person's clone and their colleagues'.
export default function RequestsPage() {
  return <RequestsScreen />;
}
