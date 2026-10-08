// The plugin's mod. Two things, so the person's office comes to the Claude Code they work in:
//
// What waits on them (their clone's questions about colleagues' requests, its permission cards,
// questions kept for later) shows under the prompt and as a toast when one comes, and /office
// answers each in Claude Code's own question dialog, as the page or the phone would. It asks the
// Clone Office app on this computer (its address in app.json in the clone's folder) for that.
//
// What colleagues' mini-mes send back later comes into the conversation that asked, once it is
// idle. A quick answer already came in the tool's own reply; this is for the rest, often because the
// colleague's mini-me asked its person first. It learns which requests a conversation asked from the
// tools' replies, keeps them in the plugin's store (so a conversation closed and resumed later still
// gets its answers), looks at them on the relay every 10 seconds while any is open, and starts a
// turn with what came. It calls the relay itself: the plugin's own calls to its MCP tools would need
// the person's leave every time.

import type { EngineInterface, On } from "claude-code";
import {
  compose,
  describe,
  FINAL,
  newsOf,
  type Office,
  REQUEST_ID,
  type Read,
  type Task,
} from "../lib/news.ts";

/** A request a conversation waits on, under `request:<id>` in the plugin's store. */
interface Watch {
  session: string;
  name: string;
  seen: number;
}

const KEY = "request:";
const TOOLS = /^mcp__plugin_clone-office_.+__(ask|answer)_colleague$/;
const HEADER = "x-clone-office";
// One conversation can have more than one id: /clear, /resume and /branch go on in the same process
// under a new one, and session.start does not come again, so the id is noted wherever it is seen.
const sessions = new Set<string>();
let timer: { cancel: () => void } | undefined;
let busy = false;
let skip = 0;
/** What waits on the person, as last shown: toasted once each. */
const shown = new Set<string>();
let turnLine: string | undefined;
let waitLine: string | undefined;

/** One question that waits on the person, as the app words it (features/minime/turn/turn.ts). */
interface Entry {
  id: string;
  about: string;
  text: string;
  choices: { label: string; value: string }[];
  words: boolean;
}

interface Turn {
  entries: Entry[];
  words: {
    header: string;
    later: string;
    stop: string;
    none: string;
    status: string;
  };
}

export function register(on: On) {
  on("session.start", async ($, e, next) => {
    sessions.add(await $.session.id());
    if (!timer)
      timer = $.clock.every(10_000, () => {
        void look($);
      });
    // Registered last: a taken name throws, and nothing after it would run.
    try {
      await $.command.register({
        name: "office",
        description: "Answer what waits on you in Clone Office",
        immediate: true,
      });
    } catch {
      // Another plugin has /office; the status line still shows what waits.
    }
    return next(e);
  });

  // The tools name the request they sent or answered; from then on the conversation waits on it.
  on("tool.call", async ($, e, next) => {
    const result = await next(e);
    if (TOOLS.test(e.tool) && "text" in result && result.text) {
      const id = REQUEST_ID.exec(result.text)?.[1];
      if (id) await watch($, id);
    }
    return result;
  });

  on("command.run", { command: "office" }, async ($) => {
    await answerTurn($);
    return {};
  });
}

/** The Clone Office app on this computer, where it said it answers. */
async function app($: EngineInterface): Promise<string | undefined> {
  const where = await home($);
  if (!where) return undefined;
  return (await readJson<{ url?: string }>($, `${where}/app.json`))?.url;
}

async function getTurn(
  $: EngineInterface,
  url: string,
): Promise<Turn | undefined> {
  const response = await $.http.fetch(`${url}/api/me/turn`, {
    headers: { [HEADER]: "1" },
  });
  if (!response.ok) return undefined;
  return JSON.parse(String(response.text)) as Turn;
}

/** What waits on the person, under the prompt; a toast for each one that came since. */
async function lookAtTurn($: EngineInterface): Promise<void> {
  const url = await app($);
  const turn = url ? await getTurn($, url).catch(() => undefined) : undefined;
  if (!turn) {
    turnLine = undefined;
    return;
  }
  turnLine = turn.entries.length ? turn.words.status : undefined;
  const now = new Set(turn.entries.map((entry) => entry.id));
  for (const entry of turn.entries)
    if (!shown.has(entry.id))
      $.ui.toast(`${entry.about}\n${clipped(entry.text, 200)}`);
  shown.clear();
  for (const id of now) shown.add(id);
}

