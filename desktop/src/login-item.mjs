// Starting with the computer, for the desktop app (Settings › General › Start with this computer,
// through app/api/me/service): the app itself is the login item, opened with no window so the clone
// answers colleagues from sign-in, in place of the npm package's LaunchAgent or systemd unit
// (bin/service.mjs), which stays the way for `npx clone-office`. macOS and Windows keep login items
// themselves (Electron's setLoginItemSettings); Linux desktops read an autostart entry
// (freedesktop's Desktop Application Autostart), which is written here.

import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Opened by a login item: no window, only the icon in the menu bar or tray. */
export const HIDDEN = "--hidden";

/** Where a Linux desktop looks for what starts at sign-in. */
export function autostartFile(env = process.env, home = homedir()) {
  return join(
    env.XDG_CONFIG_HOME || join(home, ".config"),
    "autostart",
    "clone-office.desktop",
  );
}

/** A value in a desktop entry's Exec line, quoted as the specification says. */
function execArg(value) {
  return `"${String(value).replace(/(["`$\\])/g, "\\$1")}"`;
}

/** The autostart entry that opens the app with no window. */
export function autostartEntry(executable) {
  return `[Desktop Entry]
Type=Application
Name=Clone Office
Exec=${execArg(executable)} ${HIDDEN}
Terminal=false
X-GNOME-Autostart-enabled=true
`;
}

/**
 * The login item for this app: whether it is on, and turning it on or off. `executable` is what a
 * Linux desktop starts: the AppImage itself when the app runs as one (APPIMAGE names it; the path
 * inside it changes with every run), else the installed program.
 */
export function loginItem({
  app,
  platform = process.platform,
  executable = process.env.APPIMAGE || process.execPath,
  file = autostartFile(),
}) {
  if (platform === "linux")
    return {
      get: () => existsSync(file),
      set(on) {
        if (on) {
          mkdirSync(dirname(file), { recursive: true });
          writeFileSync(file, autostartEntry(executable));
        } else rmSync(file, { force: true });
        return existsSync(file);
      },
    };
  // Windows keeps a login item per program and its arguments: the same both ways.
  const which =
    platform === "win32" ? { path: process.execPath, args: [HIDDEN] } : {};
  return {
    get: () => Boolean(app.getLoginItemSettings(which).openAtLogin),
    set(on) {
      app.setLoginItemSettings({ ...which, openAtLogin: on });
      return Boolean(app.getLoginItemSettings(which).openAtLogin);
    },
  };
}

/** Whether a login item opened this run, so it starts with no window. */
export function openedAtLogin({
  app,
  platform = process.platform,
  argv = process.argv,
}) {
  if (argv.includes(HIDDEN)) return true;
  return platform === "darwin"
    ? Boolean(app.getLoginItemSettings().wasOpenedAtLogin)
    : false;
}
