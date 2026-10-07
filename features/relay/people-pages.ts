// The pages of an office's server for the people who sign in there (accounts.ts): making an account
// from an invite, signing in, and one's own page with the line that connects one's computer. Plain
// HTML from the relay, with no scripts and nothing from elsewhere, in the reader's language when
// written in it (English otherwise); everything a person typed is escaped before it is shown, and a
// password is never put back into a page.

import { installGuide, npxLine, type Os } from "./install.ts";
import { escape, type PageLanguage, shell } from "./page.ts";

const WORDS = {
  en: {
    inviteTitle: "{from} invites you to their office",
    inviteTitleNobody: "You are invited to an office",
    what: "In this office, everyone's clone (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    accountInstead: "Or make an account on this office's server",
    accountWhy:
      "With an account you sign in here, see who is in the office, and connect your computer under your name.",
    name: "Your name",
    email: "Email",
    password: "Password (8 characters or more)",
    create: "Make my account",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",
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
    people: "People in this office",
    peopleOwner:
      "As an owner, you decide who is in, and you can make others owners too.",
    owner: "Owner",
    member: "Member",
    you: "you",
    cloneIn: "Clone connected, last seen {when}",
    cloneOut: "No computer connected yet",
    remove: "Remove",
    removeTitle: "Remove {name} from this office?",
    removeWhat:
      "Their clone stops working here at once, and they can't make a new connect command. What they asked and answered stays.",
    makeOwner: "Make owner",
    ownerTitle: "Make {name} an owner?",
    ownerWhat:
      "Owners decide who is in the office, rename it and make new invite links. You stay an owner too.",
    keyed: "Clones that joined with the link",
    keyedWhat:
      "These joined from someone's app with the invite link, without an account here.",
    cloneTitle: "Remove {name}'s clone from this office?",
    cloneWhat:
      "It stops working here at once. What it asked and answered stays.",
    newLink: "Make a new invite link",
    newLinkTitle: "Make a new invite link?",
    newLinkWhat:
      "The link you sent before stops working. Everyone already in stays in.",
    officeName: "Office name",
    save: "Save",
    cancel: "Cancel",
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
      "not-owner": "Only an owner of this office can do that.",
      "not-yourself": "You can't remove yourself.",
    },
  },
  ko: {
    inviteTitle: "{from}님이 오피스에 초대했어요",
    inviteTitleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 클론(나처럼 일하는 AI)이 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
    accountInstead: "또는 이 오피스 서버에 계정 만들기",
    accountWhy:
      "계정이 있으면 여기 로그인해서 오피스에 누가 있는지 보고, 내 이름으로 컴퓨터를 연결할 수 있어요.",
    name: "이름",
    email: "이메일",
    password: "비밀번호 (8자 이상)",
    create: "계정 만들기",
    haveAccount: "계정이 이미 있나요?",
    signInLink: "로그인",
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
    people: "이 오피스의 사람들",
    peopleOwner:
      "주인은 누가 들어와 있을지 정하고, 다른 사람도 주인으로 만들 수 있어요.",
    owner: "주인",
    member: "멤버",
    you: "나",
    cloneIn: "클론 연결됨, 마지막으로 본 때 {when}",
    cloneOut: "아직 연결된 컴퓨터가 없어요",
    remove: "내보내기",
    removeTitle: "{name}님을 이 오피스에서 내보낼까요?",
    removeWhat:
      "클론이 여기서 바로 멈추고, 새 연결 명령도 만들 수 없어요. 주고받은 부탁은 남아요.",
    makeOwner: "주인으로",
    ownerTitle: "{name}님을 주인으로 만들까요?",
    ownerWhat:
      "주인은 누가 들어와 있을지 정하고, 오피스 이름을 바꾸고, 새 초대 링크를 만들어요. 나도 계속 주인이에요.",
    keyed: "링크로 바로 들어온 클론",
    keyedWhat: "여기 계정 없이, 앱에서 초대 링크로 바로 들어온 클론이에요.",
    cloneTitle: "{name}님의 클론을 이 오피스에서 내보낼까요?",
    cloneWhat: "여기서 바로 멈춰요. 주고받은 부탁은 남아요.",
    newLink: "새 초대 링크 만들기",
    newLinkTitle: "새 초대 링크를 만들까요?",
    newLinkWhat:
      "예전에 보낸 링크는 더 쓸 수 없어요. 이미 들어온 사람은 그대로예요.",
    officeName: "오피스 이름",
    save: "저장",
    cancel: "취소",
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
      "not-owner": "이 오피스의 주인만 할 수 있어요.",
      "not-yourself": "나 자신은 내보낼 수 없어요.",
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

/** The command that connects a computer, for a setup link on the relay at `base`. */
export const connectCommand = (link: string, base: string) =>
  npxLine(base, `connect ${link}`);

/**
 * An invite's page: what the office is and how to set up one's clone with the link (install.ts),
 * then, folded away, an account to make here (or sign in with).
 */
export function signUpPage(input: {
  lang: PageLanguage;
  from?: string;
  key: string;
  link: string;
  os: Os;
  command: string;
  local?: boolean;
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
${installGuide(input)}
<details${input.error ? " open" : ""}><summary>${say(lang, "accountInstead")}</summary>
<section>
<p class="note">${say(lang, "accountWhy")}</p>
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
</details>
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
export interface HomePerson {
  id: string;
  name: string;
  email: string;
  role: "owner" | "member";
  /** When their computer's clone was last heard from, as the reader reads a time. */
  seen?: string;
}

export interface HomeClone {
  id: string;
  name: string;
  role: string;
  seen: string;
}

export function homePage(input: {
  lang: PageLanguage;
  name: string;
  /** The reader's account id, to mark them in the list. */
  me?: string;
  office?: { name: string; invite: string };
  computer?: { name: string; seen: string };
  command?: string;
  error?: string;
  /** Everyone with an account in the office, and whether the reader owns it. */
  people?: HomePerson[];
  owner?: boolean;
  /** Clones that joined with the key, shown to owners. */
  clones?: HomeClone[];
}): string {
  const { lang } = input;
  const title = say(lang, "hello", { name: input.name });
  const office = input.office;
  const people = input.people ?? [];
  const owner = Boolean(input.owner);
  const personRow = (person: HomePerson) => {
    const self = person.id === input.me;
    const acts =
      owner && !self
        ? `<span class="acts">${
            person.role === "member"
              ? `<a class="small" href="/home/people/owner?user=${encodeURIComponent(person.id)}">${say(lang, "makeOwner")}</a>`
              : ""
          }<a class="small" href="/home/people/remove?user=${encodeURIComponent(person.id)}">${say(lang, "remove")}</a></span>`
        : "";
    return `<li><span class="who"><b>${escape(person.name)}</b><span class="tag">${say(lang, person.role === "owner" ? "owner" : "member")}</span>${self ? `<span class="tag">${say(lang, "you")}</span>` : ""}<small>${escape(person.email)} · ${
      person.seen
        ? say(lang, "cloneIn", { when: person.seen })
        : say(lang, "cloneOut")
    }</small></span>${acts}</li>`;
  };
  const clones = owner ? (input.clones ?? []) : [];
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
${owner ? `<p><a href="/home/invite/new">${say(lang, "newLink")}</a></p>` : ""}
</section>
${
  people.length
    ? `<section>
<h2>${say(lang, "people")}</h2>
${owner ? `<p class="note">${say(lang, "peopleOwner")}</p>` : ""}
<ul class="rows">${people.map(personRow).join("")}</ul>
</section>`
    : ""
}
${
  clones.length
    ? `<section>
<h2>${say(lang, "keyed")}</h2>
<p class="note">${say(lang, "keyedWhat")}</p>
<ul class="rows">${clones
        .map(
          (clone) =>
            `<li><span class="who"><b>${escape(clone.name)}</b><small>${escape(clone.role)}${clone.role ? " · " : ""}${say(lang, "cloneIn", { when: clone.seen })}</small></span><span class="acts"><a class="small" href="/home/clones/remove?member=${encodeURIComponent(clone.id)}">${say(lang, "remove")}</a></span></li>`,
        )
        .join("")}</ul>
</section>`
    : ""
}
${
  owner
    ? `<section>
<h2>${say(lang, "officeName")}</h2>
<form method="post" action="/home/office/name" class="inline"><input name="name" maxlength="80" value="${escape(office.name)}" aria-label="${say(lang, "officeName")}"><button type="submit">${say(lang, "save")}</button></form>
</section>`
    : ""
}`
    : `<p>${errorWords(lang, "not-in-office")}</p>`
}
<form method="post" action="/logout"><button type="submit" class="quiet">${say(lang, "signOut")}</button></form>`,
  );
}

/** One more look before something an owner can't take back: who it is about, and yes or cancel. */
export function confirmPage(input: {
  lang: PageLanguage;
  what: "remove" | "owner" | "clone" | "newLink";
  name?: string;
  action: string;
  fields?: Record<string, string>;
}): string {
  const { lang } = input;
  const words = {
    remove: ["removeTitle", "removeWhat", "remove"],
    owner: ["ownerTitle", "ownerWhat", "makeOwner"],
    clone: ["cloneTitle", "cloneWhat", "remove"],
    newLink: ["newLinkTitle", "newLinkWhat", "newLink"],
  } as const;
  const [titleKey, whatKey, yesKey] = words[input.what];
  const title = say(lang, titleKey, { name: input.name ?? "" });
  const hidden = Object.entries(input.fields ?? {})
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`,
    )
    .join("");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, whatKey)}</p>
<form method="post" action="${escape(input.action)}">${hidden}<div class="acts"><button type="submit" class="${input.what === "owner" ? "" : "danger"}">${say(lang, yesKey)}</button><a href="/home">${say(lang, "cancel")}</a></div></form>`,
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
