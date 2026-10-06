// The mini-me's side of its office: where its relay is and who it is there (settings.json,
// "office"), and the calls it makes to the relay. The relay's shapes are A2A's (../../relay).

import { readFile } from "node:fs/promises";
import type {
  Card,
  InboxEvent,
  Member,
  Task,
  TaskState,
} from "../../relay/relay.ts";
import { atomicWrite, withLock } from "../memory/files.ts";
import { settingsPath } from "../server/exclude.ts";
import { minimeHome } from "../server/paths.ts";

export type { Card, InboxEvent, Member, Task, TaskState };

export interface OfficeConfig {
  /** The relay's address, such as http://127.0.0.1:3200. */
  relay: string;
  member: string;
  token: string;
  card: Card;
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function loadOffice(): Promise<OfficeConfig | undefined> {
  const office = (await readSettings()).office as OfficeConfig | undefined;
  return office?.relay && office.token && office.member ? office : undefined;
}

async function saveOffice(office: OfficeConfig | undefined): Promise<void> {
  await withLock(minimeHome(), async () => {
    const { office: _old, ...settings } = await readSettings();
    await atomicWrite(
      settingsPath(),
      `${JSON.stringify(office ? { ...settings, office } : settings, null, 2)}\n`,
    );
  });
}

async function call<T>(
  relay: string,
  path: string,
  init: {
    method?: string;
    token?: string;
    body?: unknown;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const response = await fetch(new URL(path, relay), {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: init.signal,
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `The relay answered ${response.status}.`,
    );
  return data as T;
}

/** Join an office with its key, and keep where and who this mini-me is there. */
export async function joinOffice(
  relay: string,
  key: string,
  card: Card,
): Promise<OfficeConfig> {
  const { id, token } = await call<{ id: string; token: string }>(
    relay,
    "/join",
    {
      body: { key, card },
    },
  );
  const office = { relay, member: id, token, card };
  await saveOffice(office);
  return office;
}

export async function updateCard(
  office: OfficeConfig,
  card: Card,
): Promise<OfficeConfig> {
  await call(office.relay, "/join", { token: office.token, body: { card } });
  const next = { ...office, card };
  await saveOffice(next);
  return next;
}

/** Leave: forget the relay here (the relay keeps the past requests). */
export async function leaveOffice(): Promise<void> {
  await saveOffice(undefined);
}

export function members(office: OfficeConfig): Promise<{ members: Member[] }> {
  return call(office.relay, "/members", { token: office.token });
}

export function tasks(office: OfficeConfig): Promise<{ tasks: Task[] }> {
  return call(office.relay, "/tasks", { token: office.token });
}

export async function sendRequest(
  office: OfficeConfig,
  to: string,
  text: string,
): Promise<Task> {
  return (
    await call<{ task: Task }>(office.relay, "/tasks", {
      token: office.token,
      body: { to, text },
    })
  ).task;
}

export async function updateRequest(
  office: OfficeConfig,
  id: string,
  change: { state?: TaskState; text?: string },
): Promise<Task> {
  return (
    await call<{ task: Task }>(
      office.relay,
      `/tasks/${encodeURIComponent(id)}`,
      {
        token: office.token,
        body: change,
      },
    )
  ).task;
}

export function inbox(
  office: OfficeConfig,
  after: number,
  signal?: AbortSignal,
): Promise<{ events: InboxEvent[]; next: number }> {
  return call(office.relay, `/inbox?after=${after}`, {
    token: office.token,
    signal,
  });
}
