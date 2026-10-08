"use client";

// Settings › Notifications & phone: notices from this browser while the app's tab is not in view
// (shell/turn-notices.ts). Turning it on asks the browser's leave; it is kept in this browser.

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { NOTIFY_KEY } from "../shell/turn-notices";
import { Group } from "./parts";
import { Toggle } from "./preferences-section";

type State = "unsupported" | "blocked" | "on" | "off";

function current(): State {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    return Notification.permission === "granted" &&
      localStorage.getItem(NOTIFY_KEY) === "1"
      ? "on"
      : "off";
  } catch {
    return "off";
  }
}

export function BrowserNotices() {
  const t = useTranslations("settings.notices");
  const [state, setState] = useState<State | null>(null);
  useEffect(() => setState(current()), []);
  if (!state || state === "unsupported") return null;
  const change = async (on: boolean) => {
    try {
      if (!on) {
        localStorage.removeItem(NOTIFY_KEY);
        setState("off");
        return;
      }
      const answer =
        Notification.permission === "granted"
          ? "granted"
          : await Notification.requestPermission();
      if (answer === "granted") localStorage.setItem(NOTIFY_KEY, "1");
      setState(current());
    } catch {
      setState(current());
    }
  };
  return (
    <Group title={t("title")}>
      <Toggle
        icon={<Bell className="size-4" />}
        title={t("toggle")}
        body={state === "blocked" ? t("blocked") : t("body")}
        checked={state === "on"}
        onChange={(on) => void change(on)}
      />
    </Group>
  );
}
