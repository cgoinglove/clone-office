// Opening the office on this computer: the app runs its team's relay itself, the same server as
// `pnpm relay` in a process of its own, keeping the office in the mini-me's folder (`relay/`, with
// PGlite), reachable from the same network, and joins it from inside this computer. Teammates join
// by the invite link, which carries this computer's network address. The relay stops with the app
// and opens again, at the same port and with the same key, when the person's page next asks about
// the office. What it keeps is never deleted here.
//
// settings.json "host": the port and key (kept so links stay the same), whether it is open, and,
// while it is closed, the person's own membership, so opening it again brings them back as
// themselves rather than as a second card.

import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { connect, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import { withLock } from "../memory/files.ts";
import { settingsPath, writeSettings } from "../server/exclude.ts";
import { minimeHome, relayServerPath } from "../server/paths.ts";
import {
  type Card,
  joinOffice,
  loadOffice,
  type OfficeConfig,
  OfficeError,
  updateCard,
} from "./client.ts";

export interface Host {
  port: number;
  /** The office key; the invite link carries it. */
  key: string;
  /** Open: the relay runs while the app does. */
  on: boolean;
  /** While closed: who the person is in it. */
  member?: string;
  token?: string;
}

/** The first port tried for a new office; the next free one is taken when it is in use. */
const FIRST_PORT = 3200;
/** How long a relay may take to start; the first time it also makes its database. */
const START_MS = 30_000;
/** After a failed start, how long before the page's next look tries again. */
const RETRY_MS = 30_000;

interface Running {
  child: ChildProcess;
  port: number;
  /** The relay's last error lines. */
  errors: string[];
}

// One relay per server process, on globalThis so it survives module reloads in development.
const holder = globalThis as typeof globalThis & {
  __minimeRelay?: Running;
  __minimeRelayStarting?: Promise<void>;
  __minimeRelayProblem?: { code: string; at: number };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function relayFolder(): string {
  return join(/*turbopackIgnore: true*/ minimeHome(), "relay");
}

/** The relay as this computer's own mini-me reaches it. */
export function localRelay(host: Pick<Host, "port">): string {
  return `http://127.0.0.1:${host.port}`;
}

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath(), "utf8"));
  } catch {
    return {};
  }
}

export async function loadHost(): Promise<Host | undefined> {
  const host = (await readSettings()).host as Host | undefined;
  return host?.port && host.key ? host : undefined;
}

async function saveHost(host: Host): Promise<void> {
  await withLock(minimeHome(), async () => {
    const settings = await readSettings();
    await writeSettings(`${JSON.stringify({ ...settings, host }, null, 2)}\n`);
  });
}

// Interfaces that are not the network teammates share: the computer itself, VPNs and tunnels,
// virtual machines and containers, and Apple's peer-to-peer links.
const NOT_LAN =
  /^(lo|utun|tun|tap|ppp|ipsec|gpd|wg|zt|tailscale|docker|br-|veth|virbr|vboxnet|vmnet|vEthernet|VirtualBox|VMware|Bluetooth|bridge|awdl|llw|anpi)/i;
const WIRED_OR_WIFI = /^(en|eth|wl|wi-?fi|ethernet)/i;

function isPrivate(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  );
}

/** A global or unique-local IPv6 address: not the computer itself and not one of a link only. */
function isRoutable6(address: string): boolean {
  return /^(2|3|f[cd])/i.test(address);
}

/**
 * This computer's address on its local network (Wi-Fi or wired), as teammates reach it, for a
 * link: a private IPv4 address, else, on a network with IPv6 only (a phone's hotspot, some
 * offices), its IPv6 address in brackets. The IPv4 address such a network gives the computer for
 * itself (192.0.0.2) is not one others reach.
 */
