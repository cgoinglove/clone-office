"use client";

// A question from the trust gate, as a card wherever the person is: the mini-me's own question
// (with choices or their own answer), or something it may not do without asking (allow, don't,
// and "don't ask again for this").

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type GateAsk =
  | { kind: "question"; question: string; choices?: string[] }
  | { kind: "permission"; tool: string; input: Record<string, unknown> };

export interface AskTurn {
  id: number;
  gate: string;
  ask: GateAsk;
  state: "open" | "done";
  answer?: string;
}

export interface AskCopy {
  needsYou: string;
  mayI: string;
  ownAnswer: string;
  send: string;
  allow: string;
  deny: string;
  always: string;
  allowed: string;
  denied: string;
  answered: (a: string) => string;
  doing: Record<string, string>;
}

/** How a tool's use reads on a card: what it would do, and on what. */
export function describe(
  copy: AskCopy,
  tool: string,
  input: Record<string, unknown>,
): string {
  const what = copy.doing[tool] ?? tool;
  const on =
    input.file_path ??
    input.url ??
    input.query ??
    input.pattern ??
    input.path ??
    // Asking a colleague: to whom, and what.
    (typeof input.to === "string"
      ? `${input.to}: ${String(input.request ?? "")}`
      : undefined);
  const shown =
    typeof on === "string"
      ? on.replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~")
      : "";
  return shown ? `${what}: ${shown}` : what;
}

/** A question from the gate: the mini-me's own question, or a tool it may not use without asking. */
export function AskCard({
  copy,
  turn,
  onAnswer,
}: {
  copy: AskCopy;
  turn: AskTurn;
  onAnswer: (answer: string, always: boolean) => void;
}) {
  const [own, setOwn] = useState("");
  const [always, setAlways] = useState(false);
  const { ask } = turn;
  const open = turn.state === "open";
  return (
    <div className="flex max-w-full flex-col gap-3 self-start rounded-xl border border-waiting/40 bg-waiting/5 p-4 text-[15px]">
      <span className="text-xs font-medium text-waiting">
        {ask.kind === "question" ? copy.needsYou : copy.mayI}
      </span>
      {ask.kind === "question" ? (
        <p className="whitespace-pre-wrap">{ask.question}</p>
      ) : (
        <p className="break-all">{describe(copy, ask.tool, ask.input)}</p>
      )}
      {!open && (
        <p className="text-sm text-muted-foreground">
          {ask.kind === "permission"
            ? turn.answer === "allow"
              ? copy.allowed
              : turn.answer === "deny"
                ? copy.denied
                : turn.answer
            : copy.answered(turn.answer ?? "")}
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
              placeholder={copy.ownAnswer}
              className="min-h-9 flex-1"
              onChange={(event) => setOwn(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={!own.trim()}>
              {copy.send}
            </Button>
          </form>
        </div>
      )}
      {open && ask.kind === "permission" && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={always}
              onChange={(event) => setAlways(event.target.checked)}
            />
            {copy.always}
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onAnswer("allow", always)}>
              {copy.allow}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAnswer("deny", false)}
            >
              {copy.deny}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
