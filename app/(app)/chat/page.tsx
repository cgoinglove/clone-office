import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ChatScreen } from "@/features/minime/shell/chat-screen";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  return { title: `${t("chat")} · sub-office` };
}

// The first screen: the conversation with the person's clone.
export default function ChatPage() {
  return (
    <Suspense>
      <ChatScreen />
    </Suspense>
  );
}
