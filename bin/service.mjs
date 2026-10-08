// Clone Office as a login item: it starts when the person signs in to their computer and keeps
// running with no window open, so their clone answers colleagues while they are away from it.
//
//   macOS    a LaunchAgent (~/Library/LaunchAgents), started again by launchd only when it crashed
//   Linux    a systemd user service (~/.config/systemd/user), the same
//   Windows  a hidden script in the Startup folder (no administrator needed), run at sign-in
//
// After OpenClaw's gateway service (src/daemon/): its launchd policy, its systemd unit and its
// hidden Windows launcher. The launcher started this way exits quietly when the app already runs
// on its port, so only a crash brings it back. It runs the node and the package it was installed
// from; after updating Clone Office, `service install` again points it at the new one.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const LABEL = "com.clone-office.app";
const UNIT = "clone-office.service";

/** XML's five characters, for a plist. */
const xml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

/** A systemd value, quoted as its unit files read one. */
const quoted = (value) =>
  `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

/**
 * What a login item for this computer is made of: its files and the commands that load and unload
 * it. Plain data, so it can be shown before anything is changed (`service install --dry-run`).
 */
export function servicePlan(options) {
  const {
    platform = process.platform,
    node = process.execPath,
    script,
    home = homedir(),
    appHome,
    env = {},
    uid = process.getuid?.() ?? 0,
  } = options;
  const args = [node, script, "--no-open", "--service"];
  const log = join(appHome, "logs", "service.log");
  if (platform === "darwin") {
    const plist = join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
    const envXml = Object.entries(env)
      .map(
        ([key, value]) =>
          `      <key>${xml(key)}</key>\n      <string>${xml(value)}</string>`,
      )
      .join("\n");
    const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${args.map((arg) => `      <string>${xml(arg)}</string>`).join("\n")}
    </array>
    <key>EnvironmentVariables</key>
    <dict>
${envXml}
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
      <key>SuccessfulExit</key>
      <false/>
    </dict>
    <key>ThrottleInterval</key>
    <integer>10</integer>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>Umask</key>
    <integer>63</integer>
    <key>StandardInPath</key>
    <string>/dev/null</string>
    <key>StandardOutPath</key>
    <string>${xml(log)}</string>
    <key>StandardErrorPath</key>
    <string>${xml(log)}</string>
  </dict>
</plist>
`;
    const target = `gui/${uid}`;
    return {
      kind: "launchd",
      where: plist,
      files: [{ path: plist, content }],
      load: [
        ["launchctl", "bootout", target, plist],
        ["launchctl", "bootstrap", target, plist],
      ],
      unload: [["launchctl", "bootout", target, plist]],
      loaded: ["launchctl", "print", `${target}/${LABEL}`],
      log,
    };
  }
  if (platform === "linux") {
    const unit = join(home, ".config", "systemd", "user", UNIT);
    const content = `[Unit]
Description=Clone Office: your clone, answering your colleagues while you are away
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=${args.map(quoted).join(" ")}
${Object.entries(env)
  .map(([key, value]) => `Environment=${quoted(`${key}=${value}`)}`)
  .join("\n")}
Restart=on-failure
RestartSec=10
UMask=0077
StandardOutput=append:${log}
StandardError=append:${log}

[Install]
WantedBy=default.target
`;
    return {
      kind: "systemd",
      where: unit,
      files: [{ path: unit, content }],
      load: [
        ["systemctl", "--user", "daemon-reload"],
        ["systemctl", "--user", "enable", "--now", UNIT],
      ],
      unload: [
        ["systemctl", "--user", "disable", "--now", UNIT],
        ["systemctl", "--user", "daemon-reload"],
      ],
      loaded: ["systemctl", "--user", "is-enabled", UNIT],
      log,
    };
  }
  if (platform === "win32") {
    const startup = join(
      env.APPDATA ?? join(home, "AppData", "Roaming"),
      "Microsoft",
      "Windows",
      "Start Menu",
      "Programs",
      "Startup",
    );
    const vbs = join(startup, "Clone Office.vbs");
    // VBScript doubles a quote inside a string; 0 runs it with no window.
    const line = args.map((arg) => `""${arg}""`).join(" ");
    const content = `' Clone Office starts with this computer, with no window: your clone answers your colleagues.\r\nCreateObject("WScript.Shell").Run "${line}", 0, False\r\n`;
    return {
      kind: "startup",
      where: vbs,
      files: [{ path: vbs, content }],
      load: [["wscript.exe", vbs]],
      unload: [],
      loaded: undefined,
      log,
    };
  }
  return undefined;
}

function run(command) {
  const [file, ...args] = command;
  const done = spawnSync(file, args, { encoding: "utf8" });
  return {
    ok: done.status === 0,
    out: `${done.stdout ?? ""}${done.stderr ?? ""}`.trim(),
  };
}

/** Installs, removes or reports the login item; returns what to tell the person. */
export function service(action, options) {
  const plan = servicePlan(options);
  if (!plan)
    return {
      ok: false,
      message: `Starting with the computer is not set up for ${process.platform} yet.`,
    };
  const installed = existsSync(plan.where);
  if (action === "status") {
    const loaded = plan.loaded ? run(plan.loaded).ok : installed;
    return {
      ok: true,
      installed,
      loaded,
      message: installed
        ? `Clone Office starts with this computer (${plan.where}).${loaded ? "" : " It is not loaded now; run `npx clone-office service install` again."}${existsSync(options.script) ? "" : " The copy it runs is gone; run `npx clone-office service install` again."}`
        : "Clone Office does not start with this computer. `npx clone-office service install` sets it up.",
    };
  }
  if (action === "uninstall") {
    for (const command of plan.unload) run(command);
    rmSync(plan.where, { force: true });
    return {
      ok: true,
      installed: false,
      message: "Clone Office no longer starts with this computer.",
    };
  }
  if (action === "install") {
    if (options.dryRun)
      return {
        ok: true,
        message: [
          ...plan.files.map((file) => `${file.path}:\n${file.content}`),
          ...plan.load.map((command) => `$ ${command.join(" ")}`),
        ].join("\n"),
      };
    mkdirSync(dirname(plan.log), { recursive: true });
    for (const file of plan.files) {
      mkdirSync(dirname(file.path), { recursive: true });
      writeFileSync(file.path, file.content, { mode: 0o600 });
    }
    // The first unload of launchd's pair may find nothing loaded: only the last command counts.
    let last = { ok: true, out: "" };
    for (const command of plan.load) last = run(command);
    return last.ok
      ? {
          ok: true,
          installed: true,
          message: `Clone Office now starts with this computer, with no window open. \`npx clone-office service uninstall\` undoes it.`,
        }
      : {
          ok: false,
          installed: true,
          message: `Set up, but it did not start: ${last.out}`,
        };
  }
  return {
    ok: false,
    message: "Use: clone-office service install | uninstall | status",
  };
}
