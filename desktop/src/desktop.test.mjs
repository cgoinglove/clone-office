import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { appHome, askedPort, FIRST_PORT, findApp, lastPort } from "./home.mjs";
import { autostartEntry, autostartFile, HIDDEN } from "./login-item.mjs";
import { serverEnv, stopServer } from "./server.mjs";
import {
  commonPlaces,
  mergePath,
  readShellOutput,
  shellCommand,
  takeShellPath,
} from "./shell-path.mjs";
import { canReplaceItself, createUpdates } from "./updates.mjs";
import { LOCALES, pickLocale, translator } from "./words.mjs";

test("the clone's folder is the launcher's: CLONE_OFFICE_HOME, a kept ~/.sub-office, else ~/.clone-office", () => {
  assert.equal(
    appHome({ CLONE_OFFICE_HOME: "/x" }, "/h", () => false),
    "/x",
  );
  assert.equal(
    appHome({ CLONE_OFFICE_HOME: "" }, "/h", () => false),
    join("/h", ".clone-office"),
    "an empty value counts as none",
  );
  assert.equal(
    appHome(
      {},
      "/h",
      (path) => path === join("/h", ".sub-office", "settings.json"),
    ),
    join("/h", ".sub-office"),
  );
});

test("the app already running is the one app.json names, while its process lives", async () => {
  const read = () => JSON.stringify({ url: "http://127.0.0.1:4420", pid: 7 });
  assert.equal(
    lastPort("/f", read, () => true),
    4420,
  );
  assert.equal(
    lastPort("/f", read, () => false),
    undefined,
  );
  assert.equal(
    lastPort("/f", () => {
      throw new Error("none");
    }),
    undefined,
  );

  assert.deepEqual(
    await findApp("/f", {
      last: () => 4420,
      ours: async (port) => port === 4420,
      free: async () => true,
    }),
    { port: 4420, running: true },
  );
  // Another folder's app on the first port is passed by, never opened as this one's.
  assert.deepEqual(
    await findApp("/f", {
      last: () => undefined,
      ours: async () => true,
      free: async (port) => port > FIRST_PORT + 1,
    }),
    { port: FIRST_PORT + 2, running: false },
  );
  // --port, as the launcher takes it, moves where it starts looking.
  assert.deepEqual(
    await findApp("/f", {
      first: 4950,
      last: () => undefined,
      free: async () => true,
    }),
    { port: 4950, running: false },
  );
  assert.equal(askedPort(["electron", "--port", "4950"]), 4950);
  assert.equal(askedPort(["electron", "--port", "x"]), undefined);
  assert.equal(askedPort(["electron"]), undefined);
});

test("the login shell's PATH and LANG are read between marks, whatever its profile prints", () => {
  const MARK = shellCommand().match(/'(__[A-Z_]+__)'/)[1];
  const out = `Welcome back!\n\x1b[32mok\x1b[0m${MARK}/opt/homebrew/bin:/usr/bin${MARK}en_US.UTF-8${MARK}`;
  assert.deepEqual(readShellOutput(out), {
    path: "/opt/homebrew/bin:/usr/bin",
    lang: "en_US.UTF-8",
  });
  assert.equal(readShellOutput("no marks here"), undefined);
  assert.deepEqual(readShellOutput(`${MARK}/bin${MARK}${MARK}`), {
    path: "/bin",
    lang: undefined,
  });
});

test("the shell's entries come first, then the app's own, then common places; each once", () => {
  assert.equal(
    mergePath(
      "/usr/bin:/bin",
      "/Users/a/.nvm/bin:/usr/bin",
      ["/opt/homebrew/bin", "/bin"],
      ":",
    ),
    "/Users/a/.nvm/bin:/usr/bin:/bin:/opt/homebrew/bin",
  );
  assert.ok(commonPlaces("/h", "darwin").includes(join("/h", ".local", "bin")));
  assert.deepEqual(commonPlaces("/h", "win32"), []);
});

test("this process takes the shell's PATH, and its LANG only when it has none", async () => {
  const env = { PATH: "/usr/bin" };
  const answered = await takeShellPath({
    env,
    home: "/h",
    platform: "darwin",
    ask: async () => ({
      path: "/opt/homebrew/bin:/usr/bin",
      lang: "ko_KR.UTF-8",
    }),
    exists: () => false,
  });
  assert.equal(answered, true);
  assert.equal(env.PATH, "/opt/homebrew/bin:/usr/bin");
  assert.equal(env.LANG, "ko_KR.UTF-8");

  const kept = { PATH: "/usr/bin", LANG: "en_US.UTF-8" };
  await takeShellPath({
    env: kept,
    home: "/h",
    platform: "linux",
    ask: async () => undefined,
    exists: (place) => place === "/usr/local/bin",
  });
  assert.equal(kept.PATH, "/usr/bin:/usr/local/bin");
  assert.equal(kept.LANG, "en_US.UTF-8");
});

