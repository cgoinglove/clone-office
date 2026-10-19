"use client";

// Inviting a teammate from wherever the person asks (their menu, the office's header). An invite is
// for one person, so one is made only when asked for: the click copies it as it comes (a clipboard
// item that waits for it), else Settings › Office shows it, or why not.

import { useTranslations } from "next-intl";
import { useState } from "react";
import { say } from "@/components/ui/toast";
import { HEADERS } from "../home/use-office";
import { useApp } from "./app-state";

export function useInvite() {
  const t = useTranslations("shell");
  const app = useApp();
  const joined = Boolean(app.office.office?.joined);
  const [making, setMaking] = useState(false);
  const copy = () => {
    const shown = () => app.setSettings("office");
    if (
      !joined ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    )
      return shown();
    setMaking(true);
    const made = fetch("/api/me/office", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "invite" }),
    })
      .then((response) => response.json())
      .then((answer) => {
        if (typeof answer?.url !== "string") throw new Error("no invite");
        return new Blob([answer.url], { type: "text/plain" });
      });
    void navigator.clipboard
      .write([new ClipboardItem({ "text/plain": made })])
      .then(() => say(t("me.invited")))
      .catch(shown)
      .finally(() => setMaking(false));
  };
  return { copy, making };
}
