// How someone invited sets up their clone, on the invite's page: install Node.js, open a
// terminal, paste one line (`npx -y clone-office join "<invite link>"`), answer a few questions. The
// steps follow the computer the page was opened on (its User-Agent), with the others folded
// away; a phone is told to open the link on a computer. Plain HTML like the relay's other pages.

import type { AllInSync } from "../../i18n/sync.ts";
import { escape, type PageLanguage } from "./page.ts";

export type Os = "mac" | "windows" | "linux" | "phone";

const NODE = "https://nodejs.org/en/download";

const WORDS = {
  en: {
    title: "Set up your clone",
    time: "About 5 minutes, and no coding: you copy one line.",
    why: "Your clone runs on your own computer. It learns how you work from what is there, works with your files and tools, and keeps what it learns on that computer. Only requests and your card go through the office.",
    node: "Install Node.js",
    nodeMac:
      "Download the macOS installer, open it and click Continue until it is done.",
    nodeWindows:
      "Download the Windows installer, open it and click Next until it is done.",
    nodeLinux:
      "Install Node.js 22.13 or later from nodejs.org or your package manager.",
    nodeSkip: "Have Node.js 22.13 or later already? Skip this step.",
    download: "Download Node.js",
    terminalMac: "Open Terminal",
    terminalMacHow: "Press ⌘ Space, type Terminal and press Return.",
    terminalWindows: "Open Command Prompt",
    terminalWindowsHow:
      "Press the Windows key, type cmd and press Enter. If it was open while Node.js installed, close it and open it again.",
    terminalLinux: "Open a terminal",
    terminalLinuxHow: "Ctrl+Alt+T opens one on most systems.",
    paste: "Paste this line and press Enter",
    pasteNote: "The first time takes a minute or two.",
    answer: "Answer a few questions",
    answerFrom:
      "Your browser opens Clone Office. Pick the AI your clone uses and say who you are; then it joins {from}'s office.",
    answerNobody:
      "Your browser opens Clone Office. Pick the AI your clone uses and say who you are; then it joins the office.",
    local:
      "This office runs on {from}'s computer: join from the same Wi-Fi or network, while their Clone Office is open.",
    localNobody:
      "This office runs on a teammate's computer: join from the same Wi-Fi or network, while their Clone Office is open.",
    other: "On another kind of computer?",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    phone:
      "Open this link on your computer: your clone runs there, not on a phone. Send it to yourself by email or a messenger.",
    already:
      "Already use Clone Office? Open it, then paste this link under Settings › Office.",
  },
  ko: {
    title: "내 클론 만들기",
    time: "5분쯤 걸려요. 코딩은 필요 없고 한 줄만 붙여 넣으면 돼요.",
    why: "클론은 내 컴퓨터에서 돌아요. 거기 있는 것으로 내가 일하는 방식을 배우고, 내 파일과 도구로 일하고, 배운 것은 그 컴퓨터에 둬요. 오피스로는 부탁과 내 명함만 오가요.",
    node: "Node.js 설치",
    nodeMac: "macOS 설치 파일을 받아 열고, 끝날 때까지 계속을 누르세요.",
    nodeWindows: "Windows 설치 파일을 받아 열고, 끝날 때까지 Next를 누르세요.",
    nodeLinux: "nodejs.org나 패키지 관리자로 Node.js 22.13 이상을 설치하세요.",
    nodeSkip: "Node.js 22.13 이상이 이미 있다면 넘어가세요.",
    download: "Node.js 받기",
    terminalMac: "터미널 열기",
    terminalMacHow: "⌘ Space를 누르고 터미널(Terminal)을 입력한 뒤 Return.",
    terminalWindows: "명령 프롬프트 열기",
    terminalWindowsHow:
      "Windows 키를 누르고 cmd를 입력한 뒤 Enter. Node.js를 설치할 때 열려 있었다면 닫고 다시 여세요.",
    terminalLinux: "터미널 열기",
    terminalLinuxHow: "대부분 Ctrl+Alt+T로 열려요.",
    paste: "이 한 줄을 붙여 넣고 Enter",
    pasteNote: "처음 한 번은 1~2분 걸려요.",
    answer: "몇 가지에 답하기",
    answerFrom:
      "브라우저에 Clone Office가 열려요. 클론이 쓸 AI 모델을 고르고 나를 소개하면 {from} 님의 오피스에 들어가요.",
    answerNobody:
      "브라우저에 Clone Office가 열려요. 클론이 쓸 AI 모델을 고르고 나를 소개하면 오피스에 들어가요.",
    local:
      "이 오피스는 {from} 님의 컴퓨터에서 열려 있어요. {from} 님의 Clone Office가 켜져 있을 때, 같은 와이파이에서 들어와 주세요.",
    localNobody:
      "이 오피스는 동료의 컴퓨터에서 열려 있어요. 동료의 Clone Office가 켜져 있을 때, 같은 와이파이에서 들어와 주세요.",
    other: "다른 컴퓨터인가요?",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    phone:
      "이 링크는 컴퓨터에서 여세요. 클론은 휴대폰이 아니라 컴퓨터에서 돌아요. 메일이나 메신저로 나에게 보내 두세요.",
    already:
      "이미 Clone Office를 쓰고 있다면, 앱을 열고 설정 › 오피스에 이 링크를 붙여 넣어 주세요.",
  },
};
// Each page language's guide says everything the English one says, and nothing more.
const _wordsInStep: AllInSync<typeof WORDS> & Record<PageLanguage, unknown> =
  WORDS;

