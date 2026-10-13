// Clone Office as a desktop app: one downloaded file, no Node.js to install, and the same app as
// `npx clone-office`. Electron's main process starts the npm package's own server (carried inside,
// desktop/build.mjs) with Electron's Node, opens it in a window of its own, and keeps it running
// from the menu bar or the tray when the window is closed, so the clone goes on answering
// colleagues; quitting stops the server it started. The clone's folder is the one the launcher uses
// (~/.clone-office, or CLONE_OFFICE_HOME), and the app already running for it is opened rather
// than started twice; its port is the first free one from the launcher's 4417, or from --port. What
// only this process can do (the login item, updates) the server asks over the channel between them
// (features/minime/server/desktop.ts).

import {
  createWriteStream,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  Notification,
  nativeImage,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import electronUpdater from "electron-updater";
import {
  appHome,
  askedPort,
  FIRST_PORT,
  findApp,
  HOST,
  ours,
} from "./home.mjs";
import loadingPage from "./loading.html";
import { loginItem, openedAtLogin } from "./login-item.mjs";
import { startServer, stopServer, waitUntilUp } from "./server.mjs";
import { takeShellPath } from "./shell-path.mjs";
import { canReplaceItself, createUpdates } from "./updates.mjs";
import { pickLocale, translator } from "./words.mjs";

const mac = process.platform === "darwin";
const home = appHome();
// Chromium's own state for the window (the page's cookies, storage, caches) stays with the
// clone's, and one desktop app runs per clone folder, as the launcher runs one app per folder.
app.setPath("userData", join(home, "desktop"));

// ---- What it keeps and says ----

const logFile = join(home, "logs", "desktop.log");
let logStream;

/** One line in logs/desktop.log: this process's own, and what the server prints. */
function log(line) {
  try {
    if (!logStream) {
      mkdirSync(join(home, "logs"), { recursive: true });
      // One older log is kept beside the current one, each up to 5 MB.
      try {
        if (statSync(logFile).size > 5 * 1024 * 1024)
          renameSync(logFile, `${logFile}.1`);
      } catch {}
      logStream = createWriteStream(logFile, { flags: "a" });
    }
    logStream.write(`${new Date().toISOString()} ${line}\n`);
  } catch {}
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

/** What the build said of itself (desktop/build.mjs): the repository, and whether it was signed. */
const built = readJson(join(app.getAppPath(), "build.json")) ?? {};
const repository = built.repository
  ? `https://github.com/${built.repository}`
  : undefined;

const allWords = readJson(join(app.getAppPath(), "words.json")) ?? {};
let locale = "en";
let t = translator(allWords, locale);

/** This process's small state: whether the person has been told closing keeps it running. */
const statePath = () => join(app.getPath("userData"), "desktop-state.json");
const state = () => readJson(statePath()) ?? {};
function keepState(change) {
  try {
    writeFileSync(statePath(), JSON.stringify({ ...state(), ...change }));
  } catch {}
}

// ---- The server ----

/** Where the package's server is: beside the app once packaged, in the build's stage before. */
const serverDir = () =>
  app.isPackaged
    ? join(process.resourcesPath, "server")
    : join(app.getAppPath(), "..", "server");

let origin;
let server;
let port;
/** True while the window shows an app this process did not start (npm's service, say). */
let attached = false;
let quitting = false;
let stopped = false;
let restartTimes = [];

/** Starts the server, or finds the one already answering for this folder; true once one answers. */
async function connect() {
  const found = await findApp(home, { first: askedPort() ?? FIRST_PORT });
  port = found.port;
  if (found.running) {
    attached = true;
    origin = `http://${HOST}:${port}`;
    log(`using the app already running at ${origin}`);
    return true;
  }
  attached = false;
  const child = startServer({
    appDir: serverDir(),
    port,
    log: (line) => log(`server: ${line}`),
  });
  server = child;
  let up = false;
  child.on("message", (message) => void answer(child, message));
  child.on("error", (error) => log(`server: ${error.message}`));
  child.on("exit", (code, signal) => {
    log(`server stopped (${code ?? signal})`);
    if (server === child) server = undefined;
    if (up && !quitting) void recover();
  });
  up = await waitUntilUp(child, port);
  if (!up) {
    await stopServer(child);
    return false;
  }
  origin = `http://${HOST}:${port}`;
  log(`server answers at ${origin}`);
  return true;
}

/** After the server stopped on its own: started again, three times in ten minutes at most. */
async function recover() {
  const now = Date.now();
  restartTimes = restartTimes.filter((at) => now - at < 10 * 60_000);
  if (restartTimes.length >= 3) return failed();
  restartTimes.push(now);
  if (await connect()) openApp();
  else await failed();
}

/** Says the app could not start, with where its log is; tries again or quits. */
async function failed() {
  const { response } = await dialog.showMessageBox({
    type: "error",
    message: t("notStarted"),
    detail: t("notStartedDetail", { log: logFile }),
    buttons: [t("tryAgain"), t("quit")],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return app.quit();
  if (!(await connect())) return failed();
  openApp();
  showWindow();
}

/** An app this process did not start can stop: then this one starts its own. */
function watchAttached() {
  let misses = 0;
  setInterval(async () => {
    if (!attached || quitting) return;
    misses = (await ours(port)) ? 0 : misses + 1;
    if (misses < 2) return;
    misses = 0;
    attached = false;
    if (await connect()) openApp();
    else await failed();
  }, 15_000).unref();
}

/** What the server asks of the app (features/minime/server/desktop.ts askDesktop). */
async function answer(child, message) {
  if (!message || message.cloneOffice !== 1 || typeof message.id !== "string")
    return;
  let reply;
  try {
    if (message.ask === "login-item") {
      const item = loginItem({ app });
      const on =
        typeof message.on === "boolean" ? item.set(message.on) : item.get();
      reply = { ok: true, on };
    } else if (message.ask === "update") reply = updates.status();
    else if (message.ask === "restart-to-update") {
      reply = { ok: updates.status().ready };
      if (reply.ok) setTimeout(() => void restartToUpdate(), 300);
    } else reply = { ok: false };
  } catch (error) {
    log(`${message.ask}: ${error?.message ?? error}`);
    reply = { ok: false };
  }
  if (child.connected)
    child.send({ cloneOffice: 1, id: message.id, answer: reply });
}

// ---- The window ----

let win;
let tray;

const isOwn = (url) => {
  try {
    return Boolean(origin) && new URL(url).origin === origin;
  } catch {
    return false;
  }
};

/** Links that leave the app open in the person's own browser; nothing else leaves at all. */
function openOutside(url) {
  try {
    if (/^(https?|mailto):$/.test(new URL(url).protocol))
      void shell.openExternal(url);
  } catch {}
}

/** The window's place and size, kept between runs while it fits on a screen. */
function savedBounds() {
  const bounds = state().bounds;
  if (!bounds) return undefined;
  const fits = screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x >= workArea.x - 40 &&
      bounds.y >= workArea.y - 40 &&
      bounds.x + 200 <= workArea.x + workArea.width &&
      bounds.y + 120 <= workArea.y + workArea.height
    );
  });
  return fits ? bounds : undefined;
}

function keepBounds() {
  if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen())
    keepState({ bounds: win.getNormalBounds() });
}

