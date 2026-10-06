"use client";

// Settings › Permissions: what the person let their clone do without asking (each "Don't ask
// again" they ticked on a card, which they can take back), and the folders kept out of everything
// it reads.

import { FolderX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type Folder, FolderList, type LeftOut } from "../folder-list";
import { HEADERS } from "../home/use-office";
import { TrustPanel } from "../trust-panel";
import { Group, Groups } from "./parts";

export function PermissionsSection() {
  const t = useTranslations("settings.permissions");
  const tTrust = useTranslations("trust");
  return (
    <Groups>
      <Group title={tTrust("title")} hint={tTrust("intro")}>
        <TrustPanel />
      </Group>
      <Group title={t("folders")} hint={t("foldersHint")}>
        <Folders />
      </Group>
    </Groups>
  );
}

/** The folders the person worked in lately, each with its switch, and a way to leave out more. */
export function Folders() {
  const tRun = useTranslations("firstRun");
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [excludes, setExcludes] = useState<string[]>([]);
  const [others, setOthers] = useState<LeftOut[]>([]);
  const [adding, setAdding] = useState("");

  const load = useCallback(
    () =>
      fetch("/api/me/sources", { headers: HEADERS })
        .then((r) => r.json())
        .then(
          (data: {
            folders: Folder[];
            exclude: string[];
            others?: LeftOut[];
          }) => {
            setFolders(data.folders);
            setExcludes(data.exclude);
            setOthers(data.others ?? []);
          },
        )
        .catch(() => setFolders([])),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  // A pattern can keep several folders out at once, so the list is read again after each change.
  const save = async (next: string[]) => {
    setExcludes(next);
    await fetch("/api/me/sources", {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ exclude: next }),
    }).catch(() => {});
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      {folders && (folders.length > 0 || others.length > 0) && (
        <FolderList
          folders={folders}
          others={others}
          excludes={excludes}
          onToggle={(folder) => {
            setFolders(
              (all) =>
                all?.map((f) =>
                  f.path === folder.path ? { ...f, excluded: !f.excluded } : f,
                ) ?? null,
            );
            void save(
              folder.excluded
                ? excludes.filter((p) => p !== folder.path)
                : [...excludes, folder.path],
            );
          }}
          onBringBack={(pattern) =>
            void save(excludes.filter((p) => p !== pattern))
          }
        />
      )}
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = adding.trim();
          if (!value) return;
          setAdding("");
          // A folder from the list is kept out by its path, so its own row switches.
          const listed = folders?.find(
            (f) => f.name === value || f.path === value,
          );
          void save([...excludes, listed ? listed.path : value]);
        }}
      >
        <Input
          value={adding}
          onChange={(event) => setAdding(event.target.value)}
          placeholder={tRun("folderPlaceholder")}
          aria-label={tRun("folderPlaceholder")}
        />
        <Button type="submit" variant="outline" disabled={!adding.trim()}>
          <FolderX />
          {tRun("leaveOut")}
        </Button>
      </form>
    </div>
  );
}
