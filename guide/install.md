# Installing Clone Office

There are two ways to have Clone Office on a computer. Both are the same app, and both keep the
clone in the same folder (`~/.clone-office`), so a person can move from one to the other and keep
everything: what the clone knows, its conversations, its office.

| | The desktop app | With Node.js |
|---|---|---|
| What they install | One file for their system, nothing else | Node.js 22.13 or later, then one line in a terminal |
| Where it opens | A window of its own, with an icon in the menu bar (Mac) or the tray (Windows, Linux) | A tab in their browser |
| Updates | It updates itself on Windows and Linux (AppImage); on a Mac, Settings › General links to the new download | Settings › General gives the line that starts the new version |

For someone who does not code, the desktop app is the simpler way.

## The desktop app

The files are on the project's GitHub page, under the latest release:

- **Mac**: the `.dmg` ending in `mac-arm64` for Apple silicon (M1 and later), `mac-x64` for an Intel
  Mac. They open it and drag Clone Office into Applications.
- **Windows**: the `win-x64-setup.exe`. It installs for them alone, with no administrator.
- **Linux**: the `.AppImage`, or the `.deb` for Ubuntu and Debian.

The app is not signed with a developer certificate yet, so the first open is asked once:

- **Mac**: right-click (or Control-click) Clone Office in Applications, choose **Open**, then
  **Open** again. On macOS 15 and later, if it still will not open: **System Settings › Privacy &
  Security**, scroll down, **Open Anyway** beside Clone Office.
- **Windows**: SmartScreen's "Windows protected your PC": **More info**, then **Run anyway**.
- **Linux**: the AppImage must be made executable first: right-click › **Properties** ›
  **Permissions** › **Allow executing file as program**, or `chmod +x` on it in a terminal.

Closing the window does not stop the clone: it keeps answering colleagues, and its icon stays in the
menu bar or tray. The icon opens the window again and has **Quit Clone Office**, which stops it.
Opening the app again while it runs shows the same window. The app finds the person's own Claude
Code, Codex and git as their terminal does.

Its menus speak the language picked under Settings › General › Language, else the computer's.

## With Node.js

1. Install Node.js 22.13 or later from nodejs.org.
2. Open a terminal (Mac: ⌘ Space, *Terminal*; Windows: the Windows key, *cmd*; Linux: usually
   Ctrl+Alt+T).
3. Run `npx -y clone-office`. The app opens in the browser, and runs while that terminal window is
   open; the same line starts it again later.

A teammate's invite link opens a page with these steps for their computer, and a line that also
joins the office. With the desktop app, they paste the invite link in the first steps' team step
(or Settings › Office) instead.

## Starting with the computer

Settings › General › **Start with this computer** has the clone start when the person signs in,
with no window open, so it answers colleagues while they are away from it. In the desktop app it
makes the app itself open at sign-in, in the menu bar or tray; with Node.js it is a small service
(`npx clone-office service install`, and `service uninstall` to undo it). If the desktop app opens
while the Node.js one already runs for the same folder, it shows that one rather than starting a
second.

## Updates

- **Desktop app on Windows, or Linux as an AppImage**: it fetches a new version by itself; Settings ›
  General and the tray's menu then offer **Restart**, and it is back in a moment with everything
  kept.
- **Desktop app on a Mac, or Linux as a .deb**: Settings › General and the menu bar's menu say when a
  new version is out, with a link to download it; they open it as the first time, and it replaces
  the old one.
- **Node.js**: Settings › General gives the line that starts the new version, once this one is
  closed.

## Removing it

Removing the app (dragging it to the Trash, Windows' Apps settings, deleting the AppImage or
`sudo apt remove clone-office`) leaves the clone's folder, `~/.clone-office`, as it is: nothing the
clone kept is deleted with the app. To start with Clone Office again later, installing it is
enough.

## When it does not start

The desktop app says so, with **Try Again**, and keeps what happened in
`~/.clone-office/logs/desktop.log`. With Node.js, `npx -y clone-office doctor` checks what is
needed and says what to do.