/** The page the window shows while the server starts. */
function loadingUrl() {
  const page = loadingPage
    .replace("{{lang}}", locale)
    .replace("{{starting}}", escapeHtml(t("starting")));
  return `data:text/html;charset=utf-8,${encodeURIComponent(page)}`;
}

const escapeHtml = (text) =>
  String(text).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

function createWindow() {
  const bounds = savedBounds();
  win = new BrowserWindow({
    width: bounds?.width ?? 1280,
    height: bounds?.height ?? 820,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 720,
    minHeight: 520,
    show: false,
    title: "Clone Office",
    // The app is light unless the person picks otherwise, whatever the computer is set to.
    backgroundColor: "#ffffff",
    ...(process.platform === "linux"
      ? { icon: join(app.getAppPath(), "icons", "icon.png") }
      : {}),
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webviewTag: false,
      spellcheck: true,
    },
  });
  const contents = win.webContents;
  // A window the page opens, and a page it goes to elsewhere, open in the person's browser.
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event) => {
    if (isOwn(event.url)) return;
    event.preventDefault();
    openOutside(event.url);
  });
  contents.on("will-redirect", (event) => {
    if (!event.isMainFrame || isOwn(event.url)) return;
    event.preventDefault();
    openOutside(event.url);
  });
  contents.on("will-attach-webview", (event) => event.preventDefault());
  contents.on("context-menu", (_event, params) => {
    const items = [
      ...(params.isEditable
        ? [
            { role: "cut", label: t("cut"), enabled: params.editFlags.canCut },
            {
              role: "copy",
              label: t("copy"),
              enabled: params.editFlags.canCopy,
            },
            {
              role: "paste",
              label: t("paste"),
              enabled: params.editFlags.canPaste,
            },
            { type: "separator" },
            { role: "selectAll", label: t("selectAll") },
          ]
        : params.selectionText
          ? [{ role: "copy", label: t("copy") }]
          : []),
    ];
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
  contents.on("render-process-gone", (_event, details) => {
    log(`window: the page stopped (${details.reason})`);
    if (!quitting && details.reason !== "clean-exit")
      setTimeout(() => win?.webContents.reload(), 1000);
  });
  win.once("ready-to-show", () => win?.show());
  win.on("close", (event) => {
    keepBounds();
    if (quitting) return;
    event.preventDefault();
    hideWindow();
    tellStillRunning();
  });
  win.on("closed", () => {
    win = undefined;
  });
  void win.loadURL(origin ? `${origin}/` : loadingUrl());
}

/** Puts the app in the window, when there is one and it shows something else (or nothing). */
function openApp() {
  if (win && origin && !isOwn(win.webContents.getURL()))
    void win.loadURL(`${origin}/`);
  else if (win && origin) win.webContents.reload();
}

function showWindow() {
  if (!win) createWindow();
  if (mac) void app.dock?.show();
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** With no window, the app lives in the menu bar or tray, and leaves the Dock. */
function hideWindow() {
  win?.hide();
  if (mac) app.dock?.hide();
}

/** The first time the window is closed: the app goes on, and where to find it. */
function tellStillRunning() {
  if (state().toldStillRunning || !Notification.isSupported()) return;
  keepState({ toldStillRunning: true });
  new Notification({
    title: t("stillRunning"),
    body: mac ? t("stillRunningMac") : t("stillRunningOther"),
  }).show();
}

/** Opens Settings as the page's own key does (⌘, or Ctrl+,), which the page listens for. */
function openSettings() {
  showWindow();
  const modifiers = [mac ? "meta" : "control"];
  win.webContents.sendInputEvent({ type: "keyDown", keyCode: ",", modifiers });
  win.webContents.sendInputEvent({ type: "keyUp", keyCode: ",", modifiers });
}

// ---- Menus and the tray ----

function buildMenu() {
  const separator = { type: "separator" };
  const settings = {
    label: t("settings"),
    accelerator: "CmdOrCtrl+,",
    // Shown, but left to the page, which opens Settings with it.
    registerAccelerator: false,
    click: openSettings,
  };
  const quit = { role: "quit", label: t("quit") };
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      mac
        ? {
            label: "Clone Office",
            submenu: [
              { role: "about", label: t("about") },
              separator,
              settings,
              separator,
              { role: "services", label: t("services") },
              separator,
              { role: "hide", label: t("hide") },
              { role: "hideOthers", label: t("hideOthers") },
              { role: "unhide", label: t("showAll") },
              separator,
              quit,
            ],
          }
        : { label: t("file"), submenu: [settings, separator, quit] },
      {
        label: t("edit"),
        submenu: [
          { role: "undo", label: t("undo") },
          { role: "redo", label: t("redo") },
          separator,
          { role: "cut", label: t("cut") },
          { role: "copy", label: t("copy") },
          { role: "paste", label: t("paste") },
          { role: "selectAll", label: t("selectAll") },
        ],
      },
      {
        label: t("view"),
        submenu: [
          { role: "reload", label: t("reload") },
          separator,
          { role: "resetZoom", label: t("actualSize") },
          { role: "zoomIn", label: t("zoomIn") },
          { role: "zoomOut", label: t("zoomOut") },
          separator,
          { role: "togglefullscreen", label: t("fullScreen") },
          separator,
          { role: "toggleDevTools", label: t("devTools") },
        ],
      },
      {
        label: t("window"),
        submenu: [
          { role: "minimize", label: t("minimize") },
          ...(mac
            ? [
                { role: "zoom", label: t("zoom") },
                separator,
                { role: "front", label: t("front") },
              ]
            : []),
          separator,
          { role: "close", label: t("close") },
        ],
      },
      {
        label: t("help"),
        role: "help",
        submenu: repository
          ? [
              {
                label: t("readme"),
                click: () => void shell.openExternal(`${repository}#readme`),
              },
              {
                label: t("report"),
                click: () => void shell.openExternal(`${repository}/issues`),
              },
            ]
          : [{ role: "about", label: t("about") }],
      },
    ]),
  );
}

