"use client";

// The office's side of the panel: what waits on the person (questions about requests, live or kept
// for later), their colleagues with a way to ask each, and the requests they sent and received with
// how far each has come. In no office yet, it says how to bring the team in.

import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Check,
  Copy,
  FileText,
  Link2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ShinyText } from "@/components/ui/shiny-text";
import { Textarea } from "@/components/ui/textarea";
import { Bot } from "@/features/office";
import type { BotShape } from "@/features/office/bot-shape";
import { looksOf } from "@/features/office/room/looks.mjs";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { AskCard } from "../ask-card";
import { statusCode } from "../office/room-data";
import {
  FILE_BYTES,
  type Member,
  type OfficeState,
  saveFile,
  sizeText,
  statusText,
  type Task,
  upload,
} from "./use-office";

export function RequestsView({
  office,
  onOpenOffice,
}: {
  office: OfficeState;
  /** Opens the office's settings (open one here, or join the team's). */
  onOpenOffice: () => void;
}) {
  const t = useTranslations("home");
  const tOffice = useTranslations("office");
  const problemText = useProblem();
  const data = office.office;

  if (!data)
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        <ShinyText text={t("loading")} />
      </div>
    );

  if (!data.joined)
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6 pb-10">
        <span className="grid size-11 place-items-center rounded-xl bg-muted">
          <Building2 className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("soloTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("soloBody")}
          </p>
        </div>
        <Button onClick={onOpenOffice}>{t("soloAction")}</Button>
      </div>
    );

  const members = data.members ?? [];
  const index = new Map(members.map((m, i) => [m.id, i]));
  const tasks = data.tasks ?? [];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pt-4 pb-6">
      <div className="flex flex-col gap-7">
        {office.waiting.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <Heading tone="waiting" count={office.waiting.length}>
              {t("waitingOnYou")}
            </Heading>
            {office.waiting.map((pending) => (
              <div key={pending.id} className="flex flex-col gap-1">
                {pending.from && (
                  <span className="px-1 text-xs text-muted-foreground">
                    {t("askedBy", {
                      name: office.names.get(pending.from) ?? pending.from,
                    })}
                  </span>
                )}
                <AskCard
                  turn={{
                    id: 0,
                    gate: pending.id,
                    ask: pending.ask,
                    state: office.answered[pending.id] ? "done" : "open",
                    answer: office.answered[pending.id],
                  }}
                  onAnswer={(answer, always) =>
                    void office.answer(pending, answer, always)
                  }
                />
              </div>
            ))}
          </section>
        )}

        <section className="flex flex-col gap-1">
          <Heading count={office.others.length}>{t("colleagues")}</Heading>
          {office.others.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {t("nobodyYet")}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={onOpenOffice}
              >
                {t("inviteSomeone")}
              </button>
            </p>
          ) : (
            <ul className="-mx-1 flex flex-col">
              {office.others.map((member) => (
                <Colleague
                  key={member.id}
                  member={member}
                  index={index.get(member.id) ?? 0}
                  busy={office.busy}
                  onSend={(text, files) =>
                    office.post({ action: "send", to: member.id, text, files })
                  }
                />
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <Heading count={tasks.length}>{t("requests")}</Heading>
          {tasks.length === 0 ? (
            <p className="px-1 py-2 text-sm text-muted-foreground">
              {t("noRequests")}
            </p>
          ) : (
            <ul className="flex flex-col">
              {tasks.map((task) => (
                <Request
                  key={task.id}
                  task={task}
                  me={data.me?.id ?? ""}
                  relay={data.relay}
                  names={office.names}
                  busy={office.busy}
                  onReply={(text) =>
                    office.post({ action: "reply", id: task.id, text })
                  }
                />
              ))}
            </ul>
          )}
        </section>

        {office.error && (
          <p className="text-sm text-destructive">
            {problemText(office.error)}
          </p>
        )}
        {data.problem && (
          <p className="text-sm text-destructive">
            {problemText(data.problem)}
          </p>
        )}
        <p className="sr-only">{tOffice("title")}</p>
      </div>
    </div>
  );
}

function Heading({
  children,
  count,
  tone,
}: {
  children: React.ReactNode;
  count?: number;
  tone?: "waiting";
}) {
  return (
    <h3
      className={cn(
        "flex items-center gap-1.5 px-1 font-mono text-[11px] tracking-wide uppercase",
        tone === "waiting" ? "text-waiting" : "text-muted-foreground",
      )}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className="tabular-nums opacity-70">{count}</span>
      )}
    </h3>
  );
}

