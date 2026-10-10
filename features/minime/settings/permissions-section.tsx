"use client";

// Settings › Permissions: what the person let their clone do without asking (each "Don't ask
// again" they ticked on a card, which they can take back), and the folders it reads, the same
// field and list as the first steps (folder-list.tsx), the list a page of this section rather than a
// dialog over Settings: a folder left out is never read or searched.

import { useTranslations } from "next-intl";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { FolderField, FolderPage, useFolders } from "../folder-list";
import type { Preferences } from "../home/use-preferences";
import { TrustPanel } from "../trust-panel";
import { SettingsBack } from "./back";
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
  const setBack = useContext(SettingsBack);
  // Back, by its button or Esc, returns to the field the list was opened from, once it is drawn
  // again; the dialog's own focus keeper may still reach for itself a moment later, so once more.
  const returning = useRef(false);
  const back = useCallback(() => {
    returning.current = true;
    setPaged(false);
  }, []);
  useEffect(() => {
    if (paged || !returning.current) return;
    returning.current = false;
    const field = () =>
      document.querySelector<HTMLElement>("[data-folder-field]");
    field()?.focus();
    const again = setTimeout(() => {
      if (document.activeElement !== field()) field()?.focus();
    }, 60);
    return () => clearTimeout(again);
  }, [paged]);
  useEffect(() => {
    setBack(paged ? back : null);
    return () => setBack(null);
  }, [paged, back, setBack]);
  if (paged)
    return (
      <FolderPage
        folders={folders}
        back={tSections("permissions.label")}
        onBack={back}
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
