"use client";

// The column on the left of every screen, kept short so the app reads at a glance: a new
// conversation, the four places (Home, the requests between clones, talking to the clone, the
// office),
// what waits on the person (their turn, only when something does), their recent conversations,
// and at the bottom their own clone with their status, and settings. Each waiting question takes
// the person straight to where it is answered.

import {
  Building2,
  Check,
  House,
  ListChecks,
  MessageCircle,
  Settings,
  SquarePen,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoMark } from "@/features/brand/logo";
import { Bot } from "@/features/office";
import { cn } from "@/lib/utils";
import { STATUSES, statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { Flap, Mark, StatusDot, twoDigits } from "./parts";
import { askLine, type TurnItem, turnHref, yourTurn } from "./your-turn";

const NAV: {
  href: string;
  key: "home" | "chat" | "requests" | "office";
  icon: ComponentType<{ className?: string }>;
}[] = [
  { href: "/home", key: "home", icon: House },
  { href: "/requests", key: "requests", icon: ListChecks },
  { href: "/chat", key: "chat", icon: MessageCircle },
  { href: "/office", key: "office", icon: Building2 },
];

/** How many recent conversations the column lists. */
const RECENT = 8;

export function Sidebar() {
  const t = useTranslations("shell");
  const tAsk = useTranslations("ask");
  const tOffice = useTranslations("office");
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
  const status = statusCode(data?.me?.card.status ?? "working") ?? "working";
  const like = data?.likeMe;
  const indexOf = (id?: string) =>
    Math.max(
      0,
      members.findIndex((member) => member.id === id),
    );
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      aria-label={t("nav")}
      className="flex h-full w-60 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border/60 bg-muted/40 px-2.5 pt-3 pb-3"
    >
      <div className="flex items-center gap-1 pl-2">
        <Link
          href="/home"
          className="flex min-w-0 flex-1 items-center gap-2 py-1"
        >
          <LogoMark className="size-[22px] shrink-0" />
          <span className="truncate text-[15px] font-semibold tracking-tight">
            sub-office
          </span>
        </Link>
        <button
          type="button"
          aria-label={t("newChat")}
          title={t("newChat")}
          onClick={() => {
            chat.newChat();
            router.push("/chat");
          }}
          className="grid size-8 shrink-0 place-items-center rounded-[10px] text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <SquarePen className="size-[17px]" />
        </button>
      </div>

      <div className="flex flex-col gap-px">
        {NAV.map((item) => {
          const on = active(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors",
                on
                  ? "bg-foreground/[0.07] font-semibold text-foreground"
                  : "font-medium text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="flex-1">{t(`screens.${item.key}`)}</span>
              {item.key === "home" && turns.length > 0 && (
                <span className="rounded-md bg-waiting/10 px-1.5 font-mono text-[11px] font-medium text-waiting tabular-nums">
                  {turns.length}
                </span>
              )}
              {item.key === "requests" && open > 0 && (
                <span className="font-mono text-[11px] font-normal text-muted-foreground tabular-nums">
                  {open}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {turns.length > 0 && (
        <section aria-labelledby="sb-turn" className="flex flex-col gap-px">
          <h2
            id="sb-turn"
            className="flex items-center gap-2 px-2.5 pb-1 text-xs font-semibold"
          >
            {t("yourTurn")}
            <Flap
              value={twoDigits(turns.length)}
              tone="ember"
              label={t("yourTurnCount", { count: turns.length })}
            />
          </h2>
          {turns.slice(0, 6).map((item) => (
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

      <section aria-labelledby="sb-chats" className="flex flex-col gap-px">
        <h2
          id="sb-chats"
          className="px-2.5 pb-1 text-xs font-semibold text-muted-foreground"
        >
          {t("recentChats")}
        </h2>
        {chat.chats.length === 0 ? (
          <p className="px-2.5 text-[13px] text-muted-foreground">
            {t("noChats")}
          </p>
        ) : (
          chat.chats.slice(0, RECENT).map((item) => {
            const on = pathname === "/chat" && chat.chatId === item.id;
            const waiting = app.chatAsks.some((ask) => ask.chat === item.id);
            return (
              <Link
                key={item.id}
                href={`/chat?c=${encodeURIComponent(item.id)}`}
                aria-current={on ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13.5px] transition-colors",
                  on
                    ? "bg-foreground/[0.07] font-semibold text-foreground"
                    : "text-foreground/80 hover:bg-foreground/5 hover:text-foreground",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {waiting && (
                  <span
                    role="img"
                    aria-label={t("chatWaits")}
                    className="size-1.5 shrink-0 rounded-full bg-waiting"
                  />
                )}
              </Link>
            );
          })
        )}
      </section>

      <div className="mt-auto flex flex-col gap-px">
        <div className="flex items-center gap-1">
          <Link
            href="/clone"
            aria-current={active("/clone") ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition-colors",
              active("/clone")
                ? "bg-foreground/[0.07]"
                : "hover:bg-foreground/5",
            )}
          >
            <Bot size={28} mood={app.mood} mine className="shrink-0" />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[13.5px] leading-tight font-semibold">
                {app.name ? t("cloneOf", { name: app.name }) : t("yourClone")}
              </span>
              <span className="truncate text-xs leading-snug text-muted-foreground">
                {app.learn.stage === "learning" && app.learn.progress
                  ? t("learning", { percent: app.learn.progress.percent })
                  : like?.total
                    ? t("likeMe", {
                        percent: Math.round((like.asIs / like.total) * 100),
                      })
                    : t("cloneHint")}
              </span>
            </span>
          </Link>
          {app.joined && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    type="button"
                    aria-label={t("statusLabel", {
                      status: tOffice(`status.${status}`),
                    })}
                    className="flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs text-foreground/80 transition-colors hover:bg-foreground/5 aria-expanded:bg-foreground/5"
                  />
                }
              >
                <StatusDot status={status} />
                {tOffice(`status.${status}`)}
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
                      <span className="flex-1">
                        {tOffice(`status.${option}`)}
                      </span>
                      {option === status && <Check className="size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <button
          type="button"
          onClick={() => app.setSettings("brain")}
          className="flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/5 hover:text-foreground"
        >
          <Settings className="size-4" />
          <span className="flex-1 text-left">{t("settings")}</span>
          <kbd className="font-mono text-[10.5px] text-muted-foreground">
            ⌘,
          </kbd>
        </button>
      </div>
    </nav>
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
      className={cn(
        "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13.5px] transition-colors",
        active ? "bg-foreground/[0.07] font-semibold" : "hover:bg-foreground/5",
      )}
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
