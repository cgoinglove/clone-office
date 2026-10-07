"use client";

// The first screen: the conversation with the person's clone, with the office live beside it. An
// empty conversation is the clone's hello and the first steps with the app. Under the box, two
// helpers put the words that hand a request to a colleague's clone or make a flow, so neither has
// to be known to be used. "/" goes to the box.

import { CalendarClock, ChevronDown, PanelRight, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { typed, windowKey } from "@/hooks/use-hotkey";
import { cn } from "@/lib/utils";
import { ChatView } from "../home/chat-view";
import { useApp } from "./app-state";
import { OfficeRail } from "./office-rail";
import { Mark } from "./parts";
import { Welcome } from "./welcome";

const RAIL = "sub-office.office-rail";

export function ChatScreen() {
  const t = useTranslations("shell.chat");
  const app = useApp();
  const { chat } = app;
  const router = useRouter();
  const params = useSearchParams();
  const draft = useRef<HTMLTextAreaElement>(null);
  const insertRef = useRef<(text: string) => void>(() => {});

  // A conversation asked for by its address (the sidebar's links) is opened, then the address
  // goes back to the screen's own.
  const wanted = params.get("c");
  const openChat = chat.openChat;
  const current = chat.chatId;
  useEffect(() => {
    if (!wanted) return;
    void (async () => {
      if (wanted !== current) await openChat(wanted);
      router.replace("/chat");
    })();
  }, [wanted, current, openChat, router]);

  // Words handed over by another screen (asking by a link from the requests) go into the box;
  // what was asked from Home's box is asked at once, in a new conversation.
  const say = params.get("say");
  useEffect(() => {
    if (!say) return;
    requestAnimationFrame(() => insertRef.current(say));
    router.replace("/chat");
  }, [say, router]);
  const send = params.get("send");
  const ask = chat.ask;
  const newChat = chat.newChat;
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!send || sent.current === send) return;
    sent.current = send;
    newChat();
    router.replace("/chat");
    void ask(send);
  }, [send, ask, newChat, router]);

  const [rail, setRail] = useState(true);
  useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL) !== "0");
    } catch {}
  }, []);
  const toggleRail = () =>
    setRail((was) => {
      try {
        localStorage.setItem(RAIL, was ? "0" : "1");
      } catch {}
      return !was;
    });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!windowKey(event) || !typed(event, "/")) return;
      event.preventDefault();
      draft.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const empty = chat.turns.length === 0;
  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border/60 px-5">
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {empty ? t("new") : (chat.title ?? t("untitled"))}
          </h1>
          <button
            type="button"
            aria-label={rail ? t("hideRail") : t("showRail")}
            title={rail ? t("hideRail") : t("showRail")}
            aria-pressed={rail}
            onClick={toggleRail}
            className={cn(
              "grid size-8 place-items-center rounded-lg text-foreground/75 transition-colors hover:bg-muted hover:text-foreground max-[1180px]:hidden",
              rail && "text-foreground",
            )}
          >
            <PanelRight className="size-[17px]" />
          </button>
        </header>
        <ChatView
          chat={chat}
          tasks={app.learn.tasks}
          routines={app.learn.routines}
          mood={app.mood}
          name={app.name}
          draftRef={draft}
          placeholder={t("placeholder")}
          empty={<Welcome />}
          tools={(insert) => {
            insertRef.current = insert;
            return <Helpers insert={insert} />;
          }}
        />
      </section>
      {rail && <OfficeRail onInsert={(text) => insertRef.current(text)} />}
    </div>
  );
}

/** The helpers under the box: ask a colleague (by name, or by a link when alone) and make a flow. */
function Helpers({ insert }: { insert: (text: string) => void }) {
  const t = useTranslations("shell.chat");
  const app = useApp();
  const members = app.office.office?.members ?? [];
  const me = app.office.office?.me?.id;
  const colleagues = members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => member.id !== me);
  const chip =
    "flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] text-foreground/80 shadow-[inset_0_0_0_1px_var(--alpha-10)] transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted";
  return (
    <>
      {colleagues.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<button type="button" className={chip} />}
          >
            <Users className="size-3.5" />
            {t("askColleague")}
            <ChevronDown className="size-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-56">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t("askWho")}</DropdownMenuLabel>
              {colleagues.map(({ member, index }) => (
                <DropdownMenuItem
                  key={member.id}
                  onClick={() =>
                    insert(t("askStarter", { name: member.card.name }))
                  }
                >
                  <Mark id={member.id} index={index} size={18} />
                  <span className="flex-1 truncate">{member.card.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => insert(t("linkStarter"))}>
                <span className="grid size-[18px] place-items-center text-muted-foreground">
                  +
                </span>
                <span className="flex-1">{t("byLink")}</span>
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button
          type="button"
          className={chip}
          onClick={() => insert(t("linkStarter"))}
        >
          <Users className="size-3.5" />
          {t("askSomeone")}
        </button>
      )}
      <button
        type="button"
        className={chip}
        onClick={() => insert(t("flowStarter"))}
      >
        <CalendarClock className="size-3.5" />
        {t("everyTime")}
      </button>
    </>
  );
}