export function networkAddress(
  nets: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string | undefined {
  const found: { name: string; address: string; rank: number }[] = [];
  for (const [name, list] of Object.entries(nets))
    for (const net of list ?? []) {
      if (net.internal || NOT_LAN.test(name)) continue;
      const lan = WIRED_OR_WIFI.test(name) ? 0 : 1;
      if (net.family === "IPv4" && isPrivate(net.address))
        found.push({ name, address: net.address, rank: lan });
      else if (net.family === "IPv6" && isRoutable6(net.address))
        found.push({ name, address: `[${net.address}]`, rank: 2 + lan });
    }
  // Stable for the same list: the first address of an interface comes first.
  found.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  return found[0]?.address;
}

/** Where the relay listens: every address, IPv6 too when this computer has it. */
function everywhere(
  nets: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string {
  return Object.values(nets).some((list) =>
    list?.some((net) => net.family === "IPv6"),
  )
    ? "::"
    : "0.0.0.0";
}

/** Whether nothing answers at the port on this computer and it can be listened on from the network. */
async function portFree(port: number): Promise<boolean> {
  const answering = await new Promise<boolean>((resolve) => {
    const socket = connect({ port, host: "127.0.0.1" });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (answering) return false;
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, everywhere(), () => server.close(() => resolve(true)));
  });
}

async function freePort(): Promise<number> {
  for (let port = FIRST_PORT; port < FIRST_PORT + 100; port++)
    if (await portFree(port)) return port;
  throw new OfficeError("relay-port-taken", "No free port for the relay.");
}

/** Whether this office's relay answers at its port: its invite page opens for its key. */
async function answers(host: Host): Promise<boolean> {
  try {
    const response = await fetch(`${localRelay(host)}/i/${host.key}`, {
      signal: AbortSignal.timeout(1500),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

function running(port: number): boolean {
  const relay = holder.__minimeRelay;
  return Boolean(
    relay &&
      relay.port === port &&
      relay.child.exitCode === null &&
      relay.child.signalCode === null,
  );
}

async function startRelay(host: Host): Promise<void> {
  if (running(host.port)) return;
  // Already answering for this office: started by this app before a module reload.
  if (await answers(host)) return;
  if (!(await portFree(host.port)))
    throw new OfficeError("relay-port-taken", `Port ${host.port} is in use.`);
  await mkdir(relayFolder(), { recursive: true });
  const logs = join(/*turbopackIgnore: true*/ minimeHome(), "logs");
  await mkdir(logs, { recursive: true });
  // The key goes by the environment, which other people on this computer cannot read; the
  // person's own database URL or proxy setting is not this relay's.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RELAY_KEY: host.key,
    RELAY_WITH_PARENT: "1",
  };
  delete env.NODE_OPTIONS;
  delete env.DATABASE_URL;
  delete env.RELAY_TRUST_PROXY;
  const child = spawn(
    process.execPath,
    [
      "--no-warnings",
      relayServerPath(),
      "--host",
      everywhere(),
      "--port",
      String(host.port),
      "--database",
      relayFolder(),
    ],
    // stdin stays open: the relay stops when it closes, that is when this process ends.
    { env, stdio: ["pipe", "ignore", "pipe"], windowsHide: true },
  );
  const relay: Running = { child, port: host.port, errors: [] };
  holder.__minimeRelay = relay;
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (text: string) => {
    relay.errors.push(...text.split("\n").filter(Boolean));
    relay.errors.splice(0, Math.max(0, relay.errors.length - 20));
    void appendFile(
      join(/*turbopackIgnore: true*/ logs, "relay.log"),
      text,
    ).catch(() => {});
  });
  const ended = new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.once("error", (error) => {
      relay.errors.push(error.message);
      resolve();
    });
  });
  const deadline = Date.now() + START_MS;
  while (Date.now() < deadline && running(host.port)) {
    if (await answers(host)) return;
    await Promise.race([ended, sleep(300)]);
  }
  stopRelay();
  throw new OfficeError(
    "relay-failed",
    relay.errors.at(-1) ?? "The relay did not start.",
  );
}

/** Starts the relay once at a time, however many calls ask for it together. */
function ensureRelay(host: Host): Promise<void> {
  holder.__minimeRelayStarting ??= startRelay(host).finally(() => {
    holder.__minimeRelayStarting = undefined;
  });
  return holder.__minimeRelayStarting;
}

/** Stops the relay this app started, letting it close its database first. */
function stopRelay(): void {
  const relay = holder.__minimeRelay;
  holder.__minimeRelay = undefined;
  if (!relay || relay.child.exitCode !== null) return;
  relay.child.stdin?.end();
  setTimeout(() => {
    if (relay.child.exitCode === null) relay.child.kill();
  }, 5000).unref();
}

/**
 * Opens the office again after the app started anew, so the page's look finds it open (a second
 * or two). A failure is kept for the screen and tried again a little later, not on every look.
 */
export async function resumeHosting(): Promise<void> {
  const host = await loadHost();
  if (!host?.on || running(host.port)) return;
  const failed = holder.__minimeRelayProblem;
  if (
    failed &&
    Date.now() - failed.at < RETRY_MS &&
    !holder.__minimeRelayStarting
  )
    return;
  try {
    await ensureRelay(host);
    holder.__minimeRelayProblem = undefined;
  } catch (error) {
    holder.__minimeRelayProblem = {
      code: error instanceof OfficeError ? error.code : "relay-failed",
      at: Date.now(),
    };
  }
}

/** Why the office on this computer is not open, when it should be. */
export function hostProblem(): string | undefined {
  return holder.__minimeRelayProblem?.code;
}

/** Opens the office on this computer (the same one, if it was open before) and joins it as the person. */
export async function openHere(card: Card): Promise<OfficeConfig> {
  const host: Host = (await loadHost()) ?? {
    port: await freePort(),
    key: randomBytes(18).toString("base64url"),
    on: false,
  };
  await ensureRelay(host);
  holder.__minimeRelayProblem = undefined;
  const relay = localRelay(host);
  let office: OfficeConfig | undefined;
  if (host.member && host.token)
    office = await updateCard(
      { relay, member: host.member, token: host.token, card },
      card,
    ).catch((error: unknown) => {
      // Its records were moved away: join it anew.
      if (
        error instanceof OfficeError &&
        error.code === "office-member-unknown"
      )
        return undefined;
      throw error;
    });
  office ??= await joinOffice(relay, host.key, card);
  await saveHost({ port: host.port, key: host.key, on: true });
  return office;
}

/** Closes the office on this computer: the relay stops, what it keeps stays. */
export async function closeHere(): Promise<void> {
  const host = await loadHost();
  if (!host) return;
  const office = await loadOffice();
  await saveHost(
    office?.relay === localRelay(host)
      ? { ...host, on: false, member: office.member, token: office.token }
      : { ...host, on: false },
  );
  stopRelay();
}

/** Whether the person's office is the one open on this computer. */
export async function hostsOffice(office: OfficeConfig): Promise<boolean> {
  const host = await loadHost();
  return Boolean(host?.on && office.relay === localRelay(host));
}

/** The relay's address as others reach it: this computer's network address when it is the relay. */
export async function publicRelay(office: OfficeConfig): Promise<string> {
  const host = await loadHost();
  if (!host?.on || office.relay !== localRelay(host)) return office.relay;
  const address = networkAddress();
  return address ? `http://${address}:${host.port}` : office.relay;
}
