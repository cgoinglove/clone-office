// Which apps the person uses most, read from what the system already records whenever an app is
// opened: Spotlight on macOS, UserAssist on Windows, GNOME Shell's usage file on Linux. No app is
// looked up by name, so whatever someone lives in shows up, an AutoCAD as much as a code editor.
// Only names, counts and dates are read.

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AppUse } from "../types";

const DAY = 24 * 60 * 60 * 1000;
/** "Lately" for counting the days an app was used. */
const RECENT_DAYS = 30;
/** Apps not opened for this long say little about how the person works now. */
const KEEP_DAYS = 180;
const KEEP = 40;

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 15_000 },
      (error, stdout) => resolve(error ? "" : stdout),
    );
  });
}

/** One entry per app, used most first: days used lately, then minutes, then times opened. */
export function rankApps(apps: AppUse[], now = Date.now()): AppUse[] {
  const byName = new Map<string, AppUse>();
  for (const app of apps) {
    const key = app.name.toLowerCase();
    const known = byName.get(key);
    if (!known) {
      byName.set(key, { ...app });
      continue;
    }
    known.days = Math.max(known.days ?? 0, app.days ?? 0) || undefined;
    known.uses = (known.uses ?? 0) + (app.uses ?? 0) || undefined;
    known.minutes = (known.minutes ?? 0) + (app.minutes ?? 0) || undefined;
    if ((app.lastUsedAt ?? "") > (known.lastUsedAt ?? ""))
      known.lastUsedAt = app.lastUsedAt;
  }
  const since = new Date(now - KEEP_DAYS * DAY).toISOString();
  return [...byName.values()]
    .filter((app) =>
      app.lastUsedAt ? app.lastUsedAt >= since : Boolean(app.days || app.uses),
    )
    .sort(
      (a, b) =>
        (b.days ?? 0) - (a.days ?? 0) ||
        (b.minutes ?? 0) - (a.minutes ?? 0) ||
        (b.uses ?? 0) - (a.uses ?? 0) ||
        (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""),
    )
    .slice(0, KEEP);
}

// macOS ---------------------------------------------------------------------------------------

/** Spotlight's date form, "2026-09-22 03:44:01 +0000", as ISO. */
function spotlightDate(text: string): string | undefined {
  const match =
    /(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})/.exec(text);
  if (!match) return undefined;
  const time = Date.parse(`${match[1]}T${match[2]}${match[3]}:${match[4]}`);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

// mdls prints the asked attributes in name order, separated by NUL, one file after another.
const MDLS_ATTRIBUTES = [
  "kMDItemDisplayName",
  "kMDItemLastUsedDate",
  "kMDItemUseCount",
  "kMDItemUsedDates",
];

export function parseMdls(
  output: string,
  paths: string[],
  now = Date.now(),
): AppUse[] {
  const fields = output.split("\0");
  const since = now - RECENT_DAYS * DAY;
  const out: AppUse[] = [];
  paths.forEach((path, i) => {
    const [name, last, uses, dates] = fields
      .slice(i * MDLS_ATTRIBUTES.length, (i + 1) * MDLS_ATTRIBUTES.length)
      .map((field) => (field === "(null)" ? "" : field.trim()));
    const fallback = path.split("/").at(-1) ?? path;
    const used = (dates ?? "").match(
      /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}/g,
    );
    const days = (used ?? [])
      .map(spotlightDate)
      .filter((date) => date && Date.parse(date) >= since).length;
    out.push({
      name: (name || fallback).replace(/\.app$/, ""),
      days: days || undefined,
      uses: Number(uses) || undefined,
      lastUsedAt: last ? spotlightDate(last) : undefined,
    });
  });
  return out;
}

async function macApps(now: number): Promise<AppUse[]> {
  const roots = [
    "/Applications",
    "/System/Applications",
    join(homedir(), "Applications"),
  ];
  const found = await run("mdfind", [
    "-0",
    ...roots.flatMap((root) => ["-onlyin", root]),
    "kMDItemContentType == 'com.apple.application-bundle'",
  ]);
  // Apps inside other apps are their helpers.
  const paths = found
    .split("\0")
    .filter(
      (path) => path.endsWith(".app") && !path.slice(0, -4).includes(".app/"),
    );
  const out: AppUse[] = [];
  for (let i = 0; i < paths.length; i += 100) {
    const chunk = paths.slice(i, i + 100);
    const output = await run("mdls", [
      "-raw",
      ...MDLS_ATTRIBUTES.flatMap((attribute) => ["-name", attribute]),
      ...chunk,
    ]);
    if (output) out.push(...parseMdls(output, chunk, now));
  }
  return out;
}

// Windows -------------------------------------------------------------------------------------