test("the server runs as Node, on loopback, told it is the desktop app's; the person's NODE_OPTIONS stay out", () => {
  const env = serverEnv({
    base: { PATH: "/bin", NODE_OPTIONS: "--inspect" },
    port: 4418,
    appDir: "/app/server",
  });
  assert.equal(env.ELECTRON_RUN_AS_NODE, "1");
  assert.equal(env.PORT, "4418");
  assert.equal(env.HOSTNAME, "127.0.0.1");
  assert.equal(env.CLONE_OFFICE_APP_DIR, "/app/server");
  assert.equal(env.CLONE_OFFICE_DESKTOP, "1");
  assert.equal(env.PATH, "/bin");
  assert.equal(env.NODE_OPTIONS, undefined);
});

test("quitting stops the server, by force when it does not stop when asked", async () => {
  const stubborn = spawn(
    process.execPath,
    ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    { stdio: "ignore" },
  );
  await new Promise((done) => setTimeout(done, 300));
  const started = Date.now();
  await stopServer(stubborn, 500);
  await new Promise((done) =>
    stubborn.exitCode !== null || stubborn.signalCode !== null
      ? done()
      : stubborn.once("exit", done),
  );
  assert.ok(Date.now() - started < 3000);
  assert.ok(stubborn.signalCode === "SIGKILL" || process.platform === "win32");
  await stopServer(stubborn);
  await stopServer(undefined);
});

test("a Linux login item is an autostart entry that opens the app with no window", () => {
  assert.equal(
    autostartFile({ XDG_CONFIG_HOME: "/c" }, "/h"),
    join("/c", "autostart", "clone-office.desktop"),
  );
  assert.equal(
    autostartFile({}, "/h"),
    join("/h", ".config", "autostart", "clone-office.desktop"),
  );
  const entry = autostartEntry('/home/a/Apps/Clone "Office".AppImage');
  assert.match(
    entry,
    new RegExp(
      `^Exec="/home/a/Apps/Clone \\\\"Office\\\\"\\.AppImage" ${HIDDEN}$`,
      "m",
    ),
  );
  assert.match(entry, /^Type=Application$/m);
});

test("it replaces itself where the system lets it, and otherwise links to the download", async () => {
  assert.equal(canReplaceItself({ platform: "win32" }), true);
  assert.equal(
    canReplaceItself({ platform: "linux", env: { APPIMAGE: "/a" } }),
    true,
  );
  assert.equal(canReplaceItself({ platform: "linux", env: {} }), false);
  assert.equal(canReplaceItself({ platform: "darwin" }), false);
  assert.equal(canReplaceItself({ platform: "darwin", signedMac: true }), true);

  const handlers = {};
  const updater = {
    on: (name, handler) => {
      handlers[name] = handler;
    },
    checkForUpdates: async () => {},
    quitAndInstall: () => {
      updater.installed = true;
    },
  };
  let changes = 0;
  const unsigned = createUpdates({
    load: () => updater,
    canReplace: false,
    releases: "https://github.com/o/r/releases",
    changed: () => {
      changes += 1;
    },
  });
  unsigned.start();
  assert.equal(updater.autoDownload, false);
  handlers["update-available"]({ version: "0.3.0" });
  assert.deepEqual(unsigned.status(), {
    newer: "0.3.0",
    ready: false,
    download: "https://github.com/o/r/releases/tag/v0.3.0",
  });
  assert.equal(unsigned.install(), false);

  const own = createUpdates({ load: () => updater, canReplace: true });
  own.start();
  assert.equal(updater.autoDownload, true);
  handlers["update-available"]({ version: "0.3.0" });
  assert.equal(own.status().download, null);
  handlers["update-downloaded"]({ version: "0.3.0" });
  assert.equal(own.status().ready, true);
  assert.equal(own.install(), true);
  assert.equal(updater.installed, true);
  assert.ok(changes >= 1);

  const none = createUpdates({
    load: () => {
      throw new Error("not packaged");
    },
    canReplace: true,
  });
  none.start();
  assert.deepEqual(none.status(), {
    newer: null,
    ready: false,
    download: null,
  });
});

test("its words are the screen's: the picked language, else the system's, else English", () => {
  assert.equal(pickLocale(["ko"]), "ko");
  assert.equal(pickLocale([undefined, "pt-BR", "en-US"]), "pt");
  assert.equal(pickLocale(["zh_CN"]), "zh");
  assert.equal(pickLocale(["fr-FR", "de"]), "en");
  const t = translator(
    {
      en: { a: "Version {version}", b: "Only English" },
      ko: { a: "{version} 버전" },
    },
    "ko",
  );
  assert.equal(t("a", { version: "1.0" }), "1.0 버전");
  assert.equal(t("b"), "Only English");

  // Every language the screen speaks has the desktop's words, the same ones as English.
  const dir = join(import.meta.dirname, "..", "..", "messages");
  const english = Object.keys(
    JSON.parse(readFileSync(join(dir, "en.json"), "utf8")).desktop,
  ).sort();
  assert.ok(english.includes("starting") && english.includes("quit"));
  for (const language of LOCALES)
    assert.deepEqual(
      Object.keys(
        JSON.parse(readFileSync(join(dir, `${language}.json`), "utf8")).desktop,
      ).sort(),
      english,
      language,
    );
});
