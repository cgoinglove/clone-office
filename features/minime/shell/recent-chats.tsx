"use client";

// The person's conversations in the column, as ChatGPT and Claude list theirs: newest first under
// a few headings by when they were last spoken in (today, yesterday, the last week and month, then
// by month), a page at a time, the next page coming as the list is scrolled to its end. Each has
// a menu (pointed at, focused or open): a name of the person's own (also F2) and putting it away,
// with Undo; put away is never removed, and Settings › General brings it back. The rows take only
// what they show, so a conversation streaming elsewhere does not draw them again. For the keyboard
// the list is one stop, as a list box is: ↑↓ (Home, End) move through it, Shift+F10 or the menu key
// opens a row's menu and F2 renames it, so Tab passes the list in one step.

import { Archive, Loader2, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  type KeyboardEvent,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { say } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { composing } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { TITLE_MAX } from "../chat/limits";
import type { ChatSummary } from "../home/use-chat";
import { useApp } from "./app-state";

type Bucket = "today" | "yesterday" | "week" | "month" | string;

const DAY = 24 * 60 * 60 * 1000;

/** Local midnight of a moment, so days are counted as the calendar counts them. */
const dayOf = (at: Date) =>
  new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();

/** Which heading a conversation goes under, by the last day something was said in it. */
function bucketOf(updated: string, today: number): Bucket {
  const at = new Date(updated);
  // Rounded, so a day of 23 or 25 hours (clocks changing) still counts as one.
  const days = Math.round((today - dayOf(at)) / DAY);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
}

/** Conversations under their headings, in the order the list already has them (newest first). */
export function groupChats(chats: ChatSummary[], today: number) {
  const groups: { bucket: Bucket; chats: ChatSummary[] }[] = [];
  for (const chat of chats) {
    const bucket = bucketOf(chat.updated, today);
    const last = groups.at(-1);
    if (last?.bucket === bucket) last.chats.push(chat);
    else groups.push({ bucket, chats: [chat] });
  }
  return groups;
}

/** Today's local midnight, moving on at the next one rather than on a timer. */
function useToday() {
  const [today, setToday] = useState(() => dayOf(new Date()));
  useEffect(() => {
    const next = new Date(today + DAY + 60 * 60 * 1000);
    const wait = setTimeout(
      () => setToday(dayOf(new Date())),
      Math.max(1000, dayOf(next) - Date.now() + 1000),
    );
    return () => clearTimeout(wait);
  }, [today]);
  return today;
}

export function RecentChats({ row }: { row: (on: boolean) => string }) {
  const t = useTranslations("shell");
  const format = useFormatter();
  const today = useToday();
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const { chat } = app;
  const end = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const { more, loadMore, renameChat, archiveChat, newChat } = chat;
  const next = useRef(() => {});
  next.current = () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const focused = document.activeElement === end.current;
    void loadMore().finally(() => {
      loadingRef.current = false;
      setLoading(false);
      // the button had the keyboard: it stays there, or, when no more remain, goes to the last row
      if (focused)
        requestAnimationFrame(() => {
          if (end.current?.isConnected) return end.current.focus();
          const rows =
            list.current?.querySelectorAll<HTMLElement>("[data-chat-row]");
          rows?.[rows.length - 1]?.focus();
        });
    });
  };
  // The next page comes as the list is scrolled to its end; one watcher while there is more.
  useEffect(() => {
    const node = end.current;
    if (!node || !more) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) next.current();
      },
      { rootMargin: "120px" },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, [more]);

  const groups = useMemo(
    () => groupChats(chat.chats, today),
    [chat.chats, today],
  );
  const leave = useMemo(
    () => () => {
      newChat();
      router.push("/chat");
    },
    [newChat, router],
  );
  // The one row Tab stops at: the last one the keyboard was on, else the open one, else the first.
  const [current, setCurrent] = useState<string | null>(null);
  const onRowFocus = useCallback((id: string) => setCurrent(id), []);
  const list = useRef<HTMLElement>(null);
  /** Puts the keyboard on a row by its place in the list (after one is put away, the next). */
  const focusAt = useCallback((at: number) => {
    requestAnimationFrame(() => {
      const rows =
        list.current?.querySelectorAll<HTMLElement>("[data-chat-row]");
      if (!rows?.length) return;
      rows[Math.min(at, rows.length - 1)]?.focus();
    });
  }, []);

  if (!chat.chats.length) return null;
  const heading = (bucket: Bucket) =>
    bucket === "today"
      ? t("chats.today")
      : bucket === "yesterday"
        ? t("chats.yesterday")
        : bucket === "week"
          ? t("chats.week")
          : bucket === "month"
            ? t("chats.month")
            : format.dateTime(new Date(`${bucket}-01T12:00:00`), {
                year: "numeric",
                month: "long",
              });
  const open = pathname === "/chat" ? chat.chatId : undefined;
  const stop =
    current && chat.chats.some((item) => item.id === current)
      ? current
      : open && chat.chats.some((item) => item.id === open)
        ? open
        : chat.chats[0]?.id;
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-chat-row]"),
    ];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    const to =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : at + (event.key === "ArrowDown" ? 1 : -1);
    rows[Math.max(0, Math.min(rows.length - 1, to))]?.focus();
  };
  let place = 0;

  return (
    <section
      ref={list}
      aria-label={t("recentChats")}
      onKeyDown={onKeyDown}
      className="flex flex-col gap-3"
    >
      {groups.map((group) => (
        <div key={group.bucket} className="flex flex-col gap-px">
          <h2 className="flex h-7 items-center px-2.5 text-xs font-medium text-muted-foreground">
            {heading(group.bucket)}
          </h2>
          {group.chats.map((item) => (
            <ChatRow
              key={item.id}
              id={item.id}
              place={place++}
              title={item.title}
              row={row}
              on={open === item.id}
              stop={stop === item.id}
              onRowFocus={onRowFocus}
              onFocusAt={focusAt}
              waiting={app.chatAsks.some((ask) => ask.chat === item.id)}
              // The conversation the clone is answering in says so wherever the person is.
              answering={chat.talking && chat.chatId === item.id}
              onRename={renameChat}
              onArchive={archiveChat}
              onLeave={leave}
            />
          ))}
        </div>
      ))}
      {more && (
        <button
          ref={end}
          type="button"
          // never disabled while it loads, so the keyboard on it is not dropped
          aria-busy={loading}
          onClick={() => next.current()}
          className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {t("chats.more")}
        </button>
      )}
    </section>
  );
}

