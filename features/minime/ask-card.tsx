"use client";

// A question from the trust gate, as a card wherever the person is: the mini-me's own question
// (with choices or their own answer), or something it may not do without asking (allow, don't,
// and "don't ask again for this").

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type GateAsk =
  | { kind: "question"; question: string; choices?: string[] }
  | { kind: "permission"; tool: string; input: Record<string, unknown> }
  | { kind: "rule"; menu: string; trust: "tell" | "auto" };

export interface AskTurn {
  id: number;
  gate: string;
  ask: GateAsk;
  state: "open" | "done";
  answer?: string;
}

type Translate = ReturnType<typeof useTranslations<"ask">>;

/** How a tool's use reads on a card: what it would do, and on what. */
export function describe(
  t: Translate,
  tool: string,
  input: Record<string, unknown>,
): string {
  const key = `doing.${tool}` as Parameters<Translate>[0];
  const what = t.has(key) ? t(key) : tool;
  const on =
    input.file_path ??
    input.url ??
    input.query ??
    input.pattern ??
    input.path ??
    // Asking a colleague: to whom, and what.
    (typeof input.to === "string"
      ? `${input.to}: ${String(input.request ?? "")}`
      : undefined) ??
    // Asking one of the person's Claude Code conversations: which, and what.
    (typeof input.session === "string"
      ? `${input.session}: ${String(input.question ?? "")}`
      : undefined);
  const shown =
    typeof on === "string"
      ? on.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~")
      : "";
  return shown ? `${what}: ${shown}` : what;
}

const clipLines = (value: unknown, lines: number) => {
  const all = String(value ?? "").split("\n");
  return all.length > lines
    ? [...all.slice(0, lines), "…"].join("\n")
    : all.join("\n");
};

/** What a change would be, so the person decides on the change itself: the lines, or the command. */
export function changeOf(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  if (tool === "Edit" && typeof input.new_string === "string")
    return `${clipLines(input.old_string, 8)
      .split("\n")
      .map((line) => `- ${line}`)
      .join("\n")}\n${clipLines(input.new_string, 8)
      .split("\n")
      .map((line) => `+ ${line}`)
      .join("\n")}`;
  if (tool === "Write" && typeof input.content === "string")
    return clipLines(input.content, 12);
  if (tool === "Bash" && typeof input.command === "string")
    return `$ ${input.command}`;
  return undefined;
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
          {/* A command is asked every time; there is no "from now on" for it. */}
          {ask.tool !== "Bash" && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={always}
                onChange={(event) => setAlways(event.target.checked)}
              />
              {t("always")}
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
