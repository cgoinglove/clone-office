"use client";

// The app's frame around every screen: the column on the left, the open screen, and settings over
// them. It holds what the screens share (app-state.tsx) so a conversation keeps streaming while the
// person looks at the office. An invite kept by the launcher opens the office's settings once.
// The column folds away (⌘\, kept for the next visit) and, on a window narrower than 900px, is a
// drawer behind a thin bar at the top (☰, the app's name, what there is to decide, search, a new
// conversation), so no screen is squeezed beside it. Keys: ⌘K finds anything, ⌘, opens settings,
// ⇧⌘N starts a new conversation, ⌘\ folds the column, ? lists the keys; the tab's title carries
// what waits on the person, so a tab in the back still says it.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, PanelLeft, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/features/brand/logo";
import { typed, windowKey } from "@/hooks/use-hotkey";
import { SettingsDialog } from "../settings/settings";
import { AppProvider, useApp, useAppState } from "./app-state";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts";
import { iconButton, Sidebar } from "./sidebar";
import { useTurnNotices } from "./turn-notices";
import { yourTurn } from "./your-turn";

/** The screen each address opens, by its first part, as the tab's title names it. */
const SCREENS: Record<
  string,
  "home" | "chat" | "requests" | "office" | "clone" | "file"
> = {
  home: "home",
  chat: "chat",
  requests: "requests",
  office: "office",
  clone: "clone",
  files: "file",
};

/** Below this width the column is a drawer rather than a column beside the screen. */
const NARROW = "(max-width: 899px)";
const FOLDED = "clone-office.sidebar-folded";

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState();
  return (
    <AppProvider value={state}>
      <TooltipProvider delay={400}>
        <Frame>{children}</Frame>
      </TooltipProvider>
    </AppProvider>
  );
}

/** Whether the window is narrow, followed as it is resized. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return narrow;
}

function Frame({ children }: { children: ReactNode }) {
  const t = useTranslations("shell");
  const app = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const waiting = yourTurn(app.office, app.chatAsks).length;
  useTurnNotices(
    app.office,
    app.chatAsks,
    app.chat.chatId,
    Boolean(app.office.office) && app.asksLoaded,
  );

  const narrow = useNarrow();
  const [folded, setFolded] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [keys, setKeys] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLDED) === "1");
    } catch {}
  }, []);
  const fold = (next: boolean) => {
    setFolded(next);
    try {
      localStorage.setItem(FOLDED, next ? "1" : "0");
    } catch {}
  };
  // On a narrow window the column is a drawer, and it goes when the person goes somewhere.
  useEffect(() => {
    if (pathname) setDrawer(false);
  }, [pathname]);
  useEffect(() => {
    if (!narrow) setDrawer(false);
  }, [narrow]);
  const column = narrow || folded ? null : "beside";

  const title = t(`screens.${SCREENS[pathname.split("/")[1] ?? ""] ?? "chat"}`);
  useEffect(() => {
    document.title = waiting
      ? `(${waiting}) ${title} · Clone Office`
      : `${title} · Clone Office`;
  }, [waiting, title]);

  const { setSettings, chat } = app;
  const foldRef = useRef(() => {});
  foldRef.current = () => (narrow ? setDrawer((was) => !was) : fold(!folded));
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (typed(event, "?") && windowKey(event)) {
        event.preventDefault();
        setKeys(true);
        return;
      }
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key === ",") {
        event.preventDefault();
        setSettings((was) => was ?? "brain");
      }
      if (event.key.toLowerCase() === "k" && !event.shiftKey) {
        event.preventDefault();
        setPalette((was) => !was);
      }
      if (event.key === "\\") {
        event.preventDefault();
        foldRef.current();
      }
      if (event.key.toLowerCase() === "n" && event.shiftKey) {
        event.preventDefault();
        chat.newChat();
        router.push("/chat");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSettings, chat, router]);

  // Started again with `clone-office join <link>`: the office's settings open once, ready to join.
  const invite = app.office.office?.invite?.link;
  const offered = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!invite || offered.current === invite) return;
    offered.current = invite;
    setSettings("office");
  }, [invite, setSettings]);

  const sidebar = (onFold: () => void, className?: string) => (
    <Sidebar
      onFold={onFold}
      onSearch={() => setPalette(true)}
      onShortcuts={() => setKeys(true)}
      className={className}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      {column && sidebar(() => fold(true))}
      <main className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {!column && (
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-2">
            <Tip
              label={narrow ? t("openMenu") : t("unfold")}
              keys={narrow ? undefined : "⌘\\"}
            >
              <button
                type="button"
                aria-label={narrow ? t("openMenu") : t("unfold")}
                onClick={() => (narrow ? setDrawer(true) : fold(false))}
                className={iconButton}
              >
                {narrow ? (
                  <Menu className="size-[18px]" />
                ) : (
                  <PanelLeft className="size-[18px]" />
                )}
              </button>
            </Tip>
            <Link
              href="/home"
              className="ml-1 truncate rounded-md text-[15px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {APP_NAME}
            </Link>
            <span className="flex-1" />
            {waiting > 0 && (
              <Link
                href="/home"
                className="mr-1 flex h-7 items-center gap-1.5 rounded-full bg-waiting/8 px-2.5 text-[12.5px] font-semibold text-waiting outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                {t("yourTurn")}
                <span className="tabular-nums">{waiting}</span>
              </Link>
            )}
            <Tip label={t("search")} keys="⌘K">
              <button
                type="button"
                aria-label={t("search")}
                onClick={() => setPalette(true)}
                className={iconButton}
              >
                <Search className="size-[18px]" />
              </button>
            </Tip>
            <Tip label={t("newChat")} keys="⇧⌘N">
              <button
                type="button"
                aria-label={t("newChat")}
                onClick={() => {
                  chat.newChat();
                  router.push("/chat");
                }}
                className={iconButton}
              >
                <SquarePen className="size-[18px]" />
              </button>
            </Tip>
          </header>
        )}
        {children}
      </main>
      {narrow && (
        <DialogPrimitive.Root open={drawer} onOpenChange={setDrawer}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-black/25 duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Popup
              aria-label={t("nav")}
              className="fixed inset-y-0 left-0 z-40 bg-background shadow-[12px_0_32px_-12px_rgb(0_0_0/0.35)] outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left"
            >
              {sidebar(() => setDrawer(false), "w-[min(18rem,85vw)]")}
            </DialogPrimitive.Popup>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}
      <CommandPalette open={palette} onOpenChange={setPalette} />
      <ShortcutsDialog open={keys} onOpenChange={setKeys} />
      <SettingsDialog
        section={app.settings}
        onSection={app.setSettings}
        lang={app.lang}
        office={app.office}
        profile={app.profile}
        preferences={app.preferences}
        onPreferences={app.changePreferences}
      />
    </div>
  );
}