const ChatRow = memo(function ChatRow({
  id,
  place,
  title,
  row,
  on,
  stop,
  onRowFocus,
  onFocusAt,
  waiting,
  answering,
  onRename,
  onArchive,
  onLeave,
}: {
  id: string;
  /** Its place in the whole list, for the keyboard to land on the next one after it goes. */
  place: number;
  title: string;
  row: (on: boolean) => string;
  on: boolean;
  /** The row Tab stops at; the others are reached with the arrow keys. */
  stop: boolean;
  onRowFocus: (id: string) => void;
  onFocusAt: (place: number) => void;
  waiting: boolean;
  answering: boolean;
  onRename: (id: string, title: string) => Promise<void>;
  onArchive: (id: string, archived: boolean) => Promise<boolean>;
  /** Leaves the conversation open on the screen for a new one. */
  onLeave: () => void;
}) {
  const t = useTranslations("shell");
  const undo = useTranslations("common")("undo");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [menu, setMenu] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);

  const startRename = () => {
    setName(title);
    setEditing(true);
  };
  const finishRename = (keep: boolean, refocus: boolean) => {
    setEditing(false);
    if (keep && name.trim() && name.trim() !== title) void onRename(id, name);
    // Back to the row after Enter or Esc; leaving the field for somewhere else keeps the focus there.
    if (refocus) requestAnimationFrame(() => link.current?.focus());
  };
  const archive = () => {
    // The one open goes with it: the screen starts a new conversation rather than keep writing
    // into one that is no longer listed.
    if (on) onLeave();
    void onArchive(id, true);
    // the keyboard goes on to the row that takes its place
    onFocusAt(place);
    say(t("chats.archived", { title }), {
      action: { label: undo, run: () => void onArchive(id, false) },
    });
  };

  if (editing)
    return (
      <input
        autoFocus
        value={name}
        maxLength={TITLE_MAX}
        aria-label={t("chats.name")}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => finishRename(true, false)}
        onKeyDown={(event) => {
          // a syllable still being made takes its own Enter and Esc
          if (composing(event)) return;
          if (event.key === "Enter") {
            event.preventDefault();
            finishRename(true, true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finishRename(false, true);
          }
        }}
        className="h-8 rounded-lg bg-background px-2.5 text-[13.5px] shadow-[inset_0_0_0_1.5px_var(--brand)] outline-none"
      />
    );

  return (
    <div className="group/chat relative">
      <Link
        ref={link}
        href={`/chat?c=${encodeURIComponent(id)}`}
        data-chat-row
        tabIndex={stop ? 0 : -1}
        aria-current={on ? "true" : undefined}
        aria-keyshortcuts="F2 Shift+F10"
        onFocus={() => onRowFocus(id)}
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            startRename();
          }
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            setMenu(true);
          }
        }}
        className={cn(
          row(on),
          "text-[13.5px] group-focus-within/chat:pr-9 group-hover/chat:pr-9 group-has-[[aria-expanded=true]]/chat:pr-9",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {waiting ? (
          <span
            role="img"
            aria-label={t("chatWaits")}
            className="size-1.5 shrink-0 rounded-full bg-waiting"
          />
        ) : (
          answering && (
            <Loader2
              aria-label={t("chatAnswering")}
              className="size-3.5 shrink-0 animate-spin text-muted-foreground"
            />
          )
        )}
      </Link>
      <DropdownMenu open={menu} onOpenChange={setMenu}>
        {/* the tip says it short; a screen reader hears the conversation's name with it */}
        <Tip label={t("chats.options")}>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                // reached from the row (Shift+F10), so Tab passes the list in one step
                tabIndex={-1}
                aria-label={t("chats.menu", { title })}
                className={cn(
                  buttonVariants({ variant: "ghost", size: "icon-sm" }),
                  "absolute top-1/2 right-1 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity group-focus-within/chat:opacity-100 group-hover/chat:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100",
                )}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="start" side="bottom" className="w-48">
          <DropdownMenuItem onClick={startRename}>
            <Pencil className="text-muted-foreground" />
            <span className="flex-1">{t("chats.rename")}</span>
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={archive}>
            <Archive className="text-muted-foreground" />
            <span className="flex-1">{t("chats.archive")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
