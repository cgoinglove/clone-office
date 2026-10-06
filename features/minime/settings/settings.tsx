"use client";

// Settings, as one dialog over the office (after Thursday's): the sections down the left, grouped
// by what they are about, each with its own mark; the open one on the right under its name and a
// line saying what it is for. Everything about the clone that is not the daily work lives here:
// what it knows and thinks with, what colleagues may ask, the person's flows, connected services,
// phone, permissions, the office, the files it keeps, and the screen's language and theme.

import {
  Building2,
  FolderOpen,
  Inbox,
  Plug,
  Repeat,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  type ComponentType,
  Fragment,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { LogoMark } from "@/features/brand/logo";
import { cn } from "@/lib/utils";
import { BrainPanel, brainReady } from "../brain-panel";
import { ConnectorsPanel } from "../connectors-panel";
import { FlowsPanel } from "../flows-panel";
import type { Learn } from "../home/use-learn";
import { HEADERS, type OfficeState, type Profile } from "../home/use-office";
import type { Preferences } from "../home/use-preferences";
import { MessengerPanel } from "../messenger-panel";
import { CloneSection } from "./clone-section";
import { FilesSection } from "./files-section";
import { GeneralSection } from "./general-section";
import { OfficeSection } from "./office-section";
import { PermissionsSection } from "./permissions-section";
import { PreferencesSection } from "./preferences-section";
import { RequestsSection } from "./requests-section";

export type SectionId =
  | "clone"
  | "preferences"
  | "brain"
  | "requests"
  | "flows"
  | "connectors"
  | "phone"
  | "permissions"
  | "office"
  | "files"
  | "general";

const GROUPS = ["clone", "work", "team", "app"] as const;

const SECTIONS: {
  id: SectionId;
  group: (typeof GROUPS)[number];
  icon: ComponentType<{ className?: string }>;
}[] = [
  { id: "clone", group: "clone", icon: LogoMark },
  { id: "preferences", group: "clone", icon: SlidersHorizontal },
  { id: "brain", group: "clone", icon: Sparkles },
  { id: "requests", group: "clone", icon: Inbox },
  { id: "flows", group: "work", icon: Repeat },
  { id: "connectors", group: "work", icon: Plug },
  { id: "phone", group: "work", icon: Smartphone },
  { id: "permissions", group: "work", icon: ShieldCheck },
  { id: "office", group: "team", icon: Building2 },
  { id: "files", group: "app", icon: FolderOpen },
  { id: "general", group: "app", icon: Settings2 },
];

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

export function SettingsDialog({
  section,
  onSection,
  lang,
  office,
  learn,
  profile,
  onProfile,
  preferences,
  onPreferences,
  onOpenChat,
  onAsk,
  onNews,
}: {
  /** The section open, or null when settings are closed. */
  section: SectionId | null;
  onSection: (section: SectionId | null) => void;
  lang: string;
  office: OfficeState;
  learn: Learn;
  profile: Profile;
  onProfile: (profile: Profile) => void;
  preferences: Preferences | null;
  onPreferences: (next: Partial<Preferences>) => Promise<boolean>;
  /** Opens a conversation (a flow's) in the side panel, closing settings. */
  onOpenChat: (id: string) => void;
  /** Says something to the clone in the side panel, closing settings. */
  onAsk: (text: string) => void;
  onNews: () => void;
}) {
  const t = useTranslations("settings");
  const current = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0];
  const body = useRef<HTMLDivElement>(null);
  const open = section !== null;
  // Quiet marks in the list, as Thursday's: the ember where something wants the person (a brain
  // that cannot think yet, a question about a request), red where something is broken (the phone's
  // bot refused), nothing at rest.
  const [marks, setMarks] = useState<{ brain?: boolean; phone?: boolean }>({});
  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([
      fetch("/api/me/brain", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/me/messenger", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([brain, phone]) => {
      if (!live) return;
      setMarks({
        brain: brain ? !brainReady(brain) || !brain.chosen : false,
        phone: Boolean(phone?.problem),
      });
    });
    return () => {
      live = false;
    };
  }, [open, section]);
  // ⌘1–9 go to the first nine sections, as in Thursday's settings.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const at = Number(event.key);
      if (!Number.isInteger(at) || at < 1 || at > Math.min(9, SECTIONS.length))
        return;
      event.preventDefault();
      onSection(SECTIONS[at - 1].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onSection]);
  // A section opens at its top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [section]);

  const step = (by: number) => {
    const at = SECTIONS.findIndex((entry) => entry.id === current.id);
    return SECTIONS[(at + by + SECTIONS.length) % SECTIONS.length].id;
  };

  return (
    <Dialog
      open={section !== null}
      onOpenChange={(open) => {
        if (!open) onSection(null);
      }}
    >
      <DialogContent className="block h-[min(50rem,calc(100vh-3rem))] overflow-hidden p-0 sm:max-w-[min(68rem,calc(100vw-3rem))]">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <div className="flex h-full min-h-0 max-sm:flex-col">
          <nav
            aria-label={t("nav")}
            onKeyDown={(event) => {
              const by =
                event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!by) return;
              event.preventDefault();
              const next = step(by);
              onSection(next);
              event.currentTarget
                .querySelector<HTMLButtonElement>(`[data-section="${next}"]`)
                ?.focus();
            }}
            className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/60 bg-muted/30 p-3 max-sm:w-full max-sm:flex-row max-sm:border-r-0 max-sm:border-b"
          >
            <span className="px-2.5 pt-1 pb-3 text-sm font-semibold max-sm:hidden">
              {t("title")}
            </span>
            {GROUPS.map((group) => (
              <Fragment key={group}>
                <span className="px-2.5 pt-3 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground uppercase max-sm:hidden">
                  {t(`groups.${group}`)}
                </span>
                {SECTIONS.filter((item) => item.group === group).map((item) => {
                  const picked = item.id === current.id;
                  return (
                    <Button
                      key={item.id}
                      data-section={item.id}
                      tabIndex={picked ? 0 : -1}
                      aria-current={picked ? "page" : undefined}
                      variant="ghost"
                      onClick={() => onSection(item.id)}
                      className={cn(
                        "h-8 justify-start gap-2.5 px-2.5 font-normal max-sm:shrink-0",
                        picked
                          ? "bg-[color-mix(in_oklch,var(--muted),var(--foreground)_6%)] text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <item.icon className="size-4" />
                      <span className="truncate text-sm">
                        {t(`sections.${item.id}.label`)}
                      </span>
                      {((item.id === "office" && office.due.length > 0) ||
                        (item.id === "brain" && marks.brain)) && (
                        <span
                          aria-hidden
                          className="ml-auto size-1.5 rounded-full bg-waiting"
                        />
                      )}
                      {item.id === "phone" && marks.phone && (
                        <span
                          aria-hidden
                          className="ml-auto size-1.5 rounded-full bg-destructive"
                        />
                      )}
                    </Button>
                  );
                })}
              </Fragment>
            ))}
            {APP_VERSION && (
              <span className="mt-auto px-2.5 pt-4 font-mono text-[10px] text-muted-foreground max-sm:hidden">
                sub-office v{APP_VERSION}
              </span>
            )}
          </nav>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div
              key={current.id}
              className="shrink-0 animate-in px-8 pt-8 pb-5 duration-300 fade-in slide-in-from-bottom-1 max-sm:px-5 max-sm:pt-5"
            >
              <div className="mx-auto w-full max-w-[42rem]">
                <h2 className="text-2xl font-semibold tracking-tight">
                  {t(`sections.${current.id}.label`)}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t(`sections.${current.id}.hint`)}
                </p>
              </div>
            </div>
            <div
              ref={body}
              className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 max-sm:px-5"
            >
              <div className="mx-auto w-full max-w-[42rem]">
                {current.id === "clone" && (
                  <CloneSection
                    lang={lang}
                    learn={learn}
                    profile={profile}
                    onProfile={onProfile}
                    office={office}
                  />
                )}
                {current.id === "preferences" && (
                  <PreferencesSection
                    preferences={preferences}
                    onChange={onPreferences}
                  />
                )}
                {current.id === "brain" && <BrainPanel />}
                {current.id === "requests" && (
                  <RequestsSection
                    lang={lang}
                    office={office}
                    defaultTrust={preferences?.defaultTrust ?? "tell"}
                    onOpenOffice={() => onSection("office")}
                  />
                )}
                {current.id === "flows" && (
                  <FlowsPanel
                    onOpenChat={onOpenChat}
                    onNews={onNews}
                    onAsk={onAsk}
                  />
                )}
                {current.id === "connectors" && <ConnectorsPanel />}
                {current.id === "phone" && <MessengerPanel />}
                {current.id === "permissions" && <PermissionsSection />}
                {current.id === "office" && (
                  <OfficeSection
                    lang={lang}
                    office={office}
                    profile={profile}
                  />
                )}
                {current.id === "files" && <FilesSection />}
                {current.id === "general" && <GeneralSection />}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
