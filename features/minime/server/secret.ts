// The clone's secrets — the AI vendors' keys, the ChatGPT sign-in, connected services' tokens and
// clients, the messenger's bot tokens — are sealed before they are written (lib/seal.ts), so a
// copy of the clone's folder on its own (a backup, a synced folder, a file attached to an issue, a
// screen showing Settings › Files) carries none of them. After Thursday's lib/secret.ts.
//
// The key is the folder's own `secret.key`, made at first need, readable by the person alone.
// What it does not do is keep them from anything that runs as the person: that can read the key
// too (SECURITY.md). A key file that is there but not a key is never replaced: a new key would
// leave every secret sealed under the old one unreadable.

import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  keyFrom,
  newKeyText,
  openWith,
  sealWith,
  UnreadableSecret,
} from "../../../lib/seal.ts";
import { atomicWrite, readText } from "../memory/files.ts";
import { minimeHome } from "./paths.ts";

export { isSealed, UnreadableSecret } from "../../../lib/seal.ts";

import { isSealed as isSealedText } from "../../../lib/seal.ts";

const NOTE =
  "# Clone Office seals the keys and sign-ins it keeps in this folder with this key. Keep it with\n" +
  "# the folder: without it they cannot be read, and each has to be given again.\n";

export const secretKeyPath = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "secret.key");

/** This folder's key: read, or made and written once when there is none. */
export async function secretKey(): Promise<Buffer> {
  const path = secretKeyPath();
  const read = async () => {
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
  };
  try {
    return await read();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  try {
    // Exclusive: two processes starting at once keep one key between them.
    await writeFile(path, `${NOTE}${newKeyText()}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  if (process.platform !== "win32") await chmod(path, 0o600).catch(() => {});
  return read();
}

export async function seal(plain: string): Promise<string> {
  return sealWith(await secretKey(), plain);
}

/** A kept value, opened; one written before sealing began is read as it is. */
export async function open(value: string): Promise<string> {
  return openWith(await secretKey(), value);
}

/**
 * A JSON file of secrets: sealed whole, or plain as it was written before sealing began (sealed at
 * its next write). One that cannot be opened reads as empty, so the person gives it again.
 */
export async function readSecretJson<T>(path: string): Promise<T | undefined> {
  const read = await readText(path);
  if (!read.raw) return undefined;
  try {
    return JSON.parse(await open(read.raw)) as T;
  } catch (error) {
    if (error instanceof UnreadableSecret)
      console.error(`${path}: ${error.message}`);
    return undefined;
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
    const value = await readSecretJson(path);
    if (value !== undefined) await writeSecretJson(path, value);
  }
}
