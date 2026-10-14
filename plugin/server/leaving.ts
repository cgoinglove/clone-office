// What may leave this computer with a message: a file sent to a colleague from an AI app is checked
// here first, as the clone checks the files it sends (features/minime/office/files.ts), since an app
// that runs tools on its own (Cursor's auto-run, Codex with no approvals) may be led by text it read
// to send one. Never a file that holds keys or passwords, nothing in the clone's own folder or
// among the computer's settings and sign-ins (a hidden folder at the top of home, Library,
// AppData), nothing in a folder the person keeps out, each judged where the path really leads. Copied here rather
// than imported: the plugin is installed alone, with nothing of the app (the same list as
// features/minime/gate/secrets.ts, which a test keeps in step).

import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, relative, sep } from "node:path";

/** Names (any folder) and paths (their last folders) of files that hold keys, passwords or tokens. */
export const SECRETS = [
  ".env",
  ".env.*",
  ".envrc",
  ".dev.vars",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.jks",
  "*.keystore",
  "*.kdbx",
  "*.ppk",
  "*.asc",
  "*.gpg",
  "*.tfstate",
  "*.tfstate.*",
  "*.tfvars",
  "id_rsa*",
  "id_dsa*",
  "id_ecdsa*",
  "id_ed25519*",
  ".netrc",
  ".npmrc",
  ".pypirc",
  ".git-credentials",
  ".htpasswd",
  "credentials",
  "credentials.json",
  "secrets.json",
  "secrets.yml",
  "secrets.yaml",
  "service-account*.json",
  "service_account*.json",
  "client_secret*.json",
  "kubeconfig",
  ".mcp.json",
  ".git/config",
  ".claude/settings.local.json",
  ".ssh/*",
  ".aws/*",
  ".gnupg/*",
  ".kube/*",
  ".docker/config.json",
];

const MATCHERS = SECRETS.map(
  (glob) =>
    new RegExp(
      `(^|/)${glob
        .toLowerCase()
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")}$`,
    ),
);

const slashed = (path: string) => path.replaceAll("\\", "/");

function secret(path: string): boolean {
  const clean = slashed(path).toLowerCase();
  return MATCHERS.some((matcher) => matcher.test(clean));
}

function under(path: string, folder: string): boolean {
  const a = slashed(path).toLowerCase();
  const b = slashed(folder).replace(/\/+$/, "").toLowerCase();
  return a === b || a.startsWith(`${b}/`);
}

/** Whether the person keeps this path out (settings.json `exclude`, as the app reads it). */
function keptOut(path: string, patterns: string[]): boolean {
  const names = slashed(path).split("/").filter(Boolean);
  for (const raw of patterns) {
    const pattern = slashed(raw.trim());
    if (!pattern) continue;
    if (pattern.includes("/")) {
      const base = pattern.startsWith("~")
        ? slashed(homedir()) + pattern.slice(1)
        : pattern;
      if (under(path, base)) return true;
      continue;
    }
    const matcher = new RegExp(
      `^${pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`,
      "i",
    );
    if (names.some((name) => matcher.test(name))) return true;
  }
  return false;
}

/**
 * Where this computer and its apps keep their settings and sign-ins: a hidden folder or file at the
 * top of home (~/.codex, ~/.config, ~/.zsh_history), Library and AppData.
 */
function settingsPlace(path: string, home: string): boolean {
  const rel = relative(home.toLowerCase(), path.toLowerCase());
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return false;
  const first = rel.split(/[\\/]/)[0];
  return first.startsWith(".") || first === "library" || first === "appdata";
}

/** Why this file may not go, in words for the model; nothing when it may. */
export async function mayNotLeave(
  path: string,
  given: string,
  clone: string,
  exclude: string[],
  home = homedir(),
): Promise<string | undefined> {
  const real = await realpath(path).catch(() => path);
  const cloneReal = await realpath(clone).catch(() => clone);
  const homeReal = await realpath(home).catch(() => home);
  if (secret(path) || secret(real))
    return `${given} looks like it holds keys or passwords, so it is not sent to anyone.`;
  if (under(real, cloneReal) || under(path, clone))
    return `${given} is one of the clone's own files, which never leave this computer.`;
  if (settingsPlace(path, home) || settingsPlace(real, homeReal))
    return `${given} is among this computer's own settings and sign-ins, which are not sent to anyone.`;
  if (keptOut(path, exclude) || keptOut(real, exclude))
    return `${given} is in a folder your person keeps out of everything.`;
  if (sep === "\\" && /^\\\\/.test(path))
    return `${given} is on another computer: send a file from this one.`;
  return undefined;
}
