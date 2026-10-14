// Files that hold keys, passwords or tokens: never read nor searched while the clone answers a
// colleague, whatever folder they are in. One list, as a .gitignore keeps them out, gives both the
// app's own loop its check (`secretFile`, on the real path a link leads to) and Claude Code its
// rules (`SECRET_READ_RULES`, from the disk's root so they hold whatever folder the session runs
// in), so a request that asks for one ("paste the .env") finds nothing to quote, and the look before
// an answer leaves (office/check.ts) is not the only thing in the way.

/** Names (any folder) and paths (their last folders) of such files, `*` within one name. */
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
  // remote addresses may carry a token; a project's own AI settings may carry keys
  ".git/config",
  ".claude/settings.local.json",
  // whole folders of keys, wherever they are
  ".ssh/*",
  ".aws/*",
  ".gnupg/*",
  ".kube/*",
  ".docker/config.json",
];

const pattern = (glob: string) =>
  new RegExp(
    `(^|/)${glob
      .toLowerCase()
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
      .join("[^/]*")}$`,
  );

const MATCHERS = SECRETS.map(pattern);

/** A file (by its path, or its name alone) that holds keys, passwords or tokens. */
export function secretFile(path: string): boolean {
  const clean = path.replaceAll("\\", "/").toLowerCase();
  return MATCHERS.some((matcher) => matcher.test(clean));
}

/** The same list as Claude Code permission rules, from the disk's root: denied answering colleagues. */
export const SECRET_READ_RULES = SECRETS.map(
  (glob) => `Read(//**/${glob.endsWith("/*") ? `${glob}*` : glob})`,
);
