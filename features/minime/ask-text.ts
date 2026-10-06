// How a question from the trust gate reads, wherever it is shown: on a card on the page, or in the
// person's messenger. Plain functions over a translator, so the server can use them too.

import type { useTranslations } from "next-intl";
import {
  askedWhen,
  type DateFormat,
  type FlowWords,
} from "./flows/when-text.ts";
import type { AskShown } from "./gate/gate.ts";

export type { AskShown };

/** The "ask" words in the person's language: next-intl's translator, on the page or on the server. */
export type AskWords = ReturnType<typeof useTranslations<"ask">>;

/** How a tool's use reads on a card: what it would do, and on what. */
export function describe(
  t: AskWords,
  tool: string,
  input: Record<string, unknown>,
): string {
  // A flow: what is done to which one; the card shows the flow itself below.
  if (tool === "mcp__minime__flow_manage") {
    const action = ["create", "update", "pause", "resume", "remove"].includes(
      String(input.action),
    )
      ? String(input.action)
      : "update";
    return t(`flow.${action}` as Parameters<AskWords>[0]);
  }
  const key = `doing.${tool}` as Parameters<AskWords>[0];
  const what = t.has(key) ? t(key) : tool;
  const on =
    input.file_path ??
    input.url ??
    input.query ??
    input.pattern ??
    input.path ??
    input.folder ??
    // Asking a colleague, or someone by a link: to whom, and what.
    (typeof input.to === "string"
      ? `${input.to}: ${String(input.request ?? "")}`
      : undefined) ??
    (typeof input.name === "string" && typeof input.request === "string"
      ? `${input.name}: ${input.request}`
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
  // Files that would leave this computer with a request: each one, by where it is.
  if (Array.isArray(input.files) && input.files.length)
    return input.files
      .map((file) =>
        String(file).replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, "~"),
      )
      .join("\n");
  return undefined;
}

/** As the flow tool keeps them: longer ones are refused, so the card says so. */
const FLOW_NAME = 80;
const FLOW_WHAT = 4000;

/**
 * The lines a permission card shows under what it would do, the same on the page and the phone:
 * for a flow, its name, when it runs and what it does, as it would be saved (or, to pause or remove
 * one, as it is now), and a warning when it is too long to be kept.
 */
export function askDetails(
  words: { flows: FlowWords; format: DateFormat },
  tool: string,
  input: Record<string, unknown>,
  shown: AskShown = {},
): string[] {
  if (tool !== "mcp__minime__flow_manage") return [];
  const now = shown.flow;
  const given = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const name = given(input.name) ?? now?.name;
  const what = given(input.what) ?? now?.what;
  const when = askedWhen(
    words.flows,
    words.format,
    input.when ?? now?.when,
    shown.menuName,
  );
  const lines = [name, when, what].filter(
    (line): line is string => typeof line === "string" && Boolean(line),
  );
  if (
    (given(input.name)?.length ?? 0) > FLOW_NAME ||
    (given(input.what)?.length ?? 0) > FLOW_WHAT
  )
    lines.push(words.flows("tooLong"));
  return lines;
}
