"use client";

// The column on the left of every screen, kept short so the app reads at a glance, after the
// columns ChatGPT, Claude and Paperclip keep: starting a conversation first; then the four places
// (Home, the requests between clones, the office, the clone itself), each marked as Thursday marks
// its own (nav-icons.tsx), the open one by its row's fill; what waits on the person, their turn, only when
// something does; their conversations, only once there are some, scrolling on their own between
// the places and the foot; and at the foot Settings, with their status in the office beside it
// once they are in one. A place says what goes on there (the requests open, a meeting under way,
// the reading), never a line telling the person what the column is. Each waiting question takes
// the person straight to where it is answered.

import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShinyText } from "@/components/ui/shiny-text";
import { APP_NAME } from "@/features/brand/logo";
import { NavIcon, type NavIconName } from "@/features/brand/nav-icons";
import { Bot } from "@/features/office";
import { cn } from "@/lib/utils";
import { STATUSES, statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { Flap, Mark, StatusDot, twoDigits } from "./parts";
import { askLine, type TurnItem, turnHref, yourTurn } from "./your-turn";

/** The places, in the order a day goes through them. */
const PLACES: {
  href: string;
  key: "home" | "requests" | "office" | "clone";
  icon: NavIconName;
}[] = [
  { href: "/home", key: "home", icon: "home" },
  { href: "/requests", key: "requests", icon: "requests" },
  { href: "/office", key: "office", icon: "office" },
  { href: "/clone", key: "clone", icon: "clone" },
];

/** How many of the person's turns the column lists; Home has the rest. */
const TURNS = 6;

/** One row of the column: a place, an action or a conversation, picked or not. */
const row = (on: boolean) =>
  cn(
    "group flex h-8 min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50",
    on
      ? "bg-foreground/[0.07] font-medium text-foreground"
      : "text-foreground/75 hover:bg-foreground/[0.045] hover:text-foreground",
  );

export function Sidebar() {
  const t = useTranslations("shell");
  const tAsk = useTranslations("ask");
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const { office, chat } = app;
  const data = office.office;
  const members = data?.members ?? [];
  const turns = yourTurn(office, app.chatAsks);
  const open = (data?.tasks ?? []).filter((task) =>
    ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(task.status.state),
  ).length;
  const meeting = (data?.meetings ?? []).some((item) => item.state === "open");
  const indexOf = (id?: string) =>
    Math.max(
      0,
      members.findIndex((member) => member.id === id),
    );
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const reading = app.learn.stage === "learning";

  /** What a place says beside its name: what goes on there now, or nothing. */
  const aside = (key: (typeof PLACES)[number]["key"]): ReactNode => {
    if (key === "requests" && open > 0)
      return (
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {open}
        </span>
      );
    if (key === "office" && meeting)
      return <ShinyText text={t("meetingOn")} className="text-[11.5px]" />;
    if (key === "clone" && reading)
      return (
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums">
          <Loader2 className="size-3 animate-spin" />
          {app.learn.progress?.percent ?? 0}%
        </span>
      );
    return null;
  };

  return (
    <nav
      aria-label={t("nav")}
      className="flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-muted/40 px-2.5"
    >
      <div className="flex h-[52px] shrink-0 items-center px-2.5">
        <Link
          href="/home"
          className="truncate rounded-md text-[15px] font-semibold tracking-[-0.01em] outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {APP_NAME}
        </Link>
      </div>

      <div className="flex shrink-0 flex-col gap-px">
        <button
          type="button"
          onClick={() => {
            chat.newChat();
            router.push("/chat");
          }}
          className={row(false)}
        >
          <NavIcon name="compose" className="text-foreground/60" />
          <span className="flex-1 truncate text-left">{t("newChat")}</span>
          <kbd className="font-mono text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            ⇧⌘N
          </kbd>
        </button>
        {PLACES.map((item) => {
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={row(on)}
            >
              <NavIcon
                name={item.icon}
                className={on ? undefined : "text-foreground/60"}
              />
              <span className="flex-1 truncate">
                {t(`screens.${item.key}`)}
              </span>
              {aside(item.key)}
            </Link>
          );
        })}
      </div>

      <div className="-mx-2.5 mt-5 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-2.5 pb-3">
        {turns.length > 0 && (
          <section aria-labelledby="sb-turn" className="flex flex-col gap-px">
            <h2
              id="sb-turn"
              className="flex h-7 items-center gap-2 px-2.5 text-xs font-semibold"
            >
              {t("yourTurn")}
              <Flap
                value={twoDigits(turns.length)}
                tone="ember"
                label={t("yourTurnCount", { count: turns.length })}
              />
            </h2>
            {turns.slice(0, TURNS).map((item) => (
              <TurnLink
                key={item.key}
                item={item}
                line={askLine(tAsk, item.ask)}
                index={indexOf(item.from)}
                active={
                  item.where.kind === "request" && pathname === turnHref(item)
                }
              />
            ))}
          </section>
        )}

        {chat.chats.length > 0 && (
          <section aria-labelledby="sb-chats" className="flex flex-col gap-px">
            <h2
              id="sb-chats"
              className="flex h-7 items-center px-2.5 text-xs font-medium text-muted-foreground"
            >
              {t("recentChats")}
            </h2>
            {chat.chats.map((item) => {
              const on = pathname === "/chat" && chat.chatId === item.id;
              const waiting = app.chatAsks.some((ask) => ask.chat === item.id);
              // The conversation the clone is answering in says so wherever the person is.
              const answering = chat.talking && chat.chatId === item.id;
              return (
                <Link
                  key={item.id}
                  href={`/chat?c=${encodeURIComponent(item.id)}`}
                  aria-current={on ? "true" : undefined}
                  className={cn(row(on), "text-[13.5px]")}
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
              );
            })}
          </section>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 py-2.5">
        <button
          type="button"
          onClick={() => app.setSettings("brain")}
          className={cn(row(false), "flex-1")}
        >
          <NavIcon name="settings" className="text-foreground/60" />
          <span className="flex-1 truncate text-left">{t("settings")}</span>
          <kbd className="font-mono text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            ⌘,
          </kbd>
        </button>
        {app.joined && <StatusMenu />}
      </div>
    </nav>
  );
}

/** The person's status in the office, beside Settings: a dot and a word, changed from a menu. */
function StatusMenu() {
  const t = useTranslations("shell");
  const tOffice = useTranslations("office");
  const { office } = useApp();
  const data = office.office;
  const status = statusCode(data?.me?.card.status ?? "working") ?? "working";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={t("statusLabel", {
              status: tOffice(`status.${status}`),
            })}
            className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg pr-1.5 pl-2.5 text-[12.5px] text-foreground/75 outline-none transition-colors hover:bg-foreground/[0.045] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 aria-expanded:bg-foreground/[0.045]"
          />
        }
      >
        <StatusDot status={status} />
        {tOffice(`status.${status}`)}
        <ChevronsUpDown className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("statusTitle")}</DropdownMenuLabel>
          {STATUSES.map((option) => (
            <DropdownMenuItem
              key={option}
              onClick={() =>
                void office.post({
                  action: "card",
                  card: { ...data?.me?.card, status: option },
                })
              }
            >
              <StatusDot status={option} />
              <span className="flex-1">{tOffice(`status.${option}`)}</span>
              {option === status && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function TurnLink({
  item,
  line,
  index,
  active,
}: {
  item: TurnItem;
  line: string;
  index: number;
  active: boolean;
}) {
  return (
    <Link
      href={turnHref(item)}
      aria-current={active ? "page" : undefined}
      className={cn(row(active), "text-[13.5px]")}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-waiting" />
      <span className="min-w-0 flex-1 truncate">{line}</span>
      {item.from ? (
        <Mark id={item.from} index={index} size={16} />
      ) : (
        <Bot size={16} mood="idle" still mine={false} className="shrink-0" />
      )}
    </Link>
  );
}
