// Files named like ones that hold keys, passwords or tokens: never read nor searched while the clone
// answers a colleague, whatever folder they are in. By name alone, as a .gitignore keeps them out,
// so a request that asks for one ("paste the .env") finds nothing to quote, and the look before
// an answer leaves (office/check.ts) is not the only thing in the way.

/** A file named like one that holds keys, passwords or tokens. */
export function secretFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower === ".env" || lower === ".envrc") return true;
  if (lower.startsWith(".env.")) {
    const rest = lower.slice(5);
    return !["example", "sample", "template", "defaults", "dist"].includes(
      rest,
    );
  }
  if (/\.(pem|key|p12|pfx|jks|keystore|kdbx|ppk|asc|gpg)$/.test(lower))
    return true;
  if (/^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/.test(lower)) return true;
  if (
    [
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
      "service-account.json",
    ].includes(lower)
  )
    return true;
  return /^(service[-_]account|client[-_]secret).*\.json$/.test(lower);
}

/**
 * The same as Claude Code permission rules, for a session on the person's own Claude Code: it reads
 * none of these anywhere (gitignore patterns, which its Read rules take).
 */
export const SECRET_READ_RULES = [
  "Read(**/.env)",
  "Read(**/.envrc)",
  "Read(**/.env.local)",
  "Read(**/.env.production)",
  "Read(**/.env.development)",
  "Read(**/.env.test)",
  "Read(**/*.pem)",
  "Read(**/*.key)",
  "Read(**/*.p12)",
  "Read(**/*.pfx)",
  "Read(**/*.jks)",
  "Read(**/*.keystore)",
  "Read(**/*.kdbx)",
  "Read(**/id_rsa*)",
  "Read(**/id_ed25519*)",
  "Read(**/id_ecdsa*)",
  "Read(**/.netrc)",
  "Read(**/.npmrc)",
  "Read(**/.pypirc)",
  "Read(**/.git-credentials)",
  "Read(**/credentials.json)",
  "Read(**/secrets.json)",
  "Read(**/service-account*.json)",
  "Read(**/client_secret*.json)",
];
