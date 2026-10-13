// The person talking to their clone from the team server's page (relay.ts `ownSay`), away from
// this computer: their words become a turn in a conversation of its own here, as a message from
// their phone does (messenger/bridge.ts); the clone's questions go to the page as buttons, and a
// choice made there answers them; its answer goes back once it is done. Only while the person turned
// it on (preferences `webChat`), which the clone tells the relay so the page knows.
//
// The relay carries the words but is never trusted with them: each browser is paired once, by its
// public key, with the person confirming here (or on their phone) the code its page shows, as the
// messenger lets a person in with a code; from then on only what that browser signed runs. Whoever
// signs in to the person's account, or runs the server, has no paired key and cannot drive it.

import { createPublicKey, verify as verifySignature } from "node:crypto";
import { join } from "node:path";
import { keyCode, spacedCode } from "../../../lib/key-code.ts";
import { chatExists, createChat, readChat } from "../chat/store.ts";
import { runTurn } from "../chat/turn.ts";
import { answerChoice } from "../gate/answer.ts";
import { askPerson } from "../gate/gate.ts";
import { atomicWrite, readText, withLock } from "../memory/files.ts";
import { errorCode } from "../server/ndjson.ts";
import { minimeHome } from "../server/paths.ts";
import { readPreferences } from "../server/preferences.ts";
import { words } from "../server/words.ts";
import { wordAsk } from "../turn/turn.ts";
import {
  type OfficeConfig,
  type OwnNews,
  ownAllow,
  ownAnswer,
  ownAsk,
  ownSettle,
  ownTake,
} from "./client.ts";
import { changeState, loadState } from "./state.ts";

/** What a paired browser signed, as the relay passes it on (relay.ts `OwnProof`). */
interface Proof {
  key: string;
  signed: string;
  sig: string;
}

/** How long a signed word stays good: the relay cannot hold one back and send it much later. */
const FRESH_MS = 10 * 60 * 1000;
/** How long the person has to confirm a browser here. */
const PAIR_MS = 10 * 60 * 1000;

const holder = globalThis as typeof globalThis & {
  __minimeOwnChat?: {
    /** One turn at a time: what comes meanwhile waits its turn. */
    queue: Promise<void>;
    /** How many turns wait in it, so a flood never piles up here. */
    queued: number;
    /** The questions shown on the page, by their id there: the gate's question each one is. */
    asks: Map<string, string>;
    /** Signed words already acted on, by their nonce, until they would be stale anyway. */
    seen: Map<string, number>;
    /** What this process last told the relay, so it says it again only when it changes. */
    allowed?: { relay: string; member: string; on: boolean; keys: string };
  };
};

function shared() {
  holder.__minimeOwnChat ??= {
    queue: Promise.resolve(),
    queued: 0,
    asks: new Map(),
    seen: new Map(),
  };
  return holder.__minimeOwnChat;
}

// ---- The browsers the person paired ----

interface PairedKey {
  /** The browser's public key (SPKI, base64url), as its page sent it. */
  key: string;
  /** The code its page showed, which the person confirmed. */
  code: string;
  at: string;
}

const keysPath = () =>
  join(/*turbopackIgnore: true*/ minimeHome(), "office", "web-keys.json");

export async function pairedKeys(): Promise<PairedKey[]> {
  try {
    const parsed = JSON.parse((await readText(keysPath())).raw || "[]");
    return Array.isArray(parsed)
      ? parsed.filter(
          (one): one is PairedKey =>
            typeof one?.key === "string" && typeof one?.code === "string",
        )
      : [];
  } catch {
    return [];
  }
}

async function changeKeys(
  change: (keys: PairedKey[]) => PairedKey[],
): Promise<void> {
  await withLock(join(minimeHome(), "office"), async () => {
    const next = change(await pairedKeys()).slice(-20);
    // only the person reads it: it says which browsers may drive their clone
    await atomicWrite(keysPath(), JSON.stringify(next, null, 2), {
      mode: 0o600,
    });
  });
}

