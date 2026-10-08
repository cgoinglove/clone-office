import assert from "node:assert/strict";
import { test } from "node:test";
import { servicePlan } from "./service.mjs";

const base = {
  node: "/usr/local/bin/node",
  script: "/pkg/bin/clone-office.cjs",
  home: "/Users/ana",
  appHome: "/Users/ana/.clone-office",
  env: { PATH: "/usr/bin:/opt/homebrew/bin" },
  uid: 501,
};

test("macOS: a LaunchAgent that starts at sign-in and comes back only after a crash", () => {
  const plan = servicePlan({ ...base, platform: "darwin" });
  assert.equal(plan.kind, "launchd");
  assert.equal(
    plan.where,
    "/Users/ana/Library/LaunchAgents/com.clone-office.app.plist",
  );
  const plist = plan.files[0].content;
  assert.match(plist, /<string>\/pkg\/bin\/clone-office\.cjs<\/string>/);
  assert.match(plist, /<string>--service<\/string>/);
  assert.match(plist, /<key>SuccessfulExit<\/key>\s*<false\/>/);
  assert.match(
    plist,
    /<key>PATH<\/key>\s*<string>\/usr\/bin:\/opt\/homebrew\/bin/,
  );
  assert.deepEqual(plan.load.at(-1), [
    "launchctl",
    "bootstrap",
    "gui/501",
    plan.where,
  ]);
});

test("Linux: a systemd user service, restarted on failure only", () => {
  const plan = servicePlan({ ...base, platform: "linux", home: "/home/ana" });
  const unit = plan.files[0].content;
  assert.equal(
    plan.where,
    "/home/ana/.config/systemd/user/clone-office.service",
  );
  assert.match(
    unit,
    /ExecStart="\/usr\/local\/bin\/node" "\/pkg\/bin\/clone-office\.cjs" "--no-open" "--service"/,
  );
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /Environment="PATH=\/usr\/bin:\/opt\/homebrew\/bin"/);
});

test("Windows: a hidden script in the Startup folder, no administrator needed", () => {
  const plan = servicePlan({
    ...base,
    platform: "win32",
    node: "C:\\Program Files\\nodejs\\node.exe",
    env: { APPDATA: "C:\\Users\\ana\\AppData\\Roaming" },
  });
  assert.match(plan.where, /Startup[\\/]Clone Office\.vbs$/);
  assert.match(
    plan.files[0].content,
    /Run """C:\\Program Files\\nodejs\\node\.exe"" ""\/pkg\/bin\/clone-office\.cjs"" ""--no-open"" ""--service""", 0, False/,
  );
});

test("XML in a path is escaped in the plist", () => {
  const plan = servicePlan({
    ...base,
    platform: "darwin",
    script: "/Users/a&b/<pkg>/clone-office.cjs",
  });
  assert.match(plan.files[0].content, /\/Users\/a&amp;b\/&lt;pkg&gt;\//);
});
