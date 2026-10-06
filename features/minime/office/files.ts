// Files between mini-mes, on this mini-me's side. What it sends is read from its person's computer,
// never from a folder they keep out and never past the relay's size, after the person saw it on a
// card; it is put at the relay and named on the message. What comes is taken from the relay into
// office/files/<request>/ under the mini-me's folder, once each, where the mini-me reads it and
// the person opens it from their page.

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, resolve } from "node:path";
import type { FileRef } from "../../relay/relay.ts";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { isExcluded, loadExcludes } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import { type OfficeConfig, OfficeError, putFile, takeFile } from "./client.ts";

export type { FileRef };

/** The largest file sent, as the relay keeps by default. */
export const SEND_BYTES = 25 * 1024 * 1024;
/** How many files go with one message. */
export const SEND_FILES = 10;

const TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".zip": "application/zip",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** Where the files of one request are kept, or all of them. */
export function filesDir(task?: string): string {
  const all = join(/*turbopackIgnore: true*/ minimeHome(), "office", "files");
  if (!task) return all;
  if (!/^[\w-]{1,80}$/.test(task)) throw new Error("Not a request id.");
  return join(/*turbopackIgnore: true*/ all, task);
}

/** A path as the person wrote it: "~/" is their home. */
function expand(path: string): string {
  const trimmed = path.trim();
  if (trimmed === "~" || trimmed.startsWith("~/"))
    return join(/*turbopackIgnore: true*/ homedir(), trimmed.slice(1));
  return trimmed;
}

/**
 * Files about to be sent, checked: each an existing file, by its full path, not in a folder the
 * person keeps out, and not past the size the relay takes.
 */
export async function readToSend(
  paths: string[],
): Promise<{ path: string; name: string; type: string; bytes: Uint8Array }[]> {
  if (paths.length > SEND_FILES)
    throw new OfficeError("files-too-many", "Too many files at once.");
  const excludes = loadExcludes();
  const out = [];
  for (const given of paths) {
    const path = expand(given);
    if (!isAbsolute(path))
      throw new OfficeError("file-not-found", `Not a full path: ${given}`);
    const full = resolve(path);
    if (isExcluded(full, excludes))
      throw new OfficeError("file-left-out", `Kept out: ${given}`);
    const info = await stat(full).catch(() => undefined);
    if (!info?.isFile())
      throw new OfficeError("file-not-found", `No such file: ${given}`);
    if (info.size > SEND_BYTES)
      throw new OfficeError("file-too-large", `Too large: ${given}`);
    out.push({
      path: full,
      name: basename(full),
      type: TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
      bytes: new Uint8Array(await readFile(full)),
    });
  }
  return out;
}

/** Files read, checked and put at the relay, to name on the message that goes next. */
export async function putFiles(
  office: OfficeConfig,
  paths: string[],
): Promise<FileRef[]> {
  const read = await readToSend(paths);
  const refs: FileRef[] = [];
  for (const file of read) refs.push(await putFile(office, file));
  return refs;
}

/** A name that stays inside its folder and reads on any system. */
function safeName(name: string): string {
  const plain = basename(name)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 150);
  return plain || "file";
}

interface Taken {
  [id: string]: string;
}

/**
 * The files a message names, taken into the request's folder once each (an index there remembers
 * which); returns where each is on this computer. A name already taken by another file gets a
 * number.
 */
export async function takeFiles(
  office: OfficeConfig,
  task: string,
  refs: FileRef[],
): Promise<{ ref: FileRef; path: string }[]> {
  if (!refs.length) return [];
  const dir = filesDir(task);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const index = join(/*turbopackIgnore: true*/ dir, ".taken.json");
  return withLock(dir, async () => {
    const read = await readText(index);
    let taken: Taken = {};
    try {
      taken = read.raw ? (JSON.parse(read.raw) as Taken) : {};
    } catch {
      taken = {};
    }
    const used = new Set(Object.values(taken));
    const out: { ref: FileRef; path: string }[] = [];
    for (const ref of refs) {
      let name = taken[ref.id];
      if (!name) {
        const bytes = await takeFile(office, ref.id);
        const wanted = safeName(ref.name);
        const ext = extname(wanted);
        const stem = wanted.slice(0, wanted.length - ext.length);
        name = wanted;
        for (let n = 2; used.has(name); n++) name = `${stem} (${n})${ext}`;
        await writeFile(join(/*turbopackIgnore: true*/ dir, name), bytes, {
          mode: 0o600,
        });
        taken[ref.id] = name;
        used.add(name);
        await atomicWrite(index, JSON.stringify(taken, null, 2));
      }
      out.push({ ref, path: join(/*turbopackIgnore: true*/ dir, name) });
    }
    return out;
  });
}

/** The files a request's messages named, as they are kept here: for the page to list and open. */
export async function keptFiles(
  task: string,
): Promise<{ id: string; name: string; size: number }[]> {
  const dir = filesDir(task);
  const read = await readText(
    join(/*turbopackIgnore: true*/ dir, ".taken.json"),
  );
  let taken: Taken = {};
  try {
    taken = read.raw ? (JSON.parse(read.raw) as Taken) : {};
  } catch {
    return [];
  }
  const out = [];
  for (const [id, name] of Object.entries(taken)) {
    const info = await stat(join(/*turbopackIgnore: true*/ dir, name)).catch(
      () => undefined,
    );
    if (info?.isFile()) out.push({ id, name, size: info.size });
  }
  return out;
}

/** How files that came read in a line of a conversation or a prompt: each name and where it is. */
export function filesLine(taken: { ref: FileRef; path: string }[]): string {
  return taken
    .map(({ ref, path }) => `- ${ref.name} (${sizeText(ref.size)}): ${path}`)
    .join("\n");
}

export function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
