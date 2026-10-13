// How electron-builder packs the desktop app, from what desktop/build.mjs staged: the main process
// (stage/app, in the app's asar) and the npm package's server with its dependencies
// (stage/server, beside it as plain files, since a Node process runs it).
//
// Unsigned unless signing is given, as electron-builder reads it from the environment:
//   macOS     CSC_LINK (a Developer ID Application certificate, .p12, as a path or base64) and
//             CSC_KEY_PASSWORD; notarized when APPLE_API_KEY, APPLE_API_KEY_ID and APPLE_API_ISSUER
//             (an App Store Connect API key) or APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD and
//             APPLE_TEAM_ID are set too
//   Windows   WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD (a code signing certificate, .pfx)
// An unsigned macOS build is signed ad hoc, which Apple silicon needs to run it at all.

const { existsSync, readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const stage = join(__dirname, "stage");
const { version } = JSON.parse(
  readFileSync(join(stage, "server", "package.json"), "utf8"),
);
const built = JSON.parse(
  readFileSync(join(stage, "app", "build.json"), "utf8"),
);
const words = JSON.parse(
  readFileSync(join(stage, "app", "words.json"), "utf8"),
);

// Decided once by desktop/build.mjs, which tells the app too (it updates itself only when signed).
const signedMac = Boolean(built.signedMac);
const notarize =
  signedMac &&
  Boolean(
    (process.env.APPLE_API_KEY &&
      process.env.APPLE_API_KEY_ID &&
      process.env.APPLE_API_ISSUER) ||
      (process.env.APPLE_ID &&
        process.env.APPLE_APP_SPECIFIC_PASSWORD &&
        process.env.APPLE_TEAM_ID),
  );

/** What macOS shows when the app (or its server) first reads these folders or the network. */
const usage = (say) => ({
  NSDesktopFolderUsageDescription: say.desktopFolder,
  NSDocumentsFolderUsageDescription: say.documentsFolder,
  NSDownloadsFolderUsageDescription: say.downloadsFolder,
  NSLocalNetworkUsageDescription: say.localNetwork,
});

/** Each system's architectures, or the one desktop/build.mjs was asked for (--arch). */
const archs = (all) =>
  process.env.DESKTOP_ARCH ? [process.env.DESKTOP_ARCH] : all;

/** The screen's languages as macOS names its language folders. */
const LPROJ = {
  en: "en",
  ko: "ko",
  zh: "zh_CN",
  ja: "ja",
  es: "es",
  pt: "pt_BR",
};

const [owner, repo] = (built.repository ?? "").split("/");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: built.appId,
  productName: "Clone Office",
  copyright: "MIT License",
  electronVersion: require("electron/package.json").version,
  directories: {
    app: "stage/app",
    output: "release",
    buildResources: "resources",
  },
  extraMetadata: { version },
  // GitHub turns spaces in a release file's name into dots; these names have none.
  artifactName: "Clone-Office-${version}-${os}-${arch}.${ext}",
  asar: true,
  // The main process is one bundled file with nothing to install or rebuild: this keeps
  // electron-builder from gathering a node_modules for it (it would take the repository's).
  beforeBuild: async () => false,
  extraResources: [
    { from: "stage/server", to: "server", filter: ["**/*"] },
    // electron-builder leaves out the node_modules at the top of a folder it copies; this one is
    // the server's own.
    {
      from: "stage/server/node_modules",
      to: "server/node_modules",
      filter: ["**/*"],
    },
  ],
  // Where electron-updater looks for a newer version (app-update.yml); nothing is uploaded from
  // here (`--publish never`): the desktop workflow attaches the files to the release.
  ...(owner && repo
    ? { publish: { provider: "github", owner, repo, releaseType: "release" } }
    : {}),
  mac: {
    target: [
      { target: "dmg", arch: archs(["arm64", "x64"]) },
      { target: "zip", arch: archs(["arm64", "x64"]) },
    ],
    category: "public.app-category.productivity",
    icon: "resources/icon.png",
    darkModeSupport: true,
    ...(signedMac
      ? {
          hardenedRuntime: true,
          entitlements: "resources/entitlements.mac.plist",
          entitlementsInherit: "resources/entitlements.mac.plist",
          notarize,
        }
      : { identity: "-", hardenedRuntime: false }),
    extendInfo: usage(words.en ?? {}),
  },
  dmg: { artifactName: "Clone-Office-${version}-mac-${arch}.${ext}" },
  win: {
    target: [{ target: "nsis", arch: archs(["x64"]) }],
    icon: "resources/icon.png",
    executableName: "Clone Office",
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    artifactName: "Clone-Office-${version}-win-${arch}-setup.${ext}",
    shortcutName: "Clone Office",
    uninstallDisplayName: "Clone Office",
    // What the clone keeps is the person's; uninstalling never takes it.
    deleteAppDataOnUninstall: false,
  },
  linux: {
    target: [
      { target: "AppImage", arch: archs(["x64"]) },
      { target: "deb", arch: archs(["x64"]) },
    ],
    icon: "resources/icon.png",
    executableName: "clone-office",
    category: "Office",
    synopsis:
      "Send your clone: an AI that works like you, for everyone on your team.",
    maintainer: owner
      ? `${owner} <https://github.com/${owner}>`
      : "Clone Office",
    desktop: { entry: { StartupWMClass: "Clone Office" } },
  },
  appImage: { artifactName: "Clone-Office-${version}-linux-${arch}.${ext}" },
  deb: {
    packageName: "clone-office",
    artifactName: "clone-office_${version}_${arch}.${ext}",
  },
  // macOS reads the folders' and network's lines in the person's language from each language's
  // InfoPlist.strings; the English ones are in Info.plist above.
  afterPack: async (context) => {
    if (context.electronPlatformName !== "darwin") return;
    const resources = join(
      context.appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents",
      "Resources",
    );
    for (const [language, folder] of Object.entries(LPROJ)) {
      const dir = join(resources, `${folder}.lproj`);
      if (!existsSync(dir) || !words[language]) continue;
      const lines = Object.entries(usage(words[language]))
        .filter(([, text]) => text)
        .map(([key, text]) => `"${key}" = ${JSON.stringify(text)};`);
      writeFileSync(join(dir, "InfoPlist.strings"), `${lines.join("\n")}\n`);
    }
  },
};