/** A colleague as their card says, and a way to ask them, with files to go along. */
function Colleague({
  member,
  index,
  busy,
  onSend,
}: {
  member: Member;
  index: number;
  busy: boolean;
  onSend: (text: string, files: string[]) => Promise<boolean>;
}) {
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const problemText = useProblem();
  const t = useTranslations("office");
  const tHome = useTranslations("home");
  const common = useTranslations("common");
  const look = looksOf({ id: member.id }, index);
  const status = statusCode(member.card.status);
  const off =
    status === "off" || Date.now() - Date.parse(member.seen) > 120_000;
  const takes = (member.card.skills ?? []).map((skill) => skill.name);
  return (
    <li className="flex flex-col gap-2 rounded-xl px-1 py-2">
      <div className="flex items-center gap-3">
        <Bot
          size={30}
          shape={look.shape as BotShape}
          color={look.color}
          mood={off ? "sleep" : "idle"}
          still
          className={cn("shrink-0", off && "opacity-50")}
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">
              {member.card.name}
            </span>
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                off
                  ? "border border-muted-foreground/50"
                  : status === "meeting" || status === "away"
                    ? "bg-muted-foreground/60"
                    : "bg-brand",
              )}
              aria-hidden
            />
            <span className="shrink-0 text-xs text-muted-foreground">
              {off
                ? tHome("off")
                : statusText(t, member.card.status) || tHome("in")}
            </span>
          </span>
          {member.card.description && (
            <span className="block truncate text-xs text-muted-foreground">
              {member.card.description}
            </span>
          )}
        </span>
        {!asking && (
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            {t("ask")}
          </Button>
        )}
      </div>
      {asking && (
        <form
          className="ml-[42px] flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              setUploading(true);
              setFileProblem(null);
              try {
                const ids: string[] = [];
                for (const file of files) {
                  const id = await upload(file);
                  if (typeof id !== "string") {
                    setFileProblem(problemText(id.error));
                    return;
                  }
                  ids.push(id);
                }
                if (await onSend(text.trim(), ids)) {
                  setText("");
                  setFiles([]);
                  setAsking(false);
                }
              } finally {
                setUploading(false);
              }
            })();
          }}
        >
          {takes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {takes.slice(0, 4).map((take) => (
                <button
                  key={take}
                  type="button"
                  onClick={() =>
                    setText((was) => (was.trim() ? was : `${take}: `))
                  }
                  className="rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {take}
                </button>
              ))}
            </div>
          )}
          <Textarea
            autoFocus
            value={text}
            className="min-h-20 text-sm"
            placeholder={t("askPlaceholder", { name: member.card.name })}
            onChange={(e) => setText(e.target.value)}
          />
          {files.length > 0 && (
            <ul className="flex flex-col gap-1">
              {files.map((file, at) => (
                <li
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5 text-xs"
                >
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    {sizeText(file.size)}
                  </span>
                  <button
                    type="button"
                    aria-label={t("removeFile")}
                    className="shrink-0 rounded text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setFiles((all) => all.filter((_, i) => i !== at))
                    }
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {fileProblem && (
            <p className="text-xs text-destructive">{fileProblem}</p>
          )}
          <input
            ref={picker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const picked = [...(event.target.files ?? [])];
              event.target.value = "";
              const large = picked.find((file) => file.size > FILE_BYTES);
              if (large) {
                setFileProblem(t("fileTooLarge", { name: large.name }));
                return;
              }
              setFileProblem(null);
              setFiles((all) => [...all, ...picked].slice(0, 10));
            }}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="submit"
              size="sm"
              disabled={busy || uploading || !text.trim()}
              loading={busy || uploading}
            >
              <Send />
              {common("send")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={files.length >= 10}
              onClick={() => picker.current?.click()}
            >
              <Paperclip />
              {t("attach")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-muted-foreground"
              onClick={() => setAsking(false)}
            >
              {common("cancel")}
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

const STATE_TONE: Record<string, string> = {
  INPUT_REQUIRED: "bg-waiting/10 text-waiting",
  COMPLETED: "bg-muted text-foreground",
  FAILED: "bg-destructive/10 text-destructive",
  REJECTED: "bg-destructive/10 text-destructive",
  CANCELED: "bg-muted text-muted-foreground",
};

/** One request sent or received: what was asked, the answer so far, its files, and a reply. */
function Request({
  task,
  me,
  relay,
  names,
  busy,
  onReply,
}: {
  task: Task;
  me: string;
  relay?: string;
  names: Map<string, string>;
  busy: boolean;
  onReply: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const t = useTranslations("office");
  const tHome = useTranslations("home");
  const format = useFormatter();
  // Relative times read against a clock that moves on its own each minute.
  const now = useNow({ updateInterval: 60_000 });
  const sent = task.metadata.from === me;
  const other = sent ? task.metadata.to : task.metadata.from;
  const who =
    names.get(other) ??
    (task.metadata.guest ? t("byLink", { name: task.metadata.guest }) : other);
  const link =
    relay && task.metadata.link
      ? new URL(task.metadata.link, relay).toString()
      : undefined;
  const first = task.history[0]?.parts.map((p) => p.text).join(" ") ?? "";
  const answer = [...task.history]
    .reverse()
    .find((m) => m.role === "agent")
    ?.parts.map((p) => p.text)
    .join(" ");
  const state = task.status.state;
  const moving = state === "SUBMITTED" || state === "WORKING";
  const files = task.history.flatMap((message) => message.files ?? []);
  return (
    <li className="flex min-w-0 flex-col gap-1.5 border-b border-border/70 px-1 py-3 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
          {sent ? (
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ArrowDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">
            {sent
              ? tHome("fromYou", { name: who })
              : tHome("fromThem", { name: who })}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            STATE_TONE[state] ?? "text-muted-foreground",
          )}
        >
          {moving ? (
            <ShinyText text={t(`state.${state}`)} />
          ) : (
            t(`state.${state}`)
          )}
        </span>
      </div>
      <p className="line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
        {first}
      </p>
      {answer && (
        <p className="border-l-2 border-border pl-2.5 text-sm whitespace-pre-wrap">
          {answer}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <li key={file.id} className="min-w-0">
              <button
                type="button"
                className="flex max-w-56 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs hover:bg-muted/70"
                onClick={() => void saveFile(task.id, file)}
              >
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {sizeText(file.size)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {link && moving && (
        <div className="flex min-w-0 items-center gap-2 rounded-lg bg-muted px-2.5 py-1.5">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <code className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {link}
          </code>
          <Button
            size="xs"
            variant="ghost"
            className="shrink-0"
            onClick={() => {
              void navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => {});
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? t("copied") : t("copyLink")}
          </Button>
        </div>
      )}
      {sent && state === "INPUT_REQUIRED" && (
        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void onReply(text.trim()).then((ok) => ok && setText(""));
          }}
        >
          <Textarea
            value={text}
            className="min-h-9 flex-1 text-sm"
            onChange={(e) => setText(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={busy || !text.trim()}>
            {t("reply")}
          </Button>
        </form>
      )}
      <span className="text-[11px] text-muted-foreground tabular-nums">
        {format.relativeTime(new Date(task.status.timestamp), now)}
      </span>
    </li>
  );
}