function trayIcon() {
  const icons = join(app.getAppPath(), "icons");
  if (mac) {
    // A template image: black on clear, which macOS tints for the menu bar's look.
    const image = nativeImage.createFromPath(join(icons, "trayTemplate.png"));
    image.setTemplateImage(true);
    return image;
  }
  return nativeImage.createFromPath(join(icons, "tray.png"));
}

function buildTray() {
  if (!tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip("Clone Office");
    if (!mac) tray.on("click", showWindow);
  }
  const update = updates.status();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t("open"), click: showWindow },
      ...(update.ready
        ? [
            {
              label: t("updateReady", { version: update.newer }),
              click: () => void restartToUpdate(),
            },
          ]
        : update.download
          ? [
              {
                label: t("updateDownload", { version: update.newer }),
                click: () => void shell.openExternal(update.download),
              },
            ]
          : []),
      { type: "separator" },
      { label: t("quit"), click: () => app.quit() },
    ]),
  );
}

/** The menus speak the language picked on the screen, else the system's. */
async function followScreenLanguage() {
  const [picked] = origin
    ? await session.defaultSession.cookies
        .get({ url: origin, name: "locale" })
        .catch(() => [])
    : [];
  const next = pickLocale([
    picked?.value,
    ...app.getPreferredSystemLanguages(),
  ]);
  if (next === locale) return;
  locale = next;
  t = translator(allWords, locale);
  buildMenu();
  buildTray();
}

