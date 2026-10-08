"use client";

// Something the clone made in its workspace (hands/shell.ts, the artifact skill), opened in the app
// by its link (/files/<path>): a document drawn as Markdown, a page in a sandboxed frame that can run
// its own scripts but never as this app (no same origin, so none of the app's routes or storage), a
// picture, a sheet as a table, other text as it is, and anything else to save.

import { Download, FileQuestion, LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { HEADERS } from "../home/use-office";

type Shown =
  | { kind: "loading" }
  | { kind: "missing" }
  | { kind: "markdown" | "html" | "text"; text: string; blob: Blob }
  | { kind: "table"; rows: string[][]; more: number; blob: Blob }
  | { kind: "image" | "pdf" | "other"; url: string; blob: Blob };

const extension = (path: string) =>
  (path.split("/").at(-1)?.split(".").at(-1) ?? "").toLowerCase();

/** A line of comma (or tab) separated values, quotes taken as CSV takes them. */
function splitRow(line: string, separator: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let at = 0; at < line.length; at++) {
    const char = line[at];
    if (quoted) {
      if (char === '"' && line[at + 1] === '"') {
        cell += '"';
        at++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      cells.push(cell);
      cell = "";
    } else cell += char;
  }
  cells.push(cell);
  return cells;
}

/** The most rows of a sheet drawn at once. */
const ROWS = 500;

export function FileScreen({ path }: { path: string }) {
  const t = useTranslations("shell.file");
  const [shown, setShown] = useState<Shown>({ kind: "loading" });
  const name = path.split("/").at(-1) ?? path;

  useEffect(() => {
    let gone = false;
    let url: string | undefined;
    void (async () => {
      const response = await fetch(
        `/api/me/workspace?path=${encodeURIComponent(path)}`,
        { headers: HEADERS },
      ).catch(() => undefined);
      if (gone) return;
      if (!response?.ok) {
        setShown({ kind: "missing" });
        return;
      }
      const blob = await response.blob();
      if (gone) return;
      const ext = extension(path);
      if (["md", "markdown"].includes(ext))
        setShown({ kind: "markdown", text: await blob.text(), blob });
      else if (["html", "htm"].includes(ext))
        setShown({ kind: "html", text: await blob.text(), blob });
      else if (["csv", "tsv"].includes(ext)) {
        const lines = (await blob.text()).split(/\r?\n/).filter(Boolean);
        const separator = ext === "tsv" ? "\t" : ",";
        setShown({
          kind: "table",
          rows: lines.slice(0, ROWS).map((line) => splitRow(line, separator)),
          more: Math.max(0, lines.length - ROWS),
          blob,
        });
      } else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
        url = URL.createObjectURL(blob);
        setShown({ kind: "image", url, blob });
      } else if (ext === "pdf") {
        url = URL.createObjectURL(blob);
        setShown({ kind: "pdf", url, blob });
      } else if (
        blob.type.startsWith("text/") ||
        blob.type.includes("json") ||
        blob.size < 512 * 1024
      ) {
        const text = await blob.text();
        // Bytes that are not text are offered to save rather than shown as noise.
        if (text.includes("\u0000")) {
          url = URL.createObjectURL(blob);
          setShown({ kind: "other", url, blob });
        } else setShown({ kind: "text", text, blob });
      } else {
        url = URL.createObjectURL(blob);
        setShown({ kind: "other", url, blob });
      }
    })();
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [path]);

  const save = () => {
    if (!("blob" in shown)) return;
    const url = URL.createObjectURL(shown.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-3 px-8 pt-7 pb-4 max-sm:px-5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate text-[20px] leading-tight font-semibold tracking-tight">
            {name}
          </h1>
          <p className="truncate font-mono text-xs text-muted-foreground">
            {t("where", { path })}
          </p>
        </div>
        {"blob" in shown && (
          <Button variant="outline" onClick={save}>
            <Download />
            {t("save")}
          </Button>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-10 max-sm:px-5">
        {shown.kind === "loading" && (
          <p className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" />
            {t("opening")}
          </p>
        )}
        {shown.kind === "missing" && (
          <p className="flex items-center gap-2 pt-6 text-sm text-muted-foreground">
            <FileQuestion className="size-4" />
            {t("missing")}
          </p>
        )}
        {shown.kind === "markdown" && (
          <div className="mx-auto max-w-3xl pt-2">
            <Markdown>{shown.text}</Markdown>
          </div>
        )}
        {shown.kind === "html" && (
          <iframe
            title={name}
            // Scripts run, but in an origin of their own: nothing of this app is reachable.
            sandbox="allow-scripts allow-popups allow-forms allow-downloads"
            srcDoc={shown.text}
            className="h-[calc(100vh-9rem)] w-full rounded-[14px] bg-white ring-1 ring-foreground/10"
          />
        )}
        {shown.kind === "table" && (
          <div className="overflow-x-auto rounded-[14px] ring-1 ring-foreground/10">
            <table className="w-full text-left text-[13px]">
              <tbody>
                {shown.rows.map((row, at) => (
                  <tr
                    // A sheet's rows have no id: their place is what they are.
                    key={at}
                    className={at === 0 ? "bg-muted/60 font-medium" : ""}
                  >
                    {row.map((cell, column) => (
                      <td
                        key={column}
                        className="border-b border-foreground/5 px-3 py-1.5 whitespace-nowrap"
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {shown.more > 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t("moreRows", { count: shown.more })}
              </p>
            )}
          </div>
        )}
        {shown.kind === "image" && (
          // biome-ignore lint/performance/noImgElement: the clone's own picture, at its own size
          <img
            src={shown.url}
            alt={name}
            className="mx-auto max-h-[calc(100vh-10rem)] max-w-full rounded-[10px]"
          />
        )}
        {shown.kind === "pdf" && (
          <iframe
            title={name}
            src={shown.url}
            className="h-[calc(100vh-9rem)] w-full rounded-[14px] ring-1 ring-foreground/10"
          />
        )}
        {shown.kind === "text" && (
          <pre className="overflow-x-auto rounded-[14px] bg-muted/50 p-4 font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap">
            {shown.text}
          </pre>
        )}
        {shown.kind === "other" && (
          <p className="pt-6 text-sm text-muted-foreground">{t("other")}</p>
        )}
      </div>
    </div>
  );
}
