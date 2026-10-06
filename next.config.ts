import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The version the screen shows (Settings › General), from the package itself.
const { version } = JSON.parse(readFileSync("package.json", "utf8")) as {
  version: string;
};

// `node scripts/pack.mjs` builds the app for the npm package: a standalone server, in a folder of
// its own so the usual `.next` is never touched.
const packaging = process.env.SUB_OFFICE_PACKAGE === "1";
// A second `pnpm dev` beside the first (another clone's folder in SUB_OFFICE_HOME, another port)
// needs a build folder of its own: two dev servers cannot share `.next`.
const devDir = process.env.SUB_OFFICE_DEV_DIR;

const nextConfig: NextConfig = {
  devIndicators: false,
  env: { NEXT_PUBLIC_APP_VERSION: version },
  ...(devDir && !packaging ? { distDir: devDir } : {}),
  // AGENTS.md already tells agents to read the installed Next.js docs; without this, every
  // `next dev` appends its own block to AGENTS.md (which CLAUDE.md links to).
  agentRules: false,
  ...(packaging
    ? {
        output: "standalone",
        distDir: ".next-package",
        // Bundled into the server, so the package needs only next and react from npm.
        transpilePackages: ["shiki"],
        // The server runs from its compiled chunks; nothing of the project's own files belongs
        // in the package (the guide and the tool server are added by the pack script), and
        // private files never may.
        outputFileTracingExcludes: {
          "**": [
            ".git/**",
            ".claude/**",
            "docs/**",
            "**/*.local.*",
            "**/*.local.d/**",
            "app/**",
            "features/**",
            "guide/**",
            "i18n/**",
            "messages/**",
            "plugin/**",
            "scripts/**",
            "*.md",
          ],
        },
      }
    : {}),
};

// The screen's words come from messages/<language>.json, chosen per request in i18n/request.ts.
export default createNextIntlPlugin()(nextConfig);
