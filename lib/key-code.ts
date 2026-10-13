// The twelve digits a browser's public key is shown as, so its person can compare what the team
// server's page shows with what their computer asks about: the first six bytes of the key's SHA-256
// as one number. The page's script computes the same (features/relay/home-client.ts), and both the
// relay and the clone use this one (features/relay/relay.ts, features/minime/office/own-chat.ts).

import { createHash } from "node:crypto";

/** The code for a key given as its SPKI bytes in base64url. */
export function keyCode(key: string): string {
  const digest = createHash("sha256")
    .update(Buffer.from(key, "base64url"))
    .digest();
  return String(digest.readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, "0");
}

/** The code as a person reads it: three groups of four. */
export const spacedCode = (code: string) =>
  `${code.slice(0, 4)} ${code.slice(4, 8)} ${code.slice(8)}`;