type Key = keyof (typeof WORDS)["en"];

function say(
  lang: PageLanguage,
  key: Key,
  values: Record<string, string> = {},
): string {
  let text: string = WORDS[lang][key];
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, value);
  return escape(text);
}

/** The computer a page was opened on, from its User-Agent; a Mac when it does not say. */
export function osOf(userAgent: string | undefined): Os {
  const agent = userAgent ?? "";
  if (/iPhone|iPad|iPod|Android/i.test(agent)) return "phone";
  if (/Windows/i.test(agent)) return "windows";
  if (/Linux|X11|CrOS/i.test(agent)) return "linux";
  return "mac";
}

/** An address on a private network: an office open on a teammate's computer. */
export function isPrivateHost(host: string): boolean {
  return (
    host === "localhost" ||
    /^(10|127)\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^\[(fd|fe80)/i.test(host)
  );
}

/**
 * The line to paste: the invite link in double quotes, which every terminal takes (zsh would
 * otherwise read its "?" as a pattern), with the name's characters a shell might act on encoded.
 */
/** Where a relay serves the app's own package, when it serves one. */
export const PACKAGE_PATH = "/clone-office.tgz";

/**
 * The app's package this relay serves itself (`CLONE_OFFICE_PACKAGE_FILE`, a .tgz `scripts/pack.mjs`
 * built): a team's own build, or the app before it is on npm. Its lines then take the app from the
 * relay they were opened on rather than from npm.
 */
export function servedPackage(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const file = env.CLONE_OFFICE_PACKAGE_FILE?.trim();
  return file?.endsWith(".tgz") ? file : undefined;
}

/** `npx` running the app: from npm, or from the package the relay at `base` serves. */
export function npxLine(
  base: string,
  args: string,
  served = Boolean(servedPackage()),
): string {
  return served
    ? // quoted, as the link is: an IPv6 address's brackets are a pattern to zsh
      `npx -y --package="${base}${PACKAGE_PATH}" clone-office ${args}`
    : `npx -y clone-office ${args}`;
}

export function joinCommand(input: {
  base: string;
  key: string;
  from?: string;
  /** The relay serves the app's package (by default, as `servedPackage` finds). */
  served?: boolean;
}): string {
  const from = input.from
    ? `?from=${encodeURIComponent(input.from).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
      )}`
    : "";
  return npxLine(
    input.base,
    `join "${input.base}/i/${encodeURIComponent(input.key)}${from}"`,
    input.served,
  );
}

const TERMINAL = {
  mac: ["terminalMac", "terminalMacHow", "nodeMac"],
  windows: ["terminalWindows", "terminalWindowsHow", "nodeWindows"],
  linux: ["terminalLinux", "terminalLinuxHow", "nodeLinux"],
} as const;

/** The guide's HTML: the steps for this computer, the others folded away. */
export function installGuide(input: {
  lang: PageLanguage;
  os: Os;
  command: string;
  link: string;
  from?: string;
  /** The office runs on a teammate's computer, on a private network. */
  local?: boolean;
}): string {
  const { lang } = input;
  const from = input.from ? { from: input.from } : undefined;
  if (input.os === "phone")
    return `<section class="guide">
<h2>${say(lang, "title")}</h2>
<p>${say(lang, "phone")}</p>
<pre>${escape(input.link)}</pre>
</section>`;
  const os = input.os;
  const [terminal, terminalHow, node] = TERMINAL[os];
  const others = (["mac", "windows", "linux"] as const).filter(
    (other) => other !== os,
  );
  return `<section class="guide">
<h2>${say(lang, "title")}</h2>
<p class="note">${say(lang, "time")} ${say(lang, "why")}</p>
<ol class="steps">
<li><b>${say(lang, "node")}</b><span>${say(lang, node)}</span><a class="button" href="${NODE}" target="_blank" rel="noreferrer">${say(lang, "download")}</a><small>${say(lang, "nodeSkip")}</small></li>
<li><b>${say(lang, terminal)}</b><span>${say(lang, terminalHow)}</span></li>
<li><b>${say(lang, "paste")}</b><pre>${escape(input.command)}</pre><small>${say(lang, "pasteNote")}</small></li>
<li><b>${say(lang, "answer")}</b><span>${say(lang, from ? "answerFrom" : "answerNobody", from)}</span></li>
</ol>
${input.local ? `<p class="note">${say(lang, from ? "local" : "localNobody", from)}</p>` : ""}
<details><summary>${say(lang, "other")}</summary>
<ul class="others">${others
    .map((other) => {
      const [t, how, n] = TERMINAL[other];
      return `<li><b>${say(lang, other)}</b> ${say(lang, n)} ${say(lang, t)}: ${say(lang, how)}</li>`;
    })
    .join("")}</ul>
</details>
<p class="note">${say(lang, "already")}</p>
</section>`;
}
