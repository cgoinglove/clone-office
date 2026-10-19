"use client";

// The column on the left of every screen, kept short so the app reads at a glance, after the
// columns ChatGPT, Claude and Linear keep: starting a conversation and searching first; then the
// four places (Home, the requests between clones, the office, the clone itself), each marked as
// Thursday marks its own (nav-icons.tsx), the open one by its row's fill; what the person has to
// decide, only when something waits, each row the face of the clone that asked with the red dot
// the office gives a clone asking, and how long it has waited; their conversations, only once
// there are some, under headings by day and a page at a time (recent-chats.tsx); and at the foot
// the person: their name and office status, opening their menu (status, the office and where it
// is, inviting, shortcuts), with Settings beside it. A place says what goes on there (the requests
// open, the reading), never a line telling the person what the column is. The column folds away
// (⌘\), and on a narrow window it is a drawer (app-shell.tsx).

import {
  Building2,
  Keyboard,
  Loader2,
  PanelLeft,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { memo, type ReactNode, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { say } from "@/components/ui/toast";
import { Tip } from "@/components/ui/tooltip";
import { APP_NAME, LogoMark } from "@/features/brand/logo";
import { NavIcon, type NavIconName } from "@/features/brand/nav-icons";
import { Bot } from "@/features/office";
import { useCommandKeys } from "@/hooks/use-hotkey";
import { cn, notAfter } from "@/lib/utils";
import { focusChatBox } from "../home/chat-view";
import { HEADERS } from "../home/use-office";
import { STATUSES, statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { Asking, Mark, StatusDot } from "./parts";
import { RecentChats } from "./recent-chats";
import { askLine, turnHref } from "./your-turn";

/** The places, in the order a day goes through them. */
/** The four places, each drawn with the mark of its own name (also listed by Search). */
export const PLACES = [
  { href: "/home", key: "home" },
  { href: "/requests", key: "requests" },
  { href: "/office", key: "office" },
  { href: "/clone", key: "clone" },
] as const satisfies readonly { href: string; key: NavIconName }[];

/** How many things to decide the column lists; Home has the rest. */
const TURNS = 6;

/** One row of the column: a place, an action or a conversation, picked or not. */
const row = (on: boolean) =>
  cn(
    "group flex h-8 min-w-0 items-center gap-2.5 rounded-lg px-2.5 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    on
      ? // on the open row's fill, its grey words are a step darker, to stay at 4.5:1
        "bg-foreground/[0.07] font-medium text-foreground [&_.text-muted-foreground]:text-foreground/70"
      : "text-foreground/75 hover:bg-foreground/[0.045] hover:text-foreground",
  );

/** A key shown only while the row is pointed at or focused, so the column stays quiet. */
const hoverKey =
  "font-mono text-[10.5px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:hidden";

/** A square button with only an icon, the app's ghost button; its words are in its tip. */
export const iconButton = cn(
  buttonVariants({ variant: "ghost", size: "icon" }),
  "text-foreground/60",
);

export function Sidebar({
  onFold,
  drawer = false,
  onSearch,
  onShortcuts,
  className,
}: {
  /** Folds the column away, or closes it when it is a drawer. */
  onFold: () => void;
  /** Shown as a drawer on a narrow window: its top button closes it, with no key of its own. */
  drawer?: boolean;
  onSearch: () => void;
  onShortcuts: () => void;
  className?: string;
}) {
  const t = useTranslations("shell");
  const tAsk = useTranslations("ask");
  const keys = useCommandKeys();
  const app = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const { office, chat } = app;
  const data = office.office;
  // what still waits: an answer on its way (its Undo open) is not listed here
  const turns = app.toDecide;
  const { indexOf } = office;
  const active = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const reading = app.learn.stage === "learning";

  // who is in now: not gone home, and heard from lately (one on the web is always in)
  const members = data?.members ?? [];
  const inNow = members.filter((member) => {
    const code = statusCode(member.card.status);
    return (
      code !== "off" &&
      (code === "web" || Date.now() - Date.parse(member.seen) <= 120_000)
    );
  }).length;

  /** What a place says beside its name: what goes on there now, or nothing. */
  const aside = (key: (typeof PLACES)[number]["key"]): ReactNode => {
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
      data-column
      aria-label={t("nav")}
      className={cn(
        "flex h-full w-60 shrink-0 flex-col border-r border-border/60 bg-muted/40 px-2.5",
        className,
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-1 pr-0.5">
        {/* the office it works in, and who is in: Linear's and Slack's workspace at the top */}
        <Link
          href="/home"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-background shadow-[0_0_0_1px_var(--alpha-08)]">
            <LogoMark className="size-[17px]" />
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[14px] font-semibold tracking-[-0.01em]">
              {data?.name || APP_NAME}
            </span>
            {data?.joined && members.length > 0 && (
              <span className="truncate text-[11.5px] text-muted-foreground">
                {data?.name
                  ? `${APP_NAME} · ${t("inNow", { count: inNow })}`
                  : t("inNow", { count: inNow })}
              </span>
            )}
          </span>
        </Link>
        <Tip
          label={drawer ? t("closeMenu") : t("fold")}
          keys={drawer ? undefined : keys.label("Backslash")}
        >
          <button
            type="button"
            data-fold
            onClick={onFold}
            className={iconButton}
          >
            <PanelLeft className="size-[18px]" />
          </button>
        </Tip>
      </div>

      <div className="flex shrink-0 flex-col gap-px">
        <button
          type="button"
          data-closes-drawer
          onClick={() => {
            chat.newChat();
            router.push("/chat");
            focusChatBox();
          }}
          aria-keyshortcuts={keys.aria("KeyO", true)}
          className={row(false)}
        >
          <NavIcon name="compose" className="text-foreground/60" />
          <span className="flex-1 truncate text-left">{t("newChat")}</span>
          <kbd aria-hidden className={hoverKey}>
            {keys.label("KeyO", true)}
          </kbd>
        </button>
        <button
          type="button"
          data-closes-drawer
          onClick={onSearch}
          aria-keyshortcuts={keys.aria("KeyK")}
          className={row(false)}
        >
          <NavIcon name="search" className="text-foreground/60" />
          <span className="flex-1 truncate text-left">{t("search")}</span>
          <kbd aria-hidden className={hoverKey}>
            {keys.label("KeyK")}
          </kbd>
        </button>
      </div>

      <div className="mt-3.5 flex shrink-0 flex-col gap-px">
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
                name={item.key}
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
            {/* said once, with its count: "To decide, 2" */}
            <h2
              id="sb-turn"
              aria-label={t("yourTurnCount", { count: turns.length })}
              className="flex h-7 items-center gap-2 px-2.5 text-xs font-semibold"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-waiting" />
              {t("yourTurn")}
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-waiting/14 px-1 text-[10.5px] font-semibold text-waiting-ink tabular-nums">
                {turns.length}
              </span>
            </h2>
            {turns.slice(0, TURNS).map((item) => (
              <TurnLink
                key={item.key}
                href={turnHref(item)}
                from={item.from}
                who={
                  item.from
                    ? t(
                        office.onWeb.has(item.from)
                          ? "office.fromPerson"
                          : "office.fromColleague",
                        { name: office.names.get(item.from) ?? "" },
                      )
                    : t("office.fromClone")
                }
                name={
                  item.from
                    ? (office.names.get(item.from) ?? "")
                    : t("office.myClone")
                }
                line={askLine(tAsk, item.ask)}
                index={indexOf(item.from)}
                ago={
                  item.since
                    ? format.relativeTime(notAfter(item.since, now), {
                        now,
                        style: "narrow",
                      })
                    : undefined
                }
                active={
                  item.where.kind === "request" && pathname === turnHref(item)
                }
              />
            ))}
          </section>
        )}

        <RecentChats row={row} />
      </div>

      <div className="flex shrink-0 items-center gap-1 pt-2 pb-2.5">
        <MeMenu onShortcuts={onShortcuts} />
        <Tip label={t("settings")} keys={keys.label("Comma")} side="top">
          <button
            type="button"
            onClick={() => app.setSettings("brain")}
            className={cn(iconButton, "size-9")}
          >
            <NavIcon name="settings" />
          </button>
        </Tip>
      </div>
    </nav>
  );
}

/** Where the office is, as the person's menu says it: this computer, or the relay's host. */
function officeWhere(
  t: ReturnType<typeof useTranslations<"shell">>,
  office: { here?: { relay: string }; relay?: string; members?: unknown[] },
): string {
  const count = office.members?.length ?? 0;
  if (office.here) return t("me.here", { count });
  let host = office.relay ?? "";
  try {
    host = new URL(host).host;
  } catch {}
  return t("me.at", { host, count });
}

/**
 * The person at the foot of the column: their own clone's mark with their office status, their
 * name, and the status in words; it opens their menu.
 */
function MeMenu({ onShortcuts }: { onShortcuts: () => void }) {
  const t = useTranslations("shell");
  const keys = useCommandKeys();
  const tOffice = useTranslations("office");
  const app = useApp();
  const router = useRouter();
  const { office } = app;
  const data = office.office;
  const joined = Boolean(data?.joined);
  const status = statusCode(data?.me?.card.status ?? "working") ?? "working";
  const name = app.name ?? t("me.you");
  const role = app.profile.role?.trim();
  const line = joined ? tOffice(`status.${status}`) : role;
  // An invite is for one person, so one is made only when asked for: the click copies it as it
  // comes (a clipboard item that waits for it), else Settings › Office shows it, or why not.
  const [making, setMaking] = useState(false);
  const copyInvite = () => {
    const shown = () => app.setSettings("office");
    if (
      !joined ||
      !navigator.clipboard?.write ||
      typeof ClipboardItem === "undefined"
    )
      return shown();
    setMaking(true);
    const made = fetch("/api/me/office", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ action: "invite" }),
    })
      .then((response) => response.json())
      .then((answer) => {
        if (typeof answer?.url !== "string") throw new Error("no invite");
        return new Blob([answer.url], { type: "text/plain" });
      });
    void navigator.clipboard
      .write([new ClipboardItem({ "text/plain": made })])
      .then(() => say(t("me.invited")))
      .catch(shown)
      .finally(() => setMaking(false));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={
              joined
                ? `${t("me.label", { name })}, ${t("statusLabel", { status: tOffice(`status.${status}`) })}`
                : t("me.label", { name })
            }
            className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] pr-2 pl-2.5 text-left outline-none transition-colors hover:bg-foreground/[0.045] focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-foreground/[0.07]"
          />
        }
      >
        <span className="relative shrink-0">
          <Bot size={22} mood="idle" still mine />
          {joined && (
            <StatusDot
              status={status}
              className="absolute -right-0.5 -bottom-0.5 ring-2 ring-background"
            />
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="truncate text-[13.5px] font-medium">{name}</span>
          {line && (
            <span className="truncate text-[11.5px] text-muted-foreground">
              {line}
            </span>
          )}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-66">
        <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-2.5">
          <Bot size={28} mood="idle" still mine />
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold">{name}</span>
            {role && (
              <span className="truncate text-xs text-muted-foreground">
                {role}
              </span>
            )}
          </span>
        </div>
        {joined && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t("statusTitle")}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={status}
              onValueChange={(option) =>
                void office.post({
                  action: "card",
                  card: { ...data?.me?.card, status: option },
                })
              }
            >
              {STATUSES.map((option) => (
                <DropdownMenuRadioItem key={option} value={option}>
                  <span className="grid w-4 place-items-center">
                    <StatusDot status={option} />
                  </span>
                  <span className="flex-1">{tOffice(`status.${option}`)}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        )}
        {joined && data && (
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => app.setSettings("office")}>
              <Building2 className="text-muted-foreground" />
              <span className="flex min-w-0 flex-1 flex-col leading-tight">
                <span>{t("me.office")}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {officeWhere(t, data)}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={making} onClick={copyInvite}>
              {making ? (
                <Loader2 className="animate-spin text-muted-foreground" />
              ) : (
                <UserPlus className="text-muted-foreground" />
              )}
              <span className="flex-1">{t("me.invite")}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/clone")}>
            <NavIcon name="clone" className="text-muted-foreground" />
            <span className="flex-1">{t("screens.clone")}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => app.setSettings("brain")}
            aria-keyshortcuts={keys.aria("Comma")}
          >
            <NavIcon name="settings" className="text-muted-foreground" />
            <span className="flex-1">{t("settings")}</span>
            <kbd
              aria-hidden
              className="font-mono text-[11px] text-muted-foreground"
            >
              {keys.label("Comma")}
            </kbd>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onShortcuts} aria-keyshortcuts="?">
            <Keyboard className="text-muted-foreground" />
            <span className="flex-1">{t("me.shortcuts")}</span>
            <kbd
              aria-hidden
              className="font-mono text-[11px] text-muted-foreground"
            >
              ?
            </kbd>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A clone's mark with the red dot the office gives a clone that is asking its person. */
/** One thing to decide: the asking clone with its dot, the question, how long it has waited. */
const TurnLink = memo(function TurnLink({
  href,
  from,
  who,
  name,
  line,
  index,
  ago,
  active,
}: {
  href: string;
  from?: string;
  /** Who asks, for a screen reader: the face says it to the eye. */
  who: string;
  /** Who asks, short, above the question: the colleague's name, or "my clone". */
  name: string;
  line: string;
  index: number;
  ago?: string;
  active: boolean;
}) {
  // two lines, so the question is read and not cut at its first words: who and when, then what
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(row(active), "h-12 items-center text-[13px]")}
    >
      <Asking>
        {from ? (
          <Mark id={from} index={index} size={20} />
        ) : (
          <Bot size={20} mood="idle" still mine className="shrink-0" />
        )}
      </Asking>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        <span className="flex items-baseline gap-2">
          <span
            aria-hidden
            className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground"
          >
            {name}
          </span>
          {ago && (
            <span className="shrink-0 text-[11px] font-normal text-muted-foreground tabular-nums">
              {ago}
            </span>
          )}
        </span>
        <span className="truncate text-foreground/80">
          <span className="sr-only">{who}: </span>
          {line}
        </span>
      </span>
    </Link>
  );
});
