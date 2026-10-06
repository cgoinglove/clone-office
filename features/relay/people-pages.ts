// The pages of an office's server for the people who sign in there (accounts.ts): making an account
// from an invite, signing in, and one's own page with the line that connects one's computer. Plain
// HTML from the relay, with no scripts and nothing from elsewhere, in the reader's language when
// written in it (English otherwise); everything a person typed is escaped before it is shown, and a
// password is never put back into a page.

import { escape, type PageLanguage, shell } from "./page.ts";

const WORDS = {
  en: {
    inviteTitle: "{from} invites you to their office",
    inviteTitleNobody: "You are invited to an office",
    what: "In this office, everyone's clone (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    makeAccount: "Make your account",
    name: "Your name",
    email: "Email",
    password: "Password (8 characters or more)",
    create: "Make my account",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",
    orApp:
      "Already running sub-office on your computer? You can paste this link under Office there instead.",
    keep: "Anyone with this link can join this office; keep it within your team.",
    signInTitle: "Sign in to your office",
    signIn: "Sign in",
    noAccount: "No account yet? Open your office's invite link to make one.",
    hello: "Hi {name}",
    yourOffice: "Your office",
    connectTitle: "Connect your computer",
    connectWhat:
      "Your clone runs on your computer: it learns from your AI records there, thinks with your own AI, and works with your files. Run this once in a terminal on that computer (it needs Node.js 22 or later, from nodejs.org):",
    makeCommand: "Make my connect command",
    commandNote:
      "It works once, for 10 minutes; make a new one any time. Connecting another computer moves your clone there.",
    connected: "Connected: {name}'s clone, last seen {when}.",
    notConnected: "No computer is connected yet.",
    inviteTeam: "Invite a teammate",
    inviteWhat: "Send them this link; they make their account with it.",
    signOut: "Sign out",
    runTitle: "Run this on your computer",
    runWhat:
      "This link connects a computer to your office. Run it in a terminal on that computer:",
    errors: {
      "invite-wrong": "There is no such invite.",
      "name-missing": "Say your name.",
      "account-exists":
        "There is already an account with that email: sign in instead.",
      "password-short": "The password needs 8 characters or more.",
      "password-long": "That password is too long.",
      "email-wrong": "That email does not look right.",
      "sign-in-wrong": "The email or the password is wrong.",
      "too-many-tries": "Too many tries. Wait a few minutes and try again.",
      "not-in-office": "You are not in this office.",
      "account-failed": "That did not work. Try again.",
    },
  },
  ko: {
    inviteTitle: "{from}님이 오피스에 초대했어요",
    inviteTitleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 클론(나처럼 일하는 AI)가 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
    makeAccount: "내 계정 만들기",
    name: "이름",
    email: "이메일",
    password: "비밀번호 (8자 이상)",
    create: "계정 만들기",
    haveAccount: "계정이 이미 있나요?",
    signInLink: "로그인",
    orApp:
      "이미 내 컴퓨터에서 sub-office를 쓰고 있다면, 거기 오피스 칸에 이 링크를 붙여 넣어도 돼요.",
    keep: "이 링크가 있으면 누구나 이 오피스에 들어올 수 있어요. 팀 안에서만 나눠 주세요.",
    signInTitle: "내 오피스에 로그인",
    signIn: "로그인",
    noAccount: "아직 계정이 없나요? 오피스 초대 링크를 열어 만들어요.",
    hello: "{name}님, 안녕하세요",
    yourOffice: "내 오피스",
    connectTitle: "내 컴퓨터 연결",
    connectWhat:
      "클론은 내 컴퓨터에서 돌아요. 그 컴퓨터의 AI 기록으로 나를 배우고, 내 AI로 생각하고, 내 파일로 일해요. 그 컴퓨터의 터미널에서 이 한 줄을 한 번 실행하세요 (Node.js 22 이상이 필요해요, nodejs.org):",
    makeCommand: "연결 명령 만들기",
    commandNote:
      "한 번, 10분 동안만 돼요. 언제든 새로 만들 수 있어요. 다른 컴퓨터를 연결하면 클론이 그리로 옮겨 가요.",
    connected: "연결됨: {name}님의 클론, 마지막으로 본 때 {when}.",
    notConnected: "아직 연결된 컴퓨터가 없어요.",
    inviteTeam: "동료 초대",
    inviteWhat: "이 링크를 보내면 동료가 그걸로 계정을 만들어요.",
    signOut: "로그아웃",
    runTitle: "내 컴퓨터에서 실행하세요",
    runWhat:
      "이 링크는 컴퓨터를 내 오피스에 연결해요. 그 컴퓨터의 터미널에서 실행하세요:",
    errors: {
      "invite-wrong": "없는 초대예요.",
      "name-missing": "이름을 적어 주세요.",
      "account-exists": "그 이메일로 만든 계정이 이미 있어요. 로그인해 주세요.",
      "password-short": "비밀번호는 8자 이상이어야 해요.",
      "password-long": "비밀번호가 너무 길어요.",
      "email-wrong": "이메일이 올바르지 않아요.",
      "sign-in-wrong": "이메일이나 비밀번호가 맞지 않아요.",
      "too-many-tries": "너무 여러 번 시도했어요. 몇 분 뒤 다시 해 주세요.",
      "not-in-office": "이 오피스에 들어와 있지 않아요.",
      "account-failed": "되지 않았어요. 다시 해 주세요.",
    },
  },
};

