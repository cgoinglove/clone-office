"use client";

// The person's conversations in the column, as ChatGPT and Claude list theirs: newest first under
// a few headings by when they were last spoken in (today, yesterday, the last week and month, then
// by month), a page at a time, the next page coming as the list is scrolled to its end. Each has
// a menu (pointed at, focused or open): a name of the person's own (also F2) and putting it away,
// with Undo; put away is never removed, and Settings › General brings it back.

import { Archive, Loader2, MoreHorizontal, Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { say } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ChatSummary } from "../home/use-chat";
import { useApp } from "./app-state";

type Bucket = "today" | "yesterday" | "week" | "month" | string;

const DAY = 24 * 60 * 60 * 1000;

/** Which heading a conversation goes under, by the last day something was said in it. */
function bucketOf(updated: string, now: Date): Bucket {
  const at = new Date(updated);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const since = today.getTime() - at.getTime();
  if (since <= 0) return "today";
  if (since <= DAY) return "yesterday";
  if (since <= 7 * DAY) return "week";
  if (since <= 30 * DAY) return "month";
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
}

/** Conversations under their headings, in the order the list already has them (newest first). */
export function groupChats(chats: ChatSummary[], now: Date) {
  const groups: { bucket: Bucket; chats: ChatSummary[] }[] = [];
  for (const chat of chats) {
    const bucket = bucketOf(chat.updated, now);
    const last = groups.at(-1);
    if (last?.bucket === bucket) last.chats.push(chat);
    else groups.push({ bucket, chats: [chat] });
  }
  return groups;
}

export function RecentChats({ row }: { row: (on: boolean) => string }) {
  const t = useTranslations("shell");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60 * 60 * 1000 });
  const app = useApp();
  const { chat } = app;
  const end = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(false);

  // The next page comes as the list is scrolled to its end.
  const { more, loadMore } = chat;
  useEffect(() => {
    const node = end.current;
    if (!node || !more) return;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || loading) return;
        setLoading(true);
        void loadMore().finally(() => setLoading(false));
      },
      { rootMargin: "120px" },
    );
    seen.observe(node);
    return () => seen.disconnect();
  }, [more, loadMore, loading]);

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

  return (
    <section aria-label={t("recentChats")} className="flex flex-col gap-3">
      {groupChats(chat.chats, now).map((group) => (
        <div key={group.bucket} className="flex flex-col gap-px">
          <h2 className="flex h-7 items-center px-2.5 text-xs font-medium text-muted-foreground">
            {heading(group.bucket)}
          </h2>
          {group.chats.map((item) => (
            <ChatRow key={item.id} item={item} row={row} />
          ))}
        </div>
      ))}
      {more && (
        <button
          ref={end}
          type="button"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void loadMore().finally(() => setLoading(false));
          }}
          className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground outline-none hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {loading && <Loader2 className="size-3.5 animate-spin" />}
          {t("chats.more")}
        </button>
      )}
    </section>
  );
}

function ChatRow({
  item,
  row,
}: {
  item: ChatSummary;
  row: (on: boolean) => string;
}) {
  const t = useTranslations("shell");
  const undo = useTranslations("common")("undo");
  const app = useApp();
  const pathname = usePathname();
  const { chat } = app;
  const on = pathname === "/chat" && chat.chatId === item.id;
  const waiting = app.chatAsks.some((ask) => ask.chat === item.id);
  // The conversation the clone is answering in says so wherever the person is.
  const answering = chat.talking && chat.chatId === item.id;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.title);
  const link = useRef<HTMLAnchorElement>(null);

  const startRename = () => {
    setName(item.title);
    setEditing(true);
  };
  const finishRename = (keep: boolean) => {
    setEditing(false);
    if (keep && name.trim() && name.trim() !== item.title)
      void chat.renameChat(item.id, name);
    requestAnimationFrame(() => link.current?.focus());
  };
  const archive = () => {
    void chat.archiveChat(item.id, true);
    say(t("chats.archived", { title: item.title }), {
      action: { label: undo, run: () => void chat.archiveChat(item.id, false) },
    });
  };

  if (editing)
    return (
      <input
        autoFocus
        value={name}
        maxLength={60}
        aria-label={t("chats.name")}
        onChange={(event) => setName(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={() => finishRename(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            finishRename(true);
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            finishRename(false);
          }
        }}
        className="h-8 rounded-lg bg-background px-2.5 text-[13.5px] shadow-[inset_0_0_0_1.5px_var(--brand)] outline-none"
      />
    );

  return (
    <div className="group/chat relative">
      <Link
        ref={link}
        href={`/chat?c=${encodeURIComponent(item.id)}`}
        aria-current={on ? "true" : undefined}
        aria-keyshortcuts="F2"
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault();
            startRename();
          }
        }}
        className={cn(
          row(on),
          "text-[13.5px] group-focus-within/chat:pr-9 group-hover/chat:pr-9 group-has-[[aria-expanded=true]]/chat:pr-9",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label={t("chats.menu", { title: item.title })}
              className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity group-focus-within/chat:opacity-100 group-hover/chat:opacity-100 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-foreground/[0.06] aria-expanded:opacity-100"
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="bottom" className="w-48">
          <DropdownMenuItem onClick={startRename}>
            <Pencil className="text-muted-foreground" />
            <span className="flex-1">{t("chats.rename")}</span>
            <kbd className="font-mono text-[11px] text-muted-foreground">
              F2
            </kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={archive}>
            <Archive className="text-muted-foreground" />
            <span className="flex-1">{t("chats.archive")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
