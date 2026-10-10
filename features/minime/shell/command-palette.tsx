"use client";

// One box that finds anything and goes there (⌘K, or Search in the column), after the palettes
// ChatGPT, Claude and Linear keep: the person's conversations by name (the latest while nothing is
// typed, then every one the server holds), the requests between clones by what was asked,
// colleagues (asking one starts the sentence in the conversation box), the places and Settings'
// sections; and, for anything typed, asking the clone it in a new conversation (⌘↵, or ↵ when
// nothing matches). Keys: ↑↓ move, ↵ opens, Esc closes and gives the focus back. Only the words a
// person reads are matched, never an id.

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Command, defaultFilter } from "cmdk";
import { CornerDownLeft, MessageSquare, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useState } from "react";
import {
  DialogOverlay,
  DialogPopup,
  DialogPortal,
} from "@/components/ui/dialog";
import { NavIcon } from "@/features/brand/nav-icons";
import { composing, isCommand, useCommandKeys } from "@/hooks/use-hotkey";
import { notAfter } from "@/lib/utils";
import type { ChatSummary } from "../home/use-chat";
import { HEADERS } from "../home/use-office";
import { SECTIONS } from "../settings/settings";
import { useApp } from "./app-state";
import { Mark, PhaseChip, phaseOf } from "./parts";
import { askedText } from "./requests-screen";
import { PLACES } from "./sidebar";

const item =
  "flex min-h-9 cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[14px] outline-none select-none data-[selected=true]:bg-muted [&_svg]:shrink-0";
const group =
  "px-1.5 pt-1.5 pb-1 **:[[cmdk-group-heading]]:flex **:[[cmdk-group-heading]]:h-7 **:[[cmdk-group-heading]]:items-center **:[[cmdk-group-heading]]:px-2.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground";

