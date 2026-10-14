// The signed-in pages' own script, served by the relay itself at /assets/home.mjs (handler.ts) and
// allowed by those pages alone (`HOME_HEADERS`). The pages work without it, a form posting and
// coming back, except talking to one's own clone, which needs it.
//
// Its menus close as menus do (Escape, a click elsewhere, focus moving on). On the clone's tab it
// pairs this browser with the clone and signs what is said: a key made here that never leaves it
// (ECDSA P-256, not extractable, kept in IndexedDB), whose public half the clone is asked to trust,
// the person comparing on their computer the twelve digits shown here (lib/key-code.ts computes the
// same); then every word and choice is signed with it, and the clone acts only on those
// (features/minime/office/own-chat.ts), so the relay carrying them, or anyone signed in to the
// account, cannot speak for the person. The answer comes in as it is ready (people-pages.ts
// `chatThread`, from /home/clone/thread).

export const HOME_CLIENT = `// ---- menus ----
for (const menu of document.querySelectorAll(".band details")) {
  const summary = menu.querySelector("summary");
  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menu.open) {
      menu.open = false;
      summary?.focus();
    }
  });
  menu.addEventListener("focusout", (event) => {
    if (menu.open && !menu.contains(event.relatedTarget)) menu.open = false;
  });
  document.addEventListener("click", (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
}

// ---- the requests page: it looks again on its own while in sight, never under someone's typing ----
const refresh = document.querySelector("[data-refresh]");
if (refresh) {
  let seen = "";
  const fields = (main) =>
    main.querySelectorAll("textarea, select, input:not([type=hidden])");
  // what each field held as the page came, so what the person wrote or picked since is known
  const first = new WeakMap();
  const note = (main) => {
    for (const field of fields(main)) first.set(field, field.value);
  };
  // Something being written or picked, or a control in use, waits for the person.
  const busy = (main) =>
    [...fields(main)].some(
      (field) =>
        field === document.activeElement || field.value !== first.get(field),
    );
  const again = async () => {
    const main = document.querySelector("main");
    if (!main || document.hidden || busy(main)) return;
    const url = new URL(location.href);
    url.searchParams.delete("done");
    url.searchParams.delete("error");
    const answer = await fetch(url, { headers: { accept: "text/html" } });
    if (!answer.ok) return;
    const html = await answer.text();
    if (html === seen || busy(main)) return;
    seen = html;
    const page = new DOMParser().parseFromString(html, "text/html");
    const fresh = page.querySelector("main");
    if (!fresh) return;
    main.innerHTML = fresh.innerHTML;
    note(main);
    for (const link of main.querySelectorAll("[data-refresh]")) link.hidden = true;
    // the tab's count and the window's title say what waits, as a new load would
    const tabs = document.querySelector(".tabs");
    const freshTabs = page.querySelector(".tabs");
    if (tabs && freshTabs) tabs.innerHTML = freshTabs.innerHTML;
    if (page.title) document.title = page.title;
  };
  refresh.hidden = true;
  const main = document.querySelector("main");
  if (main) note(main);
  setInterval(() => again().catch(() => {}), 15000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) again().catch(() => {});
  });
}

// ---- talking to one's own clone ----
const thread = document.getElementById("thread");
const decide = document.getElementById("decide");
const form = document.getElementById("say");
const box = document.getElementById("say-text");
const send = form ? form.querySelector("button.send") : null;
const failure = document.getElementById("say-error");
const news = document.getElementById("chat-news");
const pairBox = document.getElementById("pair");
const pairCode = document.getElementById("pair-code");
const pairStart = document.getElementById("pair-start");
const pairWait = document.getElementById("pair-wait");
const office = thread ? thread.dataset.office : "";
const PAIR_MS = 10 * 60 * 1000;
let on = thread ? thread.dataset.on === "1" : false;
let trusted = thread ? (thread.dataset.keys || "").split(",").filter(Boolean) : [];
let keys = null;
let code = "";
let pairingUntil = 0;
let timer = 0;

const b64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\\+/g, "-")
    .replace(/\\//g, "_")
    .replace(/=+$/, "");

// The browser's key pair, made once and kept where only this page's origin reads it.
const stored = (make) =>
  new Promise((resolve) => {
    let open;
    try {
      open = indexedDB.open("clone-office", 1);
    } catch {
      return resolve(make());
    }
    open.onupgradeneeded = () => open.result.createObjectStore("keys");
    open.onerror = () => resolve(make());
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction("keys").objectStore("keys").get("browser");
      read.onerror = () => resolve(make());
      read.onsuccess = async () => {
        if (read.result && read.result.privateKey) return resolve(read.result);
        const made = await make();
        try {
          db.transaction("keys", "readwrite").objectStore("keys").put(made, "browser");
        } catch {}
        resolve(made);
      };
    };
  });

const paired = () => Boolean(code) && trusted.includes(code);
const say = (words) => {
  if (!failure) return;
  failure.textContent = words || "";
  failure.hidden = !words;
};
const end = () => window.scrollTo({ top: document.body.scrollHeight });
const grow = () => {
  if (!box) return;
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 192) + "px";
};
// What may be used now: the box and the choices once this browser is paired, else the pairing.
const apply = () => {
  const ready = on && paired();
  if (box) box.disabled = !ready;
  if (send) send.disabled = !ready;
  for (const choice of decide ? decide.querySelectorAll("button") : []) choice.disabled = !ready;
  for (const chips of thread ? thread.querySelectorAll(".suggest") : []) chips.hidden = !ready;
  if (pairBox) pairBox.hidden = !on || !code || paired();
  if (pairWait) pairWait.hidden = !(pairingUntil > Date.now());
  if (pairStart) pairStart.hidden = pairingUntil > Date.now();
};
const show = (data) => {
  if (!thread || typeof data.html !== "string") return;
  const was = thread.dataset.waiting === "1";
  if (thread.innerHTML !== data.html) {
    thread.innerHTML = data.html;
    end();
  }
  if (decide && typeof data.decide === "string" && decide.innerHTML !== data.decide)
    decide.innerHTML = data.decide;
  thread.dataset.waiting = data.waiting ? "1" : "0";
  on = Boolean(data.on);
  trusted = Array.isArray(data.keys) ? data.keys : trusted;
  if (paired() && pairingUntil) {
    pairingUntil = 0;
    apply();
    end();
  }
  // the answer said once to a screen reader, not the whole conversation again
  if (was && !data.waiting && news && form) news.textContent = form.dataset.news || "";
  apply();
};
const look = async () => {
  const answer = await fetch("/home/clone/thread?office=" + encodeURIComponent(office), {
    headers: { accept: "application/json" },
  });
  if (answer.ok) show(await answer.json());
};
// While an answer or a pairing is on its way, look again now and then; a page out of sight waits.
const poll = () => {
  clearTimeout(timer);
  const pairing = pairingUntil > Date.now();
  if (!thread || document.hidden || !(thread.dataset.waiting === "1" || pairing)) return;
  timer = setTimeout(() => look().catch(() => {}).then(poll), 2500);
};
const post = async (path, fields) => {
  const answer = await fetch(path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ office, ...fields }),
  });
  const data = await answer.json().catch(() => ({}));
  if (!answer.ok) {
    say(data.words || data.error);
    return false;
  }
  say("");
  show(data);
  poll();
  return true;
};
// What this browser says, signed so the clone knows it was this browser and nobody between.
const signed = async (what) => {
  const text = JSON.stringify({ v: 1, ...what, at: Date.now(), nonce: crypto.randomUUID() });
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    new TextEncoder().encode(text),
  );
  return { key: keys.spki, signed: text, sig: b64url(sig) };
};

const start = async () => {
  if (!window.isSecureContext || !window.crypto || !crypto.subtle || !window.indexedDB) {
    const secure = document.getElementById("pair-secure");
    if (secure && on) secure.hidden = false;
    return;
  }
  const pair = await stored(() =>
    crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]),
  );
  const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));
  let value = 0;
  for (let i = 0; i < 6; i++) value = value * 256 + digest[i];
  code = String(value % 1e12).padStart(12, "0");
  keys = { privateKey: pair.privateKey, spki: b64url(spki) };
  if (pairCode) pairCode.textContent = code.slice(0, 4) + " " + code.slice(4, 8) + " " + code.slice(8);
  apply();
  // the pairing, shown or gone, changed the box's height: the last words stay in sight
  end();
};

if (thread && office) {
  end();
  start()
    .catch(() => {})
    .then(poll);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) look().catch(() => {}).then(poll);
  });
  pairStart?.addEventListener("click", async () => {
    if (!keys) return;
    pairingUntil = Date.now() + PAIR_MS;
    apply();
    const ok = await post("/home/clone/pair", { key: keys.spki }).catch(() => false);
    if (!ok) pairingUntil = 0;
    apply();
    poll();
  });
  if (form && box) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const text = box.value.trim();
      if (!text || !keys) return;
      box.disabled = true;
      const ok = await signed({ kind: "say", text })
        .then((proof) => post(form.action, { text, ...proof }))
        .catch(() => false);
      apply();
      if (ok) {
        box.value = "";
        grow();
      }
      box.focus();
    });
    // Enter sends, Shift+Enter starts a line; a word still being composed (Korean, Japanese) is not sent.
    box.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    box.addEventListener("input", grow);
    // a suggestion starts the sentence; the person sends it
    thread.addEventListener("click", (event) => {
      const chip = event.target instanceof Element ? event.target.closest("button.chip") : null;
      if (!chip || box.disabled) return;
      box.value = chip.dataset.fill || "";
      grow();
      box.focus();
    });
  }
  // A question's buttons answer it in place, signed as words are; focus goes on to the next one.
  decide?.addEventListener("submit", async (event) => {
    const ask = event.target;
    if (!(ask instanceof HTMLFormElement) || !keys) return;
    event.preventDefault();
    const id = ask.querySelector('input[name="ask"]')?.value || "";
    const value = event.submitter?.value || "";
    const ok = await signed({ kind: "choose", ask: id, value })
      .then((proof) => post(ask.action, { ask: id, value, ...proof }))
      .catch(() => false);
    if (!ok) return;
    const next = decide.querySelector("button:not(:disabled)");
    if (next) next.focus();
    else if (box) {
      box.focus();
      if (news && form) news.textContent = form.dataset.answered || "";
    }
  });
}
`;
