// Builds the desktop app: Clone Office in one downloaded file (a macOS .dmg, a Windows installer, a
// Linux AppImage or .deb), with no Node.js to install, running the same server `npx clone-office`
// runs. In two parts:
//
//   the server   the npm package as scripts/pack.mjs makes it, unpacked (--folder), with the
//                dependencies Next.js traced for its server and, beside them, the ones the clone's
//                tool server, the relay and its browser load (installed from npm, as npx would).
//                The same for every system: CI makes it once and each system's build takes it.
//   the app      Electron's main process (src/, bundled into one file with the words it says, from
//                messages/<language>.json), packed with the server by electron-builder
//                (electron-builder.config.cjs) for this system, or the one named.
//
//   node desktop/build.mjs [--working] [--mac | --win | --linux] [--arch arm64|x64] [--dir]
//   node desktop/build.mjs --server-only [--working]     the server alone, in desktop/stage/server
//   node desktop/build.mjs --server <folder or .tgz>      the app around a server made before
//
// --working builds the files as they are rather than as committed (scripts/pack.mjs). --dir leaves
// the app unpacked in desktop/release/ instead of making the files people download. Nothing is
// published: the desktop workflow attaches the files to a release (.github/workflows/desktop.yml).

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = dirname(fileURLToPath(import.meta.url));
const repo = join(desktop, "..");
const stage = join(desktop, "stage");
const serverDir = join(stage, "server");
const appDir = join(stage, "app");

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const platform = has("--mac")
  ? "darwin"
  : has("--win")
    ? "win32"
    : has("--linux")
      ? "linux"
      : process.platform;
const arch = option("--arch");
if (arch && !["arm64", "x64"].includes(arch))
  throw new Error(`Not an architecture this builds: ${arch}`);

/** The id the app is known by to each system (its bundle, its notices, its login item). */
const APP_ID = "com.clone-office.desktop";

// Signing comes from these when they hold something (electron-builder.config.cjs); a workflow
// passes a secret nobody set as an empty value, which would count as one.
for (const name of [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "CSC_NAME",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
])
  if (!process.env[name]?.trim()) delete process.env[name];

/** Runs a command, stopping the build when it fails. npm and pnpm are scripts on Windows. */
function run(command, list, cwd, env = {}) {
  const windows = process.platform === "win32" && /^(npm|pnpm)$/.test(command);
  const result = spawnSync(
    windows ? `${command} ${list.map((arg) => `"${arg}"`).join(" ")}` : command,
    windows ? [] : list,
    {
      cwd,
      stdio: "inherit",
      shell: windows,
      env: { ...process.env, ...env },
    },
  );
  if (result.status !== 0)
    throw new Error(`${command} ${list.join(" ")} failed (${result.status})`);
}

