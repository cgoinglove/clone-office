"use client";

// The folders the clone reads, as one field that opens them all: where the person's work lives
// (server/places.ts: the folders they changed lately and worked in with their AI tools), each one
// ticked while it is read. The first steps show it before anything is read, and Settings ›
// Permissions any time after; a folder left out is never read or searched, whatever is asked.

import {
  Check,
  ChevronRight,
  Folder as FolderIcon,
  Plus,
  Search,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ShinyText } from "@/components/ui/shiny-text";
import { BrandMark, type MarkId } from "@/features/brand/brand-mark";
import { cn } from "@/lib/utils";
import { HEADERS } from "./home/use-office";

export interface Folder {
  path: string;
  /** The path as the person reads it: "~/…" under their home folder. */
  shown?: string;
  name: string;
  /** AI conversations there lately, and the tools they ran in (server/places.ts). */
  sessions: number;
  tools?: ("claude" | "codex" | "cursor" | "hermes")[];
  /** A git repository, or a plain folder. */
  kind?: "repo" | "folder";
  /** Files changed there lately (a plain folder's), and when the last one did. */
  files?: number;
  changed?: number;
  excluded: boolean;
}

/** Something kept out that is not one of the listed folders: a folder, or a name pattern. */
export interface LeftOut {
  pattern: string;
  name: string;
}

/** Each AI tool whose records were found in a folder, by its own mark and name. */
export const TOOL_MARKS: Record<string, [MarkId, string]> = {
  claude: ["claude", "Claude Code"],
  codex: ["codex", "Codex"],
  cursor: ["cursor", "Cursor"],
  hermes: ["hermes", "Hermes"],
};

/** The folders and what else is kept out, read once and saved as the person ticks them. */
export function useFolders() {
  const [list, setList] = useState<Folder[] | null>(null);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [excludes, setExcludes] = useState<string[]>([]);
  const load = useCallback(async () => {
    const data = await fetch("/api/me/sources", { headers: HEADERS })
      .then((r) => r.json())
      .catch(() => null);
    setList(data?.folders ?? []);
    setExcludes(data?.exclude ?? []);
    setOthers(data?.others ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // A pattern can keep several folders out at once, so the list is read again after each change.
  const save = async (next: string[]) => {
    const response = await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    }).catch(() => undefined);
    if (!response?.ok) return;
    setExcludes(next);
    await load();
  };
  return { list, others, excludes, save };
}

export type Folders = ReturnType<typeof useFolders>;

/**
 * The folders as one field: how many it reads and the first of them, a chevron that says it
 * opens, and the dialog with every folder to tick. The field never grows; the list is in the dialog.
 */
export function FolderField({ folders }: { folders: Folders }) {
  const t = useTranslations("folders");
  const [open, setOpen] = useState(false);
  const { list } = folders;
  const read = (list ?? []).filter((folder) => !folder.excluded);
  const out =
    (list ?? []).filter((folder) => folder.excluded).length +
    folders.others.length;
  return (
    <>
      <button
        type="button"
        disabled={list === null}
        onClick={() => setOpen(true)}
        className="group flex h-12 w-full min-w-0 items-center gap-3 rounded-[10px] bg-background pr-2.5 pl-3.5 text-left ring-1 ring-foreground/15 outline-none ring-inset transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <FolderIcon className="size-4 shrink-0 text-muted-foreground" />
        {list === null ? (
          <ShinyText text={`${t("finding")}…`} className="flex-1 text-[14px]" />
        ) : (
          <>
            <span className="shrink-0 text-[14px] font-medium">
              {t("count", { count: read.length })}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-muted-foreground">
              {read.length
                ? read
                    .slice(0, 4)
                    .map((folder) => folder.name)
                    .join(", ")
                : t("noneRead")}
            </span>
            {out > 0 && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11.5px] text-muted-foreground">
                {t("leftOut", { count: out })}
              </span>
            )}
          </>
        )}
        <span className="flex shrink-0 items-center gap-0.5 text-[13px] text-muted-foreground transition-colors group-hover:text-foreground">
          {t("check")}
          <ChevronRight className="size-4" />
        </span>
      </button>
      <FolderDialog folders={folders} open={open} onOpenChange={setOpen} />
    </>
  );
}