/** Forgets every paired browser: each must be paired again before it is heard. */
export async function forgetPairedKeys(office?: OfficeConfig): Promise<void> {
  await changeKeys(() => []);
  if (office) await syncOwnAllow(office, true).catch(() => {});
}

/** Whether a paired browser signed exactly this, freshly, once. */
export async function signedHere(
  proof: Proof | undefined,
  expect: Record<string, string>,
): Promise<boolean> {
  if (!proof) return false;
  const paired = await pairedKeys();
  if (!paired.some((one) => one.key === proof.key)) return false;
  let ok = false;
  try {
    ok = verifySignature(
      "sha256",
      Buffer.from(proof.signed),
      {
        key: createPublicKey({
          key: Buffer.from(proof.key, "base64url"),
          format: "der",
          type: "spki",
        }),
        dsaEncoding: "ieee-p1363",
      },
      Buffer.from(proof.sig, "base64url"),
    );
  } catch {
    return false;
  }
  if (!ok) return false;
  let signed: Record<string, unknown>;
  try {
    signed = JSON.parse(proof.signed);
  } catch {
    return false;
  }
  for (const [name, value] of Object.entries(expect))
    if (signed[name] !== value) return false;
  const at = Number(signed.at);
  const nonce = String(signed.nonce ?? "");
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > FRESH_MS)
    return false;
  if (!/^[\w-]{16,64}$/.test(nonce)) return false;
  // Once: the relay cannot send the same signed words twice.
  const state = shared();
  for (const [old, when] of state.seen)
    if (Date.now() - when > FRESH_MS * 2) state.seen.delete(old);
  if (state.seen.has(nonce)) return false;
  state.seen.set(nonce, Date.now());
  const kept = (await loadState()).ownNonces ?? {};
  if (kept[nonce]) return false;
  await changeState((s) => {
    const now = Date.now();
    const next: Record<string, number> = {};
    for (const [old, when] of Object.entries(s.ownNonces ?? {}))
      if (now - when < FRESH_MS * 2) next[old] = when;
    next[nonce] = now;
    s.ownNonces = next;
  });
  return true;
}

/** Tells the relay whether the person may talk to this clone from its page, when that changed. */
export async function syncOwnAllow(
  office: OfficeConfig,
  force = false,
): Promise<void> {
  const on = (await readPreferences()).webChat;
  const codes = (await pairedKeys()).map((one) => one.code);
  const keys = codes.join(",");
  const state = shared();
  const was = state.allowed;
  if (
    !force &&
    was?.relay === office.relay &&
    was.member === office.member &&
    was.on === on &&
    was.keys === keys
  )
    return;
  await ownAllow(office, on, codes);
  state.allowed = { relay: office.relay, member: office.member, on, keys };
}

/** News of the person on the page: words to answer, a choice that answers a question, a browser to pair. */
export async function onOwn(
  office: OfficeConfig,
  news: OwnNews,
  gateUrl: string,
  language?: string,
): Promise<void> {
  if (!(await readPreferences()).webChat) {
    if (news.kind === "said")
      await ownAnswer(office, { replyTo: news.id, code: "web-chat-off" });
    await syncOwnAllow(office, true).catch(() => {});
    return;
  }
  const state = shared();
  if (news.kind === "pair") {
    await pair(office, news.key);
    return;
  }
  if (news.kind === "chosen") {
    const gate = state.asks.get(news.id);
    if (!gate) return;
    if (
      !(await signedHere(news.proof, {
        kind: "choose",
        ask: news.id,
        value: news.value,
      }))
    )
      return;
    // `ask:<gate id>:<choice>`, as wordAsk gives each button its value.
    const [, id = "", value = ""] = news.value.split(":");
    if (id !== gate) return;
    state.asks.delete(news.id);
    await answerChoice(id, value);
    return;
  }
  if (
    !(await signedHere(news.proof, {
      kind: "say",
      text: news.text,
    }))
  ) {
    // Words no paired browser signed (the page of an unpaired browser, or not the person's own)
    // never run: the page is told to pair first.
    await ownAnswer(office, { replyTo: news.id, code: "web-chat-unpaired" });
    return;
  }
  if (state.queued >= 3) {
    await ownAnswer(office, { replyTo: news.id, code: "busy" });
    return;
  }
  state.queued += 1;
  const turn = state.queue.then(() =>
    answer(office, news, gateUrl, language)
      .catch(() => {})
      .finally(() => {
        state.queued -= 1;
      }),
  );
  state.queue = turn;
  await turn;
}

