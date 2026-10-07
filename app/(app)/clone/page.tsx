import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CloneScreen } from "@/features/minime/shell/clone-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("clone")} · sub-office` };
}

// The person's clone: what it knows, the requests it takes, and its flows.
export default function ClonePage() {
  return (
    <Suspense>
      <CloneScreen />
    </Suspense>
  );
}
