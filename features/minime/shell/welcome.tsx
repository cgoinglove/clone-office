"use client";

// What an empty conversation shows: the clone says hello and what it is for, the first steps with
// the app (each ticked when it is really done, from what the app keeps, never from a click on the
// list), and a few things to say to it. Someone who opens the app should never wonder what to do.

import { ArrowRight, Check, Clock, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Bot } from "@/features/office";
import { cn } from "@/lib/utils";
import { HEADERS } from "../home/use-office";
import { routineNow } from "../routine";
import { useApp } from "./app-state";

const HIDDEN = "sub-office.first-steps-hidden";

type StepId = "ask" | "me" | "team" | "menu" | "phone";

export function Welcome({
  onWrite,
}: {
  /** Goes to the box to write, with words to start from when given. */
  onWrite: (text?: string) => void;
}) {
  const t = useTranslations("shell.welcome");
  const tHome = useTranslations("home");
  const app = useApp();
  const { chat } = app;
  const starters = [
    t("starter.today"),
    t("starter.help"),
    t("starter.know"),
    t("starter.flow"),
  ];
  const offers = app.learn.tasks.length
    ? app.learn.tasks.map((task) => ({ label: task.label, why: task.why }))
    : starters.map((label) => ({ label, why: "" }));
  // What the person usually does about now, when the clone has seen a habit.
  const now = routineNow(app.learn.routines);

  return (
    <div className="flex min-h-full flex-col justify-center gap-8 py-6">
      <div className="flex flex-col items-start gap-4">
        <Bot size={56} mood={app.mood} label={tHome("yourClone")} />
        <div className="flex flex-col gap-2">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">
            {app.name ? t("helloName", { name: app.name }) : t("hello")}
          </h1>
          <p className="max-w-[56ch] text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {t("body")}
          </p>
        </div>
      </div>

      <FirstSteps onWrite={onWrite} />

      <section aria-labelledby="w-try" className="flex flex-col gap-2">
        <h2 id="w-try" className="text-sm font-semibold">
          {app.learn.tasks.length ? t("suggested") : t("tryAsking")}
        </h2>
        <div className="flex flex-col gap-2">
          {now && (
            <button
              type="button"
              disabled={chat.busy}
              onClick={() => void chat.ask(now.label)}
              className="flex items-center gap-3 rounded-xl bg-waiting/5 px-4 py-3 text-left text-sm shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--waiting)_30%,transparent)] transition-colors hover:bg-waiting/10 disabled:opacity-50"
            >
              <Clock className="size-4 shrink-0 text-waiting" />
              <span className="min-w-0 flex-1">{now.label}</span>
              <span className="text-xs text-muted-foreground">
                {tHome("routineHint")}
              </span>
            </button>
          )}
          {offers.map((offer) => (
            <button
              key={offer.label}
              type="button"
              disabled={chat.busy}
              onClick={() => void chat.ask(offer.label)}
              className="group flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm shadow-[inset_0_0_0_1px_var(--alpha-10)] transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              <Sparkles className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              <span className="min-w-0 flex-1">{offer.label}</span>
              {offer.why && (
                <span className="max-w-[40%] truncate text-xs text-muted-foreground">
                  {offer.why}
                </span>
              )}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/**
 * The first steps with the app, after the getting-started lists of Linear and Notion: each says
 * why it matters and has one way to do it, and is ticked from what the app keeps.
 */
function FirstSteps({ onWrite }: { onWrite: (text?: string) => void }) {
  const t = useTranslations("shell.welcome.steps");
  const app = useApp();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN) === "1");
    } catch {
      setHidden(false);
    }
  }, []);
  const [facts, setFacts] = useState<{ me: boolean; phone: boolean } | null>(
    null,
  );
  useEffect(() => {
    let live = true;
    void Promise.all([
      fetch("/api/me/memory", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => null),
      fetch("/api/me/messenger", { headers: HEADERS })
        .then((r) => r.json())
        .catch(() => null),
    ]).then(([memory, phone]) => {
      if (!live) return;
      setFacts({
        me: Boolean(memory?.user?.length),
        phone: Boolean(phone?.owner),
      });
    });
    return () => {
      live = false;
    };
  }, []);

  const data = app.office.office;
  const done: Record<StepId, boolean> = {
    ask: app.chat.chats.length > 0,
    me: Boolean(facts?.me),
    team:
      (data?.members?.length ?? 0) > 1 ||
      (data?.tasks ?? []).some((task) => task.metadata.guest),
    menu: (data?.menu?.length ?? 0) > 0,
    phone: Boolean(facts?.phone),
  };
  const steps: { id: StepId; action: React.ReactNode }[] = [
    {
      id: "ask",
      action: <StepButton onClick={() => onWrite()}>{t("ask.do")}</StepButton>,
    },
    {
      id: "me",
      action: (
        <StepButton onClick={() => onWrite(t("me.starter"))}>
          {t("me.do")}
        </StepButton>
      ),
    },
    {
      id: "team",
      action: (
        <StepButton onClick={() => app.setSettings("office")}>
          {t("team.do")}
        </StepButton>
      ),
    },
    { id: "menu", action: <StepLink href="/clone">{t("menu.do")}</StepLink> },
    {
      id: "phone",
      action: (
        <StepButton onClick={() => app.setSettings("phone")}>
          {t("phone.do")}
        </StepButton>
      ),
    },
  ];
  const count = steps.filter((step) => done[step.id]).length;
  if (hidden || !facts || count === steps.length) return null;
  const next = steps.find((step) => !done[step.id])?.id;

  return (
    <section
      aria-labelledby="w-steps"
      className="flex flex-col gap-1 rounded-[14px] bg-background p-2 shadow-[0_0_0_1px_var(--alpha-10),0_12px_32px_-20px_var(--alpha-20)]"
    >
      <div className="flex items-center gap-3 px-3 pt-2 pb-1">
        <h2 id="w-steps" className="text-sm font-semibold">
          {t("title")}
        </h2>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {count}/{steps.length}
        </span>
        <span
          aria-hidden
          className="relative h-1 w-20 overflow-hidden rounded-full bg-muted"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-foreground transition-[width] duration-500"
            style={{ width: `${(count / steps.length) * 100}%` }}
          />
        </span>
        <button
          type="button"
          aria-label={t("hide")}
          title={t("hide")}
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(HIDDEN, "1");
            } catch {}
          }}
          className="ml-auto grid size-7 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <ol className="flex flex-col">
        {steps.map((step, at) => {
          const ok = done[step.id];
          const current = step.id === next;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 rounded-[10px] px-3 py-2.5",
                current && "bg-muted/50",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums",
                  ok
                    ? "bg-foreground text-background"
                    : current
                      ? "shadow-[inset_0_0_0_1.5px_var(--foreground)]"
                      : "text-muted-foreground shadow-[inset_0_0_0_1px_var(--alpha-20)]",
                )}
              >
                {ok ? <Check className="size-3.5" strokeWidth={3} /> : at + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    "text-sm",
                    ok
                      ? "text-muted-foreground line-through decoration-1"
                      : "font-medium",
                  )}
                >
                  {t(`${step.id}.title`)}
                </span>
                {!ok && (
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    {t(`${step.id}.why`)}
                  </span>
                )}
              </span>
              {!ok && <span className="shrink-0">{step.action}</span>}
              <span className="sr-only">{ok ? t("done") : ""}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--alpha-15)] transition-colors hover:bg-muted"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </button>
  );
}

function StepLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--alpha-15)] transition-colors hover:bg-muted"
    >
      {children}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}
