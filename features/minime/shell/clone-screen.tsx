"use client";

// The person's clone, on its own screen (10-19 redesign): who it is, what it thinks with, and three
// numbers on how it stands in for them (how like them its answers are, what it answered alone this
// week, what it brought to them first), then four views. What it knows about them (the memory as
// saved, each line correctable, with its notes and skills beside it), the kinds of request it takes
// from colleagues with how much it does alone, its flows, and what it did in their name, any day
// (activity-list.tsx). The card colleagues see opens from the header. How it thinks and connects
// (model, tools, phone) stays in settings.

import { Eye } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { Bot } from "@/features/office";
import { type BrainState, brainLabel } from "../brain-panel";
import { FlowsPanel } from "../flows-panel";
import { HEADERS } from "../home/use-office";
import { CloneSection } from "../settings/clone-section";
import { RequestsSection } from "../settings/requests-section";
import { ActivityList, type Logged, useActivity } from "./activity-list";
import { useApp } from "./app-state";

type Tab = "memory" | "menu" | "flows" | "history";

const WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * The model it thinks with, by its own name ("Claude Sonnet"), once the app has said which: the
 * choice alone (`?only=choice`), never the probes of what this computer offers.
 */
function useModelName(): string | undefined {
  const [name, setName] = useState<string>();
  useEffect(() => {
    let live = true;
    fetch("/api/me/brain?only=choice", { headers: HEADERS })
      .then((response) => (response.ok ? response.json() : null))
      .then((state: Pick<BrainState, "choice" | "chatgpt"> | null) => {
        if (!live || !state?.choice) return;
        const label = brainLabel(state, "Claude Code");
        setName(label.split(" · ").slice(1).join(" · ") || label);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return name;
}

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
  const activity = useActivity();
  const model = useModelName();
  const [cardOpen, setCardOpen] = useState(false);
  const role =
    app.office.office?.me?.card.description ?? app.profile.role ?? "";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[62.5rem] flex-col gap-6 px-4 pt-6 pb-14 sm:px-8 sm:pt-9">
        <header className="flex flex-wrap items-center gap-4.5">
          <Bot size={60} mood={app.mood} label={t("title")} />
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-0.5">
            <h1 className="text-[24px] leading-tight font-semibold tracking-tight">
              {app.name ? t("of", { name: app.name }) : t("title")}
            </h1>
            <p className="truncate text-[13.5px] text-muted-foreground">
              {[role || t("hint"), model && t("model", { model })]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setCardOpen(true)}>
            <Eye />
            {t("card.open")}
          </Button>
        </header>

        <Numbers lines={activity} />

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
            <RequestsSection
              lang={app.lang}
              office={app.office}
              preferences={app.preferences}
              onPreferences={app.changePreferences}
              onOpenOffice={() => app.setSettings("office")}
            />
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
          {tab === "history" && <ActivityList lines={activity} />}
        </div>
      </div>
      <CardPreview open={cardOpen} onOpenChange={setCardOpen} />
    </div>
  );
}

/**
 * Three numbers on how the clone stands in for its person: of the answers it showed them first,
 * how many went as they were (30 days); what it answered colleagues on its own this week, and to
 * how many; and what it brought to them before anything went. No answer is in both of the last two.
 */
function Numbers({ lines }: { lines: Logged[] | null }) {
  const t = useTranslations("shell.clone.stats");
  const app = useApp();
  const like = app.office.office?.likeMe;
  const since = Date.now() - WEEK;
  const week = (lines ?? []).filter((line) => Date.parse(line.at) >= since);
  // two numbers that never count one answer twice: what went on its own (alone, or telling the
  // person after), and what the person saw or decided before it went (or held back)
  const alone = week.filter(
    (line) =>
      line.kind === "answered" && (line.how === "alone" || line.how === "told"),
  );
  const people = new Set(
    alone
      .map((line) =>
        "member" in line && line.member
          ? line.member
          : "to" in line
            ? line.to
            : undefined,
      )
      .filter(Boolean),
  ).size;
  const first = week.filter(
    (line) =>
      line.kind === "held" ||
      (line.kind === "answered" &&
        (line.how === "as-is" ||
          line.how === "changed" ||
          line.how === "decided")),
  ).length;
  const items = [
    {
      key: "like",
      value: like?.total
        ? `${Math.round((like.asIs / like.total) * 100)}%`
        : "–",
      label: t("likeMe"),
      hint: like?.total
        ? t("likeMeHint", { total: like.total, asIs: like.asIs })
        : t("likeMeNone"),
    },
    {
      key: "alone",
      value: lines ? String(alone.length) : "–",
      label: t("alone"),
      hint: t("aloneHint", { count: people }),
    },
    {
      key: "first",
      value: lines ? String(first) : "–",
      label: t("first"),
      hint: t("firstHint"),
    },
  ];
  return (
    // three across at any width; on a phone each is its number and name, the line under it set aside
    <ul className="grid grid-cols-3 gap-2 sm:gap-2.5">
      {items.map((item) => (
        <li
          key={item.key}
          className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-background px-3 py-3 shadow-[0_0_0_1px_var(--alpha-10)] sm:px-4 sm:py-3.5"
        >
          <span className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2">
            <span className="text-[19px] leading-none font-semibold tracking-tight tabular-nums sm:text-[22px]">
              {item.value}
            </span>
            <span className="text-[12px] font-semibold sm:text-[13px]">
              {item.label}
            </span>
          </span>
          <span className="mt-1 text-xs leading-relaxed text-muted-foreground max-sm:hidden">
            {item.hint}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** The card colleagues and their clones see, as they see it: what they route by. */
function CardPreview({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("shell.clone.card");
  const tOffice = useTranslations("office");
  const app = useApp();
  const office = app.office.office;
  const card = office?.joined ? office.me?.card : undefined;
  const name = card?.name ?? app.name ?? "";
  const role = card?.description ?? app.profile.role ?? "";
  const owns = card?.owns ?? app.profile.owns ?? [];
  const takes = (card?.skills ?? office?.menu ?? []).map((kind) => kind.name);
  const ways = card?.howToWork ?? [];
  const block = (title: string, children: React.ReactNode) => (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-muted-foreground">
        {title}
      </span>
      {children}
    </div>
  );
  const pills = (items: string[]) => (
    <span className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex h-7 items-center rounded-lg bg-muted px-2.5 text-[13px]"
        >
          {item}
        </span>
      ))}
    </span>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>{t("title")}</DialogTitle>
        <DialogDescription>
          {card ? t("hint") : t("notJoined")}
        </DialogDescription>
        <div className="flex flex-col gap-4 rounded-[14px] p-4 shadow-[0_0_0_1px_var(--alpha-10)]">
          <div className="flex items-center gap-3">
            <Bot size={40} mood="idle" still />
            <div className="flex min-w-0 flex-col">
              <span className="text-[15px] font-semibold">
                {name ? tOffice("miniMe", { name }) : t("you")}
              </span>
              {role && (
                <span className="truncate text-[13px] text-muted-foreground">
                  {role}
                </span>
              )}
            </div>
          </div>
          {owns.length > 0 && block(t("owns"), pills(owns))}
          {takes.length > 0 && block(t("takes"), pills(takes))}
          {ways.length > 0 &&
            block(
              t("ways"),
              <ul className="flex list-disc flex-col gap-1 pl-4.5 text-[13.5px] leading-relaxed">
                {ways.map((way) => (
                  <li key={way}>{way}</li>
                ))}
              </ul>,
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