type Words = (typeof WORDS)["en"];
type Key = Exclude<keyof Words, "errors">;

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

/** A failure's words; one the page does not know reads as a general one. */
export function errorWords(lang: PageLanguage, code: string): string {
  const errors = WORDS[lang].errors as Record<string, string>;
  return escape(errors[code] ?? errors["account-failed"]);
}

const problem = (lang: PageLanguage, code?: string) =>
  code ? `<p class="error" role="alert">${errorWords(lang, code)}</p>` : "";

/** The command that connects a computer, for a setup link. */
export const connectCommand = (link: string) =>
  `npx sub-office connect ${link}`;

/** An invite's page: what the office is, and an account to make (or sign in with). */
export function signUpPage(input: {
  lang: PageLanguage;
  from?: string;
  key: string;
  link: string;
  error?: string;
  name?: string;
  email?: string;
}): string {
  const { lang } = input;
  const title = input.from
    ? say(lang, "inviteTitle", { from: input.from })
    : say(lang, "inviteTitleNobody");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, "what")}</p>
<section>
<h2>${say(lang, "makeAccount")}</h2>
${problem(lang, input.error)}
<form method="post">
<label for="name">${say(lang, "name")}</label>
<input id="name" name="name" required maxlength="80" autocomplete="name" value="${escape(input.name ?? "")}">
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "password")}</label>
<input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password">
<button type="submit">${say(lang, "create")}</button>
</form>
<p class="note">${say(lang, "haveAccount")} <a href="/login?key=${encodeURIComponent(input.key)}">${say(lang, "signInLink")}</a></p>
</section>
<p class="note">${say(lang, "orApp")}</p>
<pre>${escape(input.link)}</pre>
<footer>${say(lang, "keep")}</footer>`,
  );
}

export function signInPage(input: {
  lang: PageLanguage;
  key?: string;
  error?: string;
  email?: string;
}): string {
  const { lang } = input;
  const title = say(lang, "signInTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${problem(lang, input.error)}
<form method="post">
${input.key ? `<input type="hidden" name="key" value="${escape(input.key)}">` : ""}
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "password")}</label>
<input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password">
<button type="submit">${say(lang, "signIn")}</button>
</form>
<p class="note">${say(lang, "noAccount")}</p>`,
  );
}

/** One's own page: one's office, the line that connects one's computer, and the team's invite link. */
export function homePage(input: {
  lang: PageLanguage;
  name: string;
  office?: { name: string; invite: string };
  computer?: { name: string; seen: string };
  command?: string;
  error?: string;
}): string {
  const { lang } = input;
  const title = say(lang, "hello", { name: input.name });
  const office = input.office;
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${problem(lang, input.error)}
${
  office
    ? `<p class="note">${say(lang, "yourOffice")}${office.name ? `: ${escape(office.name)}` : ""}</p>
<section>
<h2>${say(lang, "connectTitle")}</h2>
<p>${say(lang, "connectWhat")}</p>
${
  input.command
    ? `<pre>${escape(input.command)}</pre>`
    : `<form method="post" action="/home/pair"><button type="submit">${say(lang, "makeCommand")}</button></form>`
}
<p class="note">${say(lang, "commandNote")}</p>
<p class="note">${
        input.computer
          ? say(lang, "connected", {
              name: input.computer.name,
              when: input.computer.seen,
            })
          : say(lang, "notConnected")
      }</p>
</section>
<section>
<h2>${say(lang, "inviteTeam")}</h2>
<p>${say(lang, "inviteWhat")}</p>
<pre>${escape(office.invite)}</pre>
</section>`
    : `<p>${errorWords(lang, "not-in-office")}</p>`
}
<form method="post" action="/logout"><button type="submit" class="quiet">${say(lang, "signOut")}</button></form>`,
  );
}

/** What a setup link shows in a browser: the line to run on the computer it connects. */
export function runPage(input: {
  lang: PageLanguage;
  command: string;
}): string {
  const { lang } = input;
  const title = say(lang, "runTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, "runWhat")}</p>
<pre>${escape(input.command)}</pre>`,
  );
}
