"use client";

// The folders the person worked in lately, each with "leave out", and what else they keep out: on
// their clone's page and in the first steps, before anything is read and any time after.

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Folder {
  path: string;
  name: string;
  sessions: number;
  excluded: boolean;
}

/** Something kept out that is not one of the recent folders: a folder, or a name pattern. */
export interface LeftOut {
  pattern: string;
  name: string;
}

export function FolderList({
  folders,
  others,
  excludes,
  onToggle,
  onBringBack,
}: {
  folders: Folder[];
  others: LeftOut[];
  excludes: string[];
  onToggle: (folder: Folder) => void;
  onBringBack: (pattern: string) => void;
}) {
  const t = useTranslations();
  return (
    <ul className="flex flex-col">
      {folders.map((folder) => {
        // Kept out by a name pattern rather than by itself: the pattern's own row brings it back.
        const byPattern = folder.excluded && !excludes.includes(folder.path);
        return (
          <li
            key={folder.path}
            className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
          >
            <span
              className={cn(
                "min-w-0 truncate text-sm",
                folder.excluded && "text-muted-foreground line-through",
              )}
              title={folder.path}
            >
              {folder.name}
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {t("firstRun.sessions", { count: folder.sessions })}
              </span>
            </span>
            <Button
              size="sm"
              variant={folder.excluded ? "secondary" : "outline"}
              disabled={byPattern}
              onClick={() => onToggle(folder)}
            >
              {folder.excluded ? t("firstRun.leftOut") : t("firstRun.leaveOut")}
            </Button>
          </li>
        );
      })}
      {others.map((other) => (
        <li
          key={other.pattern}
          className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
        >
          <span
            className="min-w-0 truncate text-sm text-muted-foreground line-through"
            title={other.pattern}
          >
            {other.name}
          </span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBringBack(other.pattern)}
          >
            {t("firstRun.leftOut")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
