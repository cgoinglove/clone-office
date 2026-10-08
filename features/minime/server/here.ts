// Where this app answers on this computer, kept in `app.json` in the clone's folder so the person's
// own tools find it: the Claude Code plugin reads it to show and answer what waits on them. Written
// when the server starts; the process id says whether it still runs.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWrite } from "../memory/files.ts";
import { minimeHome } from "./paths.ts";

export interface Here {
  url: string;
  pid: number;
  at: string;
}

export function herePath(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "app.json");
}

/** The app's own address, as the server runs it (the launcher and `next` set PORT). */
export function ownUrl(): string {
  return `http://127.0.0.1:${process.env.PORT || 3000}`;
}

export async function writeHere(): Promise<void> {
  const here: Here = {
    url: ownUrl(),
    pid: process.pid,
    at: new Date().toISOString(),
  };
  await atomicWrite(herePath(), `${JSON.stringify(here, null, 2)}\n`);
}

export async function readHere(): Promise<Here | undefined> {
  try {
    return JSON.parse(await readFile(herePath(), "utf8")) as Here;
  } catch {
    return undefined;
  }
}
