// Run a relay for an office:
//   node features/relay/server.ts [--port 3200] [--host 127.0.0.1] [--database URL|folder] [--key KEY]
// Where it keeps the office: --database (or DATABASE_URL) is a Postgres URL for a relay deployed
// on a server; without one it keeps it in the folder `relay-data` with PGlite, nothing to install.
// The office key (--key or RELAY_KEY) is what lets a mini-me join; without one the relay keeps the
// key its office was made with, and makes one the first time. With --host 0.0.0.0 it is reachable
// from the network, and it says at which addresses. Started by the app with RELAY_WITH_PARENT=1
// (and its stdin a pipe the app holds), it stops when the app does, however the app ends. The
// routes are in handler.ts. People make their accounts here from the office's invite link
// (accounts.ts); RELAY_PUBLIC_URL is the address they reach it at, when a proxy stands in front.

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { Accounts } from "./accounts.ts";
import { openDatabase } from "./db.ts";
import { relayHandler } from "./handler.ts";
import { Relay } from "./relay.ts";
import { DAILY_CALLS, relaySealKey, TeamAi } from "./team-ai.ts";

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
// A meeting's round ends when its time is up, whoever has not spoken.
const meetingRounds = setInterval(
  () => void relay.advanceMeetings().catch(() => {}),
  5000,
);
meetingRounds.unref();

const publicUrl = process.env.RELAY_PUBLIC_URL || undefined;
// Team keys are sealed with a key kept apart from the database (team-ai.ts).
const daily = Number(process.env.RELAY_TEAM_AI_DAILY);
const teamAi = new TeamAi(
  relay,
  await relaySealKey(db.kind === "postgres" ? undefined : target),
  {},
  fetch,
  Number.isFinite(daily) && daily >= 0 ? daily : DAILY_CALLS,
);
const accounts = await Accounts.open(db, relay, { publicUrl });

const server = createServer(
  relayHandler(relay, {
    trustProxy: process.env.RELAY_TRUST_PROXY === "1",
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
  console.log(`office key: ${office.key}`);
  // Whoever started the relay opens this first: the first account made there owns the office.
  console.log(
    `invite link (make your account here first): ${publicUrl ?? `http://${values.host === "0.0.0.0" || values.host === "::" ? "<address above>" : values.host}:${port}`}/i/${office.key}`,
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