function Row({
  lead,
  title,
  sub,
  right,
}: {
  lead: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <>
      <span className="grid w-4 place-items-center">{lead}</span>
      <span className="flex min-w-0 flex-1 flex-col leading-snug">
        <span className="truncate">{title}</span>
        {sub && (
          <span className="truncate text-xs text-muted-foreground">{sub}</span>
        )}
      </span>
      {right}
    </>
  );
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("shell");
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay />
        <DialogPopup
          aria-label={t("palette.title")}
          className="fixed top-[12vh] left-1/2 z-50 w-[min(640px,calc(100%-2rem))] -translate-x-1/2 overflow-hidden rounded-[14px] bg-popover text-popover-foreground shadow-[0_0_0_1px_var(--alpha-08),0_16px_40px_-12px_var(--alpha-20)] duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-98 data-closed:animate-out data-closed:fade-out-0"
        >
          <PaletteBody close={() => onOpenChange(false)} />
        </DialogPopup>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

/** What the box finds, worked out only while it is open (the popup holds it). */
function PaletteBody({ close }: { close: () => void }) {
  const t = useTranslations("shell");
  const tSettings = useTranslations("settings.sections");
  const tChat = useTranslations("shell.chat");
  const app = useApp();
  const router = useRouter();
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const [query, setQuery] = useState("");
  const data = app.office.office;
  const members = data?.members ?? [];
  const me = data?.me?.id;
  const { indexOf } = app.office;
  const nameOf = (id?: string) => (id && app.office.names.get(id)) || "";
  const yours = app.tasksToDecide;
  const asked = query.trim();
  const keys = useCommandKeys();

  // What is typed is looked for among every conversation, not only those the column loaded.
  const [found, setFound] = useState<ChatSummary[] | null>(null);
  useEffect(() => {
    if (!asked) return setFound(null);
    let live = true;
    const wait = setTimeout(() => {
      void fetch(`/api/me/chats?limit=20&q=${encodeURIComponent(asked)}`, {
        headers: HEADERS,
      })
        .then((response) => response.json())
        .then((data) => live && setFound(data.chats ?? []))
        .catch(() => {});
    }, 150);
    return () => {
      live = false;
      clearTimeout(wait);
    };
  }, [asked]);
  const chats = asked
    ? (found ??
      app.chat.chats.filter((chat) =>
        chat.title.toLowerCase().includes(asked.toLowerCase()),
      ))
    : app.chat.chats.slice(0, 8);

  const go = (run: () => void) => {
    close();
    run();
  };
  const ask = () => {
    if (!asked) return;
    go(() => router.push(`/chat?send=${encodeURIComponent(asked)}`));
  };

  return (
    <Command
      label={t("palette.title")}
      loop
      filter={(_value, search, keywords) =>
        defaultFilter(keywords?.join(" ") ?? "", search)
      }
      onKeyDown={(event) => {
        // a syllable still being made takes its own Enter
        if (event.key !== "Enter" || composing(event)) return;
        const picked = event.currentTarget.querySelector(
          '[cmdk-item][data-selected="true"]',
        );
        // ⌘↵ asks the clone; so does ↵ when nothing matches what was typed.
        if (isCommand(event.nativeEvent, "Enter") || !picked) {
          event.preventDefault();
          ask();
        }
      }}
    >
      <div className="flex h-14 items-center gap-3 border-b border-border/60 px-[18px]">
        <Search className="size-[18px] shrink-0 text-muted-foreground" />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder={t("palette.placeholder")}
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/80"
        />
        <kbd
          aria-hidden
          className="font-mono text-[11px] text-muted-foreground pointer-coarse:hidden"
        >
          {keys.key("Escape")}
        </kbd>
      </div>
      <Command.List
        label={t("palette.results")}
        className="max-h-[min(440px,60vh)] scroll-py-2 overflow-y-auto pb-1.5"
      >
        <Command.Empty className="flex flex-col items-center gap-3 px-4 py-7 text-center text-sm text-muted-foreground">
          {t("palette.empty")}
          {asked && (
            <button
              type="button"
              onClick={ask}
              className="flex h-8 max-w-full items-center gap-2 rounded-lg bg-secondary px-3 text-[13.5px] text-foreground outline-none hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageSquare className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">
                {t("palette.ask", { text: asked })}
              </span>
              <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          )}
        </Command.Empty>

        {chats.length > 0 && (
          <Command.Group heading={t("palette.chats")} className={group}>
            {chats.map((chat) => (
              <Command.Item
                key={chat.id}
                value={`chat:${chat.id}`}
                keywords={[chat.title]}
                onSelect={() =>
                  go(() =>
                    router.push(`/chat?c=${encodeURIComponent(chat.id)}`),
                  )
                }
                className={item}
              >
                <Row
                  lead={
                    <MessageSquare className="size-4 text-muted-foreground" />
                  }
                  title={chat.title}
                  right={
                    chat.updated && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {format.relativeTime(notAfter(chat.updated, now), {
                          now,
                          style: "narrow",
                        })}
                      </span>
                    )
                  }
                />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {(data?.tasks?.length ?? 0) > 0 && (
          <Command.Group heading={t("palette.requests")} className={group}>
            {(data?.tasks ?? []).map((task) => {
              const text = askedText(task);
              const other =
                task.metadata.from === me
                  ? task.metadata.to
                  : task.metadata.from;
              return (
                <Command.Item
                  key={task.id}
                  value={`request:${task.id}`}
                  keywords={[text, nameOf(other)]}
                  onSelect={() =>
                    go(() =>
                      router.push(`/requests/${encodeURIComponent(task.id)}`),
                    )
                  }
                  className={item}
                >
                  <Row
                    lead={<Mark id={other} index={indexOf(other)} size={16} />}
                    title={text}
                    sub={nameOf(other)}
                    right={
                      <PhaseChip
                        phase={phaseOf(task.status.state, yours.has(task.id))}
                      />
                    }
                  />
                </Command.Item>
              );
            })}
          </Command.Group>
        )}

        {members.length > 1 && (
          <Command.Group heading={t("palette.people")} className={group}>
            {members
              .filter((member) => member.id !== me)
              .map((member) => (
                <Command.Item
                  key={member.id}
                  value={`person:${member.id}`}
                  keywords={[
                    member.card.name,
                    member.card.description ?? "",
                    ...(member.card.owns ?? []),
                  ]}
                  onSelect={() =>
                    go(() =>
                      router.push(
                        `/chat?say=${encodeURIComponent(
                          tChat("askStarter", { name: member.card.name }),
                        )}`,
                      ),
                    )
                  }
                  className={item}
                >
                  <Row
                    lead={
                      <Mark
                        id={member.id}
                        index={indexOf(member.id)}
                        size={16}
                      />
                    }
                    title={t("palette.askColleague", {
                      name: member.card.name,
                    })}
                    sub={[member.card.description, ...(member.card.owns ?? [])]
                      .filter(Boolean)
                      .join(" · ")}
                  />
                </Command.Item>
              ))}
          </Command.Group>
        )}

        <Command.Group heading={t("palette.go")} className={group}>
          {PLACES.map((place) => (
            <Command.Item
              key={place.href}
              value={`go:${place.key}`}
              keywords={[t(`screens.${place.key}`)]}
              onSelect={() => go(() => router.push(place.href))}
              className={item}
            >
              <Row
                lead={
                  <NavIcon
                    name={place.key}
                    className="size-4 text-muted-foreground"
                  />
                }
                title={t(`screens.${place.key}`)}
              />
            </Command.Item>
          ))}
          {SECTIONS.map((section) => (
            <Command.Item
              key={section.id}
              value={`settings:${section.id}`}
              keywords={[t("settings"), tSettings(`${section.id}.label`)]}
              onSelect={() => go(() => app.setSettings(section.id))}
              className={item}
            >
              <Row
                lead={
                  <NavIcon
                    name={section.icon}
                    className="size-4 text-muted-foreground"
                  />
                }
                title={`${t("settings")} › ${tSettings(`${section.id}.label`)}`}
              />
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      {/* keys to press mean nothing on a screen of fingers */}
      <div className="flex h-10 items-center gap-4 border-t border-border/60 px-[18px] text-xs text-muted-foreground pointer-coarse:hidden">
        <span className="flex items-center gap-1.5">
          <kbd className="font-mono text-[11px]">↑↓</kbd>
          {t("palette.move")}
        </span>
        <span className="flex items-center gap-1.5">
          <CornerDownLeft className="size-3" />
          {t("palette.open")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="font-mono text-[11px]">{keys.label("Enter")}</kbd>
          {t("palette.askKey")}
        </span>
      </div>
    </Command>
  );
}
