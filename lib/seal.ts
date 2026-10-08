// Sealing a secret before it is written, after Thursday's lib/secret.ts: AES-256-GCM, a fresh
// 12-byte nonce for every seal and a 16-byte tag that fails the opening on a wrong key or any
// changed byte. Only the cipher lives here; where the key is kept is each side's own (the clone's
// folder, server/secret.ts; the relay, features/relay/secrets.ts).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** What a sealed value starts with. The version lets a later scheme tell its values from these. */
const SEALED = "enc:v1:";
const CIPHER = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 32 bytes in base64 (as `openssl rand -base64 32` prints them) or base64url. */
const KEY_SHAPE = /^[A-Za-z0-9+/_-]{43}=?$/;

/** A sealed value this key cannot open: sealed under another key, or damaged. */
export class UnreadableSecret extends Error {}

export const isSealed = (value: string) => value.startsWith(SEALED);

/** A new key, as the text it is kept as. */
export const newKeyText = () => randomBytes(KEY_BYTES).toString("base64");

/** The key a text holds, or undefined when it is not one. */
export function keyFrom(text: string): Buffer | undefined {
  const trimmed = text.trim();
  if (!KEY_SHAPE.test(trimmed)) return undefined;
  const key = Buffer.from(
    trimmed.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  );
  return key.length === KEY_BYTES ? key : undefined;
}

/** `plain`, sealed. Two equal secrets never look alike. */
export function sealWith(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(CIPHER, key, iv, { authTagLength: TAG_BYTES });
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return (
    SEALED +
    Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")
  );
}

/** What `value` holds: opened when sealed, as it is when it was written before sealing began. */
export function openWith(key: Buffer, value: string): string {
  if (!isSealed(value)) return value;
  const bytes = Buffer.from(value.slice(SEALED.length), "base64url");
  if (bytes.length < IV_BYTES + TAG_BYTES)
    throw new UnreadableSecret("A sealed secret is damaged.");
  try {
    const decipher = createDecipheriv(
      CIPHER,
      key,
      bytes.subarray(0, IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(bytes.subarray(bytes.length - TAG_BYTES));
    return Buffer.concat([
      decipher.update(bytes.subarray(IV_BYTES, bytes.length - TAG_BYTES)),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new UnreadableSecret(
      "A secret was sealed with another key, or is damaged.",
    );
  }
}
