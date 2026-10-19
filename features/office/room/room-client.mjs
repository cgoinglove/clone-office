// The office drawing on the team server's page (room-page.ts `officeRoomHtml`): finds the box the
// page left for it, draws the room the app draws (office.mjs) there with the words the server put
// in it, and looks at the office every few seconds while the box is on screen and the tab in front,
// as the app does; nothing is looked at while the tab is hidden. Plain module, no build step: the
// server sends it as it is, beside the room's own modules. Nothing it is given runs as code.

import { createOffice } from "./office.mjs";

/** How often the office is looked at while it is in view, as the app looks at it. */
const EVERY_MS = 5000;
/** The longest wait between tries while the server cannot be reached. */
const MOST_MS = 60_000;
/** A look that takes longer than this is given up and tried again. */
const TIMEOUT_MS = 15_000;

/** A message in the ICU form the app's words use: `{name}`, and `{count, plural, … other {# …}}`. */
function formatter(lang) {
  let rules;
  let numbers;
  try {
    rules = new Intl.PluralRules(lang);
    numbers = new Intl.NumberFormat(lang);
  } catch {
    rules = new Intl.PluralRules("en");
    numbers = new Intl.NumberFormat("en");
  }
  const closing = (text, from) => {
    let depth = 0;
    for (let i = from; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}" && --depth === 0) return i;
    }
    return -1;
  };
  const cases = (body) => {
    const out = {};
    let i = 0;
    while (i < body.length) {
      const open = body.indexOf("{", i);
      if (open < 0) break;
      const end = closing(body, open);
      if (end < 0) break;
      out[body.slice(i, open).trim()] = body.slice(open + 1, end);
      i = end + 1;
    }
    return out;
  };
  const argument = (inner, values) => {
    const [name, kind, ...rest] = inner.split(",");
    const value = values[name.trim()];
    if (kind === undefined) return value == null ? "" : String(value);
    const options = cases(rest.join(","));
    if (kind.trim() === "select")
      return render(options[String(value)] ?? options.other ?? "", values);
    if (kind.trim() !== "plural") return value == null ? "" : String(value);
    const n = Number(value);
    const chosen =
      options[`=${n}`] ?? options[rules.select(n)] ?? options.other;
    return render((chosen ?? "").replaceAll("#", numbers.format(n)), values);
  };
  function render(text, values) {
    let out = "";
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const end = closing(text, open);
      if (end < 0) break;
      out += text.slice(i, open) + argument(text.slice(open + 1, end), values);
      i = end + 1;
    }
    return out + text.slice(i);
  }
  return render;
}

/** The room's words (RoomWords, office.d.mts) from the app's own, read as office-room.tsx reads them. */
function roomWords(raw, lang) {
  const render = formatter(lang);
  const t = (key, values = {}) => {
    let node = raw;
    for (const part of key.split(".")) node = node?.[part];
    return typeof node === "string" ? render(node, values) : key;
  };
  return {
    label: t("room.label"),
    team: t("team"),
    floor: (n) => t("room.floor", { n }),
    floorGroup: t("room.floorGroup"),
    done: t("room.done"),
    answer: t("room.answer"),
    needsYouChip: t("room.needsYouChip"),
    yourMiniMe: t("yourMiniMe"),
    miniMe: (name) => t("miniMe", { name }),
    requestState: (state) => t(`state.${state}`),
    views: {
      label: t("room.views.label"),
      desk: t("room.views.desk"),
      office: t("room.views.office"),
      zoomIn: t("room.views.zoomIn"),
      zoomOut: t("room.views.zoomOut"),
    },
    composer: {
      placeholder: t("room.composer.placeholder"),
      send: t("room.composer.send"),
      askFor: (name, what) => t("room.composer.askFor", { name, what }),
      askText: (name, what) => t("room.composer.askText", { name, what }),
    },
    clock: { in: t("room.clock.in") },
    plate: {
      youShort: t("room.plate.youShort"),
      you: (name) => t("room.plate.you", { name }),
      needsYou: t("room.plate.needsYou"),
      deciding: t("room.plate.deciding"),
      workingFor: (name) => t("room.plate.workingFor", { name }),
      workingForYou: t("room.plate.workingForYou"),
      away: t("room.plate.away"),
      inMeeting: t("room.plate.inMeeting"),
      goingTo: (name) => t("room.plate.goingTo", { name }),
      off: t("room.plate.off"),
      onWeb: t("room.plate.onWeb"),
    },
    say: {
      isIn: (name) => t("room.say.isIn", { name }),
      bye: (name) => t("room.say.bye", { name }),
      bring: (to, from, what) => t("room.say.bring", { to, from, what }),
      leftOnDesk: (name) => t("room.say.leftOnDesk", { name }),
    },
    lobby: {
      greeting: (hour, name) =>
        t(
          hour < 5
            ? "room.lobby.late"
            : hour < 12
              ? "room.lobby.morning"
              : hour < 18
                ? "room.lobby.afternoon"
                : "room.lobby.evening",
          { name },
        ),
      in: (count, of) => t("room.lobby.in", { in: count, count: of }),
      alone: t("room.lobby.alone"),
      label: t("room.lobby.label"),
      waiting: (count) => t("room.lobby.waiting", { count }),
      clockIn: t("room.lobby.clockIn"),
      enter: t("room.lobby.enter"),
      foot: t("room.lobby.foot"),
      floors: (count) => t("room.lobby.floors", { count }),
      yourFloor: t("room.lobby.yourFloor"),
    },
    panel: {
      close: t("room.panel.close"),
      atDesk: t("room.panel.atDesk"),
      away: t("room.panel.away"),
      needsYou: t("room.panel.needsYou"),
      waitingOn: (name) => t("room.panel.waitingOn", { name }),
      askThem: (name) => t("room.panel.askThem", { name }),
      owns: t("room.panel.owns"),
      between: (name) => t("room.panel.between", { name }),
      now: t("room.panel.now"),
      workingOn: (what) => t("room.panel.workingOn", { what }),
      waitingFor: (name) => t("room.panel.waitingFor", { name }),
      waitingForYou: t("room.panel.waitingForYou"),
      free: t("room.panel.free"),
      notIn: (name) => t("room.panel.notIn", { name }),
      ways: (name) => t("room.panel.ways", { name }),
      myMenu: t("room.panel.myMenu"),
      menu: (name) => t("room.panel.menu", { name }),
      earlier: t("room.panel.earlier"),
      nothingYet: t("room.panel.nothingYet"),
    },
  };
}

