"use client";

// The app's frame around every screen: the column on the left, the open screen, and settings over
// them. It holds what the screens share (app-state.tsx) so a conversation keeps streaming while the
// person looks at the office. An invite kept by the launcher opens the office's settings once.
// The column folds away (⌘\, kept for the next visit) and, on a window narrower than 900px, is a
// drawer behind a thin bar at the top (☰, the app's name, what there is to decide, search, a new
// conversation), so no screen is squeezed beside it. Keys: ⌘K finds anything, ⌘, opens settings,
// ⇧⌘O starts a new conversation (as in ChatGPT; browsers keep ⇧⌘N for a private window), ⌘\
// folds the column, ? lists the keys; the tab's title carries what waits on the person, so a tab
// in the back still says it.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, PanelLeft, Search, SquarePen } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { confirmOpen } from "@/components/ui/confirm-dialog";
import { Tip, TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/features/brand/logo";
import {
  isCommand,
  typed,
  useCommandKeys,
  windowKey,
} from "@/hooks/use-hotkey";
import { focusChatBox } from "../home/chat-view";
import { SettingsDialog } from "../settings/settings";
import {
  AppProvider,
  ConversationProvider,
  useApp,
  useAppState,
} from "./app-state";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts";
import { iconButton, Sidebar } from "./sidebar";
import { useTurnNotices } from "./turn-notices";

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
  const { app, conversation } = useAppState();
  return (
    <AppProvider value={app}>
      <ConversationProvider value={conversation}>
        <TooltipProvider delay={400}>
          <Frame>{children}</Frame>
        </TooltipProvider>
      </ConversationProvider>
    </AppProvider>
  );
}

/**
 * Says on the page's root whether the keyboard moves focus (`data-keys`), for the boxes one types
 * in: a click into a text field counts as keyboard focus to the browser too, so they ring only
 * when the keyboard brought focus there (as Base UI and React Aria tell it apart).
 */
function useKeyboardFocus() {
  useEffect(() => {
    const root = document.documentElement;
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA";
      if (event.key === "Tab" || event.key === "F6" || !typing)
        root.dataset.keys = "";
    };
    const pointer = () => {
      delete root.dataset.keys;
    };
    window.addEventListener("keydown", key, true);
    window.addEventListener("pointerdown", pointer, true);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("pointerdown", pointer, true);
      delete root.dataset.keys;
    };
  }, []);
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
  const waiting = app.toDecide.length;
  useTurnNotices(
    app.office,
    app.turns,
    app.chat.chatId,
    Boolean(app.office.office) && app.asksLoaded,
  );

  const narrow = useNarrow();
  const keysOf = useCommandKeys();
  const [folded, setFolded] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [keys, setKeys] = useState(false);
  useEffect(() => {
    try {
      setFolded(localStorage.getItem(FOLDED) === "1");
    } catch {}
  }, []);
  useKeyboardFocus();
  const fold = (next: boolean) => {
    // the keyboard follows the button that brings the column back (or the one that folds it),
    // from anywhere in the column that goes
    const hadFocus =
      document.activeElement?.closest("[data-fold], [data-column]") != null;
    setFolded(next);
    try {
      localStorage.setItem(FOLDED, next ? "1" : "0");
    } catch {}
    if (hadFocus)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>("[data-fold]")?.focus(),
      );
  };
  // On a narrow window the column is a drawer, and it goes when the person goes somewhere: to
  // another screen, or to another conversation (opened, new, or the open one put away from its
  // menu, which sits outside the drawer).
  const openChat = app.chat.chatId;
  useEffect(() => {
    void openChat;
    if (pathname) setDrawer(false);
  }, [pathname, openChat]);
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
      // a confirm open waits for its answer: nothing opens over or under it
      if (confirmOpen()) return;
      if (typed(event, "?") && windowKey(event)) {
        event.preventDefault();
        setKeys(true);
        return;
      }
      if (isCommand(event, "Comma")) {
        event.preventDefault();
        setSettings((was) => was ?? "brain");
      }
      if (isCommand(event, "KeyK")) {
        event.preventDefault();
        setPalette((was) => !was);
      }
      if (isCommand(event, "Backslash")) {
        event.preventDefault();
        foldRef.current();
      }
      if (isCommand(event, "KeyO", true)) {
        event.preventDefault();
        chat.newChat();
        router.push("/chat");
        focusChatBox();
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

  const sidebar = (onFold: () => void, className?: string, drawer = false) => (
    <Sidebar
      onFold={onFold}
      drawer={drawer}
      onSearch={() => setPalette(true)}
      onShortcuts={() => setKeys(true)}
      className={className}
    />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1">
      {/* what a screen reader is told of a step taken, from wherever it was taken */}
      <p aria-live="polite" className="sr-only">
        {app.said}
      </p>
      {/* the first stop for the keyboard: past the column, straight to the screen */}
      <a
        href="#content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("content")?.focus();
        }}
        className="sr-only rounded-[10px] bg-background px-3.5 py-2 text-sm font-medium shadow-[0_0_0_1px_var(--alpha-08),0_16px_40px_-12px_var(--alpha-20)] outline-none focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[300] focus:px-3.5! focus:py-2! focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("skip")}
      </a>
      {column && sidebar(() => fold(true))}
      <main
        id="content"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background outline-none"
      >
        {!column && (
          <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-2">
            <Tip
              label={narrow ? t("openMenu") : t("unfold")}
              keys={narrow ? undefined : keysOf.label("Backslash")}
            >
              <button
                type="button"
                data-fold
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
              className="ml-1 truncate rounded-md text-[15px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {APP_NAME}
            </Link>
            <span className="flex-1" />
            {waiting > 0 && (
              <Link
                href="/home"
                className="mr-1 flex h-7 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-waiting outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("yourTurn")}
                <span className="tabular-nums">{waiting}</span>
              </Link>
            )}
            <Tip label={t("search")} keys={keysOf.label("KeyK")}>
              <button
                type="button"
                onClick={() => setPalette(true)}
                className={iconButton}
              >
                <Search className="size-[18px]" />
              </button>
            </Tip>
            <Tip label={t("newChat")} keys={keysOf.label("KeyO", true)}>
              <button
                type="button"
                onClick={() => {
                  chat.newChat();
                  router.push("/chat");
                  focusChatBox();
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
            <DialogPrimitive.Backdrop className="fixed inset-0 z-40 bg-(--scrim) duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
            <DialogPrimitive.Popup
              aria-label={t("nav")}
              // Going anywhere from the drawer closes it, a conversation picked on /chat included
              // (only its query changes) and a new one started.
              onClick={(event) => {
                if (
                  (event.target as HTMLElement).closest?.(
                    "a[href], [data-closes-drawer]",
                  )
                )
                  setDrawer(false);
              }}
              className="fixed inset-y-0 left-0 z-40 bg-background shadow-[12px_0_32px_-12px_var(--shade)] outline-none duration-200 data-open:animate-in data-open:slide-in-from-left data-closed:animate-out data-closed:slide-out-to-left"
            >
              {sidebar(() => setDrawer(false), "w-[min(18rem,85vw)]", true)}
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