// ---- Updates ----

const updates = createUpdates({
  load: () => electronUpdater.autoUpdater,
  canReplace: canReplaceItself({ signedMac: Boolean(built.signedMac) }),
  releases: repository ? `${repository}/releases` : undefined,
  log,
  changed: () => buildTray(),
});

/** Stops the server first, then has the updater put the new version in place and open it. */
async function restartToUpdate() {
  if (!updates.status().ready) return;
  quitting = true;
  keepBounds();
  await stopServer(server);
  stopped = true;
  if (!updates.install()) {
    quitting = false;
    stopped = false;
  }
}

// ---- Starting and quitting ----

async function main() {
  const hidden = openedAtLogin({ app });
  app.on("second-instance", () => showWindow());
  app.on("activate", () => showWindow());
  // Closing the window keeps the app (see the window's close); only quitting ends it.
  app.on("window-all-closed", () => {});
  app.on("before-quit", (event) => {
    quitting = true;
    keepBounds();
    if (stopped || !server) return;
    // The server goes first, so nothing the app started is left behind.
    event.preventDefault();
    void stopServer(server).finally(() => {
      stopped = true;
      app.quit();
    });
  });

  await app.whenReady();
  log(`started ${app.getVersion()} (${process.platform} ${process.arch})`);
  if (process.platform === "win32") app.setAppUserModelId(built.appId ?? "");
  app.setAboutPanelOptions({
    applicationName: "Clone Office",
    applicationVersion: app.getVersion(),
    copyright: "MIT License",
    ...(repository ? { website: repository } : {}),
  });

  // The window asks for nothing but to show the person a notice and copy to the clipboard.
  const allowed = new Set(["notifications", "clipboard-sanitized-write"]);
  session.defaultSession.setPermissionRequestHandler(
    (contents, permission, callback, details) =>
      callback(
        allowed.has(permission) &&
          isOwn(details.requestingUrl || contents.getURL()),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (_contents, permission, requestingOrigin) =>
      allowed.has(permission) && requestingOrigin === origin,
  );
  session.defaultSession.cookies.on("changed", (_event, cookie) => {
    if (cookie.name === "locale") void followScreenLanguage();
  });

  locale = pickLocale(app.getPreferredSystemLanguages());
  t = translator(allWords, locale);
  buildMenu();
  buildTray();
  if (hidden) {
    if (mac) app.dock?.hide();
  } else createWindow();

  // The person's PATH, so their own claude, codex and git are found (shell-path.mjs).
  const answered = await takeShellPath({ home: homedir() });
  if (!answered)
    log("the login shell did not say its PATH; using common places");

  if (await connect()) {
    if (win) openApp();
  } else await failed();
  watchAttached();
  void followScreenLanguage();
  if (app.isPackaged) updates.start();
}

// A second start (the app opened again, or a login item while it runs) shows the one running.
if (!app.requestSingleInstanceLock()) app.exit(0);
else void main();