/** A path on this server, or nothing: what the page says never sends anyone elsewhere. */
const samePath = (path) =>
  typeof path === "string" && /^\/(?![/\\])/.test(path) ? path : undefined;

function start(box) {
  const stage = box.querySelector("[data-co-room-stage]");
  const note = box.querySelector("[data-co-room-note]");
  const look = samePath(box.dataset.look);
  if (!stage || !note || !look) return;
  const answer = samePath(box.dataset.answer);
  const lang = box.dataset.lang || "en";
  let raw = {};
  try {
    raw = JSON.parse(box.dataset.words || "{}");
  } catch {}
  const words = roomWords(raw, lang);

  // The page's theme follows the computer's, as its own sheet does; room.css reads it as `.dark`.
  const dark = matchMedia("(prefers-color-scheme: dark)");
  const theme = () => box.classList.toggle("dark", dark.matches);
  theme();
  dark.addEventListener("change", theme);

  /** The line over the box: nothing, waiting for the first look, or what went wrong. */
  const say = (text, kind = "") => {
    note.textContent = text;
    note.className = `co-room-note${kind ? ` ${kind}` : ""}`;
    note.hidden = !text && kind !== "wait";
    box.toggleAttribute("aria-busy", kind === "wait");
  };
  say("", "wait");

  let room = null;
  let last = "";
  let timer = 0;
  let busy = false;
  let ended = false;
  let failures = 0;
  let inView = false;

  const shown = () =>
    !ended && inView && document.visibilityState === "visible";

  const later = (ms) => {
    clearTimeout(timer);
    if (shown()) timer = setTimeout(lookNow, ms);
  };

  async function lookNow() {
    clearTimeout(timer);
    if (busy || !shown()) return;
    busy = true;
    try {
      const answered = await fetch(look, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (answered.status === 401 || answered.status === 403) {
        // signed out, or no longer in this office: looking again would not change it
        ended = true;
        say(
          answered.status === 401
            ? box.dataset.signedOut || ""
            : box.dataset.unreachable || "",
          room ? "over" : "",
        );
        return;
      }
      if (!answered.ok)
        throw new Error(`The office answered ${answered.status}.`);
      const text = await answered.text();
      failures = 0;
      if (text !== last) {
        const data = JSON.parse(text);
        last = text;
        if (!room)
          room = createOffice(stage, {
            words,
            locale: lang,
            // the page shows what waits on the viewer on its requests: the office only marks it
            turnShown: true,
            onAnswer: () => {
              if (answer) location.assign(answer);
            },
          });
        room.update(data);
      }
      say("");
    } catch {
      failures++;
      say(box.dataset.unreachable || "", room ? "over" : "");
    } finally {
      busy = false;
      later(
        failures
          ? Math.min(MOST_MS, EVERY_MS * 2 ** Math.min(failures - 1, 4))
          : EVERY_MS,
      );
    }
  }

  // Looked at while on screen and in front; a tab brought back looks at once.
  new IntersectionObserver((entries) => {
    inView = entries[entries.length - 1].isIntersecting;
    if (inView) void lookNow();
    else clearTimeout(timer);
  }).observe(box);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void lookNow();
    else clearTimeout(timer);
  });
}

const box = document.querySelector("[data-co-room]");
if (box instanceof HTMLElement) start(box);
