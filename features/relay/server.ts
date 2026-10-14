// Run a relay for an office:
//   node features/relay/server.ts [--port 3200] [--host 127.0.0.1] [--database URL|folder] [--key KEY]
// Where it keeps the office: --database (or DATABASE_URL) is a Postgres URL for a relay deployed
// on a server; without one it keeps it in the folder `relay-data` with PGlite, nothing to install.
// The office key (--key or RELAY_KEY) is what lets a mini-me join; without one the relay keeps the
// key its office was made with, and makes one the first time. With --host 0.0.0.0 it is reachable
// from the network, and it says at which addresses. Started by the app with RELAY_WITH_PARENT=1
// (and its stdin a pipe the app holds), it stops when the app does, however the app ends. The
// routes are in handler.ts. People make their accounts here from the office's invite link
// (accounts.ts); RELAY_PUBLIC_URL is the address they reach it at, when a proxy stands in front,
// and the one Google sends people back to once the admin turns Google sign-in on.

import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { Accounts } from "./accounts.ts";
import { openDatabase } from "./db.ts";
import { relayHandler } from "./handler.ts";
import { Relay } from "./relay.ts";
import {
  DAILY_CALLS,
  relaySealKey,
  sealKeyMatches,
  TeamAi,
} from "./team-ai.ts";

const { values } = parseArgs({
  options: {
    port: { type: "string", default: "3200" },
    host: { type: "string", default: "127.0.0.1" },
    database: { type: "string" },
    key: { type: "string" },
  },
});

// An empty value (a compose file's unset variable) counts as none.
const target =
  values.database || process.env.DATABASE_URL || resolve("relay-data");
const db = await openDatabase(target);
const relay = await Relay.open(db);
const office = await relay.office(
  values.key || process.env.RELAY_KEY || undefined,
);
await relay.tidy();
const tidying = setInterval(
  () => void relay.tidy().catch(() => {}),
  60 * 60 * 1000,
);
tidying.unref();

const publicUrl = process.env.RELAY_PUBLIC_URL || undefined;
// Team keys are sealed with a key kept apart from the database (team-ai.ts).
const daily = Number(process.env.RELAY_TEAM_AI_DAILY);
// One key seals both the team keys and the sign-in secrets (the session secret, Google's). It is
// RELAY_ENCRYPTION_KEY, else one made once and kept in a file apart from the database: beside a
// PGlite folder's data, or for a Postgres in RELAY_KEY_DIR (`relay-keys` here by default; the
// compose file keeps it in a volume of its own), so a server works with secrets from its start.
const keyDir =
  db.kind === "postgres"
    ? process.env.RELAY_KEY_DIR || resolve("relay-keys")
    : target;
if (db.kind === "postgres" && !process.env.RELAY_ENCRYPTION_KEY?.trim())
  await mkdir(keyDir, { recursive: true, mode: 0o700 });
const sealKey = await relaySealKey(keyDir);
if (
  sealKey &&
  !(await sealKeyMatches(db, sealKey, process.env.RELAY_RESEAL === "1"))
) {
  console.error(
    `This database's secrets (sign-in, Google, team keys) were sealed with another key than this relay's (${
      process.env.RELAY_ENCRYPTION_KEY?.trim()
        ? "RELAY_ENCRYPTION_KEY"
        : join(keyDir, "secret.key")
    }). Give every relay process the same key: the one it had, through RELAY_ENCRYPTION_KEY or that file (relays sharing one database share it). To start over with this key instead, losing what the old one sealed, start once with RELAY_RESEAL=1.`,
  );
  process.exit(1);
}
const teamAi = new TeamAi(
  relay,
  sealKey,
  {},
  fetch,
  Number.isFinite(daily) && daily >= 0 ? daily : DAILY_CALLS,
);
const accounts = await Accounts.open(db, relay, { publicUrl, sealKey });

const server = createServer(
  relayHandler(relay, {
    // how many proxies stand in front (1 for one of your own, 2 with a CDN before it)
    trustProxy: Number(process.env.RELAY_TRUST_PROXY) || 0,
    accounts,
    publicUrl,
    // Started by someone's app: the office lives on their computer, reached on their network.
    onComputer: process.env.RELAY_WITH_PARENT === "1",
    teamAi,
  }),
);

server.listen(Number(values.port), values.host as string, () => {
  // The port it got, also when asked for any (--port 0)
  const { port } = server.address() as { port: number };
  console.log(`relay on http://${values.host}:${port}`);
  // Listening everywhere: the addresses teammates on the same network can join with.
  if (values.host === "0.0.0.0" || values.host === "::")
    for (const list of Object.values(networkInterfaces()))
      for (const net of list ?? [])
        if (net.family === "IPv4" && !net.internal)
          console.log(`on your network: http://${net.address}:${port}`);
  const at =
    publicUrl?.replace(/\/+$/, "") ??
    `http://${values.host === "0.0.0.0" || values.host === "::" ? "<address above>" : values.host}:${port}`;
  // The office's own key, for whoever runs the server; people are invited from their pages.
  console.log(`office key (keep it to yourself): ${office.key}`);
  // Until it has one, the link that makes the server's admin: whoever runs it opens it first.
  void accounts
    .adminLink()
    .then((token) =>
      console.log(
        token
          ? `set up this server (make its admin account; works once, for a day): ${at}/setup/${token}`
          : `people sign in at: ${at}/login`,
      ),
    )
    .catch(() => {});
  if (db.kind === "postgres" && !process.env.RELAY_ENCRYPTION_KEY?.trim())
    console.log(
      `sealing key: ${join(keyDir, "secret.key")} (back it up apart from the database)`,
    );
  // Never the URL itself: it carries the database's password.
  console.log(
    `kept in: ${db.kind === "postgres" ? "Postgres (database URL)" : target}`,
  );
});

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  // Whatever closing waits on (a long poll, the database), the process ends: one left running
  // with its port closed would hold its folder and a CPU for nothing.
  setTimeout(() => process.exit(0), 3000);
  server.close();
  server.closeAllConnections();
  await relay.close().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
// The app that started it is gone once its end of the pipe closes.
if (process.env.RELAY_WITH_PARENT === "1") {
  process.stdin.on("end", () => void stop());
  process.stdin.on("error", () => void stop());
  process.stdin.resume();
}
