// The person talking to their clone from the team server's page (relay.ts `ownSay`), away from
// this computer: their words become a turn in a conversation of its own here, as a message from
// their phone does (messenger/bridge.ts); the clone's questions go to the page as buttons, and a
// choice made there answers them; its answer goes back once it is done. Only while the person turned
// it on (preferences `webChat`), which the clone tells the relay so the page knows.

import { readChat } from "../chat/store.ts";
import { runTurn } from "../chat/turn.ts";
import { answerChoice } from "../gate/answer.ts";
import { errorCode } from "../server/ndjson.ts";
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

const holder = globalThis as typeof globalThis & {
  __minimeOwnChat?: {
    /** One turn at a time: what comes meanwhile waits its turn. */
    queue: Promise<void>;
    /** The questions shown on the page, by their id there: the gate's question each one is. */
    asks: Map<string, string>;
    /** What this process last told the relay, so it says it again only when it changes. */
    allowed?: { relay: string; member: string; on: boolean };
  };
};

function shared() {
  holder.__minimeOwnChat ??= { queue: Promise.resolve(), asks: new Map() };
  return holder.__minimeOwnChat;
}

/** Tells the relay whether the person may talk to this clone from its page, when that changed. */
export async function syncOwnAllow(
  office: OfficeConfig,
  force = false,
): Promise<void> {
  const on = (await readPreferences()).webChat;
  const state = shared();
  const was = state.allowed;
  if (
    !force &&
    was?.relay === office.relay &&
    was.member === office.member &&
    was.on === on
  )
    return;
  await ownAllow(office, on);
  state.allowed = { relay: office.relay, member: office.member, on };
}

/** News of the person on the page: words to answer, or a choice that answers a question. */
export async function onOwn(
  office: OfficeConfig,
  news: OwnNews,
  gateUrl: string,
  language?: string,
): Promise<void> {
  const state = shared();
  if (news.kind === "chosen") {
    const gate = state.asks.get(news.id);
    if (!gate) return;
    // `ask:<gate id>:<choice>`, as wordAsk gives each button its value.
    const [, id = "", value = ""] = news.value.split(":");
    if (id !== gate) return;
    state.asks.delete(news.id);
    await answerChoice(id, value);
    return;
  }
  const turn = state.queue.then(() =>
    answer(office, news, gateUrl, language).catch(() => {}),
  );
  state.queue = turn;
  await turn;
}

async function answer(
  office: OfficeConfig,
  said: { id: string; text: string },
  gateUrl: string,
  language?: string,
): Promise<void> {
  if (!(await readPreferences()).webChat) {
    // Turned off since the page last knew: it says so, and the page closes its box.
    await ownAnswer(office, { replyTo: said.id, code: "web-chat-off" });
    await syncOwnAllow(office, true).catch(() => {});
    return;
  }
  await ownTake(office, said.id).catch(() => {});
  const state = shared();
  const shown: string[] = [];
  const w = await words();
  let chat = (await loadState()).ownChat;
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
        // Asked in this conversation: its card, with its buttons, on the person's page.
        const worded = wordAsk(w, event.id, event.ask);
        if (!worded.choices.length) return;
        pending.push(
          ownAsk(office, {
            text: worded.text,
            choices: worded.choices.map(({ label, value }) => ({
              label,
              value,
            })),
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
