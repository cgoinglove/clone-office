"use client";

// The office's meetings of the clones on the screens: starting the standup or asking everyone
// (`MeetingStart`), and what is said, round by round, beside the floor where the clones gather
// (`MeetingPanel`). The floor draws the gathering itself (office.mjs); this is the record to read.

import { MessagesSquare, Send, Users, X } from "lucide-react";
import Link from "next/link";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Meeting } from "../home/use-office";
import { currentMeeting } from "../office/room-data";
import { useApp } from "./app-state";
import { Flap, Mark } from "./parts";

/** The meeting the floor shows now, if any, and the office's latest one. */
export function useMeetings(): {
  current?: Meeting;
  latest?: Meeting;
} {
  const data = useApp().office.office;
  return {
    current: data ? (currentMeeting(data) as Meeting | undefined) : undefined,
    latest: data?.meetings?.[0],
  };
}

/** Starting the standup, or one question to everyone, from the office's own header. */
export function MeetingStart({ onStarted }: { onStarted?: () => void }) {
  const t = useTranslations("shell.meeting");
  const locale = useLocale();
  const app = useApp();
  const { current } = useMeetings();
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const on = current?.state === "open";
  const open = async (kind: "standup" | "question", topic?: string) => {
    const ok = await app.office.post({
      action: "meeting",
      kind,
      topic,
      locale,
    });
    if (!ok) return;
    // Starting one is taking part: the server turned it on; the page hears it too.
    if (!app.preferences?.meetings)
      void app.changePreferences({ meetings: true });
    setAsking(false);
    setQuestion("");
    onStarted?.();
  };
  if (asking)
    return (
      <form
        className="flex min-w-0 items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (question.trim()) void open("question", question.trim());
        }}
      >
        <input
          id="meeting-question"
          autoFocus
          value={question}
          maxLength={600}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={t("askPlaceholder")}
          aria-label={t("ask")}
          className="h-8 w-[min(340px,48vw)] min-w-0 rounded-lg bg-background px-3 text-[13px] shadow-[inset_0_0_0_1px_var(--alpha-15)] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--brand)]"
        />
        <Button
          type="submit"
          size="sm"
          variant="brand"
          disabled={!question.trim() || app.office.busy}
        >
          <Send />
          {t("askSend")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={t("close")}
          onClick={() => setAsking(false)}
        >
          <X />
        </Button>
      </form>
    );
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={on || app.office.busy}
        onClick={() => void open("standup")}
      >
        <Users />
        {t("start")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={on || app.office.busy}
        onClick={() => setAsking(true)}
      >
        <MessagesSquare />
        {t("ask")}
      </Button>
    </div>
  );
}

