// The person's menu: the kinds of request their mini-me takes from colleagues, each with how much
// it does alone (product 2.2 and 2.4): answer on its own, answer and then tell them, or ask them
// first. The kinds go on their card as A2A skills, so colleagues' mini-mes (and their Claude Code)
// know what to bring; how much it does alone stays on this computer, in settings.json "menu".
// Code applies the trust level; the brain only says which kind a request is.

import { readFile } from "node:fs/promises";
import { atomicWrite, withLock } from "../memory/files.ts";
import { settingsPath } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";
import type { Card } from "./client.ts";

export const TRUSTS = ["auto", "tell", "ask"] as const;
export type Trust = (typeof TRUSTS)[number];

/** A request that fits nothing on the menu is answered, and the person is told. */
export const FREE_TRUST: Trust = "tell";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  examples?: string[];
  trust: Trust;
}

const MAX_ITEMS = 12;

function slug(name: string): string {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Keep only what a menu item can hold; every item gets an id that is its own. */
export function cleanMenu(input: unknown): MenuItem[] {
  if (!Array.isArray(input)) return [];
  const taken = new Set<string>();
  const items: MenuItem[] = [];
  for (const raw of input.slice(0, MAX_ITEMS)) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const name = String(item.name ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!name) continue;
    const given = typeof item.id === "string" ? slug(item.id) : "";
    let id = given || slug(name) || `item-${items.length + 1}`;
    for (let n = 2; taken.has(id); n++)
      id = `${given || slug(name) || "item"}-${n}`;
    taken.add(id);
    const examples = Array.isArray(item.examples)
      ? item.examples
          .map((example) => String(example).trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 3)
      : [];
    items.push({
      id,
      name,
      description: String(item.description ?? "")
        .trim()
        .slice(0, 300),
      ...(examples.length ? { examples } : {}),
      trust: TRUSTS.includes(item.trust as Trust)
        ? (item.trust as Trust)
        : FREE_TRUST,
    });
  }
  return items;
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function loadMenu(): Promise<MenuItem[]> {
  return cleanMenu((await readSettings()).menu);
}

export async function saveMenu(input: unknown): Promise<MenuItem[]> {
  const menu = cleanMenu(input);
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    await atomicWrite(
      settingsPath(),
      `${JSON.stringify({ ...settings, menu }, null, 2)}\n`,
    );
  });
  return menu;
}

/** What colleagues see of the menu: the kinds of request, never how much is done alone. */
export function menuSkills(menu: MenuItem[]): NonNullable<Card["skills"]> {
  return menu.map(({ id, name, description, examples }) => ({
    id,
    name,
    description,
    ...(examples?.length ? { examples } : {}),
  }));
}

/** The menu item a request is, by the id the brain gave, and how much is done alone for it. */
export function trustFor(
  menu: MenuItem[],
  id: string | undefined,
): { item?: MenuItem; trust: Trust } {
  const item = id ? menu.find((m) => m.id === id) : undefined;
  return { item, trust: item?.trust ?? FREE_TRUST };
}

/** The menu as the brain reads it when a request comes. */
export function menuLines(menu: MenuItem[]): string {
  return menu
    .map(
      (item) =>
        `- ${item.id}: ${item.name}${item.description ? ` — ${item.description}` : ""}`,
    )
    .join("\n");
}