/**
 * The conversation the page's words go into, made the first time: its questions (pairing a browser
 * first of all) need a conversation to be seen and answered in.
 */
async function ownConversation(): Promise<string> {
  const kept = (await loadState()).ownChat;
  if (kept && (await chatExists(kept))) return kept;
  const made = await createChat((await words()).web("chatTitle"));
  await changeState((s) => {
    s.ownChat = made.id;
  });
  return made.id;
}

/** A browser asks to be paired: the person here confirms the code its page shows, or not. */
async function pair(office: OfficeConfig, key: string): Promise<void> {
  if ((await pairedKeys()).some((one) => one.key === key)) {
    await syncOwnAllow(office, true).catch(() => {});
    return;
  }
  const code = keyCode(key);
  const w = await words();
  const yes = w.web("pairYes");
  const asked = askPerson(
    await ownConversation(),
    {
      kind: "question",
      question: w.web("pairAsk", {
        code: spacedCode(code),
      }),
      choices: [yes, w.web("pairNo")],
    },
    PAIR_MS,
  );
  const answer = await asked.done;
  if (!answer.answered || answer.answer !== yes) return;
  await changeKeys((keys) => [
    ...keys.filter((one) => one.key !== key),
    { key, code, at: new Date().toISOString() },
  ]);
  await syncOwnAllow(office, true).catch(() => {});
}

async function answer(
  office: OfficeConfig,
  said: { id: string; text: string },
  gateUrl: string,
  language?: string,
): Promise<void> {
  await ownTake(office, said.id).catch(() => {});
  const state = shared();
  const shown: string[] = [];
  const w = await words();
  let chat: string | undefined = await ownConversation();
  let failed: string | undefined;
  let done: string | undefined;
  const pending: Promise<unknown>[] = [];
  await runTurn({
    text: said.text,
    chat,
    language,
    gateUrl,
    send: (event) => {
      if (event.type === "chat" && event.id !== chat) {
        chat = event.id;
        const id = event.id;
        pending.push(
          changeState((s) => {
            s.ownChat = id;
          }),
        );
      } else if (event.type === "ask") {
        // Asked in this conversation: its card on the person's page, without "from now on", which
        // is kept as a rule and so is given only here, on the computer.
        const worded = wordAsk(w, event.id, event.ask);
        const choices = worded.choices.filter(
          (choice) => !choice.value.endsWith(":always"),
        );
        if (!choices.length) return;
        pending.push(
          ownAsk(office, {
            text: worded.text,
            choices: choices.map(({ label, value }) => ({ label, value })),
          }).then((asked) => {
            state.asks.set(asked.id, event.id);
            shown.push(asked.id);
          }),
        );
      } else if (event.type === "done") done = event.chat;
      else if (event.type === "error")
        failed = event.code ?? errorCode(event.message) ?? "task-failed";
    },
  });
  await Promise.allSettled(pending);
  // Questions of this turn not answered on the page were answered here, or no longer wait.
  for (const id of shown)
    if (state.asks.delete(id)) await ownSettle(office, id).catch(() => {});
  if (done) {
    const found = await readChat(done).catch(() => undefined);
    const last = found?.messages.filter((m) => m.role === "minime").at(-1);
    if (last?.text.trim()) {
      await ownAnswer(office, { replyTo: said.id, text: last.text });
      return;
    }
  }
  await ownAnswer(office, {
    replyTo: said.id,
    code: failed ?? "empty-answer",
  });
}
