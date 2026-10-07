"use client";

// One colleague with the way to ask their clone: who they are, what they take, how they like to be
// asked, and a request with files picked from this computer (each put at the relay before it goes).

import { FileText, Paperclip, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Bot } from "@/features/office";
import type { BotShape } from "@/features/office/bot-shape";
import { looksOf } from "@/features/office/room/looks.mjs";
import { useProblem } from "@/i18n/client";
import { cn } from "@/lib/utils";
import { statusCode } from "../office/room-data";
import {
  FILE_BYTES,
  type Member,
  sizeText,
  statusText,
  upload,
} from "./use-office";

export function Colleague({
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