/** What was said in a meeting, round by round, as the clones say it. */
export function MeetingPanel({
  meeting,
  width,
  onClose,
}: {
  meeting: Meeting;
  width: number;
  onClose: () => void;
}) {
  const t = useTranslations("shell.meeting");
  const format = useFormatter();
  const app = useApp();
  const data = app.office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const indexOf = (id: string) =>
    Math.max(
      0,
      members.findIndex((member) => member.id === id),
    );
  const nameOf = (id: string) => app.office.names.get(id) ?? "?";
  const cloneOf = (id: string) =>
    id === me ? t("yours") : t("cloneOf", { name: nameOf(id) });
  const open = meeting.state === "open";
  const byId = new Map(meeting.posts.map((post) => [post.id, post]));
  const asked = meeting.posts.find((post) => post.round === 0);
  const rounds = Array.from(
    { length: open ? meeting.round : meeting.rounds },
    (_, i) => i + 1,
  );
  const label = (round: number) =>
    meeting.kind === "standup"
      ? t(round === 1 ? "roundStandup1" : "roundStandup2")
      : t(round === 1 ? "roundQuestion1" : "roundQuestion2");
  const chat = data?.meetingChats?.[meeting.id];
  const sittingOut =
    open && me && meeting.members.includes(me) && !app.preferences?.meetings;

  return (
    <section
      aria-labelledby="o-meeting"
      style={{ width }}
      className="absolute top-4 left-4 z-10 flex max-h-[calc(100%-5.5rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden rounded-[14px] bg-background/97 shadow-[0_0_0_1px_var(--alpha-08),0_18px_40px_-20px_var(--alpha-20)]"
    >
      <div className="flex items-start gap-2 px-4 pt-3.5 pb-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="o-meeting" className="text-sm font-semibold">
            {t(meeting.kind)}
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              aria-hidden
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                open
                  ? "animate-pulse bg-brand motion-reduce:animate-none"
                  : "bg-muted-foreground/50",
              )}
            />
            {open
              ? t("on", { round: meeting.round, rounds: meeting.rounds })
              : t("over", {
                  time: format.dateTime(
                    new Date(meeting.closed ?? meeting.created),
                    { hour: "2-digit", minute: "2-digit", hourCycle: "h23" },
                  ),
                })}
          </span>
        </div>
        <Flap
          value={`${meeting.round}/${meeting.rounds}`}
          label={t("on", { round: meeting.round, rounds: meeting.rounds })}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={t("close")}
          className="-mr-1.5 grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex flex-col overflow-y-auto pb-1">
        {asked && (
          <div className="flex items-start gap-2.5 border-t border-border/60 px-4 py-3">
            <Mark
              id={asked.from}
              index={indexOf(asked.from)}
              mine={asked.from === me}
              size={22}
              className="mt-0.5 shrink-0"
            />
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">
                {t("asks", { name: nameOf(asked.from) })}
              </span>
              <p className="text-[13.5px] leading-snug font-semibold">
                {asked.text}
              </p>
            </div>
          </div>
        )}
        {rounds.map((round) => {
          const posts = meeting.posts.filter((post) => post.round === round);
          const said = posts.filter((post) => post.text.trim());
          const passed = posts.filter((post) => !post.text.trim());
          const expected = meeting.members.filter(
            (id) =>
              !(
                meeting.kind === "question" &&
                round === 1 &&
                id === meeting.openedBy
              ),
          );
          const waiting =
            open && round === meeting.round
              ? expected.filter((id) => !posts.some((post) => post.from === id))
                  .length
              : 0;
          return (
            <div
              key={round}
              className="flex flex-col border-t border-border/60 px-4 pt-2.5 pb-1"
            >
              <span className="pb-1 font-mono text-[11px] tracking-wide text-muted-foreground">
                {label(round)}
              </span>
              {said.map((post) => {
                const to = post.replyTo ? byId.get(post.replyTo) : undefined;
                return (
                  <div key={post.id} className="flex items-start gap-2.5 py-2">
                    <Mark
                      id={post.from}
                      index={indexOf(post.from)}
                      mine={post.from === me}
                      size={22}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-xs font-semibold">
                        {cloneOf(post.from)}
                        {to && to.from !== post.from && (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            → {t("to", { name: nameOf(to.from) })}
                          </span>
                        )}
                      </span>
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
                        {post.text}
                      </p>
                    </div>
                  </div>
                );
              })}
              {passed.length > 0 && (
                <p className="py-1.5 text-xs text-muted-foreground">
                  {t("passed", {
                    names: passed.map((post) => nameOf(post.from)).join(", "),
                  })}
                </p>
              )}
              {waiting > 0 && (
                <p className="py-1.5 text-xs text-muted-foreground">
                  {said.length === 0 && round === 1
                    ? t("nothingYet")
                    : t("waiting", { count: waiting })}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {(chat || sittingOut) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-3">
          {sittingOut ? (
            <>
              <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                {t("sittingOut")}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void app.changePreferences({ meetings: true })}
              >
                {t("letIn")}
              </Button>
            </>
          ) : (
            chat && (
              <Button
                size="sm"
                variant="brand"
                render={<Link href={`/chat?c=${encodeURIComponent(chat)}`} />}
              >
                {t("back")}
              </Button>
            )
          )}
        </div>
      )}
    </section>
  );
}
