"use client";

// Settings › Permissions: what the person let their clone do without asking (each "Don't ask
// again" they ticked on a card, which they can take back), and the folders it reads, the same
// field and list as the first steps (folder-list.tsx): a folder left out is never read or searched.

import { useTranslations } from "next-intl";
import { FolderField, useFolders } from "../folder-list";
import { TrustPanel } from "../trust-panel";
import { Group, Groups } from "./parts";

export function PermissionsSection() {
  const t = useTranslations("settings.permissions");
  const tTrust = useTranslations("trust");
  const folders = useFolders();
  return (
    <Groups>
      <Group title={tTrust("title")} hint={tTrust("intro")}>
        <TrustPanel />
      </Group>
      <Group title={t("folders")} hint={t("foldersHint")}>
        <FolderField folders={folders} />
      </Group>
    </Groups>
  );
}