function clipped(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

function showStatus($: EngineInterface): void {
  const line = [turnLine, waitLine].filter(Boolean).join(" · ");
  $.ui.status(line || undefined);
}

/**
 * /office: each question that waits, in Claude Code's own question dialog, with its choices, and
 * "Later" to leave one for now; their own words go under Other where words answer it. Closing the
 * dialog stops. What was done is a dim line in the transcript, which Claude does not read.
 */
async function answerTurn($: EngineInterface): Promise<void> {
  const url = await app($);
  const turn = url ? await getTurn($, url).catch(() => undefined) : undefined;
  if (!url || !turn) {
    $.ui.log(
      "Clone Office is not running on this computer: start it with `npx clone-office`.",
    );
    return;
  }
  if (!turn.entries.length) {
    $.ui.log(turn.words.none);
    return;
  }
  for (const entry of turn.entries) {
    const options = entry.choices.slice(0, 4).map((choice) => choice.label);
    if (options.length < 4) options.push(turn.words.later);
    if (options.length < 2) options.push(turn.words.stop);
    let picked: string;
    try {
      picked = await $.ui.ask(`${entry.about}\n\n${entry.text}`, {
        options,
        header: turn.words.header.slice(0, 12),
      });
    } catch {
      break;
    }
    if (picked === turn.words.stop) break;
    if (picked === turn.words.later) continue;
    const choice = entry.choices.find((one) => one.label === picked);
    // Words answer a question; a permission is answered only by its choices.
    if (!choice && !entry.words) continue;
    const response = await $.http
      .fetch(`${url}/api/me/turn`, {
        method: "POST",
        headers: { [HEADER]: "1", "content-type": "application/json" },
        body: JSON.stringify(
          choice
            ? { value: choice.value }
            : { value: `${entry.id}:`, words: picked },
        ),
      })
      .catch(() => undefined);
    const done = response?.ok
      ? (JSON.parse(String(response.text)) as { outcome?: string })
      : undefined;
    $.ui.log(`${clipped(entry.about, 120)} ${done?.outcome ?? ""}`.trim());
  }
  await lookAtTurn($).catch(() => {});
  showStatus($);
}

async function home($: EngineInterface): Promise<string | undefined> {
  const moved =
    (await $.env.get("CLONE_OFFICE_HOME")) ||
    (await $.env.get("SUB_OFFICE_HOME"));
  if (moved) return moved;
  const user = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
  if (!user) return undefined;
  // A ~/.sub-office kept before the app was named Clone Office stays the one while it is there.
  const home = `${user}/.clone-office`;
  const before = `${user}/.sub-office`;
  const settings = (dir: string) => readJson($, `${dir}/settings.json`);
  return (await settings(before)) ? before : home;
}

async function readJson<T>(
  $: EngineInterface,
  path: string,
): Promise<T | undefined> {
  try {
    return JSON.parse(String(await $.fs.read(path))) as T;
  } catch {
    return undefined;
  }
}

async function watch($: EngineInterface, id: string): Promise<void> {
  const where = await home($);
  if (!where) return;
  // The tool noted how much of the request the conversation read in its reply.
  const read = await readJson<Read>(
    $,
    `${where}/office/claude-code/${id}.json`,
  );
  if (!read) return;
  const session = await $.session.id();
  sessions.add(session);
  const kept: Watch = {
    session,
    name: read.name,
    seen: read.seen,
  };
  await $.store.set(KEY + id, kept);
  skip = 0;
}

async function getTask(
  $: EngineInterface,
  office: Office,
  id: string,
): Promise<Task | undefined> {
  const response = await $.http.fetch(`${office.relay}/tasks/${id}`, {
    headers: { authorization: `Bearer ${office.token}` },
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`The relay answered ${response.status}.`);
  return (JSON.parse(String(response.text)) as { task: Task }).task;
}

async function look($: EngineInterface): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    sessions.add(await $.session.id());
    await lookAtTurn($).catch(() => {});
    await lookAtRequests($);
  } finally {
    showStatus($);
    busy = false;
  }
}

/** Requests this conversation waits on, at the relay: what came is brought in once it is idle. */
async function lookAtRequests($: EngineInterface): Promise<void> {
  if (skip > 0) {
    skip -= 1;
    return;
  }
  try {
    const mine: [string, Watch][] = [];
    for (const key of await $.store.keys()) {
      if (!key.startsWith(KEY)) continue;
      const kept = (await $.store.get(key)) as Watch | undefined;
      if (kept && sessions.has(kept.session))
        mine.push([key.slice(KEY.length), kept]);
    }
    if (!mine.length) {
      waitLine = undefined;
      skip = 5;
      return;
    }
    const where = await home($);
    const office = where
      ? (await readJson<{ office?: Office }>($, `${where}/settings.json`))
          ?.office
      : undefined;
    if (!where || !office?.relay || !office.token) {
      skip = 5;
      return;
    }
    const found: {
      id: string;
      kept: Watch;
      text: string;
      seen: number;
      final: boolean;
    }[] = [];
    const waiting = new Set<string>();
    for (const [id, kept] of mine) {
      const task = await getTask($, office, id);
      if (!task) {
        await $.store.delete(KEY + id);
        continue;
      }
      // The tools may have read further since (an answer back, a look at the thread).
      const noted = await readJson<Read>(
        $,
        `${where}/office/claude-code/${id}.json`,
      );
      const seen = Math.max(kept.seen, noted?.seen ?? 0);
      const news = newsOf(task, { name: kept.name, seen, ended: noted?.ended });
      if (news)
        found.push({
          id,
          kept,
          text: describe(news),
          seen: news.seen,
          final: news.final,
        });
      else if (FINAL.has(task.status.state)) await $.store.delete(KEY + id);
      else waiting.add(kept.name);
    }
    waitLine = waiting.size
      ? `waiting on ${[...waiting].map((name) => `${name}'s clone`).join(", ")}`
      : undefined;
    if (!found.length) return;
    $.ui.toast(
      found.length === 1
        ? `${found[0]?.kept.name}'s clone answered`
        : `${found.length} answers from the office`,
    );
    // Resolves when the turn starts; until then the news stays unread, so a conversation
    // closed meanwhile gets it when it is resumed.
    await $.prompt.submit({ text: compose(found.map((item) => item.text)) });
    for (const item of found) {
      if (item.final) await $.store.delete(KEY + item.id);
      else await $.store.set(KEY + item.id, { ...item.kept, seen: item.seen });
    }
  } catch {
    skip = 2;
  }
}
