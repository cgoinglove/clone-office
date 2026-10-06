// A line for every session a mini-me runs on its person's brain: what it was for, how long it
// took, how much of the model's context it used, its usage and cost as the brain reports them, and
// how it failed. It lives in logs/ under the mini-me's folder, so the person (and whoever helps
// them) can see what their subscription was used for; it holds no conversation text. Past 2 MB it
// is moved aside once (runs.1.jsonl), so it never grows without bound.

import { appendFile, mkdir, rename, stat } from "node:fs/promises";
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
