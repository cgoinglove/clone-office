"use client";

// The person's clone, on its own screen: who it is and how like them it answers, then four
// views. What it knows about them (the memory as saved, each line correctable), the requests it
// takes from colleagues with how much it does alone, its flows: the things it does on its own at
// set times, and what it did in their name, any day (activity-list.tsx). How it thinks and connects (brain, tools, phone) stays in settings.

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Segmented } from "@/components/ui/segmented";
import { Bot } from "@/features/office";
import { FlowsPanel } from "../flows-panel";
import { CloneSection } from "../settings/clone-section";
import { PreferencesSection } from "../settings/preferences-section";
import { RequestsSection } from "../settings/requests-section";
import { ActivityList } from "./activity-list";
import { useApp } from "./app-state";

type Tab = "memory" | "menu" | "flows" | "history";

export function CloneScreen() {
  const t = useTranslations("shell.clone");
  const app = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab =
    asked === "menu" || asked === "flows" || asked === "history"
      ? asked
      : "memory";
  const like = app.office.office?.likeMe;
  const percent = like?.total
    ? Math.round((like.asIs / like.total) * 100)
    : undefined;
  const role =
    app.office.office?.me?.card.description ?? app.profile.role ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-8 pt-9 pb-14">
        <header className="flex flex-wrap items-center gap-4">
          <Bot size={56} mood={app.mood} label={t("title")} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight">
              {app.name ? t("of", { name: app.name }) : t("title")}
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              {role || t("hint")}
            </p>
          </div>
          {percent !== undefined && (
            <div className="flex flex-col items-end">
              <span className="text-[26px] leading-none font-semibold tabular-nums">
                {percent}%
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                {t("likeMe")}
              </span>
            </div>
          )}
        </header>

        <Segmented<Tab>
          view
          aria-label={t("views")}
          options={[
            { value: "memory", label: t("tabs.memory") },
            { value: "menu", label: t("tabs.menu") },
            { value: "flows", label: t("tabs.flows") },
            { value: "history", label: t("tabs.history") },
          ]}
          value={tab}
          onChange={(next) =>
            router.replace(next === "memory" ? "/clone" : `/clone?tab=${next}`)
          }
          className="self-start"
        />

        <div key={tab} className="animate-in duration-200 fade-in">
          {tab === "memory" && (
            <CloneSection
              lang={app.lang}
              learn={app.learn}
              profile={app.profile}
              onProfile={app.setProfile}
              office={app.office}
            />
          )}
          {tab === "menu" && (
            <div className="flex flex-col gap-8">
              <RequestsSection
                lang={app.lang}
                office={app.office}
                defaultTrust={app.preferences?.defaultTrust ?? "tell"}
                onOpenOffice={() => app.setSettings("office")}
              />
              <PreferencesSection
                preferences={app.preferences}
                onChange={app.changePreferences}
                parts={["trust"]}
              />
            </div>
          )}
          {tab === "flows" && (
            <FlowsPanel
              onOpenChat={(id) => {
                void app.chat.openChat(id);
                router.push("/chat");
              }}
              onNews={app.chat.refresh}
              onAsk={(text) => {
                router.push("/chat");
                void app.chat.ask(text);
              }}
            />
          )}
          {tab === "history" && <ActivityList />}
        </div>
      </div>
    </div>
  );
}
