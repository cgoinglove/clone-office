// The plugin's mod: brings what colleagues' mini-mes send back later into the Claude Code
// conversation that asked, once it is idle. A quick answer already came in the tool's own reply;
// this is for the rest, often because the colleague's mini-me asked its person first.
//
// It learns which requests a conversation asked from the tools' replies, keeps them in the
// plugin's store (so a conversation closed and resumed later still gets its answers), looks at
// them on the relay every 10 seconds while any is open, shows under the prompt whom it waits on,
// and starts a turn with what came. It calls the relay itself: the plugin's own calls to its MCP
// tools would need the person's leave every time.

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
const TOOLS = /^mcp__plugin_sub-office_.+__(ask|answer)_colleague$/;
// One conversation can have more than one id: /clear starts a new one in the same process.
const sessions = new Set<string>();
let timer: { cancel: () => void } | undefined;
let busy = false;
let skip = 0;

export function register(on: On) {
  on("session.start", async ($, e, next) => {
    sessions.add(await $.session.id());
    if (!timer)
      timer = $.clock.every(10_000, () => {
        void look($);
      });
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
}

async function home($: EngineInterface): Promise<string | undefined> {
  const moved = await $.env.get("SUB_OFFICE_HOME");
  if (moved) return moved;
  const user = (await $.env.get("HOME")) ?? (await $.env.get("USERPROFILE"));
  return user ? `${user}/.sub-office` : undefined;
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
  const kept: Watch = {
    session: await $.session.id(),
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
  if (skip > 0) {
    skip -= 1;
    return;
  }
  busy = true;
  try {
    const mine: [string, Watch][] = [];
    for (const key of await $.store.keys()) {
      if (!key.startsWith(KEY)) continue;
      const kept = (await $.store.get(key)) as Watch | undefined;
      if (kept && sessions.has(kept.session))
        mine.push([key.slice(KEY.length), kept]);
    }
    if (!mine.length) {
      $.ui.status(undefined);
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
    $.ui.status(
      waiting.size
        ? `waiting on ${[...waiting].map((name) => `${name}'s clone`).join(", ")}`
        : undefined,
    );
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
  } finally {
    busy = false;
  }
}
