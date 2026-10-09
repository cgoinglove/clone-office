"use client";

// Settings › Permissions: what the person let their clone do without asking (each "Don't ask
// again" they ticked on a card, which they can take back), and the folders it reads, the same
// field and list as the first steps (folder-list.tsx), the list a page of this section rather than a
// dialog over Settings: a folder left out is never read or searched.

import { useTranslations } from "next-intl";
import { useState } from "react";
import { FolderField, FolderPage, useFolders } from "../folder-list";
import type { Preferences } from "../home/use-preferences";
import { TrustPanel } from "../trust-panel";
import { Group, Groups } from "./parts";
import { PreferencesSection } from "./preferences-section";

export function PermissionsSection({
  preferences,
  onPreferences,
}: {
  preferences: Preferences | null;
  onPreferences: (next: Partial<Preferences>) => Promise<boolean>;
}) {
  const t = useTranslations("settings.permissions");
  const tTrust = useTranslations("trust");
  const tSections = useTranslations("settings.sections");
  const folders = useFolders();
  // The folders open as a page of this section, never a dialog over Settings.
  const [paged, setPaged] = useState(false);
  if (paged)
    return (
      <FolderPage
        folders={folders}
        back={tSections("permissions.label")}
        onBack={() => setPaged(false)}
      />
    );
  return (
    <div className="flex flex-col gap-10">
      <PreferencesSection
        preferences={preferences}
        onChange={onPreferences}
        parts={["autonomy"]}
      />
      <Groups>
        <Group title={tTrust("title")} hint={tTrust("intro")}>
          <TrustPanel />
        </Group>
        <Group title={t("folders")} hint={t("foldersHint")}>
          <FolderField folders={folders} onOpen={() => setPaged(true)} />
        </Group>
      </Groups>
    </div>
  );
}
