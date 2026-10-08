// File helpers shared by the mini-me's stores (memory, skills, notes): every write goes to a
// temporary file and is renamed into place, so a crash never leaves half a file, and writers in
// different processes (a session and its background review) take turns through a lock file.

import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Write `content` to `path` atomically, creating its folder. */
export async function atomicWrite(
  path: string,
  content: string,
  options: { mode?: number } = {},
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, content, { encoding: "utf8", mode: options.mode });
  await rename(temp, path);
}

/**
 * The file's text; a missing file reads as empty. A file that exists but cannot be read is
 * reported (`ok: false`) so a caller never saves over it as if it were empty.
 */
export async function readText(
  path: string,
): Promise<{ ok: boolean; raw: string; exists: boolean }> {
  try {
    // Read strictly: a file with bytes that are not UTF-8 is not read as text with stand-ins, or the
    // next save would write the stand-ins over it (Hermes Agent treats it as unreadable too).
    const raw = new TextDecoder("utf-8", { fatal: true }).decode(
      await readFile(path),
    );
    return { ok: true, raw, exists: true };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { ok: true, raw: "", exists: false }
      : { ok: false, raw: "", exists: true };
  }
}

/**
 * Take `<dir>/.lock` when it is free, or older than `staleMs` (its holder died); undefined when
 * another writer holds it. For background work that should skip a turn rather than wait.
 */
export async function tryLock(
  dir: string,
  staleMs: number,
): Promise<(() => Promise<void>) | undefined> {
  await mkdir(dir, { recursive: true });
  const path = join(/*turbopackIgnore: true*/ dir, ".lock");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await open(path, "wx");
      await handle.close();
      return () => unlink(path).catch(() => {});
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(path).then(
        (info) => Date.now() - info.mtimeMs,
        () => 0,
      );
      if (age <= staleMs) return undefined;
      await unlink(path).catch(() => {});
    }
  }
  return undefined;
}

/** A lock held longer than this is taken over: its holder died. Work under a lock ends sooner. */
export const LOCK_STALE_MS = 10_000;

/**
 * Run `work` while holding `<dir>/.lock`; a lock older than LOCK_STALE_MS is taken over. A caller
 * waits for as long as a holder may keep it, so a slow holder is waited for, not failed.
 */
export async function withLock<T>(
  dir: string,
  work: () => Promise<T>,
): Promise<T> {
  await mkdir(dir, { recursive: true });
  const path = join(/*turbopackIgnore: true*/ dir, ".lock");
  const giveUp = Date.now() + LOCK_STALE_MS + 5_000;
  for (;;) {
    try {
      const handle = await open(path, "wx");
      await handle.close();
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(path).then(
        (info) => Date.now() - info.mtimeMs,
        () => 0,
      );
      if (age > LOCK_STALE_MS) await unlink(path).catch(() => {});
      else if (Date.now() > giveUp)
        throw new Error(`${dir} is locked by another writer.`);
      else await sleep(25);
    }
  }
  try {
    return await work();
  } finally {
    await unlink(path).catch(() => {});
  }
}
