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
      "Sent by {asker}'s clone, with sub-office. Your answer goes only to {asker}.",
  },
  ko: {
    title: "{asker}님이 물어요",
    answer: "답",
    send: "보내기",
    sent: "보냈어요. {asker}님에게 이렇게 전해졌어요:",
    closed: "이 링크는 끝났어요.",
    missing: "없는 링크예요.",
    footer:
      "{asker}님의 클론이 sub-office로 보냈어요. 답은 {asker}님에게만 가요.",
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
:root { --bg: #ffffff; --fg: #0d0d0d; --muted: #62656b; --line: rgba(13,13,13,.12); --brand: #0169cc; --danger: #dc2626; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0e0f11; --fg: #f1f2f4; --muted: #a2a5ac; --line: rgba(255,255,255,.14); --brand: #0a84ff; --danger: #ef4444; color-scheme: dark; } }
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
.brand { display: flex; align-items: center; gap: .5rem; max-width: 34rem; margin: 0 auto; padding: 1.25rem 1rem 0; font-weight: 600; font-size: .95rem; letter-spacing: -.01em; }
.mark { width: 1.5rem; height: 1.5rem; color: var(--fg); }
.mark .eye { fill: var(--bg); }
.rows { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 14px; }
.rows > li { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; padding: .7rem .9rem; border-bottom: 1px solid var(--line); }
.rows > li:last-child { border-bottom: 0; }
.rows .who { flex: 1 1 12rem; min-width: 0; }
.rows .who b { font-weight: 600; }
.rows .who small { display: block; color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.tag { font-size: .75rem; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: .05rem .4rem; margin-left: .35rem; }
.acts { display: flex; gap: .4rem; align-items: center; }
.acts form { margin: 0; }
.acts button, button.small { margin: 0; padding: .3rem .7rem; font-size: .85rem; border-radius: 8px; }
details > summary { cursor: pointer; color: var(--muted); font-size: .85rem; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details[open] > summary { margin-bottom: .4rem; }
.danger { background: var(--danger); }
.inline { display: flex; gap: .5rem; align-items: flex-start; }
.inline input { margin: 0; flex: 1; }
.inline button { margin: 0; }
.small { font-size: .85rem; }
`;

/** The app's mark (app/icon.svg): your own clone at rest, in the page's ink. */
const MARK = `<svg class="mark" viewBox="14 12 212 220" aria-hidden="true"><path fill="currentColor" d="M215.5 124.3C215.4 126.6 215.3 128.9 215.3 131.3C215.3 133.6 215.3 136 215.2 138.4C215.2 140.8 215.2 143.2 215 145.6C214.9 148.1 214.7 150.6 214.4 153.1C214.1 155.6 213.7 158.1 213.2 160.6C212.6 163.1 211.9 165.6 210.9 168C210 170.4 208.9 172.7 207.7 175C206.4 177.2 204.9 179.4 203.4 181.4C201.8 183.5 200 185.4 198.1 187.2C196.3 188.9 194.2 190.6 192.2 192.1C190.1 193.7 188 195.1 185.8 196.5C183.6 197.8 181.4 199.1 179.1 200.3C176.9 201.5 174.6 202.7 172.3 203.9C170.1 205 167.8 206.1 165.4 207.3C163.1 208.4 160.8 209.6 158.4 210.7C156 211.8 153.6 212.9 151 214C148.5 215.1 146 216.1 143.3 217.1C140.7 218 138 218.9 135.2 219.6C132.5 220.4 129.6 221 126.7 221.4C123.9 221.8 120.9 222 118 222C115.1 222 112.1 221.8 109.2 221.3C106.3 220.8 103.4 220.1 100.7 219.2C97.9 218.3 95.1 217.1 92.5 215.8C89.9 214.5 87.4 213 85 211.3C82.5 209.7 80.2 207.9 78 206C75.7 204.1 73.6 202.2 71.5 200.2C69.4 198.2 67.4 196.1 65.4 194C63.4 192 61.5 189.9 59.5 187.8C57.6 185.7 55.6 183.5 53.7 181.4C51.7 179.2 49.7 177 47.8 174.7C45.8 172.5 43.8 170.2 41.9 167.8C40 165.3 38.1 162.8 36.4 160.2C34.6 157.6 32.9 154.9 31.4 152.1C29.9 149.2 28.5 146.3 27.4 143.3C26.3 140.2 25.3 137.1 24.7 133.9C24 130.8 23.6 127.5 23.4 124.3C23.3 121 23.4 117.7 23.8 114.5C24.2 111.3 24.9 108.1 25.8 105C26.6 101.8 27.7 98.8 29 95.8C30.2 92.8 31.7 89.9 33.2 87.1C34.8 84.3 36.5 81.6 38.2 79C39.9 76.4 41.7 73.8 43.5 71.3C45.4 68.8 47.2 66.4 49.1 64C51 61.6 52.9 59.2 54.9 56.9C56.9 54.5 58.9 52.2 60.9 50C63 47.7 65.1 45.5 67.3 43.3C69.5 41.2 71.8 39.1 74.3 37.2C76.7 35.2 79.2 33.4 81.8 31.7C84.4 30.1 87.2 28.6 90 27.3C92.8 26 95.8 25 98.8 24.1C101.8 23.3 104.9 22.7 107.9 22.4C111 22 114.1 21.9 117.2 22C120.3 22.1 123.4 22.4 126.4 22.9C129.4 23.4 132.3 24.1 135.2 24.9C138.1 25.6 140.9 26.6 143.7 27.5C146.4 28.5 149.1 29.6 151.7 30.6C154.4 31.7 156.9 32.8 159.4 33.8C162 34.9 164.5 36 166.9 37.1C169.4 38.2 171.8 39.3 174.3 40.5C176.7 41.7 179.1 42.8 181.5 44.1C183.9 45.3 186.3 46.6 188.6 48.1C190.9 49.5 193.1 51 195.3 52.7C197.4 54.4 199.5 56.2 201.4 58.1C203.3 60 205.1 62.1 206.6 64.3C208.2 66.5 209.6 68.9 210.8 71.3C212 73.8 213 76.3 213.8 78.9C214.6 81.5 215.2 84.1 215.6 86.8C216.1 89.4 216.3 92.1 216.5 94.7C216.6 97.3 216.6 99.9 216.6 102.5C216.5 105 216.4 107.5 216.2 110C216.1 112.4 215.9 114.8 215.8 117.2C215.7 119.6 215.5 121.9 215.5 124.3Z"/><path class="eye" d="M98 104C98 106.8 97.9 110.1 97.6 112.3C97.4 114.5 97.1 115.8 96.6 117.3C96.1 118.8 95.5 120 94.8 121.2C94.1 122.3 93.3 123.2 92.4 124C91.4 124.8 90.4 125.4 89.1 125.9C87.8 126.4 86.7 126.7 84.8 126.9C82.8 127 79.2 127 77.2 126.9C75.3 126.7 74.2 126.4 72.9 125.9C71.6 125.4 70.6 124.8 69.6 124C68.7 123.2 67.9 122.3 67.2 121.2C66.5 120 65.9 118.8 65.4 117.3C64.9 115.8 64.6 114.5 64.4 112.3C64.1 110.1 64 106.8 64 104C64 101.2 64.1 97.9 64.4 95.7C64.6 93.5 64.9 92.2 65.4 90.7C65.9 89.2 66.5 88 67.2 86.8C67.9 85.7 68.7 84.8 69.6 84C70.6 83.2 71.6 82.6 72.9 82.1C74.2 81.6 75.3 81.3 77.2 81.1C79.2 81 82.8 81 84.8 81.1C86.7 81.3 87.8 81.6 89.1 82.1C90.4 82.6 91.4 83.2 92.4 84C93.3 84.8 94.1 85.7 94.8 86.8C95.5 88 96.1 89.2 96.6 90.7C97.1 92.2 97.4 93.5 97.6 95.7C97.9 97.9 98 101.2 98 104Z"/><path class="eye" d="M176 104C176 106.8 175.9 110.1 175.6 112.3C175.4 114.5 175.1 115.8 174.6 117.3C174.1 118.8 173.5 120 172.8 121.2C172.1 122.3 171.3 123.2 170.4 124C169.4 124.8 168.4 125.4 167.1 125.9C165.8 126.4 164.7 126.7 162.8 126.9C160.8 127 157.2 127 155.2 126.9C153.3 126.7 152.2 126.4 150.9 125.9C149.6 125.4 148.6 124.8 147.6 124C146.7 123.2 145.9 122.3 145.2 121.2C144.5 120 143.9 118.8 143.4 117.3C142.9 115.8 142.6 114.5 142.4 112.3C142.1 110.1 142 106.8 142 104C142 101.2 142.1 97.9 142.4 95.7C142.6 93.5 142.9 92.2 143.4 90.7C143.9 89.2 144.5 88 145.2 86.8C145.9 85.7 146.7 84.8 147.6 84C148.6 83.2 149.6 82.6 150.9 82.1C152.2 81.6 153.3 81.3 155.2 81.1C157.2 81 160.8 81 162.8 81.1C164.7 81.3 165.8 81.6 167.1 82.1C168.4 82.6 169.4 83.2 170.4 84C171.3 84.8 172.1 85.7 172.8 86.8C173.5 88 174.1 89.2 174.6 90.7C175.1 92.2 175.4 93.5 175.6 95.7C175.9 97.9 176 101.2 176 104Z"/></svg>`;

export function shell(lang: PageLanguage, title: string, body: string): string {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 12 212 220"><path d="M215.5 124.3C215.4 126.6 215.3 128.9 215.3 131.3C215.3 133.6 215.3 136 215.2 138.4C215.2 140.8 215.2 143.2 215 145.6C214.9 148.1 214.7 150.6 214.4 153.1C214.1 155.6 213.7 158.1 213.2 160.6C212.6 163.1 211.9 165.6 210.9 168C210 170.4 208.9 172.7 207.7 175C206.4 177.2 204.9 179.4 203.4 181.4C201.8 183.5 200 185.4 198.1 187.2C196.3 188.9 194.2 190.6 192.2 192.1C190.1 193.7 188 195.1 185.8 196.5C183.6 197.8 181.4 199.1 179.1 200.3C176.9 201.5 174.6 202.7 172.3 203.9C170.1 205 167.8 206.1 165.4 207.3C163.1 208.4 160.8 209.6 158.4 210.7C156 211.8 153.6 212.9 151 214C148.5 215.1 146 216.1 143.3 217.1C140.7 218 138 218.9 135.2 219.6C132.5 220.4 129.6 221 126.7 221.4C123.9 221.8 120.9 222 118 222C115.1 222 112.1 221.8 109.2 221.3C106.3 220.8 103.4 220.1 100.7 219.2C97.9 218.3 95.1 217.1 92.5 215.8C89.9 214.5 87.4 213 85 211.3C82.5 209.7 80.2 207.9 78 206C75.7 204.1 73.6 202.2 71.5 200.2C69.4 198.2 67.4 196.1 65.4 194C63.4 192 61.5 189.9 59.5 187.8C57.6 185.7 55.6 183.5 53.7 181.4C51.7 179.2 49.7 177 47.8 174.7C45.8 172.5 43.8 170.2 41.9 167.8C40 165.3 38.1 162.8 36.4 160.2C34.6 157.6 32.9 154.9 31.4 152.1C29.9 149.2 28.5 146.3 27.4 143.3C26.3 140.2 25.3 137.1 24.7 133.9C24 130.8 23.6 127.5 23.4 124.3C23.3 121 23.4 117.7 23.8 114.5C24.2 111.3 24.9 108.1 25.8 105C26.6 101.8 27.7 98.8 29 95.8C30.2 92.8 31.7 89.9 33.2 87.1C34.8 84.3 36.5 81.6 38.2 79C39.9 76.4 41.7 73.8 43.5 71.3C45.4 68.8 47.2 66.4 49.1 64C51 61.6 52.9 59.2 54.9 56.9C56.9 54.5 58.9 52.2 60.9 50C63 47.7 65.1 45.5 67.3 43.3C69.5 41.2 71.8 39.1 74.3 37.2C76.7 35.2 79.2 33.4 81.8 31.7C84.4 30.1 87.2 28.6 90 27.3C92.8 26 95.8 25 98.8 24.1C101.8 23.3 104.9 22.7 107.9 22.4C111 22 114.1 21.9 117.2 22C120.3 22.1 123.4 22.4 126.4 22.9C129.4 23.4 132.3 24.1 135.2 24.9C138.1 25.6 140.9 26.6 143.7 27.5C146.4 28.5 149.1 29.6 151.7 30.6C154.4 31.7 156.9 32.8 159.4 33.8C162 34.9 164.5 36 166.9 37.1C169.4 38.2 171.8 39.3 174.3 40.5C176.7 41.7 179.1 42.8 181.5 44.1C183.9 45.3 186.3 46.6 188.6 48.1C190.9 49.5 193.1 51 195.3 52.7C197.4 54.4 199.5 56.2 201.4 58.1C203.3 60 205.1 62.1 206.6 64.3C208.2 66.5 209.6 68.9 210.8 71.3C212 73.8 213 76.3 213.8 78.9C214.6 81.5 215.2 84.1 215.6 86.8C216.1 89.4 216.3 92.1 216.5 94.7C216.6 97.3 216.6 99.9 216.6 102.5C216.5 105 216.4 107.5 216.2 110C216.1 112.4 215.9 114.8 215.8 117.2C215.7 119.6 215.5 121.9 215.5 124.3Z"/><path fill="#fff" d="M98 104C98 106.8 97.9 110.1 97.6 112.3C97.4 114.5 97.1 115.8 96.6 117.3C96.1 118.8 95.5 120 94.8 121.2C94.1 122.3 93.3 123.2 92.4 124C91.4 124.8 90.4 125.4 89.1 125.9C87.8 126.4 86.7 126.7 84.8 126.9C82.8 127 79.2 127 77.2 126.9C75.3 126.7 74.2 126.4 72.9 125.9C71.6 125.4 70.6 124.8 69.6 124C68.7 123.2 67.9 122.3 67.2 121.2C66.5 120 65.9 118.8 65.4 117.3C64.9 115.8 64.6 114.5 64.4 112.3C64.1 110.1 64 106.8 64 104C64 101.2 64.1 97.9 64.4 95.7C64.6 93.5 64.9 92.2 65.4 90.7C65.9 89.2 66.5 88 67.2 86.8C67.9 85.7 68.7 84.8 69.6 84C70.6 83.2 71.6 82.6 72.9 82.1C74.2 81.6 75.3 81.3 77.2 81.1C79.2 81 82.8 81 84.8 81.1C86.7 81.3 87.8 81.6 89.1 82.1C90.4 82.6 91.4 83.2 92.4 84C93.3 84.8 94.1 85.7 94.8 86.8C95.5 88 96.1 89.2 96.6 90.7C97.1 92.2 97.4 93.5 97.6 95.7C97.9 97.9 98 101.2 98 104Z"/><path fill="#fff" d="M176 104C176 106.8 175.9 110.1 175.6 112.3C175.4 114.5 175.1 115.8 174.6 117.3C174.1 118.8 173.5 120 172.8 121.2C172.1 122.3 171.3 123.2 170.4 124C169.4 124.8 168.4 125.4 167.1 125.9C165.8 126.4 164.7 126.7 162.8 126.9C160.8 127 157.2 127 155.2 126.9C153.3 126.7 152.2 126.4 150.9 125.9C149.6 125.4 148.6 124.8 147.6 124C146.7 123.2 145.9 122.3 145.2 121.2C144.5 120 143.9 118.8 143.4 117.3C142.9 115.8 142.6 114.5 142.4 112.3C142.1 110.1 142 106.8 142 104C142 101.2 142.1 97.9 142.4 95.7C142.6 93.5 142.9 92.2 143.4 90.7C143.9 89.2 144.5 88 145.2 86.8C145.9 85.7 146.7 84.8 147.6 84C148.6 83.2 149.6 82.6 150.9 82.1C152.2 81.6 153.3 81.3 155.2 81.1C157.2 81 160.8 81 162.8 81.1C164.7 81.3 165.8 81.6 167.1 82.1C168.4 82.6 169.4 83.2 170.4 84C171.3 84.8 172.1 85.7 172.8 86.8C173.5 88 174.1 89.2 174.6 90.7C175.1 92.2 175.4 93.5 175.6 95.7C175.9 97.9 176 101.2 176 104Z"/></svg>`)}">
<style>${STYLE}</style>
</head>
<body><header class="brand">${MARK}sub-office</header><main>${body}</main></body>
</html>
`;
}

const INVITE_WORDS = {
  en: {
    title: "{from} invites you to their office",
    titleNobody: "You are invited to an office",
    what: "In this office, everyone's clone (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    how: "To join: open sub-office on your computer, open Office, paste this link where the relay goes, and join.",
    keep: "Anyone with this link can join this office; keep it within your team.",
  },
  ko: {
    title: "{from}님이 오피스에 초대했어요",
    titleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 클론(나처럼 일하는 AI)가 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
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
