"use client";

// One request between two clones, on its own page: what was asked and every answer, the files that
// went with it, and, when the person's turn has come, the question waiting on them as the same card
// Home shows (`TurnRows`; a permission or a rule as its own card). Under it one box tells the clone
// something or answers the colleague as the person (`StepIn`); taking the request over or handing
// it back is in the menu. Beside it: who it is with and what they look after, why it came to the
// person (the kind of request and how much the clone does alone for it), and how it went.
// An answer here is a call in the person's name, as on Home: it stays in place, saying what goes,
// with Undo, and goes when that runs out or the page goes.

import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Ellipsis,
  FileText,
  Hand,
  Link2,
  Send,
  Undo2,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { Tip } from "@/components/ui/tooltip";
import { Bot } from "@/features/office";
import { useUndoableRemoval } from "@/hooks/use-undoable-removal";
import { clip, cn } from "@/lib/utils";
import { AskCard } from "../ask-card";
import { saveFile, statusText, type Waiting } from "../home/use-office";
import { statusCode } from "../office/room-data";
import { useApp } from "./app-state";
import { Mark, PhaseChip, phaseOf, StatusDot, useWhen } from "./parts";
import { askedText } from "./requests-screen";
import { StepIn } from "./step-in";
import { ANSWER_CHARS, PendingAnswer, SETTLE_MS, TurnRows } from "./turn-rows";
import { type TurnItem, taskOf, turnKey } from "./your-turn";

