"use client";

// Stepping into a request a colleague sent, after Thursday's step-in: the person tells their clone
// something about it, which the clone reads before its next step (and which they can take back
// until then), or answers it themselves, as themselves. While they answer it, their clone leaves it
// to them; handing it back lets the clone go on from what was said.

import { Check, CornerDownRight, Loader2, Undo2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Steps } from "../home/use-office";
import { useApp } from "./app-state";

export function StepIn({
  task,
  name,
  steps,
}: {
  task: string;
  /** The colleague who asked. */
  name: string;
  steps?: Steps;
}) {
  const t = useTranslations("shell.stepIn");
  const { office } = useApp();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const yours = Boolean(steps?.person);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      if (await office.post({ ...body, id: task })) setText("");
    } finally {
      setBusy(false);
    }
  };
  const words = text.trim();

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
                  <button
                    type="button"
                    aria-label={t("takeBack")}
                    title={t("takeBack")}
                    onClick={() =>
                      void post({ action: "take-back", note: note.id })
                    }
                    className="rounded-md p-0.5 hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {yours && (
        <p className="text-[13px] text-muted-foreground">{t("yours")}</p>
      )}
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={yours ? t("yoursPlaceholder", { name }) : t("placeholder")}
        aria-label={yours ? t("answer") : t("title")}
        rows={2}
      />
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {yours ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void post({ action: "hand-back" })}
              className="mr-auto"
            >
              <Undo2 />
              {t("handBack")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!words || busy}
              onClick={() =>
                void post({
                  action: "answer-myself",
                  text: words,
                  close: false,
                })
              }
            >
              {t("sendOpen")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="brand"
              disabled={!words || busy}
              loading={busy}
              onClick={() =>
                void post({ action: "answer-myself", text: words, close: true })
              }
            >
              {t("sendClose")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!words || busy}
              onClick={() =>
                void post({ action: "answer-myself", text: words, close: true })
              }
            >
              {t("answer")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="brand"
              disabled={!words || busy}
              loading={busy}
              onClick={() => void post({ action: "step-in", text: words })}
            >
              {t("tell")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
