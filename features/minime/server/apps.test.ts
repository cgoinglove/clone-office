import assert from "node:assert/strict";
import { test } from "node:test";
import {
  desktopName,
  parseGnomeUsage,
  parseMdls,
  parseUserAssist,
  rankApps,
  rot13,
  windowsAppName,
} from "./apps";

const NOW = Date.parse("2026-10-01T00:00:00Z");

test("Spotlight's fields become days used lately, times opened and the last use", () => {
  const output = [
    "Notes",
    "2026-09-25 06:55:07 +0000",
    "41",
    '(\n    "2026-09-20 15:00:00 +0000",\n    "2026-07-01 15:00:00 +0000"\n)',
    "(null)",
    "(null)",
    "(null)",
    "(null)",
  ].join("\0");
  const [notes, old] = parseMdls(
    output,
    ["/System/Applications/Notes.app", "/Applications/Old.app"],
    NOW,
  );
  assert.deepEqual(notes, {
    name: "Notes",
    days: 1,
    uses: 41,
    lastUsedAt: "2026-09-25T06:55:07.000Z",
  });
  assert.deepEqual(old, {
    name: "Old",
    days: undefined,
    uses: undefined,
    lastUsedAt: undefined,
  });
});

test("apps are ranked by use, merged by name, and old ones dropped", () => {
  const ranked = rankApps(
    [
      {
        name: "Drawing",
        days: 21,
        uses: 300,
        lastUsedAt: "2026-09-30T00:00:00Z",
      },
      { name: "Mail", days: 25, lastUsedAt: "2026-09-30T00:00:00Z" },
      { name: "drawing", uses: 40, lastUsedAt: "2026-09-29T00:00:00Z" },
      { name: "Abandoned", uses: 900, lastUsedAt: "2025-01-01T00:00:00Z" },
    ],
    NOW,
  );
  assert.deepEqual(
    ranked.map((app) => app.name),
    ["Mail", "Drawing"],
  );
  assert.equal(ranked[1].uses, 340);
});

test("UserAssist values give a program's runs, focus time and last run", () => {
  const data = Buffer.alloc(72);
  data.writeUInt32LE(5, 4);
  data.writeUInt32LE(180_000, 12);
  data.writeBigUInt64LE(
    BigInt((Date.parse("2026-09-01T00:00:00Z") + 11_644_473_600_000) * 10_000),
    60,
  );
  const name = rot13(
    "{6D809377-6AF0-444B-8957-A3773F02200E}\\Vendor\\Drawing 2026\\drawing.exe",
  );
  assert.deepEqual(parseUserAssist(name, data), {
    name: "drawing",
    uses: 5,
    minutes: 3,
    lastUsedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(parseUserAssist(rot13("UEME_CTLSESSION"), data), undefined);
  assert.equal(
    windowsAppName(
      "{A77F5D77-2E2B-44C3-A6A2-ABA601054A51}\\Accessories\\Paint.lnk",
    ),
    "Paint",
  );
  assert.equal(
    windowsAppName("Microsoft.WindowsTerminal_8wekyb3d8bbwe!App"),
    "WindowsTerminal",
  );
});

test("GNOME's usage file and .desktop names are read", () => {
  const usage = parseGnomeUsage(
    '<?xml version="1.0"?>\n<application-state>\n  <context id="">\n    <application id="drawing.desktop" score="12" last-seen="1788000000"/>\n  </context>\n</application-state>',
  );
  assert.deepEqual(usage, [
    { id: "drawing.desktop", score: 12, lastSeen: 1788000000 },
  ]);
  assert.equal(
    desktopName(
      "[Desktop Entry]\nType=Application\nName=Drawing\n\n[Desktop Action new]\nName=New window\n",
    ),
    "Drawing",
  );
});
