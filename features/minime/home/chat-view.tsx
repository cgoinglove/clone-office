"use client";

// The conversation with the person's clone, in the side panel: what they said, the clone's answers
// as they stream in, the gate's questions as cards in place, what it kept, and news that came into
// the conversation on its own (a colleague's answer, a flow that ran). An empty conversation offers
// what the clone suggested after reading, or a few things anyone can ask.

import {
  ArrowUp,
  BookmarkCheck,
  CircleAlert,
  Clock,
  CornerDownRight,
  Sparkles,
  Users,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { ShinyText } from "@/components/ui/shiny-text";
import { Bot, type Mood } from "@/features/office";
import { composing } from "@/hooks/use-hotkey";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { AskCard } from "../ask-card";
import { type Routine, routineNow } from "../routine";
import type { Chat, Turn } from "./use-chat";

export function ChatView({
  chat,
  tasks,
  routines,
  mood,
  name,
  draftRef,
}: {
  chat: Chat;
  /** What the clone offered to do after its last reading. */
  tasks: { label: string; why: string }[];
  routines: Routine[];
  mood: Mood;
  /** What to call the person, when known. */
  name?: string;
  /** The box the person types in, for the page to focus. */
  draftRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const t = useTranslations("home");
  const bottom = useRef<HTMLDivElement>(null);

  // The newest line stays in view as words stream in.
  const last = chat.turns.at(-1);
  const lastText = last && "text" in last ? last.text.length : 0;
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [chat.turns.length, lastText]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-5 pb-3">
        {chat.turns.length === 0 ? (
          <Empty
            chat={chat}
            tasks={tasks}
            routines={routines}
            mood={mood}
            name={name}
          />
        ) : (
          <ol className="flex flex-col gap-4">
            {chat.turns.map((turn) => (
              <TurnRow key={turn.id} turn={turn} chat={chat} />
            ))}
          </ol>
        )}
        <div ref={bottom} />
      </div>
      <Composer chat={chat} draftRef={draftRef} placeholder={t("composer")} />
    </div>
  );
}

function Empty({
  chat,
  tasks,
  routines,
  mood,
  name,
}: {
  chat: Chat;
  tasks: { label: string; why: string }[];
  routines: Routine[];
  mood: Mood;
  name?: string;
}) {
  const t = useTranslations("home");
  const routine = routineNow(routines);
  // What anyone can ask a clone on its first day, until it has read enough to suggest its own.
  const starters = [t("starter.know"), t("starter.today"), t("starter.flow")];
  const offers = tasks.length
    ? tasks.map((task) => ({ label: task.label, why: task.why }))
    : starters.map((label) => ({ label, why: "" }));
  return (
    <div className="flex min-h-full flex-col justify-end gap-6 pb-2">
      <div className="flex flex-col items-start gap-3">
        <Bot size={52} mood={mood} label={t("yourClone")} />
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight text-balance">
            {name ? t("helloName", { name }) : t("hello")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("helloBody")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
          {tasks.length ? t("suggested") : t("tryAsking")}
        </span>
        {routine && (
          <button
            type="button"
            disabled={chat.busy}
            onClick={() => void chat.ask(routine.label)}
            className="group flex items-start gap-2.5 rounded-xl border border-waiting/30 bg-waiting/5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-waiting/10 disabled:opacity-50"
          >
            <Clock className="mt-0.5 size-4 shrink-0 text-waiting" />
            <span className="min-w-0">
              <span className="block font-medium">{routine.label}</span>
              <span className="block text-xs text-muted-foreground">
                {t("routineHint")}
              </span>
            </span>
          </button>
        )}
        {offers.map((offer) => (
          <button
            key={offer.label}
            type="button"
            disabled={chat.busy}
            onClick={() => void chat.ask(offer.label)}
            className="group flex items-start gap-2.5 rounded-xl border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            <span className="min-w-0">
              <span className="block">{offer.label}</span>
              {offer.why && (
                <span className="block text-xs text-muted-foreground">
                  {offer.why}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TurnRow({ turn, chat }: { turn: Turn; chat: Chat }) {
  const t = useTranslations("home");
  const tChat = useTranslations("chat");
  const problemText = useProblem();
  const format = useFormatter();
  switch (turn.kind) {
    case "me":
      return (
        <li className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-muted px-3.5 py-2 text-[14.5px] leading-relaxed whitespace-pre-wrap wrap-break-word">
            {turn.text}
          </p>
        </li>
      );
    case "minime":
      // While a question waits for the person, the clone is not thinking: no empty line.
      if (turn.live && !turn.text && chat.asking) return null;
      return (
        <li className="min-w-0 text-[14.5px] leading-relaxed">
          {turn.text ? (
            <Markdown>{turn.text}</Markdown>
          ) : (
            <ShinyText text={t("thinking")} />
          )}
        </li>
      );
    case "ask":
      return (
        <li className="flex flex-col">
          <AskCard
            turn={turn}
            onAnswer={(answer, always) =>
              void chat.answer(turn.id, turn.gate, answer, always)
            }
          />
        </li>
      );
    case "office":
    case "told":
      return (
        <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-background px-3.5 py-3 text-[14.5px]">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {turn.kind === "office" ? (
              <Users className="size-3.5" />
            ) : (
              <CornerDownRight className="size-3.5" />
            )}
            {turn.kind === "office" ? tChat("fromColleague") : tChat("told")}
          </span>
          <span className="whitespace-pre-wrap wrap-break-word">
            {turn.text}
          </span>
        </li>
      );
    case "flow":
      return (
        <li className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          {tChat("flowRan", {
            name: turn.text,
            at: format.dateTime(new Date(turn.at), {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            }),
          })}
        </li>
      );
    case "note":
      return (
        <li className="text-center text-xs text-muted-foreground">
          {turn.text}
        </li>
      );
    case "saved":
      return (
        <li className="flex">
          <span className="flex max-w-full items-start gap-1.5 rounded-lg bg-muted/70 px-2.5 py-1.5 text-xs text-muted-foreground">
            <BookmarkCheck className="mt-px size-3.5 shrink-0 text-foreground" />
            <span className="min-w-0">
              <span className="font-medium text-foreground">{t("kept")}</span>{" "}
              {turn.text}
            </span>
          </span>
        </li>
      );
    default:
      // Errors are kept as their codes and read in the screen's language.
      return (
        <li className="flex items-start gap-2 rounded-xl bg-destructive/8 px-3.5 py-2.5 text-sm text-destructive dark:bg-destructive/15">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0">{problemText(turn.text)}</span>
        </li>
      );
  }
}

/** The box the person writes to their clone in: Enter sends, Shift+Enter starts a new line. */
export function Composer({
  chat,
  placeholder,
  draftRef,
  className,
}: {
  chat: Chat;
  placeholder: string;
  draftRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}) {
  const t = useTranslations("home");
  const [draft, setDraft] = useState("");
  const send = () => {
    const text = draft.trim();
    if (!text || chat.busy) return;
    setDraft("");
    void chat.ask(text);
  };
  return (
    <form
      className={cn("shrink-0 px-3 pt-1 pb-3", className)}
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      <div className="flex items-end gap-2 rounded-2xl bg-background px-3.5 py-2 shadow-[0_0_0_1px_var(--alpha-12),0_6px_20px_var(--alpha-05)] transition-shadow focus-within:shadow-[0_0_0_1px_var(--alpha-20),0_6px_20px_var(--alpha-08)]">
        <textarea
          ref={draftRef}
          value={draft}
          rows={1}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (composing(event)) return;
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
            // With words in the box, Esc only leaves the box; the panel (and the words) stay.
            if (event.key === "Escape" && draft.trim()) {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          className="field-sizing-content max-h-40 min-h-6 flex-1 resize-none bg-transparent py-1 text-[14.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
        />
        <Button
          type="submit"
          size="icon-sm"
          aria-label={t("send")}
          disabled={!draft.trim() || chat.busy}
          loading={chat.busy}
          className="mb-0.5 shrink-0"
        >
          <ArrowUp />
        </Button>
      </div>
    </form>
  );
}