/** UserAssist hides each name with ROT13. */
export function rot13(text: string): string {
  return text.replace(/[a-z]/gi, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

/** A program's name from the path UserAssist keeps: a shortcut, a program file or a store app. */
export function windowsAppName(path: string): string | undefined {
  if (path.startsWith("UEME_")) return undefined;
  const last = path.split("\\").at(-1) ?? path;
  if (/\.(lnk|exe)$/i.test(last)) return last.replace(/\.(lnk|exe)$/i, "");
  // A store app's id, such as "Microsoft.WindowsTerminal_8wekyb3d8bbwe!App".
  const app = last.split("!")[0].split("_")[0];
  return app.split(".").at(-1) || undefined;
}

/**
 * One UserAssist value: times run at bytes 4–7, time in focus (ms) at 12–15, and the last run as a
 * FILETIME at 60–67, in the layout Windows 7 and later use.
 */
export function parseUserAssist(
  name: string,
  data: Buffer,
): AppUse | undefined {
  if (data.length < 68) return undefined;
  const app = windowsAppName(rot13(name));
  if (!app) return undefined;
  const uses = data.readUInt32LE(4);
  const focus = data.readUInt32LE(12);
  const filetime = data.readBigUInt64LE(60);
  // 100-nanosecond steps since 1601; the precision lost in a double is far below a millisecond.
  const lastMs = filetime ? Number(filetime) / 10_000 - 11_644_473_600_000 : 0;
  if (!uses && !focus) return undefined;
  return {
    name: app,
    uses: uses || undefined,
    minutes: Math.round(focus / 60_000) || undefined,
    lastUsedAt: lastMs > 0 ? new Date(lastMs).toISOString() : undefined,
  };
}

const USER_ASSIST = `[Console]::OutputEncoding = [Text.Encoding]::UTF8
$root = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist'
$out = @()
foreach ($key in Get-ChildItem $root -ErrorAction SilentlyContinue) {
  $count = Get-Item (Join-Path $key.PSPath 'Count') -ErrorAction SilentlyContinue
  if (-not $count) { continue }
  foreach ($name in $count.GetValueNames()) {
    $data = $count.GetValue($name)
    if ($data -is [byte[]]) { $out += [pscustomobject]@{ n = $name; d = [Convert]::ToBase64String($data) } }
  }
}
ConvertTo-Json -Compress -InputObject @($out)`;

async function windowsApps(): Promise<AppUse[]> {
  const output = await run("powershell.exe", [
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    USER_ASSIST,
  ]);
  let values: { n: string; d: string }[] = [];
  try {
    values = JSON.parse(output || "[]");
  } catch {
    return [];
  }
  return values
    .map((value) => parseUserAssist(value.n, Buffer.from(value.d, "base64")))
    .filter((app): app is AppUse => Boolean(app));
}

// Linux ---------------------------------------------------------------------------------------

/** GNOME Shell's usage file: an id, a usage score and when it was last seen, per app. */
export function parseGnomeUsage(xml: string): {
  id: string;
  score: number;
  lastSeen: number;
}[] {
  const out = [];
  for (const match of xml.matchAll(/<application\b([^>]*)\/?>/g)) {
    const attr = (name: string) =>
      new RegExp(`${name}="([^"]*)"`).exec(match[1])?.[1];
    const id = attr("id");
    if (id)
      out.push({
        id,
        score: Number(attr("score")) || 0,
        lastSeen: Number(attr("last-seen")) || 0,
      });
  }
  return out;
}

/** The name a launcher shows for a .desktop file. */
export function desktopName(text: string): string | undefined {
  const entry = text
    .split(/^\[/m)
    .find((part) => part.startsWith("Desktop Entry]"));
  return entry ? /^Name=(.+)$/m.exec(entry)?.[1]?.trim() : undefined;
}

async function linuxApps(): Promise<AppUse[]> {
  const home = homedir();
  let xml: string;
  try {
    xml = await readFile(
      join(home, ".local", "share", "gnome-shell", "application_state"),
      "utf8",
    );
  } catch {
    // Not GNOME; other desktops keep usage elsewhere or not at all.
    return [];
  }
  const dataDirs = [
    process.env.XDG_DATA_HOME ?? join(home, ".local", "share"),
    ...(process.env.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share").split(":"),
    "/var/lib/flatpak/exports/share",
    join(home, ".local", "share", "flatpak", "exports", "share"),
    "/var/lib/snapd/desktop",
  ];
  const names = new Map<string, string>();
  for (const dir of dataDirs) {
    const apps = join(dir, "applications");
    let files: string[] = [];
    try {
      files = await readdir(apps);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith(".desktop") || names.has(file)) continue;
      const name = desktopName(
        await readFile(join(apps, file), "utf8").catch(() => ""),
      );
      if (name) names.set(file, name);
    }
  }
  return parseGnomeUsage(xml).map((app) => ({
    name: names.get(app.id) ?? app.id.replace(/\.desktop$/, ""),
    uses: Math.round(app.score) || undefined,
    lastUsedAt: app.lastSeen
      ? new Date(app.lastSeen * 1000).toISOString()
      : undefined,
  }));
}

export async function scanApps(now = Date.now()): Promise<AppUse[]> {
  try {
    if (process.platform === "darwin") return rankApps(await macApps(now), now);
    if (process.platform === "win32") return rankApps(await windowsApps(), now);
    return rankApps(await linuxApps(), now);
  } catch {
    return [];
  }
}