/** Every folder with its tick (ticked: it is read), a search, and leaving out one not listed. */
function FolderDialog({
  folders,
  open,
  onOpenChange,
}: {
  folders: Folders;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("folders");
  const [query, setQuery] = useState("");
  const [path, setPath] = useState("");
  const { list, others, excludes, save } = folders;
  const needle = query.trim().toLowerCase();
  const shown = (list ?? []).filter(
    (folder) =>
      !needle ||
      folder.name.toLowerCase().includes(needle) ||
      folder.path.toLowerCase().includes(needle),
  );
  const toggle = (folder: Folder) =>
    void save(
      folder.excluded
        ? excludes.filter((p) => p !== folder.path)
        : [...excludes, folder.path],
    );
  const leaveOut = () => {
    const pattern = path.trim();
    if (!pattern || excludes.includes(pattern)) return;
    // A folder from the list is kept out by its path, so its own row switches.
    const listed = list?.find(
      (folder) => folder.name === pattern || folder.path === pattern,
    );
    void save([...excludes, listed ? listed.path : pattern]).then(() =>
      setPath(""),
    );
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="flex flex-col gap-1 px-6 pt-5.5 pb-3.5">
          <DialogTitle className="text-lg font-semibold tracking-[-0.01em]">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="pr-6 text-[13.5px] leading-relaxed">
            {t("note")}
          </DialogDescription>
        </div>
        <div className="relative px-6 pb-2.5">
          <Search className="pointer-events-none absolute top-1/2 left-9 size-4 -translate-y-[calc(50%+5px)] text-muted-foreground" />
          <Input
            value={query}
            spellCheck={false}
            aria-label={t("search")}
            placeholder={t("search")}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-9"
          />
        </div>
        <ul className="flex h-[min(24rem,50vh)] flex-col gap-0.5 overflow-y-auto px-3 pb-3">
          {shown.map((folder) => {
            // Kept out by a name pattern rather than by itself: the pattern's row brings it back.
            const byPattern =
              folder.excluded && !excludes.includes(folder.path);
            return (
              <li key={folder.path}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!folder.excluded}
                  disabled={byPattern}
                  onClick={() => toggle(folder)}
                  className="flex w-full items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
                >
                  <Tick on={!folder.excluded} />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-[14.5px] font-medium",
                        folder.excluded && "text-muted-foreground",
                      )}
                    >
                      {folder.name}
                    </span>
                    <span className="block truncate font-mono text-xs text-muted-foreground">
                      {folder.shown ?? folder.path}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1">
                    {(folder.tools ?? [])
                      .filter((tool) => TOOL_MARKS[tool])
                      .map((tool) => (
                        <BrandMark
                          key={tool}
                          id={TOOL_MARKS[tool][0]}
                          className="size-3.5"
                        />
                      ))}
                  </span>
                  <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                    {folder.sessions
                      ? t("sessions", { count: folder.sessions })
                      : folder.files
                        ? t("files", { count: folder.files })
                        : folder.kind === "repo"
                          ? t("repo")
                          : ""}
                  </span>
                </button>
              </li>
            );
          })}
          {!needle &&
            others.map((other) => (
              <li key={other.pattern}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={false}
                  title={other.pattern}
                  onClick={() =>
                    void save(excludes.filter((p) => p !== other.pattern))
                  }
                  className="flex w-full items-center gap-3.5 rounded-[10px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted focus-visible:bg-muted"
                >
                  <Tick on={false} />
                  <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-muted-foreground">
                    {other.pattern}
                  </span>
                </button>
              </li>
            ))}
          {list !== null && shown.length === 0 && !others.length && (
            <li className="px-3 py-6 text-center text-sm text-muted-foreground">
              {needle ? t("noMatch") : t("none")}
            </li>
          )}
        </ul>
        <div className="flex items-center gap-2.5 bg-muted/40 px-6 py-3.5">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              leaveOut();
            }}
          >
            <Input
              value={path}
              spellCheck={false}
              aria-label={t("leaveOutOther")}
              placeholder={t("leaveOutOther")}
              onChange={(event) => setPath(event.target.value)}
              className="h-9 bg-background pr-10"
            />
            <button
              type="submit"
              disabled={!path.trim()}
              aria-label={t("leaveOut")}
              title={t("leaveOut")}
              className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-[8px] text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
            >
              <Plus className="size-4" />
            </button>
          </form>
          <DialogClose
            render={
              <Button variant="brand" className="h-9 px-5">
                {t("done")}
              </Button>
            }
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-4.5 shrink-0 place-items-center rounded-[5px]",
        on
          ? "bg-foreground text-background"
          : "shadow-[inset_0_0_0_1.5px_var(--alpha-20)]",
      )}
    >
      {on && <Check className="size-3" strokeWidth={3} />}
    </span>
  );
}
