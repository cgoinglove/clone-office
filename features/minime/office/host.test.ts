import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import type { networkInterfaces } from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

type Nets = ReturnType<typeof networkInterfaces>;
const v4 = (address: string, internal = false) => ({
  address,
  netmask: "255.255.255.0",
  family: "IPv4" as const,
  mac: "00:00:00:00:00:00",
  internal,
  cidr: `${address}/24`,
});

const root = mkdtempSync(join(tmpdir(), "minime-host-"));
const saved = process.env.CLONE_OFFICE_HOME;
let host: typeof import("./host");
let client: typeof import("./client");

before(async () => {
  process.env.CLONE_OFFICE_HOME = root;
  host = await import("./host");
  client = await import("./client");
});
after(async () => {
  await host.closeHere();
  if (saved === undefined) delete process.env.CLONE_OFFICE_HOME;
  else process.env.CLONE_OFFICE_HOME = saved;
  // The relay lets go of its folder as it stops.
  for (let i = 0; i < 20; i++)
    try {
      rmSync(root, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
});

test("the address teammates reach is the Wi-Fi or wired one, not a VPN's, a container's or a public one", () => {
  const nets: Nets = {
    lo0: [v4("127.0.0.1", true)],
    utun4: [v4("10.8.0.2")],
    docker0: [v4("172.17.0.1")],
    bridge100: [v4("192.168.64.1")],
    en0: [v4("192.168.0.12")],
    en5: [v4("203.0.113.9")],
  };
  assert.equal(host.networkAddress(nets), "192.168.0.12");
  assert.equal(
    host.networkAddress({
      "vEthernet (WSL)": [v4("172.20.0.1")],
      "Wi-Fi": [v4("10.0.0.23")],
    }),
    "10.0.0.23",
  );
  assert.equal(host.networkAddress({ lo: [v4("127.0.0.1", true)] }), undefined);
});

test("on a network with IPv6 only, the address is the IPv6 one, not the IPv4 the computer gives itself", () => {
  const v6 = (address: string, scopeid = 0) => ({
    address,
    netmask: "ffff:ffff:ffff:ffff::",
    family: "IPv6" as const,
    mac: "00:00:00:00:00:00",
    internal: false,
    cidr: `${address}/64`,
    scopeid,
  });
  assert.equal(
    host.networkAddress({
      en0: [
        v6("fe80::1c2b:3d4e", 11),
        v6("2001:db8:5:6::a"),
        v6("2001:db8:5:6::b"),
        { ...v4("192.0.0.2"), netmask: "255.255.255.255" },
      ],
      utun3: [v6("fd00:aaaa::1")],
    }),
    "[2001:db8:5:6::a]",
  );
});

test("an office opens on this computer, its link carries the network address, and it opens again as the same person", async () => {
  const card = { name: "Ana", description: "Payments" };
  const office = await host.openHere(card);
  assert.match(office.relay, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(await host.hostsOffice(office), true);
  const { members } = await client.members(office);
  assert.deepEqual(
    members.map((m) => m.card.name),
    ["Ana"],
  );
  const shared = await host.publicRelay(office);
  const address = host.networkAddress();
  assert.equal(
    shared,
    address ? office.relay.replace("127.0.0.1", address) : office.relay,
  );
  const invite = await client.inviteLink(office, shared);
  assert.ok(invite.startsWith(`${shared}/i/`));
  // Teammates' address reaches it: it listens on the network, not only on this computer.
  assert.equal((await fetch(invite)).status, 200);

  await host.closeHere();
  await client.leaveOffice();
  await assert.rejects(client.members(office), /relay|fetch|ECONNREFUSED/i);

  const again = await host.openHere({ ...card, status: "working" });
  assert.equal(again.relay, office.relay, "the same address");
  assert.equal(
    again.member,
    office.member,
    "the same member, not a second card",
  );
  assert.equal(again.card.status, "working");
  assert.equal((await client.members(again)).members.length, 1);
});

test("when the app starts again, the page's first look finds the office open again", async () => {
  const office = await client.loadOffice();
  assert.ok(office);
  // The app's process ended: its relay went with it, while the office stays open in the settings.
  const relay = (globalThis as { __minimeRelay?: { child: ChildProcess } })
    .__minimeRelay;
  assert.ok(relay);
  relay.child.kill();
  await once(relay.child, "exit");
  await assert.rejects(client.members(office));
  await host.resumeHosting();
  assert.equal((await client.members(office)).members.length, 1);
});
