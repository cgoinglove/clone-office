// The page someone without a mini-me opens from a link: who asks, what, and a box to answer. It is
// plain HTML from the relay itself, with no scripts and nothing from elsewhere, in the reader's
// language when the page is written in it (English otherwise), and everything a person wrote is
// escaped before it is shown. Node runs this file as it is, like the rest of the relay.

import type { AllInSync } from "../../i18n/sync.ts";
import {
  type Installers,
  installGuide,
  type Local,
  type Os,
} from "./install.ts";

const WORDS = {
  en: {
    title: "{asker} asks you",
    answer: "Your answer",
    send: "Send",
    sent: "Sent. {asker} has your answer:",
    closed: "This link is closed.",
    missing: "There is no such link.",
    tooManyTries:
      "Too many tries from here. Wait a few minutes, then open the link again.",
    inviteEndedTitle: "This invite has ended",
    inviteEnded:
      "It was used, cancelled, or a week has passed. Ask whoever invited you for a new link.",
    footer:
      "Sent by {asker}'s clone, with Clone Office. Your answer goes only to {asker}.",
  },
  ko: {
    title: "{asker} 님의 질문",
    answer: "답",
    send: "보내기",
    sent: "보냈어요. {asker} 님에게 이렇게 전했어요:",
    closed: "이미 끝난 링크예요.",
    missing: "없는 링크예요.",
    tooManyTries:
      "여기서 너무 여러 번 시도했어요. 몇 분 뒤 링크를 다시 열어 주세요.",
    inviteEndedTitle: "끝난 초대 링크예요",
    inviteEnded:
      "이미 쓰였거나, 취소됐거나, 일주일이 지났어요. 초대한 사람에게 새 링크를 받아 주세요.",
    footer:
      "{asker} 님의 클론이 Clone Office로 보낸 질문이에요. 답은 {asker} 님에게만 가요.",
  },
  zh: {
    title: "{asker}向你提问",
    answer: "你的回答",
    send: "发送",
    sent: "已发送。{asker}收到了你的回答：",
    closed: "这个链接已关闭。",
    missing: "没有这个链接。",
    tooManyTries: "这里的尝试次数太多。请等几分钟再打开链接。",
    inviteEndedTitle: "这个邀请已结束",
    inviteEnded:
      "它已被使用、已被取消，或者已经过了一周。请向邀请你的人要一个新链接。",
    footer: "由{asker}的分身通过 Clone Office 发送。你的回答只会发给{asker}。",
  },
  ja: {
    title: "{asker}さんからの質問",
    answer: "あなたの回答",
    send: "送信",
    sent: "送信しました。{asker}さんに届いた回答：",
    closed: "このリンクはすでに終了しています。",
    missing: "このリンクは存在しません。",
    tooManyTries:
      "ここからの試行が多すぎます。数分待ってから、もう一度リンクを開いてください。",
    inviteEndedTitle: "この招待は終了しています",
    inviteEnded:
      "使用済みか、取り消されたか、1週間が過ぎました。招待した人に新しいリンクをもらってください。",
    footer:
      "{asker}さんのクローンがClone Officeで送った質問です。回答は{asker}さんにだけ届きます。",
  },
  es: {
    title: "{asker} te pregunta",
    answer: "Tu respuesta",
    send: "Enviar",
    sent: "Enviado. {asker} ya tiene tu respuesta:",
    closed: "Este enlace está cerrado.",
    missing: "Este enlace no existe.",
    tooManyTries:
      "Demasiados intentos desde aquí. Espera unos minutos y vuelve a abrir el enlace.",
    inviteEndedTitle: "Esta invitación terminó",
    inviteEnded:
      "Ya se usó, se canceló o pasó una semana. Pide un enlace nuevo a quien te invitó.",
    footer:
      "Enviado por el clon de {asker}, con Clone Office. Tu respuesta solo le llega a {asker}.",
  },
  pt: {
    title: "{asker} pergunta a você",
    answer: "Sua resposta",
    send: "Enviar",
    sent: "Enviado. {asker} recebeu sua resposta:",
    closed: "Este link já foi encerrado.",
    missing: "Este link não existe.",
    tooManyTries:
      "Tentativas demais daqui. Espere alguns minutos e abra o link de novo.",
    inviteEndedTitle: "Este convite terminou",
    inviteEnded:
      "Ele já foi usado, foi cancelado ou passou uma semana. Peça um link novo a quem convidou você.",
    footer:
      "Enviado pelo clone de {asker}, com o Clone Office. Sua resposta vai só para {asker}.",
  },
};

export type PageLanguage = keyof typeof WORDS;

