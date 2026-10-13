// The signed-in pages' own script, served by the relay itself at /assets/home.mjs (handler.ts) and
// allowed by those pages alone (`HOME_HEADERS`). The pages work without it: a form posts and comes
// back. With it, what the person says to their clone is sent without leaving the page, and the
// answer comes in as it is ready (people-pages.ts `chatThread`, from /home/clone/thread).

export const HOME_CLIENT = `const thread = document.getElementById("thread");
const form = document.getElementById("say");
const box = document.getElementById("say-text");
const send = form ? form.querySelector("button.send") : null;
const failure = document.getElementById("say-error");
const office = thread ? thread.dataset.office : "";
let timer = 0;

const end = () => window.scrollTo({ top: document.body.scrollHeight });
const grow = () => {
  if (!box) return;
  box.style.height = "auto";
  box.style.height = Math.min(box.scrollHeight, 192) + "px";
};
const say = (words) => {
  if (!failure) return;
  failure.textContent = words || "";
  failure.hidden = !words;
};
const show = (data) => {
  if (!thread || typeof data.html !== "string") return;
  thread.innerHTML = data.html;
  thread.dataset.waiting = data.waiting ? "1" : "0";
  if (box) box.disabled = !data.on;
  if (send) send.disabled = !data.on;
  end();
};
const look = async () => {
  const answer = await fetch("/home/clone/thread?office=" + encodeURIComponent(office), {
    headers: { accept: "application/json" },
  });
  if (answer.ok) show(await answer.json());
};
// While an answer is on its way, look again now and then; a page out of sight waits.
const poll = () => {
  clearTimeout(timer);
  if (!thread || thread.dataset.waiting !== "1" || document.hidden) return;
  timer = setTimeout(() => look().catch(() => {}).then(poll), 2500);
};
const post = async (path, body) => {
  const answer = await fetch(path, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
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

if (thread && office) {
  end();
  poll();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) look().catch(() => {}).then(poll);
  });
  if (form && box) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!box.value.trim()) return;
      const body = new URLSearchParams(new FormData(form));
      box.disabled = true;
      const ok = await post(form.action, body).catch(() => false);
      box.disabled = false;
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
  }
  // A question's buttons answer it in place.
  thread.addEventListener("submit", (event) => {
    const ask = event.target;
    if (!(ask instanceof HTMLFormElement)) return;
    event.preventDefault();
    post(ask.action, new URLSearchParams(new FormData(ask, event.submitter))).catch(() => {});
  });
}
`;
