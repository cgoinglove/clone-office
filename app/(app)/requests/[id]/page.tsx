import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequestScreen } from "@/features/minime/shell/request-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("requests")} · sub-office` };
}

// One request between two clones.
export default async function RequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RequestScreen id={decodeURIComponent(id)} />;
}
