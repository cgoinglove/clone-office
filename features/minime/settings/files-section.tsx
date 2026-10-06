"use client";

// Settings › Files: every file the clone keeps on this computer, grouped by kind, each text file
// openable in place (secrets masked by the server), and where they all are.

import { ChevronRight, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { ShinyText } from "@/components/ui/shiny-text";
import { HEADERS, sizeText } from "../home/use-office";
import { Group, Groups, Rows } from "./parts";

interface StoredFile {
  path: string;
  group: string;
  size: number;
  text?: string;
}

const FILE_GROUPS = [
  "memory",
  "skills",
  "notes",
  "chats",
  "logs",
  "reading",
  "settings",
  "office",
  "connectors",
  "index",
  "backup",
  "other",
] as const;

export function FilesSection() {
  const t = useTranslations("files");
  const tS = useTranslations("settings.files");
  const [data, setData] = useState<{
    home: string;
    files: StoredFile[];
  } | null>(null);
  useEffect(() => {
    void fetch("/api/me/files", { headers: HEADERS })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);
  if (!data) return <ShinyText className="text-sm" text={tS("loading")} />;
  const total = data.files.reduce((sum, file) => sum + file.size, 0);
  return (
    <Groups>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border px-4 py-3">
        <span>
          <span className="block text-xs text-muted-foreground">
            {tS("where")}
          </span>
          <code className="text-xs break-all">{data.home}</code>
        </span>
        <span className="ml-auto text-right">
          <span className="block text-xs text-muted-foreground">
            {tS("total")}
          </span>
          <span className="tabular-nums">
            {tS("summary", { count: data.files.length, size: sizeText(total) })}
          </span>
        </span>
      </div>
      {FILE_GROUPS.map((group) => {
        const files = data.files.filter((f) => f.group === group);
        if (files.length === 0) return null;
        return (
          <Group
            key={group}
            title={t(`group.${group}`)}
            action={
              <span className="text-xs text-muted-foreground tabular-nums">
                {files.length}
              </span>
            }
          >
            <Rows>
              {files.map((file) => (
                <li key={file.path} className="min-w-0">
                  {file.text === undefined ? (
                    <span className="flex items-center gap-2.5 px-3.5 py-2.5">
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <code className="min-w-0 flex-1 truncate text-xs">
                        {file.path}
                      </code>
                      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                        {sizeText(file.size)}
                      </span>
                    </span>
                  ) : (
                    <details className="group/file">
                      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/file:rotate-90" />
                        <code className="min-w-0 flex-1 truncate text-xs">
                          {file.path}
                        </code>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {sizeText(file.size)}
                        </span>
                      </summary>
                      <pre className="mx-3.5 mb-3 max-h-80 overflow-auto rounded-lg bg-muted p-3 text-xs whitespace-pre-wrap">
                        {file.text || t("empty")}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </Rows>
          </Group>
        );
      })}
    </Groups>
  );
}
