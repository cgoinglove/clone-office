import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { FileScreen } from "@/features/minime/shell/file-screen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}): Promise<Metadata> {
  const t = await getTranslations("shell.screens");
  const { path } = await params;
  const name = decodeURIComponent(path.at(-1) ?? "");
  return { title: `${name || t("file")} · Clone Office` };
}

// Something the clone made in its workspace (a document, a page, a sheet), opened in the app.
export default async function FilePage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  return <FileScreen path={path.map(decodeURIComponent).join("/")} />;
}
