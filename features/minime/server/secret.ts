// The clone's secrets — the AI vendors' keys, the ChatGPT sign-in, connected services' tokens and
// clients, the messenger's bot tokens — are sealed before they are written (lib/seal.ts), so a
// copy of the clone's folder on its own (a backup, a synced folder, a file attached to an issue, a
// screen showing Settings › Files) carries none of them. After Thursday's lib/secret.ts.
//
// The key is the folder's own `secret.key`, made at first need, readable by the person alone.
// What it does not do is keep them from anything that runs as the person: that can read the key
// too (SECURITY.md). A key file that is there but not a key is never replaced: a new key would
// leave every secret sealed under the old one unreadable.

import { chmod, link, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { keyFrom, newKeyText, openWith, sealWith } from "../../../lib/seal.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { minimeHome } from "./paths.ts";

export { isSealed, UnreadableSecret } from "../../../lib/seal.ts";

import { isSealed as isSealedText } from "../../../lib/seal.ts";

const NOTE =
  "# Clone Office seals the keys and sign-ins it keeps in this folder with this key. Keep it with\n" +
  "# the folder: without it they cannot be read, and each has to be given again.\n";

export const secretKeyPath = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "secret.key");

/** One key per folder and process: concurrent first uses share one making of it. */
const pinned = globalThis as typeof globalThis & {
  __cloneOfficeKeys?: Map<string, Promise<Buffer>>;
};
const keys = (pinned.__cloneOfficeKeys ??= new Map());

/** This folder's key: read, or made and written once when there is none. */
export function secretKey(): Promise<Buffer> {
  const path = secretKeyPath();
  let kept = keys.get(path);
  if (!kept) {
    kept = loadOrMake(path);
    // A failure is not kept: the next use reads (or makes) it again.
    kept.catch(() => keys.delete(path));
    keys.set(path, kept);
  }
  return kept;
}

async function readKey(path: string): Promise<Buffer> {
  const text = await readFile(path, "utf8");
  const line = text
    .split("\n")
    .find((entry) => entry.trim() && !entry.startsWith("#"));
  const key = keyFrom(line ?? "");
  if (!key)
    throw new Error(
      `${path} is not a key Clone Office made. Put back the one it had, or move the file aside to start a new one (every key and sign-in is then given again).`,
    );
  return key;
}

async function loadOrMake(path: string): Promise<Buffer> {
  try {
    return await readKey(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  // Written whole under another name, then linked into place: the link fails if another process
  // made one first, and nobody ever reads a key file half written.
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, `${NOTE}${newKeyText()}\n`, { mode: 0o600 });
  try {
    await link(temp, path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  } finally {
    await unlink(temp).catch(() => {});
  }
  if (process.platform !== "win32") await chmod(path, 0o600).catch(() => {});
  return readKey(path);
}

export async function seal(plain: string): Promise<string> {
  return sealWith(await secretKey(), plain);
}

/**
 * A kept value, opened; one written before sealing began is read as it is, without the key, so a
 * key file in trouble never makes a plain value unreadable.
 */
export async function open(value: string): Promise<string> {
  if (!isSealedText(value)) return value;
  return openWith(await secretKey(), value);
}

/**
 * A JSON file of secrets: sealed whole, or plain as it was written before sealing began (sealed at
 * its next write). Undefined when there is none. One that cannot be opened (another key, a key file
 * in trouble, damage) throws: a caller about to change it must not take it for empty and write over
 * what the person may still get back. Reading only, `readSecretJsonOr` falls back.
 */
export async function readSecretJson<T>(path: string): Promise<T | undefined> {
  const read = await readText(path);
  if (!read.raw) return undefined;
  return JSON.parse(await open(read.raw)) as T;
}

/** A JSON file of secrets for reading only: what cannot be opened reads as the fallback. */
export async function readSecretJsonOr<T>(
  path: string,
  fallback: T,
): Promise<T> {
  try {
    return (await readSecretJson<T>(path)) ?? fallback;
  } catch (error) {
    console.error(`${path}: ${(error as Error).message}`);
    return fallback;
  }
}

export async function writeSecretJson(
  path: string,
  value: unknown,
): Promise<void> {
  await atomicWrite(path, await seal(JSON.stringify(value, null, 2)), {
    mode: 0o600,
  });
}

/**
 * Seals the secret files kept before sealing began, when the server starts, rather than at their
 * next change (an API key may never change). Each is read as it is and written sealed.
 */
export async function sealKeptFiles(paths: string[]): Promise<void> {
  for (const path of paths) {
    const read = await readText(path);
    if (!read.raw || isSealedText(read.raw)) continue;
    const value = await readSecretJson(path).catch(() => undefined);
    if (value !== undefined) await writeSecretJson(path, value);
  }
}
