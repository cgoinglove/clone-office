// The clone's own browser, in the person's own work only (a conversation with them, or one of their
// flows): Microsoft's Playwright MCP server, as Claude Code and Hermes Agent drive a browser, on a
// profile of the clone's own (~/.clone-office/browser), never the person's browser or its sign-ins.
// It shows its window while the person is there to watch, and runs without one in a flow. Its tools
// are reached like a connected service's: named, and loaded when needed (Claude Code's tool search,
// or tool_search in the app's own loop).
//
// Who decides: looking (going to a page, reading it, a screenshot) may be let "from now on" as one
// rule (`browser:read`); acting on a page (a click, typing, a form, a key) is asked each time by hand,
// and on its own in "auto" mode; uploading a file and running code in the page are asked every time,
// and running arbitrary code in the browser's own process is never offered.

import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { appDir, minimeHome } from "../server/paths.ts";

export {
  BROWSER,
  BROWSER_ALWAYS_ASKED,
  BROWSER_LOOKS,
  BROWSER_NEVER,
  BROWSER_READ_RULE,
  browserActRules,
  browserReadRules,
  browserTool,
} from "./names.ts";

/** The browser the clone drives: Chrome where it is installed, Edge on Windows, else Chromium. */
export function browserChannel(
  platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): "chrome" | "msedge" | "chromium" {
  const chrome =
    platform === "darwin"
      ? ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"]
      : platform === "win32"
        ? [
            join(
              process.env.PROGRAMFILES ?? "C:\\Program Files",
              "Google",
              "Chrome",
              "Application",
              "chrome.exe",
            ),
            join(
              process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
              "Google",
              "Chrome",
              "Application",
              "chrome.exe",
            ),
            join(
              process.env.LOCALAPPDATA ?? "",
              "Google",
              "Chrome",
              "Application",
              "chrome.exe",
            ),
          ]
        : [
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/opt/google/chrome/chrome",
          ];
  if (chrome.some((path) => path && exists(path))) return "chrome";
  return platform === "win32" ? "msedge" : "chromium";
}

/** Where Playwright MCP's own program is: from the app's packages, in development or installed. */
export function browserServerPath(): string | undefined {
  try {
    const require = createRequire(join(appDir(), "package.json"));
    return join(
      require
        .resolve("@playwright/mcp/package.json")
        .replace(/package\.json$/, ""),
      "cli.js",
    );
  } catch {
    return undefined;
  }
}

/**
 * How a session starts the browser's server: on the clone's own profile, its downloads and
 * screenshots kept in the workspace, a window only while the person can watch.
 */
export function browserServer(options: {
  watched: boolean;
}):
  | { command: string; args: string[]; env: Record<string, string> }
  | undefined {
  const cli = browserServerPath();
  if (!cli) return undefined;
  const home = minimeHome();
  return {
    command: process.execPath,
    args: [
      "--no-warnings",
      cli,
      "--browser",
      browserChannel(),
      "--user-data-dir",
      join(home, "browser", "profile"),
      "--output-dir",
      join(home, "workspace", "browser"),
      ...(options.watched ? [] : ["--headless"]),
    ],
    env: {
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? "",
      ...(process.env.USERPROFILE
        ? { USERPROFILE: process.env.USERPROFILE }
        : {}),
      ...(process.env.LOCALAPPDATA
        ? { LOCALAPPDATA: process.env.LOCALAPPDATA }
        : {}),
      ...(process.env.DISPLAY ? { DISPLAY: process.env.DISPLAY } : {}),
      PLAYWRIGHT_BROWSERS_PATH: join(
        home,
        "workspace",
        ".cache",
        "ms-playwright",
      ),
    },
  };
}
