"use client";

// A question from the trust gate, as a card wherever the person is: the mini-me's own question
// (with choices or their own answer), or something it may not do without asking (allow, don't,
// and "don't ask again for this").

import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AskShown, askDetails, changeOf, describe } from "./ask-text";

export { changeOf, describe };

export type GateAsk =
  | { kind: "question"; question: string; choices?: string[] }
  | ({
      kind: "permission";
      tool: string;
      input: Record<string, unknown>;
    } & AskShown)
  | { kind: "rule"; menu: string; trust: "tell" | "auto" };

export interface AskTurn {
  id: number;
  gate: string;
  ask: GateAsk;
  state: "open" | "done";
  answer?: string;
}

/** A question from the gate: the mini-me's own question, or a tool it may not use without asking. */
export function AskCard({
  turn,
  onAnswer,
}: {
  turn: AskTurn;
  onAnswer: (answer: string, always: boolean) => void;
}) {
  const t = useTranslations("ask");
  const flows = useTranslations("flows");
  const format = useFormatter();
  const send = useTranslations("common")("send");
  const [own, setOwn] = useState("");
  const [always, setAlways] = useState(false);
  const { ask } = turn;
  const open = turn.state === "open";
  // Make it a rule: the person sent this kind's answers as they were, three times in a row.
  if (ask.kind === "rule")
    return (
      <div className="flex max-w-full flex-col gap-3 self-start rounded-xl border border-waiting/40 bg-waiting/5 p-4 text-[15px]">
        <span className="text-xs font-medium text-waiting">
          {t("ruleTitle")}
        </span>
        <p>{t("rule", { menu: ask.menu })}</p>
        {open ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onAnswer("yes", false)}>
              {t("ruleYes")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAnswer("no", false)}
            >
              {t("ruleNo")}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {turn.answer === "yes" ? t("ruleDone") : t("ruleKept")}
          </p>
        )}
      </div>
    );
  return (
    <div className="flex max-w-full flex-col gap-3 self-start rounded-xl border border-waiting/40 bg-waiting/5 p-4 text-[15px]">
      <span className="text-xs font-medium text-waiting">
        {ask.kind === "question" ? t("needsYou") : t("mayI")}
      </span>
      {ask.kind === "question" ? (
        <p className="whitespace-pre-wrap">{ask.question}</p>
      ) : (
        <>
          <p className="break-all">{describe(t, ask.tool, ask.input)}</p>
          {changeOf(ask.tool, ask.input) && (
            <pre className="max-h-60 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
              {changeOf(ask.tool, ask.input)}
            </pre>
          )}
          {askDetails({ flows, format }, ask.tool, ask.input, ask).length >
            0 && (
            <div className="flex flex-col gap-1 rounded-lg bg-muted p-3 text-sm">
              {askDetails({ flows, format }, ask.tool, ask.input, ask).map(
                (line, index) => (
                  <span
                    key={line}
                    className={
                      index === 0
                        ? "font-medium"
                        : "whitespace-pre-wrap text-muted-foreground"
                    }
                  >
                    {line}
                  </span>
                ),
              )}
            </div>
          )}
        </>
      )}
      {!open && (
        <p className="text-sm text-muted-foreground">
          {ask.kind === "permission"
            ? turn.answer === "allow"
              ? t("allowed")
              : turn.answer === "deny"
                ? t("denied")
                : turn.answer
            : t("answered", { answer: turn.answer ?? "" })}
        </p>
      )}
      {open && ask.kind === "question" && (
        <div className="flex flex-col gap-2">
          {ask.choices && ask.choices.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ask.choices.map((choice) => (
                <Button
                  key={choice}
                  size="sm"
                  variant="outline"
                  onClick={() => onAnswer(choice, false)}
                >
                  {choice}
                </Button>
              ))}
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (own.trim()) onAnswer(own.trim(), false);
            }}
          >
            <Textarea
              id={`ask-own-${turn.id}`}
              value={own}
              placeholder={t("ownAnswer")}
              className="min-h-9 flex-1"
              onChange={(event) => setOwn(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={!own.trim()}>
              {send}
            </Button>
          </form>
        </div>
      )}
      {open && ask.kind === "permission" && (
        <div className="flex flex-col gap-2">
          {/* "From now on" only where code can keep it as a rule: never a command, never files. */}
          {ask.always && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={always}
                onChange={(event) => setAlways(event.target.checked)}
              />
              {ask.reads
                ? t("alwaysReads", { service: ask.reads })
                : t("always")}
            </label>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAnswer("allow", always)}>
              {t("allow")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAnswer("deny", false)}
            >
              {t("deny")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
