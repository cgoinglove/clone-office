// A line for every session a mini-me runs on its person's brain: what it was for, how long it
// took, how much of the model's context it used, its usage and cost as the brain reports them, and
// how it failed. It lives in logs/ under the mini-me's folder, so the person (and whoever helps
// them) can see what their subscription was used for; it holds no conversation text. Past 2 MB it
// is moved aside once (runs.1.jsonl), so it never grows without bound.

import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises";
import { join } from "node:path";
import { minimeHome } from "../server/paths.ts";

export interface RunRecord {
  at: string;
  purpose: string;
  brain: string;
  model: string;
  session?: string;
  ok: boolean;
  error?: string;
  ms: number;
  turns?: number;
  context?: number;
  usage?: Record<string, number>;
  cost_usd?: number;
}

const ROTATE_AT = 2 * 1024 * 1024;

export function runLogPath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "logs", "runs.jsonl");
}

export async function logRun(record: RunRecord): Promise<void> {
  const path = runLogPath();
  await mkdir(join(/*turbopackIgnore: true*/ minimeHome(), "logs"), {
    recursive: true,
  });
  const size = await stat(path).then(
    (info) => info.size,
    () => 0,
  );
  if (size > ROTATE_AT)
    await rename(path, path.replace(/\.jsonl$/, ".1.jsonl")).catch(() => {});
  const { usage, error, ...rest } = record;
  const line = {
    ...rest,
    ...(error ? { error: error.slice(0, 300) } : {}),
    ...(usage
      ? {
          usage: {
            input: usage.input_tokens,
            output: usage.output_tokens,
            cache_read: usage.cache_read_input_tokens,
            cache_write: usage.cache_creation_input_tokens,
          },
        }
      : {}),
  };
  await appendFile(path, `${JSON.stringify(line)}\n`, "utf8");
}

/** What the clone used its AI for, grouped as the person thinks of it. */
export type UseGroup =
  | "conversations"
  | "colleagues"
  | "flows"
  | "learning"
  | "other";

const GROUPS: Record<string, UseGroup> = {
  task: "conversations",
  summary: "conversations",
  fix: "conversations",
  request: "colleagues",
  check: "colleagues",
  meeting: "colleagues",
  card: "colleagues",
  flow: "flows",
  review: "learning",
  learn: "learning",
  import: "learning",
};

export interface UseLine {
  group: UseGroup;
  runs: number;
  failed: number;
  tokens: number;
  /** What it would cost at the API's prices, as the brain reports it; none when it does not. */
  cost?: number;
}

/**
 * The last `days` of the run log, by group: how often, how many failed, the tokens, and the cost
 * the brain reported (Claude Code reports what the work would cost at API prices, also on a
 * subscription, where nothing more is paid). Read from both the log and the one moved aside.
 */
export async function usageSummary(
  days = 30,
  now = Date.now(),
): Promise<{ since: string; lines: UseLine[] }> {
  const since = now - days * 24 * 60 * 60 * 1000;
  const path = runLogPath();
  const texts = await Promise.all(
    [path.replace(/\.jsonl$/, ".1.jsonl"), path].map((file) =>
      readFile(file, "utf8").catch(() => ""),
    ),
  );
  const totals = new Map<UseGroup, UseLine>();
  for (const text of texts)
    for (const raw of text.split("\n")) {
      if (!raw.trim()) continue;
      let line: {
        at?: string;
        purpose?: string;
        ok?: boolean;
        cost_usd?: number;
        usage?: Record<string, number | undefined>;
      };
      try {
        line = JSON.parse(raw);
      } catch {
        continue;
      }
      if (!line.at || Date.parse(line.at) < since) continue;
      const group = GROUPS[line.purpose ?? ""] ?? "other";
      const total = totals.get(group) ?? {
        group,
        runs: 0,
        failed: 0,
        tokens: 0,
      };
      total.runs += 1;
      if (line.ok === false) total.failed += 1;
      total.tokens += Object.values(line.usage ?? {}).reduce<number>(
        (sum, value) => sum + (typeof value === "number" ? value : 0),
        0,
      );
      if (typeof line.cost_usd === "number")
        total.cost = (total.cost ?? 0) + line.cost_usd;
      totals.set(group, total);
    }
  const order: UseGroup[] = [
    "conversations",
    "colleagues",
    "flows",
    "learning",
    "other",
  ];
  return {
    since: new Date(since).toISOString(),
    lines: order.flatMap((group) => {
      const line = totals.get(group);
      return line ? [line] : [];
    }),
  };
}
