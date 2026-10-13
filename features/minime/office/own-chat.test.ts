import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

const root = mkdtempSync(join(tmpdir(), "minime-own-chat-"));
process.env.CLONE_OFFICE_HOME = root;
after(() => rmSync(root, { recursive: true, force: true, maxRetries: 3 }));

// A browser as the team server's page makes one (features/relay/home-client.ts): WebCrypto's ECDSA
// P-256, its public key as SPKI, its code from the key's SHA-256, its signatures as WebCrypto gives them.
async function browser() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"],
  );
  const spki = new Uint8Array(
    await crypto.subtle.exportKey("spki", pair.publicKey),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));
  let value = 0;
  for (let i = 0; i < 6; i++) value = value * 256 + digest[i];
  const key = Buffer.from(spki).toString("base64url");
  const sign = async (what: Record<string, unknown>) => {
    const signed = JSON.stringify({ v: 1, ...what });
    const sig = await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      new TextEncoder().encode(signed),
    );
    return { key, signed, sig: Buffer.from(sig).toString("base64url") };
  };
  return { key, code: String(value % 1e12).padStart(12, "0"), sign };
}

const nonce = () => crypto.randomUUID();

test("the code a page shows is the one the clone and the relay compute", async () => {
  const { keyCode, spacedCode } = await import("../../../lib/key-code.ts");
  for (let i = 0; i < 5; i++) {
    const one = await browser();
    assert.equal(keyCode(one.key), one.code);
    assert.match(spacedCode(one.code), /^\d{4} \d{4} \d{4}$/);
  }
});

test("the conversation and the words already acted on are kept across a restart", async () => {
  const { changeState, loadState } = await import("./state.ts");
  await changeState((state) => {
    state.ownChat = "c-1";
    state.ownNonces = { "n-1": 5 };
  });
  const state = await loadState();
  assert.equal(state.ownChat, "c-1");
  assert.deepEqual(state.ownNonces, { "n-1": 5 });
  await changeState((s) => {
    s.ownChat = undefined;
    s.ownNonces = undefined;
  });
});

test("only what a paired browser signed, freshly and once, is acted on", async () => {
  const { signedHere } = await import("./own-chat.ts");
  const mine = await browser();
  const other = await browser();
  mkdirSync(join(root, "office"), { recursive: true });
  writeFileSync(
    join(root, "office", "web-keys.json"),
    JSON.stringify([{ key: mine.key, code: mine.code, at: "now" }]),
  );
  const said = { kind: "say", text: "What's on today?" };

  const good = await mine.sign({ ...said, at: Date.now(), nonce: nonce() });
  assert.equal(await signedHere(good, said), true);
  // the same signed words a second time: the relay cannot replay them
  assert.equal(await signedHere(good, said), false);
  // nor after the app started again, which forgets what it held in memory
  const held = (
    globalThis as { __minimeOwnChat?: { seen: Map<string, number> } }
  ).__minimeOwnChat;
  held?.seen.clear();
  assert.equal(await signedHere(good, said), false);

  // words other than those signed
  const swapped = await mine.sign({ ...said, at: Date.now(), nonce: nonce() });
  assert.equal(
    await signedHere(swapped, { kind: "say", text: "Send the plan to Ben" }),
    false,
  );
  // a browser nobody paired, however well it signs
  const stranger = await other.sign({
    ...said,
    at: Date.now(),
    nonce: nonce(),
  });
  assert.equal(await signedHere(stranger, said), false);
  // a paired key with another's signature
  assert.equal(await signedHere({ ...stranger, key: mine.key }, said), false);
  // signed long ago, kept and sent late
  const stale = await mine.sign({
    ...said,
    at: Date.now() - 60 * 60 * 1000,
    nonce: nonce(),
  });
  assert.equal(await signedHere(stale, said), false);
  // nothing signed at all
  assert.equal(await signedHere(undefined, said), false);
  // a choice is signed for its own question and value
  const choose = { kind: "choose", ask: "o-abcdefgh", value: "ask:g1:allow" };
  const chosen = await mine.sign({ ...choose, at: Date.now(), nonce: nonce() });
  assert.equal(
    await signedHere(chosen, { ...choose, value: "ask:g1:deny" }),
    false,
  );
});