export function RequestScreen({ id }: { id: string }) {
  const t = useTranslations("shell.request");
  const tOffice = useTranslations("office");
  const tTurn = useTranslations("shell.office");
  const tAsk = useTranslations("ask");
  const tStep = useTranslations("shell.stepIn");
  const undo = useTranslations("common")("undo");
  const when = useWhen();
  const params = useSearchParams();
  const app = useApp();
  const { office } = app;
  const data = office.office;
  const me = data?.me?.id;
  const members = data?.members ?? [];
  const task = data?.tasks?.find((entry) => entry.id === id);
  const [reply, setReply] = useState("");
  const [copied, setCopied] = useState(false);
  // Answers chosen and waiting out their Undo, by question, and when the last one was chosen.
  const sending = useUndoableRemoval(undo);
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const chosenAt = useRef(0);

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
  const index = office.indexOf(other);
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
  const choose = (entry: Waiting, answer: string, always: boolean) => {
    if (performance.now() - chosenAt.current < SETTLE_MS) return;
    chosenAt.current = performance.now();
    const key = turnKey(entry);
    const shown =
      entry.ask.kind === "permission"
        ? tAsk(answer === "allow" ? "allow" : "deny")
        : answer;
    setChosen((all) => ({ ...all, [key]: answer }));
    app.markAnswering(key, true);
    // The card shrinks to one line: what stood below it keeps its place for a moment, so a
    // second tap lands nowhere new (as Home's rows ignore one).
    const block = document.getElementById(`answer-${entry.id}`);
    if (block) {
      block.style.minHeight = `${block.offsetHeight}px`;
      setTimeout(() => {
        block.style.minHeight = "";
      }, SETTLE_MS);
    }
    sending.remove(
      key,
      tTurn("answerFor", { name, choice: clip(shown, ANSWER_CHARS) }),
      {
        commit: async () => {
          const here =
            !!document
              .getElementById(`answer-${entry.id}`)
              ?.contains(document.activeElement) ||
            document.activeElement === document.body;
          await office.answer(entry, answer, always);
          app.markAnswering(key, false);
          app.announce(
            tTurn("sentFor", { name, choice: clip(shown, ANSWER_CHARS) }),
          );
          // where the request stands now, else its title
          if (here)
            requestAnimationFrame(() =>
              (
                document.getElementById("request-state") ??
                document.getElementById("request-title")
              )?.focus(),
            );
          return true;
        },
        undo: () => {
          app.markAnswering(key, false);
          app.announce(tTurn("undone"));
          // back on what was chosen (a choice, or the words written), when the keyboard was here
          const block = document.getElementById(`answer-${entry.id}`);
          if (block?.contains(document.activeElement))
            requestAnimationFrame(() => {
              const again = [
                ...block.querySelectorAll<HTMLElement>("button, textarea"),
              ];
              (
                again.find((one) => one.textContent === shown) ??
                again.find((one) => one.tagName === "TEXTAREA")
              )?.focus();
            });
        },
      },
    );
    // the keyboard stays with this question, on its Undo
    requestAnimationFrame(() =>
      document
        .getElementById(`answer-${entry.id}`)
        ?.querySelector<HTMLElement>("[data-undo]")
        ?.focus(),
    );
  };
  // a question waits as the same card Home shows; a permission or a rule keeps its own card
  const cards: TurnItem[] = waiting
    .filter((entry) => !entry.self && entry.ask.kind === "question")
    .map((entry) => ({
      key: turnKey(entry),
      ask: entry.ask,
      where: { kind: "request", task: task.id },
      from: sent ? undefined : task.metadata.from,
      waiting: entry,
      since: entry.at ?? task.status.timestamp,
    }));
  const others = waiting.filter(
    (entry) => entry.self || entry.ask.kind !== "question",
  );
  // why it came to the person: the kind of request the clone named, and how much it does alone for it
  const kindId = waiting.find((entry) => entry.menu)?.menu;
  const kind = kindId
    ? data.menu?.find((item) => (item.id ?? item.name) === kindId)
    : undefined;
  const steps = data.steps?.[task.id];
  const theirs = Boolean(steps?.person);
  const canStep = !sent && !task.metadata.guest;

  return (
    <div className="flex h-full min-h-0">
      <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/60 px-6">
          <Link
            href="/requests"
            className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            {t("back")}
          </Link>
          {canStep && moving && (
            <DropdownMenu>
              <Tip label={t("more")}>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      className={cn(
                        buttonVariants({ variant: "ghost", size: "icon" }),
                        "ml-auto text-muted-foreground",
                      )}
                    />
                  }
                >
                  <Ellipsis className="size-4" />
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="w-56">
                {theirs ? (
                  <DropdownMenuItem
                    onClick={() =>
                      void office.post({ action: "hand-back", id: task.id })
                    }
                  >
                    <Undo2 className="text-muted-foreground" />
                    {tStep("handBack")}
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() =>
                      void office.post({ action: "take-over", id: task.id })
                    }
                  >
                    <Hand className="text-muted-foreground" />
                    {tStep("takeOver")}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-5 px-8 pt-7">
          <div className="flex flex-col gap-2">
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              {task.metadata.guest ? (
                <Link2 className="size-4" />
              ) : (
                <Mark id={other} index={index} size={20} />
              )}
              {sent ? t("sentTo", { name }) : t("from", { name })}
              <span aria-hidden>·</span>
              {when(task.metadata.created)}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1
                id="request-title"
                tabIndex={-1}
                className="-mx-1 min-w-0 rounded-sm px-1 text-[22px] leading-snug font-semibold tracking-[-0.02em] text-balance outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                {askedText(task)}
              </h1>
              {phase !== "yours" && (
                <PhaseChip
                  phase={phase}
                  failed={["FAILED", "REJECTED", "CANCELED"].includes(
                    task.status.state,
                  )}
                />
              )}
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[44rem] flex-col gap-6 px-8 pt-6 pb-8">
          <ol className="flex flex-col gap-5">
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
                      index={office.indexOf(author)}
                      size={28}
                    />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="flex items-baseline gap-2 text-[13px] font-semibold">
                      {message.metadata?.by === "person"
                        ? mine
                          ? t("myself")
                          : t("themselves", {
                              name: office.names.get(author) ?? name,
                            })
                        : mine
                          ? t("myClone")
                          : t("theirClone", {
                              name: office.names.get(author) ?? name,
                            })}
                      {message.metadata?.at && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {when(message.metadata.at)}
                        </span>
                      )}
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

          {cards.length > 0 && (
            <section
              aria-labelledby="request-decide"
              className="flex flex-col gap-2"
            >
              <h2
                id="request-decide"
                tabIndex={-1}
                className="flex items-center gap-2 text-[13px] font-semibold outline-none"
              >
                <span
                  aria-hidden
                  className="size-1.5 rounded-full bg-waiting"
                />
                {t("yourTurn")}
              </h2>
              <TurnRows turns={cards} heading="request-decide" />
              <p className="px-1 text-xs text-muted-foreground">
                {t("decideNote", { name })}
              </p>
            </section>
          )}

          {others.map((entry) => {
            const key = turnKey(entry);
            const label =
              entry.ask.kind === "permission"
                ? tAsk(chosen[key] === "allow" ? "allow" : "deny")
                : (chosen[key] ?? "");
            return (
              <div
                key={entry.id}
                id={`answer-${entry.id}`}
                className="flex flex-col gap-2"
              >
                <p className="flex items-center gap-2 text-[13px] font-semibold text-waiting-ink">
                  <span
                    aria-hidden
                    className="size-1.5 rounded-full bg-waiting"
                  />
                  {entry.self ? t("selfWaiting", { name }) : t("yourTurn")}
                </p>
                {/* Theirs to answer: the box below is where they write as themselves. The card
                    stays, hidden while its answer waits, so Undo gives back what was written */}
                {!entry.self && sending.hidden.has(key) && (
                  <PendingAnswer
                    choice={label}
                    hold={() => sending.hold(key, "row-pointer")}
                    release={() => sending.release(key, "row-pointer")}
                    onUndo={() => {
                      // a second press just after the answer is a bounce
                      if (performance.now() - chosenAt.current < SETTLE_MS)
                        return;
                      sending.undo(key);
                    }}
                  />
                )}
                {!entry.self && (
                  <div hidden={sending.hidden.has(key)}>
                    <AskCard
                      turn={{
                        id: 0,
                        gate: entry.id,
                        ask: entry.ask,
                        state: "open",
                      }}
                      onAnswer={(answer, always) =>
                        choose(entry, answer, always)
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}

          {canStep && (moving || Boolean(steps?.notes.length)) && (
            <StepIn
              task={task.id}
              name={name}
              steps={steps}
              closed={!moving}
              mode={params.get("answer") === "own" ? "self" : "tell"}
            />
          )}

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
                variant="secondary"
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
        className="flex w-[320px] shrink-0 flex-col gap-8 overflow-y-auto border-l border-border/60 px-6 pt-7 pb-6 max-[1100px]:hidden"
      >
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground">
            {sent ? t("to") : t("fromLabel")}
          </h2>
          <div className="flex items-center gap-3">
            {task.metadata.guest ? (
              <span className="grid size-10 place-items-center rounded-full bg-muted">
                <Link2 className="size-4" />
              </span>
            ) : (
              <Mark id={other} index={index} size={40} />
            )}
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{name}</span>
              {member && (
                <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  {member.card.description && (
                    <span className="truncate">{member.card.description}</span>
                  )}
                  {member.card.description && <span aria-hidden>·</span>}
                  <StatusDot
                    status={statusCode(member.card.status) ?? "working"}
                  />
                  <span className="shrink-0">
                    {statusText(tOffice, member.card.status)}
                  </span>
                </span>
              )}
            </div>
          </div>
          {(member?.card.owns ?? []).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {member?.card.owns?.map((item) => (
                <span
                  key={item}
                  className="inline-flex h-[22px] items-center rounded-full bg-muted px-2 text-xs font-medium text-foreground/80"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          {member && !sent && (
            <Link
              href={`/requests?ask=${encodeURIComponent(member.id)}`}
              className={cn(
                buttonVariants({ variant: "secondary", size: "sm" }),
                "w-fit rounded-full",
              )}
            >
              <Send />
              {t("askThem", { name })}
            </Link>
          )}
        </section>

        {kind && (
          <section className="flex flex-col gap-2">
            <h2 className="text-xs font-semibold text-muted-foreground">
              {t("why")}
            </h2>
            <p className="text-[13.5px] leading-relaxed">
              {t.rich("whyKind", {
                kind: kind.name,
                trust: tOffice(`menu.trust.${kind.trust}`),
                b: (chunk) => <b className="font-semibold">{chunk}</b>,
              })}
            </p>
            <Link
              href="/clone?tab=menu"
              className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("menuLink")}
              <ChevronRight className="size-3.5" />
            </Link>
          </section>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold text-muted-foreground">
            {t("state")}
          </h2>
          <ol className="flex flex-col gap-2.5 text-[13px]">
            {task.history.map((message, at) => {
              const author =
                message.role === "user" ? task.metadata.from : task.metadata.to;
              const who =
                author === me
                  ? message.metadata?.by === "person"
                    ? t("myself")
                    : t("myClone")
                  : message.metadata?.by === "person"
                    ? t("themselves", {
                        name: office.names.get(author) ?? name,
                      })
                    : t("theirClone", {
                        name: office.names.get(author) ?? name,
                      });
              return (
                <li key={at} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className="size-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {t(
                      at === 0
                        ? "stepAsked"
                        : message.role === "user"
                          ? "stepAdded"
                          : "stepAnswered",
                    )}
                    <span className="text-muted-foreground"> · {who}</span>
                  </span>
                  {message.metadata?.at && (
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {when(message.metadata.at)}
                    </span>
                  )}
                </li>
              );
            })}
            {(cards.length > 0 || moving) && (
              <li
                id="request-state"
                tabIndex={-1}
                className="flex items-center gap-2.5 font-semibold outline-none"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    cards.length
                      ? "bg-waiting"
                      : "animate-pulse bg-brand motion-reduce:animate-none",
                  )}
                />
                <span className="min-w-0 flex-1">
                  {cards.length
                    ? t("stepYours")
                    : sent
                      ? t("theyWork", { name })
                      : task.status.state === "INPUT_REQUIRED"
                        ? t("waitsFor", { name })
                        : t("cloneWorks")}
                </span>
                <span className="shrink-0 text-xs font-normal text-muted-foreground">
                  {t("now")}
                </span>
              </li>
            )}
          </ol>
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
              variant="secondary"
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
