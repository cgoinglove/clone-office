// The page someone without a mini-me opens from a link: who asks, what, and a box to answer. It is
// plain HTML from the relay itself, with no scripts and nothing from elsewhere, in the reader's
// language when the page is written in it (English otherwise), and everything a person wrote is
// escaped before it is shown. Node runs this file as it is, like the rest of the relay.

const WORDS = {
  en: {
    title: "{asker} asks you",
    answer: "Your answer",
    send: "Send",
    sent: "Sent. {asker} has your answer:",
    closed: "This link is closed.",
    missing: "There is no such link.",
    footer:
      "Sent by {asker}'s mini-me, with sub-office. Your answer goes only to {asker}.",
  },
  ko: {
    title: "{asker}님이 물어요",
    answer: "답",
    send: "보내기",
    sent: "보냈어요. {asker}님에게 이렇게 전해졌어요:",
    closed: "이 링크는 끝났어요.",
    missing: "없는 링크예요.",
    footer:
      "{asker}님의 미니미가 sub-office로 보냈어요. 답은 {asker}님에게만 가요.",
  },
};

export type PageLanguage = keyof typeof WORDS;

/** The first of the reader's languages the page is written in, else English. */
export function pageLanguage(acceptLanguage: string | undefined): PageLanguage {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase().split("-")[0];
    if (tag in WORDS) return tag as PageLanguage;
  }
  return "en";
}

export function escape(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function say(
  lang: PageLanguage,
  key: keyof (typeof WORDS)["en"],
  values: Record<string, string> = {},
): string {
  let text: string = WORDS[lang][key];
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, value);
  return escape(text);
}

const STYLE = `
:root { --bg: #ffffff; --fg: #0d0d0d; --muted: #62656b; --line: rgba(13,13,13,.12); --brand: #0169cc; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0e0f11; --fg: #f1f2f4; --muted: #a2a5ac; --line: rgba(255,255,255,.14); --brand: #0a84ff; color-scheme: dark; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", system-ui, sans-serif; }
main { max-width: 34rem; margin: 0 auto; padding: 2.5rem 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
h1 { font-size: 1.25rem; margin: 0; text-wrap: balance; }
.request { white-space: pre-wrap; border: 1px solid var(--line); border-radius: 14px; padding: 1rem; margin: 0; }
label { display: block; font-weight: 600; margin-bottom: .5rem; }
textarea { width: 100%; min-height: 8rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: .75rem; }
button { font: inherit; font-weight: 600; color: #fff; background: var(--brand); border: 0; border-radius: 10px; padding: .6rem 1.2rem; margin-top: .75rem; cursor: pointer; }
input { width: 100%; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 10px; padding: .6rem .75rem; margin-bottom: .75rem; }
form label { margin-bottom: .25rem; }
pre { white-space: pre-wrap; word-break: break-all; user-select: all; -webkit-user-select: all; font: .9rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; border: 1px solid var(--line); border-radius: 10px; padding: .75rem; margin: 0; }
section { display: flex; flex-direction: column; gap: .5rem; }
h2 { font-size: 1.05rem; margin: 0; }
a { color: var(--brand); }
.error { color: #c43d18; }
.quiet { background: transparent; color: var(--fg); border: 1px solid var(--line); }
.note, footer { color: var(--muted); }
footer { font-size: .85rem; border-top: 1px solid var(--line); padding-top: 1rem; }
`;

export function shell(lang: PageLanguage, title: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>
`;
}

const INVITE_WORDS = {
  en: {
    title: "{from} invites you to their office",
    titleNobody: "You are invited to an office",
    what: "In this office, everyone's mini-me (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    how: "To join: open sub-office on your computer, open Office, paste this link where the relay goes, and join.",
    keep: "Anyone with this link can join this office; keep it within your team.",
  },
  ko: {
    title: "{from}님이 오피스에 초대했어요",
    titleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 미니미(나처럼 일하는 AI)가 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
    how: "들어오는 법: 내 컴퓨터에서 sub-office를 열고, 오피스에서 릴레이 칸에 이 링크를 붙여 넣은 뒤 들어가기를 누르세요.",
    keep: "이 링크가 있으면 누구나 이 오피스에 들어올 수 있어요. 팀 안에서만 나눠 주세요.",
  },
};

/** The page an office invite opens: who invites, what an office is, and how to join with the link. */
export function invitePage(input: {
  lang: PageLanguage;
  from?: string;
  link: string;
}): string {
  const words = INVITE_WORDS[input.lang];
  const title = escape(
    input.from
      ? words.title.replaceAll("{from}", input.from)
      : words.titleNobody,
  );
  return shell(
    input.lang,
    title,
    `<h1>${title}</h1>
<p>${escape(words.what)}</p>
<p>${escape(words.how)}</p>
<p class="request">${escape(input.link)}</p>
<footer>${escape(words.keep)}</footer>`,
  );
}

export function missingPage(lang: PageLanguage): string {
  const text = say(lang, "missing");
  return shell(lang, text, `<p>${text}</p>`);
}

export function replyPage(input: {
  lang: PageLanguage;
  asker: string;
  name: string;
  request: string;
  state: "open" | "answered" | "closed";
  answer?: string;
}): string {
  const { lang } = input;
  const asker = input.asker;
  const title = say(lang, "title", { asker });
  const answered =
    input.state === "answered"
      ? `<p class="note">${say(lang, "sent", { asker })}</p><p class="request">${escape(input.answer ?? "")}</p>`
      : input.state === "closed"
        ? `<p class="note">${say(lang, "closed")}</p>`
        : `<form method="post">
<label for="answer">${say(lang, "answer")}</label>
<textarea id="answer" name="answer" required maxlength="8000"></textarea>
<button type="submit">${say(lang, "send")}</button>
</form>`;
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p class="request">${escape(input.request)}</p>
${answered}
<footer>${say(lang, "footer", { asker })}</footer>`,
  );
}
