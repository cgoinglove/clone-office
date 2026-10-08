// Builds the npm package, in a temporary folder, from the repository's own files only: what is
// committed (or, with --working, every file git tracks or would track, as it is now; ignored
// files such as *.local.* never). Nothing private or stray can reach the package that way, and
// no path of this computer is written into the build. There the dependencies are installed, the
// app is built as a standalone server (next.config.ts, SUB_OFFICE_PACKAGE), and the mini-me's
// tool server and the relay are bundled into one file each, since Node does not run TypeScript
// from inside node_modules. Before it builds, the types and every language are checked, and a
// language out of step stops it. The package is left in dist/; nothing is published.
//
//   node scripts/pack.mjs [--working]

import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const working = process.argv.includes("--working");
const work = mkdtempSync(join(tmpdir(), "sub-office-pack-"));
const source = join(work, "sub-office");
const out = join(work, "package");

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0)
    throw new Error(`${command} ${args.join(" ")} failed (${result.status})`);
}

try {
  console.log(`==> Copying ${working ? "the working files" : "HEAD"}`);
  mkdirSync(source, { recursive: true });
  if (working) {
    const files = execFileSync(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      { cwd: repo },
    )
      .toString()
      .split("\0")
      .filter(Boolean);
    for (const file of files) {
      try {
        cpSync(join(repo, file), join(source, file));
      } catch {
        // Deleted in the working tree.
      }
    }
  } else {
    const archive = execFileSync("git", ["archive", "--format=tar", "HEAD"], {
      cwd: repo,
      maxBuffer: 512 * 1024 * 1024,
    });
    const tar = spawnSync("tar", ["-x", "-C", source], { input: archive });
    if (tar.status !== 0) throw new Error("Could not unpack the archive.");
  }

  console.log("==> Installing dependencies");
  run(
    "pnpm",
    ["install", "--frozen-lockfile", "--prefer-offline", "--ignore-scripts"],
    source,
  );

  console.log("==> Building the app");
  // Nothing is packed whose languages are out of step: every language with exactly English's lines
  // (the type check, i18n/sync.ts) and the same values in each (i18n/messages.test.ts).
  console.log("==> Checking types and languages");
  run("pnpm", ["typecheck"], source);
  run("pnpm", ["exec", "tsx", "--test", "i18n/messages.test.ts"], source);
  run("pnpm", ["exec", "next", "build"], source, {
    SUB_OFFICE_PACKAGE: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  });

  console.log("==> Assembling the package");
  cpSync(join(source, ".next-package", "standalone"), join(out, "app"), {
    recursive: true,
    verbatimSymlinks: true,
  });
  // The dependencies come from npm, for this computer's system, not from the build's folder.
  rmSync(join(out, "app", "node_modules"), { recursive: true, force: true });
  // Next's file tracing copies the rule files a path pattern in them names (`.claude/rules`);
  // they are notes for whoever works on the code, never part of the app.
  rmSync(join(out, "app", ".claude"), { recursive: true, force: true });
  // The skills the app ships are read from the package's own skills/ (below), not a traced copy.
  rmSync(join(out, "app", "skills"), { recursive: true, force: true });
  cpSync(
    join(source, ".next-package", "static"),
    join(out, "app", ".next-package", "static"),
    { recursive: true },
  );
  // The server and its chunks are CommonJS; the package says nothing about module type itself.
  writeFileSync(
    join(out, "app", "package.json"),
    `${JSON.stringify({ private: true, type: "commonjs" }, null, 2)}\n`,
  );
  cpSync(join(source, "guide"), join(out, "guide"), { recursive: true });
  cpSync(join(source, "skills"), join(out, "skills"), { recursive: true });
  cpSync(join(source, "bin"), join(out, "bin"), { recursive: true });
  cpSync(join(source, "LICENSE"), join(out, "LICENSE"));

  for (const [entry, file] of [
    ["features/minime/memory/mcp-server.ts", "mcp-server.mjs"],
    ["features/relay/server.ts", "relay.mjs"],
    ["features/minime/connectors/headers.ts", "connector-headers.mjs"],
  ])
    await build({
      entryPoints: [join(source, entry)],
      outfile: join(out, "dist", file),
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      // The relay's database packages come from npm with the package: PGlite loads its own files
      // at run time, and pg-native is a choice pg makes only when asked.
      external: ["pg", "pg-native", "@electric-sql/pglite"],
      // Packages written as CommonJS still find require.
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
      },
      logLevel: "warning",
    });

  const own = JSON.parse(readFileSync(join(source, "package.json"), "utf8"));
  const pick = (names) =>
    Object.fromEntries(names.map((name) => [name, own.dependencies[name]]));
  writeFileSync(
    join(out, "package.json"),
    `${JSON.stringify(
      {
        name: own.name,
        version: own.version,
        description: own.description,
        license: own.license,
        bin: { "sub-office": "bin/sub-office.mjs" },
        engines: { node: ">=22.13" },
        files: ["app", "bin", "dist", "guide", "skills"],
        dependencies: pick([
          "next",
          "react",
          "react-dom",
          "pg",
          "@electric-sql/pglite",
        ]),
      },
      null,
      2,
    )}\n`,
  );

  console.log("==> Packing");
  mkdirSync(join(repo, "dist"), { recursive: true });
  run("npm", ["pack", "--pack-destination", join(repo, "dist")], out);
} finally {
  rmSync(work, { recursive: true, force: true });
}
