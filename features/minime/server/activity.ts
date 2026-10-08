// What the clone did in its person's name, kept so they can look back on it any day, not only
// today (after Paperclip's activity log and OpenClaw's audit ledger): each answer it sent a
// colleague and how (alone, telling them, or after they saw it), each it held back, each request it
// sent, each "from now on" made or taken back, and each flow run. One line each in
// logs/activity.jsonl, on the person's computer; past 2 MB it is moved aside once.

import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimeHome } from "./paths.ts";

export type Activity =
  | {
      kind: "answered";
      task: string;
      to?: string;
      text: string;
      /** On its own, telling them after, or after they saw it (as it was, or changed). */
      how: "alone" | "told" | "as-is" | "changed";
      files?: string[];
    }
  | { kind: "held"; task: string; to?: string }
  | { kind: "asked"; task: string; to: string; text: string; files?: number }
  | { kind: "rule"; rule: string; added: boolean }
  | { kind: "flow"; name: string; ok: boolean; quiet?: boolean };

export type Logged = Activity & { at: string };

const ROTATE_AT = 2 * 1024 * 1024;
const TEXT_CHARS = 400;

export function activityPath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "logs", "activity.jsonl");
}

const clip = (text: string) =>
  text.length > TEXT_CHARS ? `${text.slice(0, TEXT_CHARS - 1)}…` : text;

/** Keeps one line; never fails what it records. */
export async function logActivity(entry: Activity): Promise<void> {
  try {
    const path = activityPath();
    await mkdir(join(/*turbopackIgnore: true*/ minimeHome(), "logs"), {
      recursive: true,
    });
    const size = await stat(path).then(
      (info) => info.size,
      () => 0,
    );
    if (size > ROTATE_AT)
      await rename(path, path.replace(/\.jsonl$/, ".1.jsonl")).catch(() => {});
    const line: Logged = {
      at: new Date().toISOString(),
      ...entry,
      ...("text" in entry ? { text: clip(entry.text) } : {}),
    } as Logged;
    await appendFile(path, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  } catch {
    // A record that could not be kept never stops the work it records.
  }
}

/** The latest lines first, `limit` at most, from the log and the one moved aside. */
export async function readActivity(limit = 200): Promise<Logged[]> {
  const path = activityPath();
  const texts = await Promise.all(
    [path.replace(/\.jsonl$/, ".1.jsonl"), path].map((file) =>
      readFile(file, "utf8").catch(() => ""),
    ),
  );
  const lines: Logged[] = [];
  for (const text of texts)
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      try {
        lines.push(JSON.parse(raw) as Logged);
      } catch {
        // A line cut short by a crash is passed over.
      }
    }
  return lines.reverse().slice(0, limit);
}
