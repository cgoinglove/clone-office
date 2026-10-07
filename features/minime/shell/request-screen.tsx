"use client";

// One request between two clones, on its own page: what was asked and every answer, the files that
// went with it, and, when the person's turn has come, the question waiting on them in place (the
// answer their clone drafted, a promise only they can make, a permission). Beside it: who it is
// with, what they take, and how far it has come.

import { ChevronLeft, Copy, FileText, Link2, Send } from "lucide-react";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { Bot } from "@/features/office";
import { AskCard } from "../ask-card";
import { saveFile, statusText } from "../home/use-office";
import { statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { Mark, PhaseChip, phaseOf, StatusDot } from "./parts";
import { askedText } from "./requests-screen";
import { taskOf } from "./your-turn";

export function RequestScreen({ id }: { id: string }) {
  const t = useTranslations("shell.request");
  const tOffice = useTranslations("office");
  const format = useFormatter();
  const app = useApp();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const task = data?.tasks?.find((entry) => entry.id === id);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);

  if (!data)
    return (
      <div className="grid h-full place-items-center">
        <ShinyText text={t("loading")} />
      </div>
    );
  if (!task)
    return (
      <div className="grid h-full place-items-center px-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">{t("gone")}</p>
          <Link
            href="/requests"
            className="text-sm font-medium underline underline-offset-4"
          >
            {t("back")}
          </Link>
        </div>
      </div>
    );

  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  const index = Math.max(
    0,
    members.findIndex((member) => member.id === other),
  );
  const member = members.find((entry) => entry.id === other);
  const name =
    office.names.get(other) ??
    (task.metadata.guest
      ? tOffice("byLink", { name: task.metadata.guest })
      : other);
  const waiting = office.waiting.filter((entry) => taskOf(entry) === task.id);
  const phase = phaseOf(task.status.state, waiting.length > 0);
  const files = task.history.flatMap((message) => message.files ?? []);
  const link =
    data.relay && task.metadata.link
      ? new URL(task.metadata.link, data.relay).toString()
      : undefined;
  const moving = ["SUBMITTED", "WORKING", "INPUT_REQUIRED"].includes(
    task.status.state,
  );
  const time = (iso: string) =>
    format.dateTime(new Date(iso), {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex flex-col gap-2 border-b border-border/60 px-8 pt-5 pb-5">
          <Link
            href="/requests"
            className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            {t("back")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="min-w-0 text-xl font-semibold tracking-tight text-balance">
              {askedText(task)}
            </h1>
            <PhaseChip
              phase={phase}
              failed={["FAILED", "REJECTED", "CANCELED"].includes(
                task.status.state,
              )}
            />
          </div>
          <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
            {sent ? t("sentTo", { name }) : t("from", { name })}
            <span aria-hidden>·</span>
            {time(task.metadata.created)}
          </p>
        </header>

        <div className="mx-auto flex w-full max-w-180 flex-col gap-6 px-8 py-7">
          <ol className="flex flex-col gap-6">
            {task.history.map((message, at) => {
              const author =
                message.role === "user" ? task.metadata.from : task.metadata.to;
              const mine = author === me;
              return (
                <li key={at} className="flex gap-3">
                  {mine ? (
                    <Bot size={28} mood="idle" still className="shrink-0" />
                  ) : (
                    <Mark
                      id={author}
                      index={Math.max(
                        0,
                        members.findIndex((entry) => entry.id === author),
                      )}
                      size={28}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="text-[13px] font-semibold">
                      {mine
                        ? t("myClone")
                        : t("theirClone", {
                            name: office.names.get(author) ?? name,
                          })}
                    </p>
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word">
                      {message.parts.map((part) => part.text).join("\n")}
                    </p>
                    {(message.files ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {(message.files ?? []).map((file) => (
                          <button
                            key={file.id}
                            type="button"
                            onClick={() => void saveFile(task.id, file)}
                            className="flex h-7 items-center gap-1.5 rounded-md bg-muted/60 px-2.5 text-[12.5px] shadow-[inset_0_0_0_1px_var(--alpha-08)] transition-colors hover:bg-muted"
                          >
                            <FileText className="size-3.5" />
                            {file.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>

          {moving && waiting.length === 0 && (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <span
                aria-hidden
                className="size-1.5 animate-pulse rounded-full bg-brand motion-reduce:animate-none"
              />
              {sent ? t("theyWork", { name }) : t("cloneWorks")}
            </p>
          )}

          {waiting.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-waiting">
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-waiting"
                />
                {t("yourTurn")}
              </p>
              <AskCard
                turn={{
                  id: 0,
                  gate: entry.id,
                  ask: entry.ask,
                  state: office.answered[entry.id] ? "done" : "open",
                  answer: office.answered[entry.id],
                }}
                onAnswer={(answer, always) =>
                  void office.answer(entry, answer, always)
                }
              />
            </div>
          ))}

          {sent && moving && (
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const text = reply.trim();
                if (!text) return;
                if (await office.post({ action: "reply", id: task.id, text }))
                  setReply("");
              }}
              className="flex flex-col gap-2"
            >
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder={t("addPlaceholder", { name })}
                aria-label={t("add")}
                rows={2}
              />
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={!reply.trim() || office.busy}
                className="self-end"
              >
                <Send />
                {t("add")}
              </Button>
            </form>
          )}
        </div>
      </section>

      <aside
        aria-label={t("about")}
        className="flex w-[300px] shrink-0 flex-col gap-6 overflow-y-auto border-l border-border/60 bg-muted/25 px-5 pt-6 pb-6 max-[1100px]:hidden"
      >
        <section className="flex flex-col gap-2.5">
          <h2 className="text-xs font-semibold text-muted-foreground">
            {sent ? t("to") : t("fromLabel")}
          </h2>
          <div className="flex items-center gap-3">
            {task.metadata.guest ? (
              <span className="grid size-8 place-items-center rounded-full bg-muted">
                <Link2 className="size-4" />
              </span>
            ) : (
              <Mark id={other} index={index} size={32} />
            )}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              {member && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <StatusDot
                    status={statusCode(member.card.status) ?? "working"}
                  />
                  {statusText(tOffice, member.card.status)}
                </span>
              )}
            </div>
          </div>
          {member?.card.description && (
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              {member.card.description}
            </p>
          )}
          {(member?.card.skills ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground">
                {t("takes", { name })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {member?.card.skills?.map((skill) => (
                  <span
                    key={skill.id}
                    className="rounded-md bg-muted px-2 py-0.5 text-xs text-foreground/85"
                  >
                    {skill.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground">
            {t("state")}
          </h2>
          <p className="text-sm">{tOffice(`state.${task.status.state}`)}</p>
          <p className="text-xs text-muted-foreground">
            {t("updated", { at: time(task.status.timestamp) })}
          </p>
        </section>

        {files.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground">
              {t("files")}
            </h2>
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                onClick={() => void saveFile(task.id, file)}
                className="flex items-center gap-2 text-left text-[13px] hover:underline"
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
              </button>
            ))}
          </section>
        )}

        {link && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground">
              {t("link")}
            </h2>
            <Button
              size="sm"
              variant="outline"
              className="self-start"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(link)
                  .then(() => setCopied(true))
                  .catch(() => {});
              }}
            >
              <Copy />
              {copied ? tOffice("copied") : tOffice("copyLink")}
            </Button>
          </section>
        )}
      </aside>
    </div>
  );
}
