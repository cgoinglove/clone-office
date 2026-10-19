"use client";

// Stepping into a request a colleague sent, after Thursday's step-in: one box, two ways (10-19
// redesign). "Tell my clone" is read before its next step (and answers a question it waits on;
// it can be taken back until then); "Answer it yourself" goes to the colleague as the person's own
// words, and the request is theirs from then on until they hand it back. Taking it over and handing
// it back live in the page's menu (`request-screen.tsx`), not as more buttons here.

import {
  ArrowUp,
  Check,
  CornerDownRight,
  Loader2,
  MessageSquare,
  PenLine,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Steps } from "../home/use-office";
import { useApp } from "./app-state";

export type StepMode = "tell" | "self";

export function StepIn({
  task,
  name,
  steps,
  closed = false,
  mode: start = "tell",
}: {
  task: string;
  /** The colleague who asked. */
  name: string;
  steps?: Steps;
  /** The request is over: what the person said to their clone stays to read, nothing to send. */
  closed?: boolean;
  /** Which way the box opens: a link that said "answer it yourself" opens it on that. */
  mode?: StepMode;
}) {
  const t = useTranslations("shell.stepIn");
  const { office } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // While the person answers it, everything they write is their own answer.
  const yours = Boolean(steps?.person);
  const [mode, setMode] = useState<StepMode>(yours ? "self" : start);
  const [keepOpen, setKeepOpen] = useState(yours);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (start !== "self") return;
    setMode("self");
    box.current?.focus();
  }, [start]);
  // taken over (from the page's menu, or elsewhere): their words are their own answer, and the
  // request stays open for the next, as it does when the page opens on it;
  // handed back to the clone: what they write is for their clone again, and nothing stays theirs
  const wasYours = useRef(yours);
  useEffect(() => {
    if (yours) {
      setMode("self");
      setKeepOpen(true);
    } else if (wasYours.current) {
      setMode("tell");
      setKeepOpen(false);
    }
    wasYours.current = yours;
  }, [yours]);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (await office.post({ ...body, id: task })) setText("");
    } finally {
      setBusy(false);
    }
  };
  const words = text.trim();
  const send = () => {
    if (!words || busy) return;
    if (mode === "tell") void post({ action: "step-in", text: words });
    else void post({ action: "answer-myself", text: words, close: !keepOpen });
  };

  return (
    <section aria-label={t("title")} className="flex flex-col gap-2.5">
      {(steps?.notes ?? []).length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {(steps?.notes ?? []).map((note) => (
            <li
              key={note.id}
              className="flex items-start gap-2 text-[13.5px] text-muted-foreground"
            >
              <CornerDownRight className="mt-0.5 size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 wrap-break-word text-foreground">
                {note.text}
              </span>
              {note.read ? (
                <span className="flex shrink-0 items-center gap-1 text-xs">
                  <Check className="size-3.5" />
                  {t("read")}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-xs">
                  <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" />
                  {t("waits")}
                  <Tip label={t("takeBack")}>
                    <button
                      type="button"
                      onClick={() =>
                        void post({ action: "take-back", note: note.id })
                      }
                      className="rounded-md p-0.5 hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </Tip>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {closed ? null : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
          data-ask-box
          className="flex flex-col gap-2 rounded-[18px] bg-background px-4 pt-3 pb-2.5 shadow-[0_0_0_1px_var(--field)] transition-shadow focus-within:shadow-[0_0_0_1px_var(--field),0_0_0_4px_var(--alpha-05)]"
        >
          {yours && (
            <p className="text-[12.5px] text-muted-foreground">{t("yours")}</p>
          )}
          <textarea
            ref={box}
            value={text}
            rows={2}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={
              mode === "self"
                ? t("yoursPlaceholder", { name })
                : t("placeholder")
            }
            aria-label={mode === "self" ? t("answer") : t("tellLabel")}
            className="field-sizing-content max-h-48 min-h-11 resize-none bg-transparent text-[14.5px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            {yours ? null : (
              <Segmented<StepMode>
                size="sm"
                aria-label={t("way")}
                options={[
                  {
                    value: "tell",
                    label: (
                      <>
                        <MessageSquare className="size-3.5" />
                        {t("tell")}
                      </>
                    ),
                  },
                  {
                    value: "self",
                    label: (
                      <>
                        <PenLine className="size-3.5" />
                        {t("answer")}
                      </>
                    ),
                  },
                ]}
                value={mode}
                onChange={setMode}
              />
            )}
            {mode === "self" && (
              <label className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={keepOpen}
                  onChange={(event) => setKeepOpen(event.target.checked)}
                  className="size-3.5 accent-[var(--foreground)]"
                />
                {t("keepOpen")}
              </label>
            )}
            <Tip label={mode === "self" ? t("sendSelf", { name }) : t("tell")}>
              <Button
                type="submit"
                size="icon"
                disabled={!words || busy}
                loading={busy}
                className={cn("ml-auto size-8.5 rounded-full")}
              >
                <ArrowUp className="size-4" />
              </Button>
            </Tip>
          </div>
        </form>
      )}
    </section>
  );
}