// Each language says everything English says, and nothing more: a type error names what is not.
const _wordsInStep: AllInSync<typeof WORDS> = WORDS;

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
:root { --bg: #ffffff; --fg: #0d0d0d; --muted: #62656b; --line: rgba(13,13,13,.12); --field: #8a8d93; --soft: rgba(13,13,13,.06); --brand: #0169cc; --brand-fill: #0169cc; --brand-soft: rgba(1,105,204,.1); --on: #0169cc; --danger: #dc2626; --error: #c43d18; --waiting: #ea580c; --waiting-ink: #9a3412; --g-bg: #ffffff; --g-line: #747775; --g-fg: #1f1f1f; color-scheme: light; }
@media (prefers-color-scheme: dark) { :root { --bg: #0e0f11; --fg: #f1f2f4; --muted: #a2a5ac; --line: rgba(255,255,255,.14); --field: #6b6f76; --soft: rgba(255,255,255,.08); --brand: #0a84ff; --brand-fill: #0060df; --brand-soft: rgba(10,132,255,.16); --on: #6cb4ff; --danger: #b91c1c; --error: #ff7a55; --waiting: #fb923c; --waiting-ink: #fdba74; --g-bg: #131314; --g-line: #8e918f; --g-fg: #e3e3e3; color-scheme: dark; } }
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
:lang(ko) body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", system-ui, sans-serif; }
:lang(ja) body { font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, system-ui, sans-serif; }
:lang(zh) body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif; }
main { max-width: 34rem; margin: 0 auto; padding: 2.5rem 1rem; display: flex; flex-direction: column; gap: 1.25rem; }
h1 { font-size: 1.25rem; margin: 0; text-wrap: balance; }
.request { white-space: pre-wrap; background: var(--soft); border-radius: 14px; padding: .8rem 1rem; margin: 0; }
label { display: block; font-weight: 600; margin-bottom: .5rem; }
textarea { width: 100%; min-height: 8rem; font: inherit; color: inherit; background: transparent; border: 1px solid var(--field); border-radius: 10px; padding: .75rem; }
button { font: inherit; font-weight: 600; color: #fff; background: var(--brand-fill); border: 0; border-radius: 999px; padding: .6rem 1.2rem; margin-top: .75rem; cursor: pointer; }
/* the one thing a page asks for is round; the quieter buttons are the controls' rounded rectangle, unless beside it */
button.quiet, button.ghost, .inline button { border-radius: 10px; }
:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
input { width: 100%; font: inherit; color: inherit; background: transparent; border: 1px solid var(--field); border-radius: 10px; padding: .6rem .75rem; margin-bottom: .75rem; }
input[aria-invalid="true"] { border-color: var(--error); }
form label { margin-bottom: .25rem; }
pre { white-space: pre-wrap; word-break: break-all; user-select: all; -webkit-user-select: all; font: .9rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; border: 1px solid var(--line); border-radius: 10px; padding: .75rem; margin: 0; }
section { display: flex; flex-direction: column; gap: .5rem; }
h2 { font-size: 1.05rem; margin: 0; }
a { color: var(--brand); }
.error { color: var(--error); }
.quiet { background: var(--soft); color: var(--fg); }
.ghost { background: transparent; color: var(--fg); }
.quiet:hover, .ghost:hover { background: color-mix(in srgb, var(--fg) 10%, transparent); }
.note, footer { color: var(--muted); }
footer { font-size: .85rem; border-top: 1px solid var(--line); padding-top: 1rem; }
/* the pages before signing in share the signed-in pages' white row (10-19 redesign): the app's mark and name */
.brand { display: flex; align-items: center; gap: .55rem; min-height: 3.5rem; margin: 0; padding: 0 max(1rem, calc((100% - 60.5rem) / 2)); box-shadow: inset 0 -1px 0 var(--line); font-weight: 650; font-size: .95rem; letter-spacing: -.01em; }
.mark { width: 1.5rem; height: 1.5rem; color: var(--fg); }
.mark .eye { fill: var(--bg); }
/* a short list's rows are split by space, never by lines between them */
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; }
.rows > li { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; }
.rows .who { flex: 1 1 12rem; min-width: 0; }
.rows .who b { font-weight: 600; }
.rows .who small { display: block; color: var(--muted); font-size: .85rem; overflow-wrap: anywhere; }
.tag { font-size: .75rem; color: var(--muted); border: 1px solid var(--line); border-radius: 6px; padding: .05rem .4rem; margin-left: .35rem; }
.acts { display: flex; gap: .4rem; align-items: center; }
.acts form { margin: 0; }
.acts button, button.small { margin: 0; padding: .3rem .7rem; font-size: .85rem; border-radius: 8px; }
.acts > button:not(.quiet):not(.ghost):not(.small) { border-radius: 999px; }
.acts a.small { display: inline-flex; align-items: center; min-height: 2rem; padding: 0 .4rem; }
.links { display: flex; flex-wrap: wrap; align-items: center; gap: 0 .25rem; }
.links a { display: inline-flex; align-items: center; min-height: 2.75rem; padding: 0 .25rem; }
.acts a.button { padding: .3rem .7rem; font-size: .85rem; border-radius: 8px; }
details > summary { cursor: pointer; color: var(--muted); font-size: .85rem; list-style: none; }
details:not(.account) > summary { display: inline-flex; align-items: center; min-height: 2rem; }
details > summary::-webkit-details-marker { display: none; }
details[open] > summary { margin-bottom: .4rem; }
/* every fold says it opens: a small chevron after its words, turning down once open */
details:not(.account) > summary::after { content: ""; display: inline-block; width: .38rem; height: .38rem; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); margin-left: .5rem; vertical-align: .12em; transition: transform .15s; }
details:not(.account)[open] > summary::after { transform: rotate(45deg); }

.inline { display: flex; gap: .5rem; align-items: flex-start; }
.inline input { margin: 0; flex: 1; }
:lang(ko) { word-break: keep-all; overflow-wrap: anywhere; }
.guide { gap: .9rem; }
.guide p { margin: 0; }
.chips { display: flex; flex-wrap: wrap; gap: .4rem; }
.chips span { font-size: .85rem; background: var(--soft); border-radius: 999px; padding: .15rem .7rem; }
/* the three kinds of computer as tabs, with no script: a radio each, the one this page was opened on picked */
.computers { display: flex; flex-direction: column; gap: 1.25rem; }
.computers > input { position: absolute; opacity: 0; pointer-events: none; }
.tabs { display: inline-flex; align-self: flex-start; gap: .25rem; background: var(--soft); border-radius: 10px; padding: .25rem; }
.tabs label { margin: 0; cursor: pointer; font-size: .9rem; color: var(--muted); padding: .3rem .9rem; border-radius: 8px; }
.pick-mac:checked ~ .tabs [for="computer-mac"], .pick-windows:checked ~ .tabs [for="computer-windows"], .pick-linux:checked ~ .tabs [for="computer-linux"] { background: var(--bg); color: var(--fg); box-shadow: 0 0 0 1px var(--line); }
.pick-mac:focus-visible ~ .tabs [for="computer-mac"], .pick-windows:focus-visible ~ .tabs [for="computer-windows"], .pick-linux:focus-visible ~ .tabs [for="computer-linux"] { outline: 2px solid var(--brand); outline-offset: 2px; }
.computers > ol.steps { display: none; }
.pick-mac:checked ~ .on-mac, .pick-windows:checked ~ .on-windows, .pick-linux:checked ~ .on-linux { display: flex; }
/* the steps on a numbered rail */
ol.steps { list-style: none; counter-reset: step; margin: 0; padding: 0; display: flex; flex-direction: column; }
ol.steps > li { counter-increment: step; position: relative; padding: 0 0 1.6rem 2.6rem; display: flex; flex-direction: column; align-items: flex-start; gap: .5rem; min-width: 0; }
ol.steps > li:last-child { padding-bottom: 0; }
ol.steps > li::before { content: counter(step); position: absolute; left: 0; top: 0; width: 1.75rem; height: 1.75rem; border-radius: 999px; background: var(--fg); color: var(--bg); font-weight: 600; font-size: .85rem; display: grid; place-items: center; }
ol.steps > li:not(:last-child)::after { content: ""; position: absolute; left: calc(.875rem - 1px); top: 2.1rem; bottom: .35rem; width: 2px; border-radius: 2px; background: var(--line); }
ol.steps > li > b { line-height: 1.75rem; }
ol.steps > li > .term, ol.steps > li > .seen { align-self: stretch; }
ol.steps small { color: var(--muted); font-size: .85rem; }
ol.steps a.button small { color: inherit; font-size: .8rem; font-weight: 500; opacity: .85; margin-left: .25rem; }
kbd { font-family: inherit; font-weight: 600; font-size: .82rem; line-height: 1.4; color: var(--fg); background: var(--bg); border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 6px; padding: .05rem .45rem; }
code { font: .85em ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft); border-radius: 6px; padding: .05rem .35rem; overflow-wrap: anywhere; }
.keys { line-height: 2; }
/* a line to copy, drawn as a terminal draws it: dark in both themes */
.term { background: #16181c; color: #e8eaed; border-radius: 14px; overflow: hidden; }
.term-bar { display: flex; align-items: center; justify-content: space-between; gap: .5rem; min-height: 2.2rem; padding: .35rem .45rem .35rem .85rem; }
.dots { display: flex; gap: .35rem; }
.dots i { display: block; width: .55rem; height: .55rem; border-radius: 50%; background: rgba(255,255,255,.2); }
.term pre { border: 0; border-radius: 0; padding: 0 .9rem .9rem; color: inherit; }
button.copy { margin: 0; font-size: .8rem; color: #e8eaed; background: rgba(255,255,255,.12); border-radius: 8px; padding: .3rem .75rem; }
button.copy:hover { background: rgba(255,255,255,.2); }
button.copy[data-done] { color: #7fd3a0; }
/* what the terminal shows once it worked */
.seen { display: flex; flex-direction: column; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.seen span { font-size: .8rem; font-weight: 600; color: var(--muted); padding: .5rem .9rem 0; }
.seen pre { border: 0; color: var(--muted); font-size: .8rem; padding: .3rem .9rem .8rem; user-select: text; -webkit-user-select: text; }
.seen pre b { color: var(--fg); font-weight: 600; }
.keep { display: flex; align-items: flex-start; gap: .75rem; border: 1px solid var(--line); border-radius: 14px; padding: .85rem 1rem; }
.keep svg { flex: none; width: 1.2rem; height: 1.2rem; margin-top: .2rem; }
.keep div { display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.keep .note { font-size: .9rem; }
/* the folds under the steps: rows that open, a hairline above each as at a pane's edge */
.folds { display: flex; flex-direction: column; }
details.fold { border-top: 1px solid var(--line); padding: .35rem 0; }
details.fold:last-child { border-bottom: 1px solid var(--line); }
details.fold > summary { display: flex; justify-content: space-between; color: var(--fg); font-size: .95rem; font-weight: 600; min-height: 2.5rem; }
details.fold[open] { padding-bottom: .9rem; }
details.fold > .note { margin-bottom: .6rem; }
.trouble { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1rem; font-size: .92rem; }
.trouble li { display: flex; flex-direction: column; gap: .3rem; }
.said { display: flex; flex-wrap: wrap; gap: .3rem; }
.said code { font-size: .78rem; }
a.button { display: inline-block; color: #fff; background: var(--brand-fill); text-decoration: none; font-weight: 600; border-radius: 999px; padding: .45rem 1rem; }
.inline button { margin: 0; }
.small { font-size: .85rem; }
a.google { display: flex; align-items: center; justify-content: center; gap: .6rem; font-weight: 600; color: var(--g-fg); text-decoration: none; background: var(--g-bg); border: 1px solid var(--g-line); border-radius: 10px; padding: .6rem 1rem; }
a.google:hover { background: color-mix(in srgb, var(--g-fg) 8%, var(--g-bg)); }
a.google svg { width: 1.15rem; height: 1.15rem; flex: none; }
.or { display: flex; align-items: center; gap: .75rem; color: var(--muted); font-size: .85rem; margin: 0; }
.or::before, .or::after { content: ""; flex: 1; border-top: 1px solid var(--line); }
.method { border: 1px solid var(--line); border-radius: 14px; padding: 1rem; }
.method p, .method form { margin: 0; }
.method .top { display: flex; align-items: center; justify-content: space-between; gap: .75rem; }
.state { font-size: .8rem; font-weight: 600; color: var(--muted); background: var(--soft); border-radius: 999px; padding: .1rem .6rem; white-space: nowrap; }
.state.on { color: var(--on); background: var(--brand-soft); }
.done { margin: 0; font-weight: 600; }
a.button.quiet { color: var(--fg); background: var(--soft); border-radius: 10px; }
.acts:has(> button:not(.quiet):not(.ghost), > a.button:not(.quiet):not(.ghost)) > a.button { border-radius: 999px; }
a.button.ghost { color: var(--fg); background: transparent; }
.danger { background: var(--danger); }
/* the two ways in stand alike: Google's button and the form's, the whole width */
form.auth button { width: 100%; }
/* the account under an invite's guide: a row that opens, not a footnote */
details.account > summary { display: flex; align-items: center; justify-content: space-between; gap: .75rem; color: var(--fg); font-size: 1rem; font-weight: 600; border: 1px solid var(--line); border-radius: 12px; padding: .75rem 1rem; }
details.account > summary::after { content: ""; width: .5rem; height: .5rem; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); flex: none; transition: transform .15s; }
details.account[open] > summary::after { transform: rotate(45deg); }
details.account[open] > summary { margin-bottom: .75rem; }
.ways { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .5rem; }
.ways > li { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .75rem; }
.ways .who { flex: 1 1 12rem; min-width: 0; }
.ways .who small { display: block; color: var(--muted); font-size: .85rem; }
.field-error { color: var(--error); font-size: .9rem; margin: -.4rem 0 .75rem; }
select { width: 100%; font: inherit; color: inherit; background: var(--bg); border: 1px solid var(--field); border-radius: 10px; padding: .6rem .75rem; margin-bottom: .75rem; }
/* a request and its answer, each the whole row */
.rows.requests > li { flex-direction: column; align-items: stretch; gap: .5rem; }
.rows.requests .who { flex: none; }
.rows.requests form { display: flex; flex-direction: column; }
.rows.requests form button { align-self: flex-start; }
/* something about one's account that waits on them: a reset link they may not have asked for (ember, as the app marks what waits) */
.alert { display: flex; flex-direction: column; align-items: flex-start; gap: .6rem; margin: 0; border: 1px solid var(--waiting); border-radius: 14px; padding: .9rem 1rem; }
.alert p { margin: 0; }
button:disabled { opacity: .5; cursor: not-allowed; }
/* signing in: one narrow card, the mark over its title */
main.auth { max-width: 25rem; padding-top: 4rem; }
main.auth h1 { text-align: center; font-size: 1.5rem; }
main.auth > .note { text-align: center; word-break: keep-all; text-wrap: balance; }
.auth-mark { display: flex; justify-content: center; }
.auth-mark .mark { width: 2.5rem; height: 2.5rem; color: var(--fg); }
.auth-mark .mark .eye { fill: var(--bg); }
/* a question by link: the card, who asks over it */
.reply { border: 1px solid var(--line); border-radius: 16px; padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
.reply h1 { font-size: 1rem; font-weight: 650; }
.reply form { margin: 0; }
.reply form button { margin-top: .75rem; }
.asker { display: flex; align-items: center; gap: .65rem; margin: 0; }
.asker .avatar { width: 2.25rem; height: 2.25rem; display: grid; place-items: center; flex: none; }
.asker .mark { width: 2rem; height: 2rem; color: var(--fg); }
.asker .mark .eye { fill: var(--bg); }
.ask-text { margin: 0; font-size: 1.2rem; font-weight: 650; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; letter-spacing: -.01em; }
`;

/** The app's mark (app/icon.svg): your own clone at rest, in the page's ink. */
export const MARK = `<svg class="mark" viewBox="14 12 212 220" aria-hidden="true"><path fill="currentColor" d="M215.5 124.3C215.4 126.6 215.3 128.9 215.3 131.3C215.3 133.6 215.3 136 215.2 138.4C215.2 140.8 215.2 143.2 215 145.6C214.9 148.1 214.7 150.6 214.4 153.1C214.1 155.6 213.7 158.1 213.2 160.6C212.6 163.1 211.9 165.6 210.9 168C210 170.4 208.9 172.7 207.7 175C206.4 177.2 204.9 179.4 203.4 181.4C201.8 183.5 200 185.4 198.1 187.2C196.3 188.9 194.2 190.6 192.2 192.1C190.1 193.7 188 195.1 185.8 196.5C183.6 197.8 181.4 199.1 179.1 200.3C176.9 201.5 174.6 202.7 172.3 203.9C170.1 205 167.8 206.1 165.4 207.3C163.1 208.4 160.8 209.6 158.4 210.7C156 211.8 153.6 212.9 151 214C148.5 215.1 146 216.1 143.3 217.1C140.7 218 138 218.9 135.2 219.6C132.5 220.4 129.6 221 126.7 221.4C123.9 221.8 120.9 222 118 222C115.1 222 112.1 221.8 109.2 221.3C106.3 220.8 103.4 220.1 100.7 219.2C97.9 218.3 95.1 217.1 92.5 215.8C89.9 214.5 87.4 213 85 211.3C82.5 209.7 80.2 207.9 78 206C75.7 204.1 73.6 202.2 71.5 200.2C69.4 198.2 67.4 196.1 65.4 194C63.4 192 61.5 189.9 59.5 187.8C57.6 185.7 55.6 183.5 53.7 181.4C51.7 179.2 49.7 177 47.8 174.7C45.8 172.5 43.8 170.2 41.9 167.8C40 165.3 38.1 162.8 36.4 160.2C34.6 157.6 32.9 154.9 31.4 152.1C29.9 149.2 28.5 146.3 27.4 143.3C26.3 140.2 25.3 137.1 24.7 133.9C24 130.8 23.6 127.5 23.4 124.3C23.3 121 23.4 117.7 23.8 114.5C24.2 111.3 24.9 108.1 25.8 105C26.6 101.8 27.7 98.8 29 95.8C30.2 92.8 31.7 89.9 33.2 87.1C34.8 84.3 36.5 81.6 38.2 79C39.9 76.4 41.7 73.8 43.5 71.3C45.4 68.8 47.2 66.4 49.1 64C51 61.6 52.9 59.2 54.9 56.9C56.9 54.5 58.9 52.2 60.9 50C63 47.7 65.1 45.5 67.3 43.3C69.5 41.2 71.8 39.1 74.3 37.2C76.7 35.2 79.2 33.4 81.8 31.7C84.4 30.1 87.2 28.6 90 27.3C92.8 26 95.8 25 98.8 24.1C101.8 23.3 104.9 22.7 107.9 22.4C111 22 114.1 21.9 117.2 22C120.3 22.1 123.4 22.4 126.4 22.9C129.4 23.4 132.3 24.1 135.2 24.9C138.1 25.6 140.9 26.6 143.7 27.5C146.4 28.5 149.1 29.6 151.7 30.6C154.4 31.7 156.9 32.8 159.4 33.8C162 34.9 164.5 36 166.9 37.1C169.4 38.2 171.8 39.3 174.3 40.5C176.7 41.7 179.1 42.8 181.5 44.1C183.9 45.3 186.3 46.6 188.6 48.1C190.9 49.5 193.1 51 195.3 52.7C197.4 54.4 199.5 56.2 201.4 58.1C203.3 60 205.1 62.1 206.6 64.3C208.2 66.5 209.6 68.9 210.8 71.3C212 73.8 213 76.3 213.8 78.9C214.6 81.5 215.2 84.1 215.6 86.8C216.1 89.4 216.3 92.1 216.5 94.7C216.6 97.3 216.6 99.9 216.6 102.5C216.5 105 216.4 107.5 216.2 110C216.1 112.4 215.9 114.8 215.8 117.2C215.7 119.6 215.5 121.9 215.5 124.3Z"/><path class="eye" d="M98 104C98 106.8 97.9 110.1 97.6 112.3C97.4 114.5 97.1 115.8 96.6 117.3C96.1 118.8 95.5 120 94.8 121.2C94.1 122.3 93.3 123.2 92.4 124C91.4 124.8 90.4 125.4 89.1 125.9C87.8 126.4 86.7 126.7 84.8 126.9C82.8 127 79.2 127 77.2 126.9C75.3 126.7 74.2 126.4 72.9 125.9C71.6 125.4 70.6 124.8 69.6 124C68.7 123.2 67.9 122.3 67.2 121.2C66.5 120 65.9 118.8 65.4 117.3C64.9 115.8 64.6 114.5 64.4 112.3C64.1 110.1 64 106.8 64 104C64 101.2 64.1 97.9 64.4 95.7C64.6 93.5 64.9 92.2 65.4 90.7C65.9 89.2 66.5 88 67.2 86.8C67.9 85.7 68.7 84.8 69.6 84C70.6 83.2 71.6 82.6 72.9 82.1C74.2 81.6 75.3 81.3 77.2 81.1C79.2 81 82.8 81 84.8 81.1C86.7 81.3 87.8 81.6 89.1 82.1C90.4 82.6 91.4 83.2 92.4 84C93.3 84.8 94.1 85.7 94.8 86.8C95.5 88 96.1 89.2 96.6 90.7C97.1 92.2 97.4 93.5 97.6 95.7C97.9 97.9 98 101.2 98 104Z"/><path class="eye" d="M176 104C176 106.8 175.9 110.1 175.6 112.3C175.4 114.5 175.1 115.8 174.6 117.3C174.1 118.8 173.5 120 172.8 121.2C172.1 122.3 171.3 123.2 170.4 124C169.4 124.8 168.4 125.4 167.1 125.9C165.8 126.4 164.7 126.7 162.8 126.9C160.8 127 157.2 127 155.2 126.9C153.3 126.7 152.2 126.4 150.9 125.9C149.6 125.4 148.6 124.8 147.6 124C146.7 123.2 145.9 122.3 145.2 121.2C144.5 120 143.9 118.8 143.4 117.3C142.9 115.8 142.6 114.5 142.4 112.3C142.1 110.1 142 106.8 142 104C142 101.2 142.1 97.9 142.4 95.7C142.6 93.5 142.9 92.2 143.4 90.7C143.9 89.2 144.5 88 145.2 86.8C145.9 85.7 146.7 84.8 147.6 84C148.6 83.2 149.6 82.6 150.9 82.1C152.2 81.6 153.3 81.3 155.2 81.1C157.2 81 160.8 81 162.8 81.1C164.7 81.3 165.8 81.6 167.1 82.1C168.4 82.6 169.4 83.2 170.4 84C171.3 84.8 172.1 85.7 172.8 86.8C173.5 88 174.1 89.2 174.6 90.7C175.1 92.2 175.4 93.5 175.6 95.7C175.9 97.9 176 101.2 176 104Z"/></svg>`;

/**
 * A page of the relay. `title` and `preview` come escaped. `preview`, when there is one, is what a
 * messenger shows under a pasted link (Open Graph): never anything the link's own words do not say
 * openly, since whoever the link is pasted to sees it.
 */
/**
 * The signed-in pages' own top in place of the plain one (people-pages.ts `homeBand`), what they add
 * to the style, and their scripts, served by this server itself (handler.ts `HOME_HEADERS`).
 */
export interface ShellParts {
  band?: string;
  style?: string;
  scripts?: string[];
  /** A class for <main>: a page laid out its own way (the conversation with one's clone). */
  main?: string;
}

export function shell(
  lang: PageLanguage,
  title: string,
  body: string,
  preview?: string,
  parts: ShellParts = {},
): string {
  const quoted = (text: string) => text.replaceAll('"', "&quot;");
  const card = preview
    ? `<meta name="description" content="${quoted(preview)}">
<meta property="og:site_name" content="Clone Office">
<meta property="og:title" content="${quoted(title)}">
<meta property="og:description" content="${quoted(preview)}">
`
    : "";
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${card}<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="14 12 212 220"><path d="M215.5 124.3C215.4 126.6 215.3 128.9 215.3 131.3C215.3 133.6 215.3 136 215.2 138.4C215.2 140.8 215.2 143.2 215 145.6C214.9 148.1 214.7 150.6 214.4 153.1C214.1 155.6 213.7 158.1 213.2 160.6C212.6 163.1 211.9 165.6 210.9 168C210 170.4 208.9 172.7 207.7 175C206.4 177.2 204.9 179.4 203.4 181.4C201.8 183.5 200 185.4 198.1 187.2C196.3 188.9 194.2 190.6 192.2 192.1C190.1 193.7 188 195.1 185.8 196.5C183.6 197.8 181.4 199.1 179.1 200.3C176.9 201.5 174.6 202.7 172.3 203.9C170.1 205 167.8 206.1 165.4 207.3C163.1 208.4 160.8 209.6 158.4 210.7C156 211.8 153.6 212.9 151 214C148.5 215.1 146 216.1 143.3 217.1C140.7 218 138 218.9 135.2 219.6C132.5 220.4 129.6 221 126.7 221.4C123.9 221.8 120.9 222 118 222C115.1 222 112.1 221.8 109.2 221.3C106.3 220.8 103.4 220.1 100.7 219.2C97.9 218.3 95.1 217.1 92.5 215.8C89.9 214.5 87.4 213 85 211.3C82.5 209.7 80.2 207.9 78 206C75.7 204.1 73.6 202.2 71.5 200.2C69.4 198.2 67.4 196.1 65.4 194C63.4 192 61.5 189.9 59.5 187.8C57.6 185.7 55.6 183.5 53.7 181.4C51.7 179.2 49.7 177 47.8 174.7C45.8 172.5 43.8 170.2 41.9 167.8C40 165.3 38.1 162.8 36.4 160.2C34.6 157.6 32.9 154.9 31.4 152.1C29.9 149.2 28.5 146.3 27.4 143.3C26.3 140.2 25.3 137.1 24.7 133.9C24 130.8 23.6 127.5 23.4 124.3C23.3 121 23.4 117.7 23.8 114.5C24.2 111.3 24.9 108.1 25.8 105C26.6 101.8 27.7 98.8 29 95.8C30.2 92.8 31.7 89.9 33.2 87.1C34.8 84.3 36.5 81.6 38.2 79C39.9 76.4 41.7 73.8 43.5 71.3C45.4 68.8 47.2 66.4 49.1 64C51 61.6 52.9 59.2 54.9 56.9C56.9 54.5 58.9 52.2 60.9 50C63 47.7 65.1 45.5 67.3 43.3C69.5 41.2 71.8 39.1 74.3 37.2C76.7 35.2 79.2 33.4 81.8 31.7C84.4 30.1 87.2 28.6 90 27.3C92.8 26 95.8 25 98.8 24.1C101.8 23.3 104.9 22.7 107.9 22.4C111 22 114.1 21.9 117.2 22C120.3 22.1 123.4 22.4 126.4 22.9C129.4 23.4 132.3 24.1 135.2 24.9C138.1 25.6 140.9 26.6 143.7 27.5C146.4 28.5 149.1 29.6 151.7 30.6C154.4 31.7 156.9 32.8 159.4 33.8C162 34.9 164.5 36 166.9 37.1C169.4 38.2 171.8 39.3 174.3 40.5C176.7 41.7 179.1 42.8 181.5 44.1C183.9 45.3 186.3 46.6 188.6 48.1C190.9 49.5 193.1 51 195.3 52.7C197.4 54.4 199.5 56.2 201.4 58.1C203.3 60 205.1 62.1 206.6 64.3C208.2 66.5 209.6 68.9 210.8 71.3C212 73.8 213 76.3 213.8 78.9C214.6 81.5 215.2 84.1 215.6 86.8C216.1 89.4 216.3 92.1 216.5 94.7C216.6 97.3 216.6 99.9 216.6 102.5C216.5 105 216.4 107.5 216.2 110C216.1 112.4 215.9 114.8 215.8 117.2C215.7 119.6 215.5 121.9 215.5 124.3Z"/><path fill="#fff" d="M98 104C98 106.8 97.9 110.1 97.6 112.3C97.4 114.5 97.1 115.8 96.6 117.3C96.1 118.8 95.5 120 94.8 121.2C94.1 122.3 93.3 123.2 92.4 124C91.4 124.8 90.4 125.4 89.1 125.9C87.8 126.4 86.7 126.7 84.8 126.9C82.8 127 79.2 127 77.2 126.9C75.3 126.7 74.2 126.4 72.9 125.9C71.6 125.4 70.6 124.8 69.6 124C68.7 123.2 67.9 122.3 67.2 121.2C66.5 120 65.9 118.8 65.4 117.3C64.9 115.8 64.6 114.5 64.4 112.3C64.1 110.1 64 106.8 64 104C64 101.2 64.1 97.9 64.4 95.7C64.6 93.5 64.9 92.2 65.4 90.7C65.9 89.2 66.5 88 67.2 86.8C67.9 85.7 68.7 84.8 69.6 84C70.6 83.2 71.6 82.6 72.9 82.1C74.2 81.6 75.3 81.3 77.2 81.1C79.2 81 82.8 81 84.8 81.1C86.7 81.3 87.8 81.6 89.1 82.1C90.4 82.6 91.4 83.2 92.4 84C93.3 84.8 94.1 85.7 94.8 86.8C95.5 88 96.1 89.2 96.6 90.7C97.1 92.2 97.4 93.5 97.6 95.7C97.9 97.9 98 101.2 98 104Z"/><path fill="#fff" d="M176 104C176 106.8 175.9 110.1 175.6 112.3C175.4 114.5 175.1 115.8 174.6 117.3C174.1 118.8 173.5 120 172.8 121.2C172.1 122.3 171.3 123.2 170.4 124C169.4 124.8 168.4 125.4 167.1 125.9C165.8 126.4 164.7 126.7 162.8 126.9C160.8 127 157.2 127 155.2 126.9C153.3 126.7 152.2 126.4 150.9 125.9C149.6 125.4 148.6 124.8 147.6 124C146.7 123.2 145.9 122.3 145.2 121.2C144.5 120 143.9 118.8 143.4 117.3C142.9 115.8 142.6 114.5 142.4 112.3C142.1 110.1 142 106.8 142 104C142 101.2 142.1 97.9 142.4 95.7C142.6 93.5 142.9 92.2 143.4 90.7C143.9 89.2 144.5 88 145.2 86.8C145.9 85.7 146.7 84.8 147.6 84C148.6 83.2 149.6 82.6 150.9 82.1C152.2 81.6 153.3 81.3 155.2 81.1C157.2 81 160.8 81 162.8 81.1C164.7 81.3 165.8 81.6 167.1 82.1C168.4 82.6 169.4 83.2 170.4 84C171.3 84.8 172.1 85.7 172.8 86.8C173.5 88 174.1 89.2 174.6 90.7C175.1 92.2 175.4 93.5 175.6 95.7C175.9 97.9 176 101.2 176 104Z"/></svg>`)}">
<style>${STYLE}${parts.style ?? ""}</style>
${(parts.scripts ?? []).map((src) => `<script type="module" src="${quoted(src)}"></script>\n`).join("")}</head>
<body>${parts.band ?? `<header class="brand">${MARK}Clone Office</header>`}<main${parts.main ? ` class="${quoted(parts.main)}"` : ""}>${body}</main></body>
</html>
`;
}

const INVITE_WORDS = {
  en: {
    title: "{from} invites you to their office",
    titleNobody: "You are invited to an office",
    what: "In this office, everyone's clone (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    keep: "Anyone with this link can join this office; keep it within your team.",
  },
  ko: {
    title: "{from} 님이 오피스에 초대했어요",
    titleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 클론(나처럼 일하는 AI)이 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
    keep: "이 링크가 있으면 누구나 이 오피스에 들어올 수 있어요. 팀 안에서만 나눠 주세요.",
  },
  zh: {
    title: "{from}邀请你加入他们的办公室",
    titleNobody: "你收到了一个办公室的邀请",
    what: "在这个办公室里，每个人的分身（一个像本人一样工作的 AI）会接收并回答团队的请求，只把该本人决定的事交给本人。",
    keep: "拿到这个链接的任何人都能加入这个办公室，请只在团队内分享。",
  },
  ja: {
    title: "{from}さんからオフィスへの招待が届いています",
    titleNobody: "オフィスに招待されています",
    what: "このオフィスでは、一人ひとりのクローン（本人のように働くAI）がチームの依頼を受けて答え、本人が決めるべきことだけを本人に届けます。",
    keep: "このリンクがあれば誰でもこのオフィスに参加できます。チームの中だけで共有してください。",
  },
  es: {
    title: "{from} te invita a su oficina",
    titleNobody: "Te invitaron a una oficina",
    what: "En esta oficina, el clon de cada persona (una IA que trabaja como ella) recibe y responde las solicitudes del equipo, y a cada persona solo le trae las decisiones que le tocan.",
    keep: "Cualquiera con este enlace puede unirse a esta oficina; compártelo solo dentro de tu equipo.",
  },
  pt: {
    title: "{from} convida você para o escritório",
    titleNobody: "Você recebeu um convite para um escritório",
    what: "Neste escritório, o clone de cada pessoa (uma IA que trabalha como ela) recebe e responde os pedidos da equipe, e traz a cada pessoa só as decisões que são dela.",
    keep: "Qualquer pessoa com este link pode entrar neste escritório; compartilhe só com a sua equipe.",
  },
};
const _inviteInStep: AllInSync<typeof INVITE_WORDS> &
  Record<PageLanguage, unknown> = INVITE_WORDS;

/** What an invite's page says first: who invites, and what an office is. */
export function inviteHead(lang: PageLanguage, from?: string) {
  const words = INVITE_WORDS[lang];
  const title = escape(
    from ? words.title.replaceAll("{from}", from) : words.titleNobody,
  );
  return {
    title,
    what: escape(words.what),
    keep: escape(words.keep),
  };
}

/** The page an office invite opens: who invites, what an office is, and how to set up and join. */
export function invitePage(input: {
  lang: PageLanguage;
  from?: string;
  link: string;
  os: Os;
  command: string;
  local?: Local;
  installers?: Installers;
}): string {
  const head = inviteHead(input.lang, input.from);
  return shell(
    input.lang,
    head.title,
    `<h1>${head.title}</h1>
<p>${head.what}</p>
${installGuide(input)}
<footer>${head.keep}</footer>`,
    head.what,
  );
}

export function missingPage(lang: PageLanguage): string {
  const text = say(lang, "missing");
  return shell(lang, text, `<p>${text}</p>`);
}

/** A link opened from an address that missed too often lately: asked to wait, not told it is gone. */
export function tooManyTriesPage(lang: PageLanguage): string {
  const text = say(lang, "tooManyTries");
  return shell(lang, text, `<p>${text}</p>`);
}

/** An invite link that worked once: used, cancelled or past its week. */
export function inviteEndedPage(lang: PageLanguage): string {
  const title = say(lang, "inviteEndedTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>\n<p>${say(lang, "inviteEnded")}</p>`,
  );
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
    // the question as one card, who asks over it, the answer under it (10-19 redesign)
    `<section class="reply">
<div class="asker"><span class="avatar" aria-hidden="true">${MARK}</span><h1>${title}</h1></div>
<p class="ask-text">${escape(input.request)}</p>
${answered}
</section>
<footer>${say(lang, "footer", { asker })}</footer>`,
    // Who asks and with what, never what they asked.
    say(lang, "footer", { asker }),
  );
}