/** owner/name on GitHub: the Actions run's (GITHUB_REPOSITORY), else origin's, else none. */
function repositorySlug() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  try {
    const origin = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: repo,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin)?.[1];
  } catch {
    return undefined;
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// ---- The server ----

/** The npm package, unpacked, with what its server and its bundles load beside it. */
function makeServer() {
  console.log("==> The server: the npm package, unpacked");
  const pack = [join(repo, "scripts", "pack.mjs"), "--folder", serverDir];
  if (has("--working")) pack.push("--working");
  run(process.execPath, pack, repo);

  // What Next.js traced is in app/node_modules already; the rest of the package's dependencies
  // (the relay's database, the clone's sandbox and browser) come from npm, as npx would get them.
  const manifest = readJson(join(serverDir, "package.json"));
  const rest = Object.fromEntries(
    Object.entries(manifest.dependencies ?? {}).filter(
      ([name]) =>
        !existsSync(
          join(serverDir, "app", "node_modules", name, "package.json"),
        ),
    ),
  );
  console.log(`==> Installing ${Object.keys(rest).join(", ")}`);
  const work = mkdtempSync(join(tmpdir(), "clone-office-desktop-"));
  try {
    writeFileSync(
      join(work, "package.json"),
      `${JSON.stringify({ private: true, dependencies: rest }, null, 2)}\n`,
    );
    run(
      "npm",
      [
        "install",
        "--omit=dev",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
      ],
      work,
    );
    rmSync(join(serverDir, "node_modules"), { recursive: true, force: true });
    renameSync(join(work, "node_modules"), join(serverDir, "node_modules"));
    // npm's links to the packages' commands: nothing starts them, and a link is not a file
    // every system's unpacking keeps.
    rmSync(join(serverDir, "node_modules", ".bin"), {
      recursive: true,
      force: true,
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** A server made before: a folder, or a .tgz of one (which keeps its files' modes). */
function takeServer(from) {
  const source = resolve(from);
  console.log(`==> The server: ${source}`);
  if (source === serverDir) return;
  rmSync(serverDir, { recursive: true, force: true });
  mkdirSync(stage, { recursive: true });
  if (source.endsWith(".tgz")) {
    mkdirSync(serverDir, { recursive: true });
    // A relative path, which every tar reads as a file (GNU tar takes "C:" for a host).
    run("tar", ["-xzf", relative(serverDir, source)], serverDir);
  } else cpSync(source, serverDir, { recursive: true, verbatimSymlinks: true });
  if (!existsSync(join(serverDir, "app", "server.js")))
    throw new Error(`No server in ${source} (app/server.js is missing).`);
}

/** What only another system runs is left out: the sandbox's helpers for Linux and Windows. */
function trimForSystem() {
  const vendor = join(
    serverDir,
    "node_modules",
    "@anthropic-ai",
    "sandbox-runtime",
    "vendor",
  );
  if (platform !== "linux")
    rmSync(join(vendor, "seccomp"), { recursive: true, force: true });
  if (platform !== "win32")
    rmSync(join(vendor, "srt-win"), { recursive: true, force: true });
}

// ---- The app ----

/** The words the app says: the `desktop` part of each language's messages. */
function words() {
  const all = {};
  for (const language of ["en", "ko", "zh", "ja", "es", "pt"])
    all[language] = readJson(
      join(repo, "messages", `${language}.json`),
    ).desktop;
  return all;
}

/** The page shown while the server starts, with the app's mark (always light, as the app starts). */
function loadingPage() {
  const mark = readFileSync(join(repo, "app", "icon.svg"), "utf8")
    .replace(/@media[^{]*\{[^}]*\{[^}]*\}[^}]*\}/, "")
    .replace("<svg ", '<svg class="mark" aria-hidden="true" ');
  return readFileSync(join(desktop, "src", "loading.html"), "utf8").replace(
    "{{mark}}",
    mark,
  );
}

async function makeApp() {
  console.log("==> The app: Electron's main process");
  const { build } = await import("esbuild");
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(join(appDir, "icons"), { recursive: true });
  const page = loadingPage();
  await build({
    entryPoints: [join(desktop, "src", "main.mjs")],
    outfile: join(appDir, "main.cjs"),
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node24",
    external: ["electron"],
    plugins: [
      {
        name: "loading-page",
        setup(builder) {
          builder.onLoad({ filter: /loading\.html$/ }, () => ({
            contents: page,
            loader: "text",
          }));
        },
      },
    ],
    logLevel: "warning",
  });
  const { version, description } = readJson(join(serverDir, "package.json"));
  const slug = repositorySlug();
  const owner = slug?.split("/")[0];
  writeFileSync(
    join(appDir, "package.json"),
    `${JSON.stringify(
      {
        name: "clone-office",
        productName: "Clone Office",
        version,
        description,
        license: "MIT",
        author: owner
          ? { name: owner, url: `https://github.com/${owner}` }
          : "Clone Office",
        ...(slug ? { homepage: `https://github.com/${slug}` } : {}),
        main: "main.cjs",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(join(appDir, "words.json"), JSON.stringify(words()));
  // Signed for macOS only with a Developer ID (electron-builder.config.cjs), and only then does the
  // app put its own updates in place there (src/updates.mjs).
  const signedMac =
    platform === "darwin" &&
    Boolean(process.env.CSC_LINK || process.env.CSC_NAME);
  writeFileSync(
    join(appDir, "build.json"),
    `${JSON.stringify({ appId: APP_ID, repository: slug, signedMac }, null, 2)}\n`,
  );
  for (const icon of [
    "icon.png",
    "tray.png",
    "tray@2x.png",
    "trayTemplate.png",
    "trayTemplate@2x.png",
  ])
    cpSync(join(desktop, "resources", icon), join(appDir, "icons", icon));
}

function pack() {
  const flag = { darwin: "--mac", win32: "--win", linux: "--linux" }[platform];
  console.log(`==> Packing for ${platform}${arch ? ` (${arch})` : ""}`);
  run(
    process.execPath,
    [
      join(desktop, "node_modules", "electron-builder", "cli.js"),
      "--config",
      "electron-builder.config.cjs",
      "--projectDir",
      desktop,
      flag,
      "--publish",
      "never",
      ...(has("--dir") ? ["--dir"] : []),
    ],
    desktop,
    arch ? { DESKTOP_ARCH: arch } : {},
  );
}

const given = option("--server");
if (given) takeServer(given);
else makeServer();
if (has("--server-only")) process.exit(0);
// The desktop app's own tools (Electron, electron-builder), kept apart from the repository's.
if (!existsSync(join(desktop, "node_modules", "electron-builder", "cli.js")))
  run("pnpm", ["install", "--ignore-workspace", "--frozen-lockfile"], desktop);
trimForSystem();
await makeApp();
pack();
console.log(`==> Done: ${join(desktop, "release")}`);
