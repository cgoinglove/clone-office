// Updates from the project's GitHub Releases, through electron-updater, as Orca and Hermes Agent
// ship theirs. Where the app can replace itself (Windows, Linux as an AppImage, and macOS when the
// build was signed and notarized: Squirrel.Mac refuses anything else), the newer version is
// fetched in the background and put in place on restart. Elsewhere (macOS unsigned, Linux's .deb)
// the same look only finds the newer version, and Settings › General and the tray menu link to its
// page to download it from. Looked at a minute after start, then every six hours.

const FIRST_LOOK_MS = 60_000;
const EVERY_MS = 6 * 60 * 60_000;

/** Whether this copy can put an update in place itself. */
export function canReplaceItself({
  platform = process.platform,
  env = process.env,
  signedMac = false,
}) {
  if (platform === "win32") return true;
  if (platform === "linux") return Boolean(env.APPIMAGE);
  if (platform === "darwin") return signedMac;
  return false;
}

/**
 * The app's updates. `load` gives electron-updater's autoUpdater, loaded only when used (it reads
 * the app's version as it loads). `changed` is called whenever what is known changes.
 */
export function createUpdates({
  load,
  canReplace,
  releases,
  log = () => {},
  changed = () => {},
}) {
  const state = { newer: null, ready: false, download: null };
  let updater;
  let timer;

  const look = () => {
    updater
      ?.checkForUpdates()
      .catch((error) => log(`updates: ${error?.message ?? error}`));
  };

  return {
    /** Starts looking; nothing happens in a copy that was never packaged. */
    start() {
      try {
        updater = load();
      } catch (error) {
        log(`updates: not available (${error?.message ?? error})`);
        return;
      }
      updater.autoDownload = canReplace;
      updater.autoInstallOnAppQuit = canReplace;
      updater.logger = {
        info: () => {},
        warn: (text) => log(`updates: ${text}`),
        error: (text) => log(`updates: ${text}`),
        debug: () => {},
      };
      updater.on("update-available", (info) => {
        state.newer = info.version;
        state.download =
          !canReplace && releases ? `${releases}/tag/v${info.version}` : null;
        changed();
      });
      updater.on("update-downloaded", (info) => {
        state.newer = info.version;
        state.ready = true;
        changed();
      });
      updater.on("error", (error) =>
        log(`updates: ${error?.message ?? error}`),
      );
      timer = setTimeout(function again() {
        look();
        timer = setTimeout(again, EVERY_MS);
        timer.unref?.();
      }, FIRST_LOOK_MS);
      timer.unref?.();
    },
    /** What Settings shows (features/minime/server/update.ts DesktopUpdate). */
    status: () => ({ ...state }),
    /** Restarts into the version that is ready; false when none is. */
    install() {
      if (!state.ready || !updater) return false;
      clearTimeout(timer);
      // Quietly (the person asked for it already), and the app opens again once it is in place.
      updater.quitAndInstall(true, true);
      return true;
    },
  };
}
