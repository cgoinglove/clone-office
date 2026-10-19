// The pages of an office's server for the people who sign in there (accounts.ts): making an account
// from an invite, signing in (with a password, or with Google where the admin turned it on), one's
// own page with the line that connects one's computer, and, for the server's admin, how people sign
// in. Plain HTML from the relay, with no scripts and nothing from elsewhere, in the reader's language
// when written in it (English otherwise); everything a person typed is escaped before it is shown,
// and a password or a secret is never put back into a page.

import type { AllInSync } from "../../i18n/sync.ts";
import type { SignInMethods, SignInSettings, SignInWays } from "./accounts.ts";
import {
  type Installers,
  installGuide,
  type Local,
  npxLine,
  type Os,
} from "./install.ts";
import { escape, MARK, type PageLanguage, shell } from "./page.ts";
import type { OwnMessage } from "./relay.ts";

const WORDS = {
  en: {
    inviteTitle: "{from} invites you to their office",
    onWebPerson: "On the web, no computer connected",
    answerFrom: "Answer from {name}",
    answerFromClone: "Answer from {name}'s clone",
    requestsWaiting: "{count} requests waiting",
    inviteFor: "For whom (optional)",
    inviteOnce: "Copy it now: it is shown only once.",
    webTitle: "No computer connected?",
    webWhat:
      "Take part from here: colleagues' clones can ask you, and you answer them and ask them on this page. A computer you connect later takes this over with your clone.",
    webJoin: "Take part on the web",
    requestsLink: "Requests",
    requestsTitle: "Requests",
    askedOfYou: "Asked of you",
    askedNone: "Nothing is waiting for you.",
    youAsked: "You asked",
    youAskedNone: "You haven't asked anyone yet.",
    askTitle: "Ask a colleague",
    askTo: "Who",
    askPick: "Pick a colleague",
    askText: "What you need",
    askSend: "Send",
    answerLabel: "Your answer",
    answerSend: "Send answer",
    fromWho: "{name} asks",
    toWho: "To {name}",
    stateWaiting: "Waiting for you",
    stateCloneOn: "Your clone is on it",
    stateAwaiting: "Waiting for an answer",
    stateAnswered: "Answered",
    stateYouAnswered: "You answered",
    stateCloneAnswered: "Your clone answered",
    stateClosed: "Closed",
    cloneHandles:
      "Your clone answers what is asked of you on your computer; what it needs from you comes under My clone here, in the app or on your phone.",
    refresh: "Refresh",
    askSent: "Sent. The answer shows here when it comes.",
    answerSent: "Answer sent.",
    onWeb: "on the web",
    noColleagues: "Nobody else is in this office yet.",
    inviteTitleNobody: "You are invited to an office",
    what: "In this office, everyone's clone (an AI that works like them) takes and answers the team's requests, and brings each person only the calls that are theirs.",
    accountInstead: "Or make an account on the team server",
    accountWhy:
      "With an account you sign in here, see who is in the office, and connect your computer under your name.",
    name: "Your name",
    email: "Email",
    password: "Password (8 characters or more)",
    create: "Make my account",
    haveAccount: "Already have an account?",
    signInLink: "Sign in",
    keep: "This link is for one person: it works once, for a week.",
    signInTitle: "Sign in to your office",
    signIn: "Sign in",
    noAccount: "No account yet? Open your office's invite link to make one.",
    hello: "Hi {name}",
    yourOffice: "Your office",
    connectTitle: "Connect your computer",
    connectWhat:
      "Your clone runs on your computer: it learns from your AI records there, thinks with your own AI, and works with your files. Run this once in a terminal on that computer (it needs Node.js 22.13 or later, from nodejs.org):",
    makeCommand: "Make my connect command",
    commandNote:
      "It works once, for 10 minutes; make a new one any time. Connecting another computer moves your clone there.",
    connected: "Connected: {name}'s clone, last seen {when}.",
    notConnected: "No computer is connected yet.",
    inviteTeam: "Invite a teammate",
    inviteWhat: "Each link is for one person: it works once, for {days} days.",
    accountMade:
      "An account was made with this invite already. Sign in to it, or ask for a new invite.",
    welcome:
      "You're this server's admin. People sign in with email and password; Google is optional, below. Then invite your team from your page.",
    adminLinkEnded:
      "It was used, or a day has passed. Whoever runs the server gets a new one in its log when it starts again, or from the app that opened the office (Settings › Office › Open the team server).",
    adminLinkEndedTitle: "This setup link has ended",
    setupButton: "Make my admin account",
    setupWhat:
      "You'll be its admin: you decide how people sign in, and you invite your team. Make your account here. This link works once.",
    setupTitle: "Set up this team server",
    inviteHalfAccount: "account made · clone not joined yet",
    inviteHalfClone: "clone joined · no account yet",
    inviteFrom: "Made by {by} · {when}",
    invitesTitle: "Invites still open",
    inviteMade: "Send this to one person:",
    inviteMake: "Make an invite link",
    signOut: "Sign out",
    tabHome: "Home",
    pairTitle: "Pair this browser with your clone",
    pairWhat:
      "So that only you can talk to your clone, each browser is paired once. Your computer will ask you to confirm this code:",
    pairStart: "Pair this browser",
    pairWaiting:
      "Confirm it on your computer, in Clone Office (or on your phone)…",
    pairSecure:
      "Talking to your clone needs this page over https. Ask whoever runs the team server for an https address.",
    chatScript: "Talking to your clone here needs JavaScript.",
    chatUnpaired:
      "This browser isn't paired, so your clone didn't act on it. Pair it, then send it again.",
    chatBusy:
      "Your clone is still on what you sent before. Send this again once it answers.",
    chatNews: "Your clone answered.",
    chatAnswered: "Answered.",
    suggest1: "What's waiting on me today?",
    suggest2: "Where did I leave off yesterday?",
    suggest3: "Sum up the requests still open",
    tabClone: "My clone",
    tabRequests: "Requests",
    tabOffice: "Office",
    menuLabel: "Your menu",
    accountTitle: "Your account",
    computerOn: "Your clone is on, at your computer",
    computerOff:
      "Your computer is off or asleep. What you write here waits until it is back.",
    chatOff:
      "Talking to your clone from here is off. Turn it on in Clone Office on your computer: Settings › Office › Talk from the team server.",
    chatPlaceholder: "Tell your clone…",
    chatSend: "Send",
    chatEmpty:
      "Ask your clone anything, as you would at your computer. It answers from there.",
    chatWorking: "Your clone is answering…",
    chatWaiting: "Waiting for your computer…",
    cloneLabel: "Your clone",
    toDecide: "To decide",
    askSettled: "Answered on your computer",
    askChosen: "Answered: {choice}",
    chatKept:
      "Kept here for a day. The whole conversation stays on your computer.",
    chatRefresh: "Refresh to see the answer.",
    chatFailed:
      "Your clone couldn't answer this time. Try again, or look at it on your computer.",
    chatLimit:
      "Your AI plan has reached its usage limit. Try again later, or pick another model on your computer.",
    noCloneTitle: "You have no clone yet",
    noCloneWhat:
      "Your clone runs on your computer. Connect it, and you can talk to it here while it answers colleagues for you.",
    connectCta: "Connect your computer",
    webCta: "Take part on the web without a computer",
    onWebTitle: "You take part on the web",
    onWebWhat:
      "Colleagues' clones ask you here, and you answer under Requests. Connect a computer and your clone takes your place.",
    moveComputer: "Connect another computer",
    connectHow:
      "Run this once in a terminal on that computer (it needs Node.js 22.13 or later, from nodejs.org):",
    officeTitle: "The office",
    officeDrawingOff: "The office drawing needs JavaScript.",
    runTitle: "Run this on your computer",
    runWhat:
      "This link connects a computer to your office. Run it in a terminal on that computer:",
    people: "People in this office",
    peopleOwner:
      "As an owner, you decide who is in, and you can make others owners too.",
    owner: "Owner",
    member: "Member",
    you: "you",
    cloneIn: "Clone connected · last seen {when}",
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
    newLink: "Replace the shared invite link",
    newLinkTitle: "Change the office key?",
    newLinkWhat:
      "Links made with the office key stop working. Invites, and everyone already in, are not affected.",
    officeName: "Office name",
    save: "Save",
    cancel: "Cancel",
    continueGoogle: "Continue with Google",
    orWord: "or",
    waysTitle: "How you sign in",
    waysPassword: "Email and password",
    waysGoogle: "Google",
    connectGoogle: "Connect Google",
    connectGoogleWhat: "Sign in with your Google account too.",
    inUse: "In use",
    linked: "Connected",
    adminLink: "Sign-in settings for the team server",
    adminTitle: "Sign-in settings",
    adminWhat:
      "How people sign in to the team server. It applies to every office on it, and one way always stays on.",
    backHome: "Back to my page",
    saved: "Saved.",
    stateOn: "On",
    stateOff: "Off",
    stateUnset: "Not set up",
    turnOn: "Turn on",
    turnOff: "Turn off",
    methodPasswordWhat:
      "People make an account with their email and a password.",
    methodGoogleWhat:
      "People sign in with their Google account. A new account still needs an office's invite link.",
    passwordOnly: "{count} people sign in only with a password.",
    googleOnly: "{count} people sign in only with Google.",
    linkFirst:
      "Connect your own Google account before turning this off, so you can still sign in.",
    googleSetup: "Set up Google sign-in",
    googleChange: "Change the Google client",
    step1:
      "In Google Cloud Console, open APIs & Services, then Credentials, and create an OAuth client ID for a web application.",
    consoleLink: "Open Google Cloud Console",
    step2: "Add this address as an authorized redirect URI:",
    step3: "Paste the client ID and the client secret Google shows you here.",
    httpsNote:
      "Google sends people back only to an https address, or to localhost. Put this server behind https and set RELAY_PUBLIC_URL to that address.",
    clientId: "Client ID",
    clientSecret: "Client secret",
    secretNew: "It is kept encrypted on the team server and never shown again.",
    secretKeep: "Leave it empty to keep the secret already saved.",
    savedBy: "Set up by {name} on {when}.",
    saveGoogle: "Save and turn on",
    removeGoogle: "Remove Google settings",
    sealingOff:
      "To keep a Google secret, this server needs a sealing key: set RELAY_ENCRYPTION_KEY (openssl rand -base64 32) and restart it.",
    googleRemoveTitle: "Remove the Google settings?",
    googleRemoveWhat:
      "The client ID and its encrypted secret are deleted from the team server. Setting Google up again takes both again.",
    passwordOffTitle: "Turn off email and password?",
    passwordOffWhat:
      "While it is off, people sign in only with Google. You can turn it back on any time.",
    passwordPlain: "Password",
    forgot:
      "Forgot your password? Ask the team server's admin for a reset link.",
    noAccountInvite: "No account yet?",
    makeFromInvite: "Make one with your office's invite",
    passwordOnlyOne: "1 person signs in only with a password.",
    googleOnlyOne: "1 person signs in only with Google.",
    lockedGoogle:
      "{count} people sign in only with Google: they can't sign in while it is off.",
    lockedGoogleOne:
      "1 person signs in only with Google: they can't sign in while it is off.",
    lockedPassword:
      "{count} people sign in only with a password: they can't sign in while it is off.",
    lockedPasswordOne:
      "1 person signs in only with a password: they can't sign in while it is off.",
    googleOffTitle: "Turn off Google sign-in?",
    googleOffWhat: "Its settings stay, and you can turn it back on any time.",
    serverPeople: "People on the team server",
    serverPeopleWhat:
      "Everyone with an account here. Someone who forgot their password gets a reset link from you.",
    resetLink: "Reset link",
    resetTitle: "Make a password reset link for {name}?",
    resetWhat:
      "You get a link to send them yourself. It works once, for an hour, and signs them out everywhere once used.",
    resetMadeTitle: "Reset link for {name}",
    resetMadeWhat:
      "Send this link to {name} yourself. It works once, for an hour:",
    newPassword: "New password (8 characters or more)",
    setPassword: "Save the new password",
    adminMade: "This server is set up already. Sign in.",
    resetDone: "Your password is changed. Sign in with it.",
    joinTitle: "Join {office} too?",
    joinWhat:
      "You're signed in as {name}. The people of {office} will see your name and email.",
    join: "Join",
    removeAccount: "Remove account",
    removeAccountTitle: "Remove {name}'s account?",
    removeAccountWhat:
      "Their account goes from the team server: they can't sign in, and their clone stops in every office here. What they asked and answered stays, and they can make a new account from an invite.",
    thatOffice: "this office",
    yourOffices: "Your offices",
    showing: "Showing",
    notYou: "Not {name}?",
    joinFrom: "{from} invited you.",
    resetMake: "Make the link",
    newPasswordFor: "A new password for {name}",
    resetOpen:
      "On {when}, {name} made a link to reset your password. It works once, for {minutes} more minutes. If you didn't ask for it, stop it.",
    resetOpenOne:
      "On {when}, {name} made a link to reset your password. It works once, for 1 more minute. If you didn't ask for it, stop it.",
    passwordOffBlocked: "Passwords can't be turned off yet",
    resetStop: "Stop the link",
    resetStopped:
      "On {when}, {name} made a link to reset your password. You stopped it.",
    resetEnded:
      "On {when}, {name} made a link to reset your password. It ended unused.",
    stoppedDone: "Stopped. That link can no longer change your password.",
    connectTitleTo: "Connect your computer to {office}",
    resetDeadTitle: "This link no longer works",
    resetDeadWhat:
      "It was used, stopped or has expired. Ask the team server's admin for a new one.",
    passwordBack: "Saved. Email and password sign-in is back on for everyone.",
    adminsOnlyNote:
      "For now, only this server's admin can sign in with a password.",
    resetMadeTold: "Their page says you made it, and they can stop it.",
    errors: {
      "too-many":
        "That's a lot at once. Wait for your clone's answer, then send more.",
      "web-chat-unpaired":
        "This browser isn't paired with your clone yet. Pair it first.",
      "web-chat-off":
        "Talking to your clone from here is off. Turn it on in Clone Office on your computer.",
      "no-clone": "There is no clone to talk to: connect your computer first.",
      "too-long": "That is too long to send at once.",
      "text-missing": "Write something first.",
      "not-on-web": "Your clone answers these on your computer.",
      "invite-used": "This invite made an account already. Ask for a new one.",
      "admin-link-ended": "This setup link has ended.",
      "too-many-invites":
        "This office has too many open invites. Cancel some first.",
      "too-many-invites-mine":
        "You have 10 invites still open. One opens up again when someone uses one, or after its week.",
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
      "password-off":
        "Signing in with a password is turned off on this server. Use Google instead.",
      "google-off": "Signing in with Google is turned off on this server.",
      "google-not-linked":
        "An account with that email signs in with its password. Sign in with it, then connect Google on your page.",
      "google-no-account":
        "No account here uses that Google account yet. Open your office's invite link to make one.",
      "google-cancelled": "Signing in with Google was cancelled.",
      "google-other":
        "That Google account is connected to another account here, or its email is not this account's.",
      "google-unverified": "Google has not verified that account's email.",
      "google-again": "That took too long. Try again.",
      "google-failed": "Signing in with Google did not work. Try again.",
      "not-admin": "Only this server's admin can change how people sign in.",
      "google-first": "Turn on Google first, so people can still sign in.",
      "link-google-first":
        "Connect your own Google account first, so you can still sign in.",
      "password-first":
        "Turn on email and password first, so people can still sign in.",
      "sealing-off":
        "This server has no key to seal the secret with. Set RELAY_ENCRYPTION_KEY and restart it.",
      "google-id-wrong":
        "That is not a Google client ID: one ends in .apps.googleusercontent.com.",
      "google-secret-missing": "Paste the client secret too.",
      "google-secret-wrong": "That does not look like a client secret.",
      "google-not-set": "Set up Google first.",
      "google-unreadable":
        "The saved secret can't be opened with this server's key. Paste it again.",
      "reset-expired":
        "That link no longer works. Ask the team server's admin for a new one.",
      "no-password":
        "That person has no password to reset: they sign in with Google.",
      "last-owner":
        "They are the only owner of an office here. Make someone else its owner first.",
      "not-yours":
        "That account is in an office you don't own: its owners look after it.",
      "has-google":
        "That person signs in with Google: they don't need a reset link.",
      "owner-reset": "An office's owner gets no reset link from someone else.",
      "public-url-needed":
        "Google over https needs this server's public address: set RELAY_PUBLIC_URL to it and restart the server.",
    },
  },
  ko: {
    inviteTitle: "{from} 님이 오피스에 초대했어요",
    onWebPerson: "웹에서 함께해요 (연결된 컴퓨터 없음)",
    answerFrom: "{name} 님의 답",
    answerFromClone: "{name} 님 클론의 답",
    requestsWaiting: "기다리는 부탁 {count}개",
    inviteFor: "누구에게 보내나요 (선택)",
    inviteOnce: "지금 복사해 두세요. 한 번만 보여요.",
    webTitle: "연결된 컴퓨터가 없나요?",
    webWhat:
      "여기서 함께할 수 있어요. 동료의 클론이 나에게 물으면 이 페이지에서 답하고, 나도 여기서 동료에게 부탁해요. 나중에 컴퓨터를 연결하면 내 클론이 이어받아요.",
    webJoin: "웹에서 함께하기",
    requestsLink: "부탁",
    requestsTitle: "부탁",
    askedOfYou: "나에게 온 부탁",
    askedNone: "기다리는 부탁이 없어요.",
    youAsked: "내가 한 부탁",
    youAskedNone: "아직 부탁한 게 없어요.",
    askTitle: "동료에게 부탁하기",
    askTo: "누구에게",
    askPick: "동료를 골라 주세요",
    askText: "필요한 것",
    askSend: "보내기",
    answerLabel: "내 답",
    answerSend: "답 보내기",
    fromWho: "{name} 님의 부탁",
    toWho: "{name} 님에게",
    stateWaiting: "내 답을 기다려요",
    stateCloneOn: "클론이 답하는 중",
    stateAwaiting: "답을 기다리는 중",
    stateAnswered: "답 옴",
    stateYouAnswered: "답함",
    stateCloneAnswered: "클론이 답함",
    stateClosed: "끝남",
    cloneHandles:
      "나에게 온 부탁은 내 컴퓨터의 클론이 답해요. 클론이 나에게 물을 것은 여기 '내 클론'과 앱, 휴대폰으로 와요.",
    refresh: "새로 고침",
    askSent: "보냈어요. 답이 오면 여기에 보여요.",
    answerSent: "답을 보냈어요.",
    onWeb: "웹",
    noColleagues: "아직 이 오피스에 다른 사람이 없어요.",
    inviteTitleNobody: "오피스에 초대받았어요",
    what: "이 오피스에서는 사람마다 클론(나처럼 일하는 AI)이 팀의 부탁을 받고 답하며, 사람에게는 그 사람이 정할 것만 가져와요.",
    accountInstead: "또는 팀 서버에 계정 만들기",
    accountWhy:
      "계정이 있으면 여기 로그인해서 오피스에 누가 있는지 보고, 내 이름으로 컴퓨터를 연결할 수 있어요.",
    name: "이름",
    email: "이메일",
    password: "비밀번호 (8자 이상)",
    create: "계정 만들기",
    haveAccount: "계정이 이미 있나요?",
    signInLink: "로그인",
    keep: "이 링크는 한 사람용이에요. 한 번, 일주일 동안 쓸 수 있어요.",
    signInTitle: "내 오피스에 로그인",
    signIn: "로그인",
    noAccount: "아직 계정이 없나요? 오피스 초대 링크를 열면 만들 수 있어요.",
    hello: "{name} 님, 안녕하세요",
    yourOffice: "내 오피스",
    connectTitle: "내 컴퓨터 연결",
    connectWhat:
      "클론은 내 컴퓨터에서 돌아요. 그 컴퓨터의 AI 기록으로 나를 배우고, 내 AI로 생각하고, 내 파일로 일해요. 그 컴퓨터의 터미널에서 이 한 줄을 한 번 실행하세요 (Node.js 22.13 이상이 필요해요, nodejs.org):",
    makeCommand: "연결 명령 만들기",
    commandNote:
      "한 번, 10분 동안만 돼요. 언제든 새로 만들 수 있어요. 다른 컴퓨터를 연결하면 클론이 그리로 옮겨 가요.",
    connected: "연결됨: {name} 님의 클론, 마지막으로 본 때 {when}.",
    notConnected: "아직 연결된 컴퓨터가 없어요.",
    inviteTeam: "동료 초대",
    inviteWhat:
      "링크 하나는 한 사람용이에요. 한 번, {days}일 동안 쓸 수 있어요.",
    accountMade:
      "이 초대로 이미 계정을 만들었어요. 그 계정으로 로그인하거나 새 초대를 받아 주세요.",
    welcome:
      "이 서버의 관리자가 됐어요. 사람들은 이메일과 비밀번호로 로그인해요. Google은 아래에서 원할 때 켜면 돼요. 그다음 내 페이지에서 팀을 초대하세요.",
    adminLinkEnded:
      "이미 쓰였거나 하루가 지났어요. 서버를 운영하는 사람은 서버를 다시 켜면 로그에서, 또는 오피스를 연 앱에서(설정 › 오피스 › 팀 서버 열기) 새 링크를 받을 수 있어요.",
    adminLinkEndedTitle: "끝난 설정 링크예요",
    setupButton: "관리자 계정 만들기",
    setupWhat:
      "이 서버의 관리자가 돼요. 사람들이 어떻게 로그인할지 정하고, 팀을 초대해요. 여기서 계정을 만드세요. 이 링크는 한 번만 쓸 수 있어요.",
    setupTitle: "이 팀 서버 설정하기",
    inviteHalfAccount: "계정은 만들었고, 컴퓨터는 아직 연결 전",
    inviteHalfClone: "컴퓨터는 연결했고, 계정은 아직",
    inviteFrom: "{by} 님이 만듦 · {when}",
    invitesTitle: "아직 쓸 수 있는 초대",
    inviteMade: "한 사람에게 보내 주세요:",
    inviteMake: "초대 링크 만들기",
    signOut: "로그아웃",
    tabHome: "홈",
    pairTitle: "이 브라우저를 내 클론과 짝지어 주세요",
    pairWhat:
      "나만 내 클론과 이야기할 수 있도록 브라우저마다 한 번 짝지어요. 내 컴퓨터가 이 코드가 맞는지 물어볼 거예요:",
    pairStart: "이 브라우저 짝짓기",
    pairWaiting: "내 컴퓨터의 Clone Office(또는 휴대폰)에서 확인해 주세요…",
    pairSecure:
      "클론과 이야기하려면 이 페이지가 https로 열려야 해요. 팀 서버를 운영하는 분께 https 주소를 부탁해 주세요.",
    chatScript: "여기서 클론과 이야기하려면 자바스크립트가 켜져 있어야 해요.",
    chatUnpaired:
      "이 브라우저가 짝지어지지 않아서 클론이 따르지 않았어요. 짝지은 뒤 다시 보내 주세요.",
    chatBusy:
      "클론이 아직 앞에 보낸 말을 하고 있어요. 답이 오면 다시 보내 주세요.",
    chatNews: "클론이 답했어요.",
    chatAnswered: "답했어요.",
    suggest1: "오늘 나를 기다리는 게 뭐야?",
    suggest2: "어제 어디까지 했지?",
    suggest3: "아직 안 끝난 부탁 정리해 줘",
    tabClone: "내 클론",
    tabRequests: "부탁",
    tabOffice: "오피스",
    menuLabel: "내 메뉴",
    accountTitle: "내 계정",
    computerOn: "내 컴퓨터에서 켜져 있어요",
    computerOff:
      "내 컴퓨터가 꺼져 있거나 잠들었어요. 여기에 쓴 말은 켜지면 전해져요.",
    chatOff:
      "여기서 클론과 이야기하기가 꺼져 있어요. 내 컴퓨터의 Clone Office › 설정 › 오피스 › 팀 서버에서 이야기하기를 켜 주세요.",
    chatPlaceholder: "내 클론에게 말하기",
    chatSend: "보내기",
    chatEmpty:
      "내 컴퓨터에서처럼 무엇이든 말해 보세요. 클론이 그 컴퓨터에서 답해요.",
    chatWorking: "클론이 답하는 중이에요",
    chatWaiting: "컴퓨터를 기다리는 중이에요",
    cloneLabel: "내 클론",
    toDecide: "정할 것",
    askSettled: "내 컴퓨터에서 답했어요",
    askChosen: "답했어요: {choice}",
    chatKept: "여기에는 하루만 남아요. 대화 전체는 내 컴퓨터에 있어요.",
    chatRefresh: "새로 고치면 답이 보여요.",
    chatFailed:
      "클론이 이번에는 답하지 못했어요. 다시 해 보거나, 내 컴퓨터에서 확인해 주세요.",
    chatLimit:
      "AI 요금제의 사용 한도에 닿았어요. 조금 뒤에 다시 하거나, 내 컴퓨터에서 다른 모델을 골라 주세요.",
    noCloneTitle: "내 클론이 아직 없어요",
    noCloneWhat:
      "클론은 내 컴퓨터에서 돌아요. 연결하면 여기서 클론과 이야기하고, 클론이 동료에게 대신 답해요.",
    connectCta: "내 컴퓨터 연결하기",
    webCta: "컴퓨터 없이 웹에서 함께하기",
    onWebTitle: "웹에서 함께하고 있어요",
    onWebWhat:
      "동료의 클론이 여기로 물어 오면 부탁 탭에서 답해요. 컴퓨터를 연결하면 내 클론이 이어받아요.",
    moveComputer: "다른 컴퓨터 연결",
    connectHow:
      "그 컴퓨터의 터미널에서 이 한 줄을 한 번 실행하세요 (Node.js 22.13 이상이 필요해요, nodejs.org):",
    officeTitle: "오피스",
    officeDrawingOff: "오피스 그림은 자바스크립트가 켜져 있어야 보여요.",
    runTitle: "내 컴퓨터에서 실행하세요",
    runWhat:
      "이 링크는 컴퓨터를 내 오피스에 연결해요. 그 컴퓨터의 터미널에서 실행하세요:",
    people: "이 오피스의 사람들",
    peopleOwner:
      "주인은 누가 들어와 있을지 정하고, 다른 사람도 주인으로 만들 수 있어요.",
    owner: "주인",
    member: "멤버",
    you: "나",
    cloneIn: "클론 연결됨 · 마지막 접속 {when}",
    cloneOut: "아직 연결된 컴퓨터가 없어요",
    remove: "내보내기",
    removeTitle: "{name} 님을 이 오피스에서 내보낼까요?",
    removeWhat:
      "클론이 여기서 바로 멈추고, 새 연결 명령도 만들 수 없어요. 주고받은 부탁은 남아요.",
    makeOwner: "주인으로 만들기",
    ownerTitle: "{name} 님을 주인으로 만들까요?",
    ownerWhat:
      "주인은 누가 들어와 있을지 정하고, 오피스 이름을 바꾸고, 새 초대 링크를 만들어요. 나도 계속 주인이에요.",
    keyed: "링크로 바로 들어온 클론",
    keyedWhat: "여기 계정 없이, 앱에서 초대 링크로 바로 들어온 클론이에요.",
    cloneTitle: "{name} 님의 클론을 이 오피스에서 내보낼까요?",
    cloneWhat: "여기서 바로 멈춰요. 주고받은 부탁은 남아요.",
    newLink: "같이 쓰는 초대 링크 바꾸기",
    newLinkTitle: "오피스 키를 바꿀까요?",
    newLinkWhat:
      "오피스 키로 만든 링크는 더 쓸 수 없어요. 초대 링크와 이미 들어온 사람은 그대로예요.",
    officeName: "오피스 이름",
    save: "저장",
    cancel: "취소",
    continueGoogle: "Google 계정으로 계속하기",
    orWord: "또는",
    waysTitle: "내 로그인 방법",
    waysPassword: "이메일과 비밀번호",
    waysGoogle: "Google",
    connectGoogle: "Google 계정 연결",
    connectGoogleWhat: "Google 계정으로도 로그인할 수 있어요.",
    inUse: "사용 중",
    linked: "연결됨",
    adminLink: "팀 서버의 로그인 설정",
    adminTitle: "로그인 설정",
    adminWhat:
      "사람들이 팀 서버에 로그인하는 방법이에요. 팀 서버의 모든 오피스에 똑같이 적용되고, 한 가지는 항상 켜져 있어요.",
    backHome: "내 페이지로",
    saved: "저장했어요.",
    stateOn: "켜짐",
    stateOff: "꺼짐",
    stateUnset: "설정 안 됨",
    turnOn: "켜기",
    turnOff: "끄기",
    methodPasswordWhat: "이메일과 비밀번호로 계정을 만들고 로그인해요.",
    methodGoogleWhat:
      "Google 계정으로 로그인해요. 새 계정은 여전히 오피스 초대 링크가 있어야 만들 수 있어요.",
    passwordOnly: "비밀번호로만 로그인하는 사람 {count}명",
    googleOnly: "Google로만 로그인하는 사람 {count}명",
    linkFirst:
      "끄기 전에 내 Google 계정을 연결해 두세요. 그래야 나도 계속 로그인할 수 있어요.",
    googleSetup: "Google 로그인 설정하기",
    googleChange: "Google 클라이언트 바꾸기",
    step1:
      "Google Cloud Console에서 API 및 서비스 › 사용자 인증 정보로 가서 OAuth 클라이언트 ID(웹 애플리케이션)를 만들어요.",
    consoleLink: "Google Cloud Console 열기",
    step2: "승인된 리디렉션 URI에 이 주소를 넣어요:",
    step3:
      "Google이 보여 주는 클라이언트 ID와 클라이언트 보안 비밀번호를 여기에 붙여 넣어요.",
    httpsNote:
      "Google은 https 주소(또는 localhost)로만 돌려보내요. 이 서버를 https 뒤에 두고 RELAY_PUBLIC_URL에 그 주소를 넣어 주세요.",
    clientId: "클라이언트 ID",
    clientSecret: "클라이언트 보안 비밀번호",
    secretNew: "팀 서버에 암호화해서 저장하고, 다시 보여 주지 않아요.",
    secretKeep: "비워 두면 저장된 보안 비밀번호를 그대로 써요.",
    savedBy: "{when}에 {name} 님이 설정했어요.",
    saveGoogle: "저장하고 켜기",
    removeGoogle: "Google 설정 지우기",
    sealingOff:
      "Google 보안 비밀번호를 저장하려면 팀 서버에 암호화 키가 있어야 해요. RELAY_ENCRYPTION_KEY(openssl rand -base64 32)를 넣고 다시 시작해 주세요.",
    googleRemoveTitle: "Google 설정을 지울까요?",
    googleRemoveWhat:
      "클라이언트 ID와 암호화해 둔 보안 비밀번호가 팀 서버에서 지워져요. Google을 다시 설정하려면 둘 다 다시 넣어야 해요.",
    passwordOffTitle: "이메일과 비밀번호 로그인을 끌까요?",
    passwordOffWhat:
      "끄는 동안에는 Google로만 로그인할 수 있어요. 언제든 다시 켤 수 있어요.",
    passwordPlain: "비밀번호",
    forgot: "비밀번호를 잊었나요? 팀 서버 관리자에게 재설정 링크를 받으세요.",
    noAccountInvite: "아직 계정이 없나요?",
    makeFromInvite: "오피스 초대로 만들기",
    passwordOnlyOne: "비밀번호로만 로그인하는 사람 1명",
    googleOnlyOne: "Google로만 로그인하는 사람 1명",
    lockedGoogle:
      "Google로만 로그인하는 {count}명은 끄는 동안 로그인할 수 없어요.",
    lockedGoogleOne:
      "Google로만 로그인하는 1명은 끄는 동안 로그인할 수 없어요.",
    lockedPassword:
      "비밀번호로만 로그인하는 {count}명은 끄는 동안 로그인할 수 없어요.",
    lockedPasswordOne:
      "비밀번호로만 로그인하는 1명은 끄는 동안 로그인할 수 없어요.",
    googleOffTitle: "Google 로그인을 끌까요?",
    googleOffWhat: "설정은 그대로 남고, 언제든 다시 켤 수 있어요.",
    serverPeople: "팀 서버의 사람들",
    serverPeopleWhat:
      "여기에 계정이 있는 모든 사람이에요. 비밀번호를 잊은 사람에게는 재설정 링크를 만들어 보내 주세요.",
    resetLink: "재설정 링크",
    resetTitle: "{name} 님의 비밀번호 재설정 링크를 만들까요?",
    resetWhat:
      "링크를 받아 직접 보내 주면 돼요. 한 번, 1시간 동안만 쓸 수 있고, 쓰면 그 사람은 모든 곳에서 로그아웃돼요.",
    resetMadeTitle: "{name} 님의 재설정 링크",
    resetMadeWhat:
      "이 링크를 {name} 님에게 직접 보내 주세요. 한 번, 1시간 동안만 돼요:",
    newPassword: "새 비밀번호 (8자 이상)",
    setPassword: "새 비밀번호 저장",
    adminMade: "이 서버는 이미 설정됐어요. 로그인하세요.",
    resetDone: "비밀번호를 바꿨어요. 새 비밀번호로 로그인하세요.",
    joinTitle: "{office}에도 들어갈까요?",
    joinWhat:
      "{name} 님으로 로그인해 있어요. {office}의 사람들에게 내 이름과 이메일이 보여요.",
    join: "들어가기",
    removeAccount: "계정 지우기",
    removeAccountTitle: "{name} 님의 계정을 지울까요?",
    removeAccountWhat:
      "그 사람의 계정이 팀 서버에서 사라져요. 로그인할 수 없고, 여기 모든 오피스에서 클론이 멈춰요. 주고받은 부탁은 남고, 초대 링크로 새 계정을 만들 수 있어요.",
    thatOffice: "이 오피스",
    yourOffices: "들어가 있는 오피스",
    showing: "보는 중",
    notYou: "{name} 님이 아닌가요?",
    joinFrom: "{from} 님이 초대했어요.",
    resetMake: "링크 만들기",
    newPasswordFor: "{name} 님의 새 비밀번호",
    resetOpen:
      "{when}에 {name} 님이 내 비밀번호 재설정 링크를 만들었어요. 앞으로 {minutes}분 동안 한 번 쓸 수 있어요. 내가 부탁한 게 아니라면 링크를 막아 주세요.",
    resetOpenOne:
      "{when}에 {name} 님이 내 비밀번호 재설정 링크를 만들었어요. 앞으로 1분 동안 한 번 쓸 수 있어요. 내가 부탁한 게 아니라면 링크를 막아 주세요.",
    passwordOffBlocked: "아직 비밀번호를 끌 수 없어요",
    resetStop: "링크 막기",
    resetStopped: "{when}에 {name} 님이 만든 비밀번호 재설정 링크를 막았어요.",
    resetEnded:
      "{when}에 {name} 님이 만든 비밀번호 재설정 링크는 쓰이지 않고 끝났어요.",
    stoppedDone: "링크를 막았어요. 이제 그 링크로는 비밀번호를 바꿀 수 없어요.",
    connectTitleTo: "내 컴퓨터를 {office}에 연결",
    resetDeadTitle: "이 링크는 더 쓸 수 없어요",
    resetDeadWhat:
      "이미 쓰였거나, 막혔거나, 시간이 지났어요. 팀 서버 관리자에게 새 링크를 받아 주세요.",
    passwordBack:
      "저장했어요. 이메일과 비밀번호 로그인도 모두에게 다시 켜졌어요.",
    adminsOnlyNote: "지금은 이 서버의 관리자만 비밀번호로 로그인할 수 있어요.",
    resetMadeTold:
      "링크를 만든 것은 그 사람의 페이지에도 보이고, 그 사람이 링크를 막을 수 있어요.",
    errors: {
      "too-many":
        "한꺼번에 너무 많이 보냈어요. 클론의 답을 기다린 뒤에 더 보내 주세요.",
      "web-chat-unpaired":
        "이 브라우저가 아직 내 클론과 짝지어지지 않았어요. 먼저 짝지어 주세요.",
      "web-chat-off":
        "여기서 클론과 이야기하기가 꺼져 있어요. 내 컴퓨터의 Clone Office에서 켜 주세요.",
      "no-clone": "이야기할 클론이 없어요. 먼저 내 컴퓨터를 연결해 주세요.",
      "too-long": "한 번에 보내기에 너무 길어요.",
      "text-missing": "먼저 내용을 적어 주세요.",
      "not-on-web": "이 부탁은 내 컴퓨터의 클론이 답해요.",
      "invite-used": "이 초대로 이미 계정을 만들었어요. 새 초대를 받아 주세요.",
      "admin-link-ended": "끝난 설정 링크예요.",
      "too-many-invites":
        "쓸 수 있는 초대가 너무 많아요. 몇 개를 먼저 취소해 주세요.",
      "too-many-invites-mine":
        "아직 쓸 수 있는 내 초대가 10개예요. 누가 하나를 쓰거나 일주일이 지나면 다시 만들 수 있어요.",
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
      "password-off":
        "이 서버에서는 비밀번호 로그인이 꺼져 있어요. Google로 로그인해 주세요.",
      "google-off": "이 서버에서는 Google 로그인이 꺼져 있어요.",
      "google-not-linked":
        "그 이메일의 계정은 비밀번호로 로그인해요. 비밀번호로 로그인한 뒤 내 페이지에서 Google을 연결해 주세요.",
      "google-no-account":
        "그 Google 계정으로 만든 계정이 아직 없어요. 오피스 초대 링크를 열어 만들어 주세요.",
      "google-cancelled": "Google 로그인을 취소했어요.",
      "google-other":
        "그 Google 계정은 여기의 다른 계정에 연결돼 있거나, 이메일이 이 계정과 달라요.",
      "google-unverified": "Google이 그 계정의 이메일을 확인하지 않았어요.",
      "google-again": "시간이 너무 지났어요. 다시 해 주세요.",
      "google-failed": "Google 로그인이 되지 않았어요. 다시 해 주세요.",
      "not-admin": "로그인 방법은 이 서버의 관리자만 바꿀 수 있어요.",
      "google-first":
        "먼저 Google 로그인을 켜 주세요. 그래야 사람들이 계속 로그인할 수 있어요.",
      "link-google-first":
        "먼저 내 Google 계정을 연결해 주세요. 그래야 나도 계속 로그인할 수 있어요.",
      "password-first":
        "먼저 이메일과 비밀번호 로그인을 켜 주세요. 그래야 사람들이 계속 로그인할 수 있어요.",
      "sealing-off":
        "이 서버에 보안 비밀번호를 봉인할 키가 없어요. RELAY_ENCRYPTION_KEY를 넣고 다시 시작해 주세요.",
      "google-id-wrong":
        "Google 클라이언트 ID가 아니에요. 클라이언트 ID는 .apps.googleusercontent.com으로 끝나요.",
      "google-secret-missing": "클라이언트 보안 비밀번호도 붙여 넣어 주세요.",
      "google-secret-wrong": "클라이언트 보안 비밀번호가 아닌 것 같아요.",
      "google-not-set": "먼저 Google 로그인을 설정해 주세요.",
      "google-unreadable":
        "저장된 보안 비밀번호를 이 서버의 키로 열 수 없어요. 다시 붙여 넣어 주세요.",
      "reset-expired":
        "더 쓸 수 없는 링크예요. 팀 서버 관리자에게 새 링크를 받아 주세요.",
      "no-password":
        "그 사람은 Google로 로그인해서 재설정할 비밀번호가 없어요.",
      "last-owner":
        "그 사람이 여기 한 오피스의 유일한 주인이에요. 먼저 다른 사람을 그 오피스의 주인으로 만들어 주세요.",
      "not-yours":
        "내가 주인이 아닌 오피스에 있는 계정이에요. 그 오피스의 주인이 맡아요.",
      "has-google": "그 사람은 Google로 로그인해서 재설정 링크가 필요 없어요.",
      "owner-reset":
        "오피스 주인의 계정에는 다른 사람이 재설정 링크를 만들 수 없어요.",
      "public-url-needed":
        "https로 Google을 쓰려면 이 서버의 공개 주소가 필요해요. RELAY_PUBLIC_URL에 그 주소를 넣고 서버를 다시 시작해 주세요.",
    },
  },
  zh: {
    inviteTitle: "{from}邀请你加入他们的办公室",
    onWebPerson: "在网页上参与（没有连接电脑）",
    answerFrom: "{name}的回答",
    answerFromClone: "{name}的分身的回答",
    requestsWaiting: "请求 · {count} 个等待中",
    inviteFor: "发给谁（可选）",
    inviteOnce: "现在就复制：它只显示一次。",
    webTitle: "没有连接电脑？",
    webWhat:
      "可以在这里参与：同事的分身向你提问时，你在这个页面回答，也可以在这里向同事提出请求。之后连接电脑，你的分身会接手。",
    webJoin: "在网页上参与",
    requestsLink: "请求",
    requestsTitle: "请求",
    askedOfYou: "发给你的请求",
    askedNone: "没有等你处理的请求。",
    youAsked: "你发出的请求",
    youAskedNone: "你还没有向谁提出请求。",
    askTitle: "向同事提出请求",
    askTo: "发给谁",
    askPick: "选择一位同事",
    askText: "你需要什么",
    askSend: "发送",
    answerLabel: "你的回答",
    answerSend: "发送回答",
    fromWho: "{name}的请求",
    toWho: "发给{name}",
    stateWaiting: "等你回答",
    stateCloneOn: "分身在回答",
    stateAwaiting: "等待回答",
    stateAnswered: "已回答",
    stateYouAnswered: "你已回答",
    stateCloneAnswered: "分身已回答",
    stateClosed: "已结束",
    cloneHandles:
      "发给你的请求由你电脑上的分身回答；它需要你决定的事会出现在应用或手机上。",
    refresh: "刷新",
    askSent: "已发送。回答到了会显示在这里。",
    answerSent: "回答已发送。",
    onWeb: "网页",
    noColleagues: "这个办公室里还没有其他人。",
    inviteTitleNobody: "你收到了一个办公室的邀请",
    what: "在这个办公室里，每个人的分身（一个像本人一样工作的 AI）会接收并回答团队的请求，只把该本人决定的事交给本人。",
    accountInstead: "或者在团队服务器上创建账号",
    accountWhy:
      "有了账号，你可以在这里登录，看看办公室里有谁，并用你的名字连接你的电脑。",
    name: "你的名字",
    email: "邮箱",
    password: "密码（至少 8 位）",
    create: "创建我的账号",
    haveAccount: "已经有账号了？",
    signInLink: "登录",
    keep: "这个链接只给一个人用：只能用一次，一周内有效。",
    signInTitle: "登录你的办公室",
    signIn: "登录",
    noAccount: "还没有账号？打开你们办公室的邀请链接来创建。",
    hello: "{name}，你好",
    yourOffice: "你的办公室",
    connectTitle: "连接你的电脑",
    connectWhat:
      "你的分身在你的电脑上运行：它从那里的 AI 记录中学习，用你自己的 AI 思考，用你的文件工作。请在那台电脑的终端里运行一次这行命令（需要 Node.js 22.13 或更高版本，可从 nodejs.org 获取）：",
    makeCommand: "生成我的连接命令",
    commandNote:
      "只能用一次，10 分钟内有效；随时可以重新生成。连接另一台电脑，会把你的分身移到那台电脑上。",
    connected: "已连接：{name}的分身，最近在线 {when}。",
    notConnected: "还没有连接任何电脑。",
    inviteTeam: "邀请同事",
    inviteWhat: "每个链接只给一个人用：只能用一次，{days} 天内有效。",
    accountMade:
      "已经用这个邀请创建过账号了。请登录那个账号，或者要一个新的邀请。",
    welcome:
      "你已成为这台服务器的管理员。大家用邮箱和密码登录；Google 登录可在下方按需开启。然后在你的页面邀请团队。",
    adminLinkEnded:
      "它已被使用，或者已经过了一天。运行服务器的人可以在服务器重新启动后的日志里，或在打开这个办公室的应用里（设置 › 办公室 › 打开团队服务器）拿到新链接。",
    adminLinkEndedTitle: "这个设置链接已结束",
    setupButton: "创建我的管理员账号",
    setupWhat:
      "你将成为它的管理员：决定大家如何登录，并邀请你的团队。请在这里创建你的账号。这个链接只能用一次。",
    setupTitle: "设置这台团队服务器",
    inviteHalfAccount: "账号已创建 · 分身尚未加入",
    inviteHalfClone: "分身已加入 · 尚未创建账号",
    inviteFrom: "{by} 创建 · {when}",
    invitesTitle: "仍可使用的邀请",
    inviteMade: "把它发给一个人：",
    inviteMake: "生成邀请链接",
    signOut: "退出登录",
    tabHome: "首页",
    pairTitle: "把这个浏览器和你的分身配对",
    pairWhat:
      "为了只有你能和分身对话，每个浏览器都要配对一次。你的电脑会请你确认这个代码：",
    pairStart: "配对这个浏览器",
    pairWaiting: "请在电脑上的 Clone Office（或手机上）确认…",
    pairSecure:
      "和分身对话需要通过 https 打开此页面。请让团队服务器的管理者提供 https 地址。",
    chatScript: "在这里和分身对话需要开启 JavaScript。",
    chatUnpaired:
      "这个浏览器还没有配对，所以分身没有执行。请先配对，再发送一次。",
    chatBusy: "分身还在处理你之前发的话。等它回答后再发送一次。",
    chatNews: "分身回答了。",
    chatAnswered: "已回答。",
    suggest1: "今天有什么在等我？",
    suggest2: "我昨天做到哪儿了？",
    suggest3: "整理一下还没结束的请求",
    tabClone: "我的分身",
    tabRequests: "请求",
    tabOffice: "办公室",
    menuLabel: "我的菜单",
    accountTitle: "我的账户",
    computerOn: "你的分身在你的电脑上开着",
    computerOff: "你的电脑已关机或休眠。在这里写的话会等它回来后再送达。",
    chatOff:
      "从这里和分身对话的功能已关闭。请在你电脑上的 Clone Office › 设置 › 办公室 › 在团队服务器上对话 中打开。",
    chatPlaceholder: "对你的分身说…",
    chatSend: "发送",
    chatEmpty: "像在电脑前一样问分身任何事。它会在那台电脑上回答。",
    chatWorking: "分身正在回答…",
    chatWaiting: "正在等你的电脑…",
    cloneLabel: "我的分身",
    toDecide: "待决定",
    askSettled: "已在你的电脑上回答",
    askChosen: "已回答：{choice}",
    chatKept: "这里只保留一天，完整的对话在你的电脑上。",
    chatRefresh: "刷新就能看到回答。",
    chatFailed: "分身这次没能回答。再试一次，或在你的电脑上查看。",
    chatLimit: "AI 套餐的用量已达上限。稍后再试，或在你的电脑上换一个模型。",
    noCloneTitle: "你还没有分身",
    noCloneWhat:
      "分身在你的电脑上运行。连接后，你可以在这里和它对话，它也会替你回答同事。",
    connectCta: "连接你的电脑",
    webCta: "不用电脑，在网页上参与",
    onWebTitle: "你正在网页上参与",
    onWebWhat:
      "同事的分身会在这里问你，你在“请求”里回答。连接电脑后，你的分身会接手。",
    moveComputer: "连接另一台电脑",
    connectHow:
      "请在那台电脑的终端里运行一次这行命令（需要 Node.js 22.13 或更高版本，可从 nodejs.org 获取）：",
    officeTitle: "办公室",
    officeDrawingOff: "办公室的画面需要开启 JavaScript。",
    runTitle: "在你的电脑上运行这个",
    runWhat: "这个链接会把一台电脑连接到你的办公室。请在那台电脑的终端里运行：",
    people: "这个办公室的成员",
    peopleOwner: "作为所有者，你决定谁能留在办公室，也可以把其他人设为所有者。",
    owner: "所有者",
    member: "成员",
    you: "你",
    cloneIn: "分身已连接 · 最近在线 {when}",
    cloneOut: "还没有连接电脑",
    remove: "移除",
    removeTitle: "把{name}移出这个办公室？",
    removeWhat:
      "对方的分身会立刻停止在这里工作，对方也不能再生成连接命令。对方提过和回答过的请求会保留。",
    makeOwner: "设为所有者",
    ownerTitle: "把{name}设为所有者？",
    ownerWhat:
      "所有者决定谁能留在办公室、给办公室改名、生成新的邀请链接。你也仍然是所有者。",
    keyed: "通过链接加入的分身",
    keyedWhat: "这些分身是有人在应用里用邀请链接加入的，没有在这里创建账号。",
    cloneTitle: "把{name}的分身移出这个办公室？",
    cloneWhat: "它会立刻停止在这里工作。它提过和回答过的请求会保留。",
    newLink: "更换共用的邀请链接",
    newLinkTitle: "要更换办公室密钥吗？",
    newLinkWhat:
      "用办公室密钥生成的链接将无法再使用。邀请链接和已经加入的人不受影响。",
    officeName: "办公室名称",
    save: "保存",
    cancel: "取消",
    continueGoogle: "使用 Google 账号继续",
    orWord: "或",
    waysTitle: "你的登录方式",
    waysPassword: "邮箱和密码",
    waysGoogle: "Google",
    connectGoogle: "关联 Google",
    connectGoogleWhat: "也可以用你的 Google 账号登录。",
    inUse: "使用中",
    linked: "已关联",
    adminLink: "团队服务器的登录设置",
    adminTitle: "登录设置",
    adminWhat:
      "大家登录团队服务器的方式。它适用于上面的每个办公室，并且始终至少保留一种方式。",
    backHome: "回到我的页面",
    saved: "已保存。",
    stateOn: "已开启",
    stateOff: "已关闭",
    stateUnset: "未设置",
    turnOn: "开启",
    turnOff: "关闭",
    methodPasswordWhat: "用邮箱和密码创建账号并登录。",
    methodGoogleWhat: "用 Google 账号登录。新账号仍然需要办公室的邀请链接。",
    passwordOnly: "{count} 人只用密码登录。",
    googleOnly: "{count} 人只用 Google 登录。",
    linkFirst:
      "关闭前，请先在你的页面关联你自己的 Google 账号，这样你仍然可以登录。",
    googleSetup: "设置 Google 登录",
    googleChange: "更换 Google 客户端",
    step1:
      "在 Google Cloud Console 中打开“API 和服务”›“凭据”，为 Web 应用创建一个 OAuth 客户端 ID。",
    consoleLink: "打开 Google Cloud Console",
    step2: "把这个地址添加为“已获授权的重定向 URI”：",
    step3: "把 Google 显示的客户端 ID 和客户端密钥粘贴到这里。",
    httpsNote:
      "Google 只会把人送回 https 地址或 localhost。请把这台服务器放在 https 之后，并把 RELAY_PUBLIC_URL 设为那个地址。",
    clientId: "客户端 ID",
    clientSecret: "客户端密钥",
    secretNew: "它会在这台服务器上加密保存，之后不再显示。",
    secretKeep: "留空则继续使用已保存的密钥。",
    savedBy: "由 {name} 于 {when} 设置。",
    saveGoogle: "保存并开启",
    removeGoogle: "删除 Google 设置",
    sealingOff:
      "要保存 Google 密钥，这台服务器需要一个加密密钥：设置 RELAY_ENCRYPTION_KEY（openssl rand -base64 32）后重启。",
    googleRemoveTitle: "删除 Google 设置？",
    googleRemoveWhat:
      "客户端 ID 和加密保存的密钥会从团队服务器上删除。重新设置 Google 时需要再次填写两者。",
    passwordOffTitle: "关闭邮箱和密码登录？",
    passwordOffWhat: "关闭期间，大家只能用 Google 登录。你随时可以重新开启。",
    passwordPlain: "密码",
    forgot: "忘记密码了？请向团队服务器的管理员要一个重置链接。",
    noAccountInvite: "还没有账号？",
    makeFromInvite: "用办公室的邀请创建",
    passwordOnlyOne: "1 人只用密码登录。",
    googleOnlyOne: "1 人只用 Google 登录。",
    lockedGoogle: "只用 Google 登录的 {count} 人在关闭期间无法登录。",
    lockedGoogleOne: "只用 Google 登录的 1 人在关闭期间无法登录。",
    lockedPassword: "只用密码登录的 {count} 人在关闭期间无法登录。",
    lockedPasswordOne: "只用密码登录的 1 人在关闭期间无法登录。",
    googleOffTitle: "关闭 Google 登录？",
    googleOffWhat: "设置会保留，你随时可以重新开启。",
    serverPeople: "团队服务器上的成员",
    serverPeopleWhat:
      "这里有账号的所有人。有人忘记密码时，由你为他生成重置链接。",
    resetLink: "重置链接",
    resetTitle: "为{name}生成密码重置链接？",
    resetWhat:
      "你会得到一个链接，由你自己发给对方。它只能用一次，1 小时内有效，使用后对方会在所有地方退出登录。",
    resetMadeTitle: "{name}的重置链接",
    resetMadeWhat: "请把这个链接亲自发给{name}。只能用一次，1 小时内有效：",
    newPassword: "新密码（至少 8 位）",
    setPassword: "保存新密码",
    adminMade: "这台服务器已经设置好了。请登录。",
    resetDone: "密码已更改。请用新密码登录。",
    joinTitle: "也加入{office}吗？",
    joinWhat: "你正以{name}的身份登录。{office}的成员会看到你的名字和邮箱。",
    join: "加入",
    removeAccount: "删除账号",
    removeAccountTitle: "删除{name}的账号？",
    removeAccountWhat:
      "对方的账号会从团队服务器上删除：无法再登录，其分身也会在这里的每个办公室停止。提过和回答过的请求会保留，对方可以用邀请重新创建账号。",
    thatOffice: "这个办公室",
    yourOffices: "你加入的办公室",
    showing: "当前",
    notYou: "不是{name}？",
    joinFrom: "{from}邀请了你。",
    resetMake: "生成链接",
    newPasswordFor: "为{name}设置新密码",
    resetOpen:
      "{name}于 {when} 为你的密码生成了重置链接。它还可以用一次，剩余 {minutes} 分钟。如果不是你请求的，请停用它。",
    resetOpenOne:
      "{name}于 {when} 为你的密码生成了重置链接。它还可以用一次，剩余 1 分钟。如果不是你请求的，请停用它。",
    passwordOffBlocked: "现在还不能关闭密码登录",
    resetStop: "停用链接",
    resetStopped: "{name}于 {when} 生成的密码重置链接已被你停用。",
    resetEnded: "{name}于 {when} 生成的密码重置链接没有被使用，已经失效。",
    stoppedDone: "已停用。那个链接不能再更改你的密码。",
    connectTitleTo: "把你的电脑连接到 {office}",
    resetDeadTitle: "这个链接已经不能用了",
    resetDeadWhat:
      "它已被使用、被停用或已过期。请向团队服务器的管理员要一个新的。",
    passwordBack: "已保存。邮箱和密码登录已对所有人重新开启。",
    adminsOnlyNote: "目前只有这台服务器的管理员可以用密码登录。",
    resetMadeTold: "对方的页面会显示是你生成的，对方也可以停用它。",
    errors: {
      "too-many": "一次发得太多了。等分身回答后再发。",
      "web-chat-unpaired": "这个浏览器还没有和分身配对。请先配对。",
      "web-chat-off":
        "从这里和分身对话的功能已关闭。请在电脑上的 Clone Office 里打开。",
      "no-clone": "没有可以对话的分身：请先连接你的电脑。",
      "too-long": "内容太长，无法一次发送。",
      "text-missing": "请先写点内容。",
      "not-on-web": "这些由你电脑上的分身回答。",
      "invite-used": "已经用这个邀请创建过账号了。请要一个新的邀请。",
      "admin-link-ended": "这个设置链接已结束。",
      "too-many-invites": "仍可使用的邀请太多了。请先取消一些。",
      "too-many-invites-mine":
        "你还有 10 个可用的邀请。有人用掉一个或满一周后，就能再发。",
      "invite-wrong": "没有这个邀请。",
      "name-missing": "请填写你的名字。",
      "account-exists": "这个邮箱已经有账号了：请直接登录。",
      "password-short": "密码至少需要 8 位。",
      "password-long": "这个密码太长了。",
      "email-wrong": "这个邮箱看起来不对。",
      "sign-in-wrong": "邮箱或密码不对。",
      "too-many-tries": "尝试次数太多。请等几分钟再试。",
      "not-in-office": "你不在这个办公室里。",
      "account-failed": "没有成功。请重试。",
      "not-owner": "只有这个办公室的所有者才能这样做。",
      "not-yourself": "你不能移除自己。",
      "password-off": "这台服务器已关闭密码登录。请改用 Google 登录。",
      "google-off": "这台服务器已关闭 Google 登录。",
      "google-not-linked":
        "这个邮箱的账号用密码登录。请先用密码登录，再在你的页面关联 Google。",
      "google-no-account":
        "这里还没有使用这个 Google 账号的账号。请打开办公室的邀请链接来创建。",
      "google-cancelled": "已取消 Google 登录。",
      "google-other":
        "这个 Google 账号已关联到这里的另一个账号，或者它的邮箱和这个账号不同。",
      "google-unverified": "Google 尚未验证这个账号的邮箱。",
      "google-again": "时间太久了。请重试。",
      "google-failed": "Google 登录没有成功。请重试。",
      "not-admin": "只有这台服务器的管理员才能更改登录方式。",
      "google-first": "请先开启 Google 登录，这样大家仍然可以登录。",
      "link-google-first": "请先关联你自己的 Google 账号，这样你仍然可以登录。",
      "password-first": "请先开启邮箱和密码登录，这样大家仍然可以登录。",
      "sealing-off":
        "这台服务器没有用来加密密钥的密钥。请设置 RELAY_ENCRYPTION_KEY 后重启。",
      "google-id-wrong":
        "这不是 Google 客户端 ID：客户端 ID 以 .apps.googleusercontent.com 结尾。",
      "google-secret-missing": "也请粘贴客户端密钥。",
      "google-secret-wrong": "这看起来不像客户端密钥。",
      "google-not-set": "请先设置 Google 登录。",
      "google-unreadable":
        "已保存的密钥无法用这台服务器的密钥打开。请重新粘贴。",
      "reset-expired":
        "这个链接已经不能用了。请向团队服务器的管理员要一个新的。",
      "no-password": "这个人用 Google 登录，没有可重置的密码。",
      "last-owner":
        "对方是这里某个办公室唯一的所有者。请先把别人设为那个办公室的所有者。",
      "not-yours":
        "这个账号在你不是所有者的办公室里：由那个办公室的所有者负责。",
      "has-google": "这个人用 Google 登录，不需要重置链接。",
      "owner-reset": "办公室所有者的账号不能由别人生成重置链接。",
      "public-url-needed":
        "通过 https 使用 Google 需要这台服务器的公开地址：把 RELAY_PUBLIC_URL 设为该地址并重启服务器。",
    },
  },
  ja: {
    inviteTitle: "{from}さんからオフィスへの招待が届いています",
    onWebPerson: "Webで参加（コンピューター未接続）",
    answerFrom: "{name}さんの回答",
    answerFromClone: "{name}さんのクローンの回答",
    requestsWaiting: "依頼 · {count}件待ち",
    inviteFor: "誰に送るか（任意）",
    inviteOnce: "今コピーしてください。表示は一度だけです。",
    webTitle: "コンピューターをつないでいませんか？",
    webWhat:
      "ここから参加できます。同僚のクローンから聞かれたらこのページで答え、ここから同僚に依頼もできます。あとでコンピューターをつなぐと、あなたのクローンが引き継ぎます。",
    webJoin: "Webで参加する",
    requestsLink: "依頼",
    requestsTitle: "依頼",
    askedOfYou: "あなたへの依頼",
    askedNone: "待っている依頼はありません。",
    youAsked: "あなたが出した依頼",
    youAskedNone: "まだ誰にも依頼していません。",
    askTitle: "同僚に依頼する",
    askTo: "宛先",
    askPick: "同僚を選んでください",
    askText: "必要なこと",
    askSend: "送信",
    answerLabel: "あなたの回答",
    answerSend: "回答を送る",
    fromWho: "{name}さんからの依頼",
    toWho: "{name}さんへ",
    stateWaiting: "あなたの答え待ち",
    stateCloneOn: "クローンが対応中",
    stateAwaiting: "答え待ち",
    stateAnswered: "回答あり",
    stateYouAnswered: "回答済み",
    stateCloneAnswered: "クローンが回答済み",
    stateClosed: "終了",
    cloneHandles:
      "あなたへの依頼は、あなたのコンピューターのクローンが答えます。クローンがあなたに聞きたいことは、アプリかスマートフォンに届きます。",
    refresh: "再読み込み",
    askSent: "送信しました。回答が来たらここに表示されます。",
    answerSent: "回答を送りました。",
    onWeb: "Web",
    noColleagues: "このオフィスにはまだ他の人がいません。",
    inviteTitleNobody: "オフィスに招待されています",
    what: "このオフィスでは、一人ひとりのクローン（本人のように働くAI）がチームの依頼を受けて答え、本人が決めるべきことだけを本人に届けます。",
    accountInstead: "または、チームのサーバーでアカウントを作る",
    accountWhy:
      "アカウントがあれば、ここにサインインしてオフィスに誰がいるかを確認し、あなたの名前でコンピューターをつなげます。",
    name: "名前",
    email: "メールアドレス",
    password: "パスワード（8文字以上）",
    create: "アカウントを作成",
    haveAccount: "アカウントをお持ちですか？",
    signInLink: "サインイン",
    keep: "このリンクは一人用です。1回だけ、1週間使えます。",
    signInTitle: "オフィスにサインイン",
    signIn: "サインイン",
    noAccount:
      "まだアカウントがない場合は、オフィスの招待リンクを開いて作成してください。",
    hello: "{name}さん、こんにちは",
    yourOffice: "あなたのオフィス",
    connectTitle: "コンピューターをつなぐ",
    connectWhat:
      "クローンはあなたのコンピューターで動きます。そこにあるAIの記録から学び、あなた自身のAIで考え、あなたのファイルで作業します。そのコンピューターのターミナルで、これを一度実行してください（Node.js 22.13以降が必要です。nodejs.orgから入手できます）：",
    makeCommand: "接続コマンドを作成",
    commandNote:
      "1回だけ、10分間有効です。いつでも作り直せます。別のコンピューターをつなぐと、クローンはそちらに移ります。",
    connected: "接続済み：{name}さんのクローン、最終オンライン {when}。",
    notConnected: "まだコンピューターがつながっていません。",
    inviteTeam: "チームメイトを招待",
    inviteWhat: "リンクは一人用です。1回だけ、{days}日間使えます。",
    accountMade:
      "この招待ですでにアカウントが作られています。そのアカウントでサインインするか、新しい招待をもらってください。",
    welcome:
      "このサーバーの管理者になりました。みんなはメールとパスワードでサインインします。Google は下で必要なときにオンにできます。次に、あなたのページからチームを招待しましょう。",
    adminLinkEnded:
      "すでに使われたか、1日が過ぎました。サーバーを動かしている人は、サーバーを再起動したときのログか、オフィスを開いたアプリ（設定 › オフィス › チームサーバーを開く）から新しいリンクを受け取れます。",
    adminLinkEndedTitle: "この設定リンクは終了しています",
    setupButton: "管理者アカウントを作る",
    setupWhat:
      "あなたがこのサーバーの管理者になります。サインイン方法を決め、チームを招待します。ここでアカウントを作ってください。このリンクは1回だけ使えます。",
    setupTitle: "このチームサーバーを設定する",
    inviteHalfAccount: "アカウント作成済み · クローンはまだ",
    inviteHalfClone: "クローン参加済み · アカウントはまだ",
    inviteFrom: "{by}さんが作成 · {when}",
    invitesTitle: "まだ使える招待",
    inviteMade: "一人に送ってください：",
    inviteMake: "招待リンクを作る",
    signOut: "サインアウト",
    tabHome: "ホーム",
    pairTitle: "このブラウザをクローンとペアにしてください",
    pairWhat:
      "あなただけがクローンと話せるように、ブラウザごとに一度ペアにします。コンピューターがこのコードの確認を求めます：",
    pairStart: "このブラウザをペアにする",
    pairWaiting:
      "コンピューターの Clone Office（またはスマホ）で確認してください…",
    pairSecure:
      "クローンと話すには、このページを https で開く必要があります。チームサーバーの管理者に https のアドレスを頼んでください。",
    chatScript: "ここでクローンと話すには JavaScript が必要です。",
    chatUnpaired:
      "このブラウザはペアになっていないため、クローンは実行しませんでした。ペアにしてから、もう一度送ってください。",
    chatBusy:
      "クローンはまだ前のメッセージに取り組んでいます。答えが来てから、もう一度送ってください。",
    chatNews: "クローンが答えました。",
    chatAnswered: "答えました。",
    suggest1: "今日、私を待っているものは？",
    suggest2: "昨日はどこまでやった？",
    suggest3: "まだ終わっていない依頼をまとめて",
    tabClone: "自分のクローン",
    tabRequests: "依頼",
    tabOffice: "オフィス",
    menuLabel: "メニュー",
    accountTitle: "アカウント",
    computerOn: "クローンはあなたのコンピューターで起動中です",
    computerOff:
      "コンピューターがオフかスリープ中です。ここに書いたことは、戻ったときに届きます。",
    chatOff:
      "ここからクローンと話す機能はオフです。コンピューターの Clone Office ›「設定」›「オフィス」›「チームサーバーから話す」でオンにしてください。",
    chatPlaceholder: "クローンに話しかける",
    chatSend: "送信",
    chatEmpty:
      "コンピューターの前と同じように、何でも話しかけてください。クローンがそのコンピューターで答えます。",
    chatWorking: "クローンが答えています…",
    chatWaiting: "コンピューターを待っています…",
    cloneLabel: "自分のクローン",
    toDecide: "決めること",
    askSettled: "コンピューターで答えました",
    askChosen: "答えました：{choice}",
    chatKept: "ここには1日だけ残ります。会話の全体はコンピューターにあります。",
    chatRefresh: "再読み込みすると答えが見えます。",
    chatFailed:
      "今回はクローンが答えられませんでした。もう一度試すか、コンピューターで確認してください。",
    chatLimit:
      "AIプランの利用上限に達しました。しばらくしてから試すか、コンピューターで別のモデルを選んでください。",
    noCloneTitle: "まだクローンがいません",
    noCloneWhat:
      "クローンはあなたのコンピューターで動きます。つなぐと、ここでクローンと話せて、クローンが同僚に代わりに答えます。",
    connectCta: "コンピューターをつなぐ",
    webCta: "コンピューターなしでウェブから参加",
    onWebTitle: "ウェブから参加しています",
    onWebWhat:
      "同僚のクローンがここであなたに尋ね、あなたは「依頼」で答えます。コンピューターをつなぐと、クローンが引き継ぎます。",
    moveComputer: "別のコンピューターをつなぐ",
    connectHow:
      "そのコンピューターのターミナルで、これを一度実行してください（Node.js 22.13以降が必要です。nodejs.orgから入手できます）：",
    officeTitle: "オフィス",
    officeDrawingOff: "オフィスの絵を見るには JavaScript が必要です。",
    runTitle: "コンピューターでこれを実行",
    runWhat:
      "このリンクは、コンピューターをあなたのオフィスにつなぎます。そのコンピューターのターミナルで実行してください：",
    people: "このオフィスのメンバー",
    peopleOwner:
      "オーナーとして、誰がオフィスにいるかを決められ、ほかの人をオーナーにすることもできます。",
    owner: "オーナー",
    member: "メンバー",
    you: "あなた",
    cloneIn: "クローン接続済み · 最終オンライン {when}",
    cloneOut: "まだコンピューターがつながっていません",
    remove: "外す",
    removeTitle: "{name}さんをこのオフィスから外しますか？",
    removeWhat:
      "その人のクローンはすぐにここで動かなくなり、新しい接続コマンドも作れなくなります。やりとりした依頼は残ります。",
    makeOwner: "オーナーにする",
    ownerTitle: "{name}さんをオーナーにしますか？",
    ownerWhat:
      "オーナーは、誰がオフィスにいるかを決め、オフィスの名前を変え、新しい招待リンクを作れます。あなたも引き続きオーナーです。",
    keyed: "リンクで参加したクローン",
    keyedWhat:
      "ここでアカウントを作らず、誰かのアプリから招待リンクで参加したクローンです。",
    cloneTitle: "{name}さんのクローンをこのオフィスから外しますか？",
    cloneWhat: "すぐにここで動かなくなります。やりとりした依頼は残ります。",
    newLink: "共用の招待リンクを作り直す",
    newLinkTitle: "オフィスキーを変えますか？",
    newLinkWhat:
      "オフィスキーで作ったリンクは使えなくなります。招待リンクと、すでに参加している人はそのままです。",
    officeName: "オフィス名",
    save: "保存",
    cancel: "キャンセル",
    continueGoogle: "Google で続行",
    orWord: "または",
    waysTitle: "サインインの方法",
    waysPassword: "メールアドレスとパスワード",
    waysGoogle: "Google",
    connectGoogle: "Google をつなぐ",
    connectGoogleWhat: "Google アカウントでもサインインできるようになります。",
    inUse: "使用中",
    linked: "接続済み",
    adminLink: "チームのサーバーのサインイン設定",
    adminTitle: "サインイン設定",
    adminWhat:
      "チームのサーバーへのサインイン方法です。そこにあるすべてのオフィスに適用され、少なくとも一つは常にオンのままです。",
    backHome: "自分のページに戻る",
    saved: "保存しました。",
    stateOn: "オン",
    stateOff: "オフ",
    stateUnset: "未設定",
    turnOn: "オンにする",
    turnOff: "オフにする",
    methodPasswordWhat:
      "メールアドレスとパスワードでアカウントを作り、サインインします。",
    methodGoogleWhat:
      "Google アカウントでサインインします。新しいアカウントには、引き続きオフィスの招待リンクが必要です。",
    passwordOnly: "パスワードだけでサインインする人：{count}人",
    googleOnly: "Google だけでサインインする人：{count}人",
    linkFirst:
      "オフにする前に、自分のページで自分の Google アカウントをつないでください。そうすればあなたも引き続きサインインできます。",
    googleSetup: "Google サインインを設定",
    googleChange: "Google クライアントを変更",
    step1:
      "Google Cloud Console で「API とサービス」›「認証情報」を開き、ウェブ アプリケーションの OAuth クライアント ID を作成します。",
    consoleLink: "Google Cloud Console を開く",
    step2: "このアドレスを「承認済みのリダイレクト URI」に追加します：",
    step3:
      "Google に表示されたクライアント ID とクライアント シークレットをここに貼り付けます。",
    httpsNote:
      "Google は https のアドレス（または localhost）にしか戻しません。このサーバーを https の後ろに置き、RELAY_PUBLIC_URL にそのアドレスを設定してください。",
    clientId: "クライアント ID",
    clientSecret: "クライアント シークレット",
    secretNew: "このサーバーに暗号化して保存され、二度と表示されません。",
    secretKeep: "空のままにすると、保存済みのシークレットをそのまま使います。",
    savedBy: "{when}に{name}さんが設定しました。",
    saveGoogle: "保存してオンにする",
    removeGoogle: "Google の設定を削除",
    sealingOff:
      "Google のシークレットを保存するには、このサーバーに暗号化キーが必要です。RELAY_ENCRYPTION_KEY（openssl rand -base64 32）を設定して再起動してください。",
    googleRemoveTitle: "Google の設定を削除しますか？",
    googleRemoveWhat:
      "クライアント ID と暗号化したシークレットがチームのサーバーから削除されます。Google を設定し直すには、両方をもう一度入力します。",
    passwordOffTitle:
      "メールアドレスとパスワードのサインインをオフにしますか？",
    passwordOffWhat:
      "オフの間は、Google でしかサインインできません。いつでもオンに戻せます。",
    passwordPlain: "パスワード",
    forgot:
      "パスワードを忘れた場合は、チームのサーバーの管理者にリセット用リンクをもらってください。",
    noAccountInvite: "まだアカウントがない場合は",
    makeFromInvite: "オフィスの招待で作成",
    passwordOnlyOne: "パスワードだけでサインインする人：1人",
    googleOnlyOne: "Google だけでサインインする人：1人",
    lockedGoogle:
      "Google だけでサインインする{count}人は、オフの間サインインできません。",
    lockedGoogleOne:
      "Google だけでサインインする1人は、オフの間サインインできません。",
    lockedPassword:
      "パスワードだけでサインインする{count}人は、オフの間サインインできません。",
    lockedPasswordOne:
      "パスワードだけでサインインする1人は、オフの間サインインできません。",
    googleOffTitle: "Google のサインインをオフにしますか？",
    googleOffWhat: "設定はそのまま残り、いつでもオンに戻せます。",
    serverPeople: "チームのサーバーのメンバー",
    serverPeopleWhat:
      "ここにアカウントがある全員です。パスワードを忘れた人には、あなたがリセット用リンクを作って渡します。",
    resetLink: "リセット用リンク",
    resetTitle: "{name}さんのパスワードのリセット用リンクを作りますか？",
    resetWhat:
      "リンクができたら、あなたから本人に送ってください。1回だけ、1時間有効で、使うと本人はすべての場所でサインアウトします。",
    resetMadeTitle: "{name}さんのリセット用リンク",
    resetMadeWhat:
      "このリンクを{name}さんに直接送ってください。1回だけ、1時間有効です：",
    newPassword: "新しいパスワード（8文字以上）",
    setPassword: "新しいパスワードを保存",
    adminMade: "このサーバーはすでに設定済みです。サインインしてください。",
    resetDone:
      "パスワードを変更しました。新しいパスワードでサインインしてください。",
    joinTitle: "{office}にも参加しますか？",
    joinWhat:
      "{name}としてサインインしています。{office}のメンバーにあなたの名前とメールアドレスが表示されます。",
    join: "参加する",
    removeAccount: "アカウントを削除",
    removeAccountTitle: "{name}さんのアカウントを削除しますか？",
    removeAccountWhat:
      "その人のアカウントがチームのサーバーから削除されます。サインインできなくなり、ここにあるすべてのオフィスでクローンが止まります。やりとりした依頼は残り、招待から新しいアカウントを作れます。",
    thatOffice: "このオフィス",
    yourOffices: "参加しているオフィス",
    showing: "表示中",
    notYou: "{name}さんではありませんか？",
    joinFrom: "{from}さんが招待しました。",
    resetMake: "リンクを作る",
    newPasswordFor: "{name}さんの新しいパスワード",
    resetOpen:
      "{when}に{name}さんがあなたのパスワードのリセット用リンクを作りました。あと{minutes}分、一度だけ使えます。頼んでいない場合は止めてください。",
    resetOpenOne:
      "{when}に{name}さんがあなたのパスワードのリセット用リンクを作りました。あと1分、一度だけ使えます。頼んでいない場合は止めてください。",
    passwordOffBlocked: "まだパスワードをオフにできません",
    resetStop: "リンクを止める",
    resetStopped:
      "{when}に{name}さんが作ったパスワードのリセット用リンクを止めました。",
    resetEnded:
      "{when}に{name}さんが作ったパスワードのリセット用リンクは、使われずに終わりました。",
    stoppedDone: "止めました。そのリンクではもうパスワードを変えられません。",
    connectTitleTo: "コンピューターを{office}につなぐ",
    resetDeadTitle: "このリンクはもう使えません",
    resetDeadWhat:
      "使用済みか、止められたか、期限切れです。チームサーバーの管理者に新しいリンクをもらってください。",
    passwordBack:
      "保存しました。メールとパスワードでのサインインも全員に再びオンになりました。",
    adminsOnlyNote:
      "今はこのサーバーの管理者だけがパスワードでサインインできます。",
    resetMadeTold:
      "作ったことは相手のページにも表示され、相手はリンクを止められます。",
    errors: {
      "too-many":
        "一度に送りすぎです。クローンの答えを待ってから送ってください。",
      "web-chat-unpaired":
        "このブラウザはまだクローンとペアになっていません。先にペアにしてください。",
      "web-chat-off":
        "ここからクローンと話す機能はオフです。コンピューターの Clone Office でオンにしてください。",
      "no-clone":
        "話せるクローンがいません。先にコンピューターをつないでください。",
      "too-long": "一度に送るには長すぎます。",
      "text-missing": "先に内容を書いてください。",
      "not-on-web": "これはあなたのコンピューターのクローンが答えます。",
      "invite-used":
        "この招待ですでにアカウントが作られています。新しい招待をもらってください。",
      "admin-link-ended": "この設定リンクは終了しています。",
      "too-many-invites":
        "まだ使える招待が多すぎます。先にいくつか取り消してください。",
      "too-many-invites-mine":
        "まだ使える招待が 10 件あります。誰かが 1 件使うか、1 週間たつと、また作れます。",
      "invite-wrong": "その招待は存在しません。",
      "name-missing": "名前を入力してください。",
      "account-exists":
        "そのメールアドレスのアカウントはすでにあります。サインインしてください。",
      "password-short": "パスワードは8文字以上にしてください。",
      "password-long": "パスワードが長すぎます。",
      "email-wrong": "メールアドレスが正しくないようです。",
      "sign-in-wrong": "メールアドレスかパスワードが違います。",
      "too-many-tries":
        "試行回数が多すぎます。数分待ってからもう一度お試しください。",
      "not-in-office": "このオフィスに参加していません。",
      "account-failed": "うまくいきませんでした。もう一度お試しください。",
      "not-owner": "このオフィスのオーナーだけができる操作です。",
      "not-yourself": "自分自身は外せません。",
      "password-off":
        "このサーバーではパスワードでのサインインがオフになっています。Google でサインインしてください。",
      "google-off":
        "このサーバーでは Google でのサインインがオフになっています。",
      "google-not-linked":
        "そのメールアドレスのアカウントはパスワードでサインインします。パスワードでサインインしてから、自分のページで Google をつないでください。",
      "google-no-account":
        "その Google アカウントを使うアカウントはまだありません。オフィスの招待リンクを開いて作成してください。",
      "google-cancelled": "Google でのサインインがキャンセルされました。",
      "google-other":
        "その Google アカウントはここの別のアカウントにつながっているか、メールアドレスがこのアカウントと違います。",
      "google-unverified":
        "Google がそのアカウントのメールアドレスを確認していません。",
      "google-again": "時間がかかりすぎました。もう一度お試しください。",
      "google-failed":
        "Google でサインインできませんでした。もう一度お試しください。",
      "not-admin":
        "サインイン方法を変更できるのは、このサーバーの管理者だけです。",
      "google-first":
        "先に Google のサインインをオンにしてください。そうすればみんな引き続きサインインできます。",
      "link-google-first":
        "先に自分の Google アカウントをつないでください。そうすればあなたも引き続きサインインできます。",
      "password-first":
        "先にメールアドレスとパスワードのサインインをオンにしてください。そうすればみんな引き続きサインインできます。",
      "sealing-off":
        "このサーバーにはシークレットを暗号化するキーがありません。RELAY_ENCRYPTION_KEY を設定して再起動してください。",
      "google-id-wrong":
        "Google のクライアント ID ではありません。クライアント ID は .apps.googleusercontent.com で終わります。",
      "google-secret-missing":
        "クライアント シークレットも貼り付けてください。",
      "google-secret-wrong": "クライアント シークレットではないようです。",
      "google-not-set": "先に Google のサインインを設定してください。",
      "google-unreadable":
        "保存済みのシークレットを、このサーバーのキーで開けません。もう一度貼り付けてください。",
      "reset-expired":
        "このリンクはもう使えません。チームサーバーの管理者に新しいリンクをもらってください。",
      "no-password":
        "その人は Google でサインインするため、リセットするパスワードがありません。",
      "last-owner":
        "その人はここにあるオフィスの唯一のオーナーです。先にほかの人をそのオフィスのオーナーにしてください。",
      "not-yours":
        "そのアカウントは、あなたがオーナーではないオフィスにいます。そのオフィスのオーナーが管理します。",
      "has-google":
        "その人は Google でサインインするので、リセット用リンクは必要ありません。",
      "owner-reset":
        "オフィスのオーナーのアカウントには、ほかの人がリセット用リンクを作れません。",
      "public-url-needed":
        "https で Google を使うには、このサーバーの公開アドレスが必要です。RELAY_PUBLIC_URL にそのアドレスを設定して、サーバーを再起動してください。",
    },
  },
  es: {
    inviteTitle: "{from} te invita a su oficina",
    onWebPerson: "En la web, sin computadora conectada",
    answerFrom: "Respuesta de {name}",
    answerFromClone: "Respuesta del clon de {name}",
    requestsWaiting: "Solicitudes · {count} en espera",
    inviteFor: "Para quién (opcional)",
    inviteOnce: "Cópialo ahora: solo se muestra una vez.",
    webTitle: "¿No tienes una computadora conectada?",
    webWhat:
      "Participa desde aquí: los clones de tus colegas pueden preguntarte, y tú respondes y les pides cosas en esta página. Si luego conectas una computadora, tu clon toma el relevo.",
    webJoin: "Participar en la web",
    requestsLink: "Solicitudes",
    requestsTitle: "Solicitudes",
    askedOfYou: "Lo que te piden",
    askedNone: "No tienes nada pendiente.",
    youAsked: "Lo que pediste",
    youAskedNone: "Aún no has pedido nada a nadie.",
    askTitle: "Pedir algo a un colega",
    askTo: "A quién",
    askPick: "Elige a un colega",
    askText: "Qué necesitas",
    askSend: "Enviar",
    answerLabel: "Tu respuesta",
    answerSend: "Enviar respuesta",
    fromWho: "{name} te pide",
    toWho: "Para {name}",
    stateWaiting: "Te espera",
    stateCloneOn: "Tu clon lo atiende",
    stateAwaiting: "Esperando respuesta",
    stateAnswered: "Respondida",
    stateYouAnswered: "Respondiste",
    stateCloneAnswered: "Tu clon respondió",
    stateClosed: "Cerrada",
    cloneHandles:
      "Tu clon responde lo que te piden desde tu computadora; lo que necesita de ti llega a la app o a tu teléfono.",
    refresh: "Actualizar",
    askSent: "Enviado. La respuesta aparecerá aquí cuando llegue.",
    answerSent: "Respuesta enviada.",
    onWeb: "en la web",
    noColleagues: "Todavía no hay nadie más en esta oficina.",
    inviteTitleNobody: "Te invitaron a una oficina",
    what: "En esta oficina, el clon de cada persona (una IA que trabaja como ella) recibe y responde las solicitudes del equipo, y a cada persona solo le trae las decisiones que le tocan.",
    accountInstead: "O crea una cuenta en el servidor del equipo",
    accountWhy:
      "Con una cuenta inicias sesión aquí, ves quién está en la oficina y conectas tu computadora con tu nombre.",
    name: "Tu nombre",
    email: "Correo electrónico",
    password: "Contraseña (8 caracteres o más)",
    create: "Crear mi cuenta",
    haveAccount: "¿Ya tienes una cuenta?",
    signInLink: "Iniciar sesión",
    keep: "Este enlace es para una persona: sirve una vez, durante una semana.",
    signInTitle: "Inicia sesión en tu oficina",
    signIn: "Iniciar sesión",
    noAccount:
      "¿Todavía no tienes cuenta? Abre el enlace de invitación de tu oficina para crear una.",
    hello: "Hola, {name}",
    yourOffice: "Tu oficina",
    connectTitle: "Conecta tu computadora",
    connectWhat:
      "Tu clon funciona en tu computadora: aprende de tus registros de IA que hay ahí, piensa con tu propia IA y trabaja con tus archivos. Ejecuta esto una vez en una terminal de esa computadora (necesita Node.js 22.13 o posterior, de nodejs.org):",
    makeCommand: "Crear mi comando de conexión",
    commandNote:
      "Funciona una sola vez, durante 10 minutos; crea uno nuevo cuando quieras. Si conectas otra computadora, tu clon se muda ahí.",
    connected: "Conectado: el clon de {name}, visto por última vez {when}.",
    notConnected: "Todavía no hay ninguna computadora conectada.",
    inviteTeam: "Invita a un colega",
    inviteWhat:
      "Cada enlace es para una persona: sirve una vez, durante {days} días.",
    accountMade:
      "Ya se creó una cuenta con esta invitación. Inicia sesión con ella o pide una invitación nueva.",
    welcome:
      "Ahora administras este servidor. La gente inicia sesión con correo y contraseña; Google es opcional, más abajo. Después, invita a tu equipo desde tu página.",
    adminLinkEnded:
      "Ya se usó o pasó un día. Quien ejecuta el servidor obtiene uno nuevo en su registro al reiniciarlo, o desde la app que abrió la oficina (Ajustes › Oficina › Abrir el servidor del equipo).",
    adminLinkEndedTitle: "Este enlace de configuración terminó",
    setupButton: "Crear mi cuenta de administración",
    setupWhat:
      "Serás quien lo administra: decides cómo inicia sesión la gente e invitas a tu equipo. Crea tu cuenta aquí. Este enlace sirve una sola vez.",
    setupTitle: "Configura este servidor del equipo",
    inviteHalfAccount: "cuenta creada · el clon aún no se ha unido",
    inviteHalfClone: "clon unido · aún sin cuenta",
    inviteFrom: "Creado por {by} · {when}",
    invitesTitle: "Invitaciones aún abiertas",
    inviteMade: "Envíalo a una sola persona:",
    inviteMake: "Crear un enlace de invitación",
    signOut: "Cerrar sesión",
    tabHome: "Inicio",
    pairTitle: "Empareja este navegador con tu clon",
    pairWhat:
      "Para que solo tú puedas hablar con tu clon, cada navegador se empareja una vez. Tu computadora te pedirá confirmar este código:",
    pairStart: "Emparejar este navegador",
    pairWaiting:
      "Confírmalo en Clone Office en tu computadora (o en tu teléfono)…",
    pairSecure:
      "Para hablar con tu clon, esta página debe abrirse por https. Pide a quien administra el servidor del equipo una dirección https.",
    chatScript: "Para hablar con tu clon aquí se necesita JavaScript.",
    chatUnpaired:
      "Este navegador no está emparejado, así que tu clon no lo hizo. Emparéjalo y vuelve a enviarlo.",
    chatBusy:
      "Tu clon sigue con lo que enviaste antes. Vuelve a enviarlo cuando responda.",
    chatNews: "Tu clon respondió.",
    chatAnswered: "Respondido.",
    suggest1: "¿Qué me espera hoy?",
    suggest2: "¿Dónde lo dejé ayer?",
    suggest3: "Resume las solicitudes aún abiertas",
    tabClone: "Mi clon",
    tabRequests: "Solicitudes",
    tabOffice: "Oficina",
    menuLabel: "Tu menú",
    accountTitle: "Tu cuenta",
    computerOn: "Tu clon está encendido en tu computadora",
    computerOff:
      "Tu computadora está apagada o en reposo. Lo que escribas aquí espera hasta que vuelva.",
    chatOff:
      "Hablar con tu clon desde aquí está desactivado. Actívalo en Clone Office en tu computadora: Configuración › Oficina › Hablar desde el servidor del equipo.",
    chatPlaceholder: "Dile algo a tu clon…",
    chatSend: "Enviar",
    chatEmpty:
      "Pídele a tu clon lo que quieras, como en tu computadora. Responde desde allí.",
    chatWorking: "Tu clon está respondiendo…",
    chatWaiting: "Esperando a tu computadora…",
    cloneLabel: "Tu clon",
    toDecide: "Por decidir",
    askSettled: "Respondido en tu computadora",
    askChosen: "Respondido: {choice}",
    chatKept:
      "Se guarda aquí un día. La conversación completa queda en tu computadora.",
    chatRefresh: "Actualiza para ver la respuesta.",
    chatFailed:
      "Tu clon no pudo responder esta vez. Inténtalo de nuevo o revísalo en tu computadora.",
    chatLimit:
      "Tu plan de IA llegó a su límite de uso. Inténtalo más tarde o elige otro modelo en tu computadora.",
    noCloneTitle: "Aún no tienes un clon",
    noCloneWhat:
      "Tu clon funciona en tu computadora. Conéctala y podrás hablar con él aquí mientras responde a tus colegas por ti.",
    connectCta: "Conectar tu computadora",
    webCta: "Participar en la web sin computadora",
    onWebTitle: "Participas en la web",
    onWebWhat:
      "Los clones de tus colegas te preguntan aquí y tú respondes en Solicitudes. Conecta una computadora y tu clon toma tu lugar.",
    moveComputer: "Conectar otra computadora",
    connectHow:
      "Ejecuta esto una vez en una terminal de esa computadora (necesita Node.js 22.13 o posterior, de nodejs.org):",
    officeTitle: "La oficina",
    officeDrawingOff: "El dibujo de la oficina necesita JavaScript.",
    runTitle: "Ejecuta esto en tu computadora",
    runWhat:
      "Este enlace conecta una computadora a tu oficina. Ejecútalo en una terminal de esa computadora:",
    people: "Personas en esta oficina",
    peopleOwner:
      "Como dueño, decides quién está dentro y también puedes hacer dueños a otros.",
    owner: "Dueño",
    member: "Miembro",
    you: "tú",
    cloneIn: "Clon conectado · visto por última vez {when}",
    cloneOut: "Todavía no hay ninguna computadora conectada",
    remove: "Quitar",
    removeTitle: "¿Quitar a {name} de esta oficina?",
    removeWhat:
      "Su clon deja de funcionar aquí de inmediato y no puede crear un nuevo comando de conexión. Lo que pidió y respondió se queda.",
    makeOwner: "Hacer dueño",
    ownerTitle: "¿Hacer dueño a {name}?",
    ownerWhat:
      "Los dueños deciden quién está en la oficina, le cambian el nombre y crean nuevos enlaces de invitación. Tú también sigues siendo dueño.",
    keyed: "Clones que se unieron con el enlace",
    keyedWhat:
      "Se unieron desde la app de alguien con el enlace de invitación, sin una cuenta aquí.",
    cloneTitle: "¿Quitar el clon de {name} de esta oficina?",
    cloneWhat:
      "Deja de funcionar aquí de inmediato. Lo que pidió y respondió se queda.",
    newLink: "Cambiar el enlace de invitación compartido",
    newLinkTitle: "¿Cambiar la clave de la oficina?",
    newLinkWhat:
      "Los enlaces hechos con la clave de la oficina dejan de funcionar. Las invitaciones y quienes ya están dentro no se ven afectados.",
    officeName: "Nombre de la oficina",
    save: "Guardar",
    cancel: "Cancelar",
    continueGoogle: "Continuar con Google",
    orWord: "o",
    waysTitle: "Cómo inicias sesión",
    waysPassword: "Correo y contraseña",
    waysGoogle: "Google",
    connectGoogle: "Conectar Google",
    connectGoogleWhat: "Inicia sesión también con tu cuenta de Google.",
    inUse: "En uso",
    linked: "Conectado",
    adminLink: "Ajustes de inicio de sesión del servidor del equipo",
    adminTitle: "Ajustes de inicio de sesión",
    adminWhat:
      "Cómo inician sesión las personas en el servidor del equipo. Se aplica a todas sus oficinas, y siempre queda al menos una forma activa.",
    backHome: "Volver a mi página",
    saved: "Guardado.",
    stateOn: "Activado",
    stateOff: "Desactivado",
    stateUnset: "Sin configurar",
    turnOn: "Activar",
    turnOff: "Desactivar",
    methodPasswordWhat:
      "Las personas crean una cuenta con su correo y una contraseña.",
    methodGoogleWhat:
      "Las personas inician sesión con su cuenta de Google. Una cuenta nueva sigue necesitando el enlace de invitación de una oficina.",
    passwordOnly: "{count} personas inician sesión solo con contraseña.",
    googleOnly: "{count} personas inician sesión solo con Google.",
    linkFirst:
      "Antes de desactivarlo, conecta tu propia cuenta de Google en tu página, para que puedas seguir iniciando sesión.",
    googleSetup: "Configurar el inicio de sesión con Google",
    googleChange: "Cambiar el cliente de Google",
    step1:
      "En Google Cloud Console, abre APIs y servicios › Credenciales y crea un ID de cliente de OAuth para una aplicación web.",
    consoleLink: "Abrir Google Cloud Console",
    step2: "Agrega esta dirección como URI de redireccionamiento autorizado:",
    step3:
      "Pega aquí el ID de cliente y el secreto del cliente que te muestra Google.",
    httpsNote:
      "Google solo devuelve a las personas a una dirección https, o a localhost. Pon este servidor detrás de https y define RELAY_PUBLIC_URL con esa dirección.",
    clientId: "ID de cliente",
    clientSecret: "Secreto del cliente",
    secretNew: "Se guarda cifrado en este servidor y no se vuelve a mostrar.",
    secretKeep: "Déjalo vacío para conservar el secreto ya guardado.",
    savedBy: "Configurado por {name} el {when}.",
    saveGoogle: "Guardar y activar",
    removeGoogle: "Eliminar los ajustes de Google",
    sealingOff:
      "Para guardar un secreto de Google, este servidor necesita una clave de cifrado: define RELAY_ENCRYPTION_KEY (openssl rand -base64 32) y reinícialo.",
    googleRemoveTitle: "¿Eliminar los ajustes de Google?",
    googleRemoveWhat:
      "El ID de cliente y su secreto cifrado se borran del servidor del equipo. Para configurar Google de nuevo hay que volver a poner ambos.",
    passwordOffTitle: "¿Desactivar el correo y la contraseña?",
    passwordOffWhat:
      "Mientras esté desactivado, solo se inicia sesión con Google. Puedes volver a activarlo cuando quieras.",
    passwordPlain: "Contraseña",
    forgot:
      "¿Olvidaste tu contraseña? Pide al administrador del servidor del equipo un enlace para restablecerla.",
    noAccountInvite: "¿Todavía no tienes cuenta?",
    makeFromInvite: "Créala con la invitación de tu oficina",
    passwordOnlyOne: "1 persona inicia sesión solo con contraseña.",
    googleOnlyOne: "1 persona inicia sesión solo con Google.",
    lockedGoogle:
      "{count} personas inician sesión solo con Google: no podrán hacerlo mientras esté desactivado.",
    lockedGoogleOne:
      "1 persona inicia sesión solo con Google: no podrá hacerlo mientras esté desactivado.",
    lockedPassword:
      "{count} personas inician sesión solo con contraseña: no podrán hacerlo mientras esté desactivado.",
    lockedPasswordOne:
      "1 persona inicia sesión solo con contraseña: no podrá hacerlo mientras esté desactivado.",
    googleOffTitle: "¿Desactivar el inicio de sesión con Google?",
    googleOffWhat:
      "Sus ajustes se conservan y puedes volver a activarlo cuando quieras.",
    serverPeople: "Personas en el servidor del equipo",
    serverPeopleWhat:
      "Todas las personas con cuenta aquí. A quien olvide su contraseña le das tú un enlace para restablecerla.",
    resetLink: "Enlace para restablecer",
    resetTitle: "¿Crear un enlace para restablecer la contraseña de {name}?",
    resetWhat:
      "Recibes un enlace para enviárselo tú. Funciona una vez, durante una hora, y al usarlo cierra su sesión en todas partes.",
    resetMadeTitle: "Enlace para restablecer de {name}",
    resetMadeWhat:
      "Envía tú mismo este enlace a {name}. Funciona una vez, durante una hora:",
    newPassword: "Contraseña nueva (8 caracteres o más)",
    setPassword: "Guardar la contraseña nueva",
    adminMade: "Este servidor ya está configurado. Inicia sesión.",
    resetDone: "Tu contraseña cambió. Inicia sesión con ella.",
    joinTitle: "¿Unirte también a {office}?",
    joinWhat:
      "Iniciaste sesión como {name}. Las personas de {office} verán tu nombre y tu correo.",
    join: "Unirme",
    removeAccount: "Eliminar cuenta",
    removeAccountTitle: "¿Eliminar la cuenta de {name}?",
    removeAccountWhat:
      "Su cuenta se borra del servidor del equipo: no puede iniciar sesión y su clon se detiene en todas las oficinas de aquí. Lo que pidió y respondió se queda, y puede crear una cuenta nueva con una invitación.",
    thatOffice: "esta oficina",
    yourOffices: "Tus oficinas",
    showing: "Mostrando",
    notYou: "¿No eres {name}?",
    joinFrom: "{from} te invitó.",
    resetMake: "Crear el enlace",
    newPasswordFor: "Una contraseña nueva para {name}",
    resetOpen:
      "El {when}, {name} creó un enlace para restablecer tu contraseña. Sirve una vez, durante {minutes} minutos más. Si no lo pediste, detenlo.",
    resetOpenOne:
      "El {when}, {name} creó un enlace para restablecer tu contraseña. Sirve una vez, durante 1 minuto más. Si no lo pediste, detenlo.",
    passwordOffBlocked: "Aún no se pueden desactivar las contraseñas",
    resetStop: "Detener el enlace",
    resetStopped:
      "El {when}, {name} creó un enlace para restablecer tu contraseña. Lo detuviste.",
    resetEnded:
      "El {when}, {name} creó un enlace para restablecer tu contraseña. Terminó sin usarse.",
    stoppedDone: "Detenido. Ese enlace ya no puede cambiar tu contraseña.",
    connectTitleTo: "Conecta tu computadora a {office}",
    resetDeadTitle: "Este enlace ya no funciona",
    resetDeadWhat:
      "Ya se usó, se detuvo o caducó. Pide uno nuevo a quien administra el servidor del equipo.",
    passwordBack:
      "Guardado. El inicio de sesión con correo y contraseña vuelve a estar activo para todos.",
    adminsOnlyNote:
      "Por ahora, solo quien administra este servidor puede iniciar sesión con contraseña.",
    resetMadeTold: "Su página dice que lo creaste, y puede detenerlo.",
    errors: {
      "too-many":
        "Es demasiado a la vez. Espera la respuesta de tu clon y luego envía más.",
      "web-chat-unpaired":
        "Este navegador aún no está emparejado con tu clon. Emparéjalo primero.",
      "web-chat-off":
        "Hablar con tu clon desde aquí está desactivado. Actívalo en Clone Office en tu computadora.",
      "no-clone":
        "No hay un clon con quien hablar: conecta primero tu computadora.",
      "too-long": "Es demasiado largo para enviarlo de una vez.",
      "text-missing": "Escribe algo primero.",
      "not-on-web": "Tu clon responde esto desde tu computadora.",
      "invite-used":
        "Ya se creó una cuenta con esta invitación. Pide una nueva.",
      "admin-link-ended": "Este enlace de configuración terminó.",
      "too-many-invites":
        "Esta oficina tiene demasiadas invitaciones abiertas. Cancela algunas primero.",
      "too-many-invites-mine":
        "Tienes 10 invitaciones abiertas. Podrás crear otra cuando alguien use una o pase su semana.",
      "invite-wrong": "Esa invitación no existe.",
      "name-missing": "Escribe tu nombre.",
      "account-exists": "Ya hay una cuenta con ese correo: inicia sesión.",
      "password-short": "La contraseña necesita 8 caracteres o más.",
      "password-long": "Esa contraseña es demasiado larga.",
      "email-wrong": "Ese correo no parece correcto.",
      "sign-in-wrong": "El correo o la contraseña no son correctos.",
      "too-many-tries":
        "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
      "not-in-office": "No estás en esta oficina.",
      "account-failed": "No funcionó. Inténtalo de nuevo.",
      "not-owner": "Solo un dueño de esta oficina puede hacer eso.",
      "not-yourself": "No puedes quitar tu propia cuenta.",
      "password-off":
        "El inicio de sesión con contraseña está desactivado en este servidor. Usa Google.",
      "google-off":
        "El inicio de sesión con Google está desactivado en este servidor.",
      "google-not-linked":
        "La cuenta con ese correo inicia sesión con su contraseña. Inicia sesión con ella y luego conecta Google en tu página.",
      "google-no-account":
        "Todavía ninguna cuenta de aquí usa esa cuenta de Google. Abre el enlace de invitación de tu oficina para crear una.",
      "google-cancelled": "Se canceló el inicio de sesión con Google.",
      "google-other":
        "Esa cuenta de Google está conectada a otra cuenta de aquí, o su correo no es el de esta cuenta.",
      "google-unverified": "Google no ha verificado el correo de esa cuenta.",
      "google-again": "Tardó demasiado. Inténtalo de nuevo.",
      "google-failed":
        "No se pudo iniciar sesión con Google. Inténtalo de nuevo.",
      "not-admin":
        "Solo el administrador de este servidor puede cambiar cómo se inicia sesión.",
      "google-first":
        "Activa primero Google, para que las personas puedan seguir iniciando sesión.",
      "link-google-first":
        "Conecta primero tu propia cuenta de Google, para que puedas seguir iniciando sesión.",
      "password-first":
        "Activa primero el correo y la contraseña, para que las personas puedan seguir iniciando sesión.",
      "sealing-off":
        "Este servidor no tiene una clave para cifrar el secreto. Define RELAY_ENCRYPTION_KEY y reinícialo.",
      "google-id-wrong":
        "Eso no es un ID de cliente de Google: termina en .apps.googleusercontent.com.",
      "google-secret-missing": "Pega también el secreto del cliente.",
      "google-secret-wrong": "Eso no parece un secreto del cliente.",
      "google-not-set": "Configura Google primero.",
      "google-unreadable":
        "El secreto guardado no se puede abrir con la clave de este servidor. Pégalo de nuevo.",
      "reset-expired":
        "Ese enlace ya no funciona. Pide uno nuevo a quien administra el servidor del equipo.",
      "no-password":
        "Esa persona no tiene contraseña que restablecer: inicia sesión con Google.",
      "last-owner":
        "Es la única persona dueña de una oficina aquí. Haz dueña a otra persona primero.",
      "not-yours":
        "Esa cuenta está en una oficina de la que no eres dueño: la cuidan sus dueños.",
      "has-google":
        "Esa persona inicia sesión con Google: no necesita un enlace para restablecer.",
      "owner-reset":
        "Nadie más puede crear un enlace para restablecer la cuenta de quien es dueño de una oficina.",
      "public-url-needed":
        "Google por https necesita la dirección pública de este servidor: define RELAY_PUBLIC_URL con ella y reinicia el servidor.",
    },
  },
  pt: {
    inviteTitle: "{from} convida você para o escritório",
    onWebPerson: "Na web, sem computador conectado",
    answerFrom: "Resposta de {name}",
    answerFromClone: "Resposta do clone de {name}",
    requestsWaiting: "Pedidos · {count} esperando",
    inviteFor: "Para quem (opcional)",
    inviteOnce: "Copie agora: ele aparece só uma vez.",
    webTitle: "Nenhum computador conectado?",
    webWhat:
      "Participe por aqui: os clones dos colegas podem perguntar a você, e você responde e faz pedidos nesta página. Se depois conectar um computador, seu clone assume.",
    webJoin: "Participar pela web",
    requestsLink: "Pedidos",
    requestsTitle: "Pedidos",
    askedOfYou: "Pedidos para você",
    askedNone: "Nada esperando por você.",
    youAsked: "Seus pedidos",
    youAskedNone: "Você ainda não pediu nada a ninguém.",
    askTitle: "Pedir a um colega",
    askTo: "Para quem",
    askPick: "Escolha um colega",
    askText: "O que você precisa",
    askSend: "Enviar",
    answerLabel: "Sua resposta",
    answerSend: "Enviar resposta",
    fromWho: "{name} pede",
    toWho: "Para {name}",
    stateWaiting: "Esperando por você",
    stateCloneOn: "Seu clone está cuidando",
    stateAwaiting: "Esperando resposta",
    stateAnswered: "Respondido",
    stateYouAnswered: "Você respondeu",
    stateCloneAnswered: "Seu clone respondeu",
    stateClosed: "Encerrado",
    cloneHandles:
      "Seu clone responde no seu computador o que pedem a você; o que ele precisar de você chega pelo app ou pelo celular.",
    refresh: "Atualizar",
    askSent: "Enviado. A resposta aparece aqui quando chegar.",
    answerSent: "Resposta enviada.",
    onWeb: "na web",
    noColleagues: "Ainda não há mais ninguém neste escritório.",
    inviteTitleNobody: "Você recebeu um convite para um escritório",
    what: "Neste escritório, o clone de cada pessoa (uma IA que trabalha como ela) recebe e responde os pedidos da equipe, e traz a cada pessoa só as decisões que são dela.",
    accountInstead: "Ou crie uma conta no servidor da equipe",
    accountWhy:
      "Com uma conta, você entra aqui, vê quem está no escritório e conecta seu computador com o seu nome.",
    name: "Seu nome",
    email: "E-mail",
    password: "Senha (8 caracteres ou mais)",
    create: "Criar minha conta",
    haveAccount: "Já tem uma conta?",
    signInLink: "Entrar",
    keep: "Este link é para uma pessoa: funciona uma vez, durante uma semana.",
    signInTitle: "Entre no seu escritório",
    signIn: "Entrar",
    noAccount:
      "Ainda não tem conta? Abra o link de convite do seu escritório para criar uma.",
    hello: "Oi, {name}",
    yourOffice: "Seu escritório",
    connectTitle: "Conecte seu computador",
    connectWhat:
      "Seu clone roda no seu computador: ele aprende com os seus registros de IA de lá, pensa com a sua própria IA e trabalha com os seus arquivos. Rode isto uma vez em um terminal desse computador (precisa do Node.js 22.13 ou mais recente, em nodejs.org):",
    makeCommand: "Criar meu comando de conexão",
    commandNote:
      "Funciona uma vez, por 10 minutos; crie um novo quando quiser. Conectar outro computador leva seu clone para lá.",
    connected: "Conectado: clone de {name}, visto por último {when}.",
    notConnected: "Nenhum computador conectado ainda.",
    inviteTeam: "Convide um colega",
    inviteWhat:
      "Cada link é para uma pessoa: funciona uma vez, durante {days} dias.",
    accountMade:
      "Uma conta já foi criada com este convite. Entre com ela ou peça um convite novo.",
    welcome:
      "Agora você administra este servidor. As pessoas entram com e-mail e senha; o Google é opcional, logo abaixo. Depois, convide a sua equipe pela sua página.",
    adminLinkEnded:
      "Ele já foi usado ou passou um dia. Quem roda o servidor recebe um novo no registro ao reiniciá-lo, ou pelo app que abriu o escritório (Configurações › Escritório › Abrir o servidor da equipe).",
    adminLinkEndedTitle: "Este link de configuração terminou",
    setupButton: "Criar minha conta de administração",
    setupWhat:
      "Você vai administrá-lo: decide como as pessoas entram e convida a sua equipe. Crie sua conta aqui. Este link funciona uma vez só.",
    setupTitle: "Configure este servidor da equipe",
    inviteHalfAccount: "conta criada · o clone ainda não entrou",
    inviteHalfClone: "clone entrou · ainda sem conta",
    inviteFrom: "Criado por {by} · {when}",
    invitesTitle: "Convites ainda abertos",
    inviteMade: "Envie para uma pessoa só:",
    inviteMake: "Criar um link de convite",
    signOut: "Sair",
    tabHome: "Início",
    pairTitle: "Pareie este navegador com seu clone",
    pairWhat:
      "Para que só você fale com seu clone, cada navegador é pareado uma vez. Seu computador vai pedir para confirmar este código:",
    pairStart: "Parear este navegador",
    pairWaiting: "Confirme no Clone Office do seu computador (ou no celular)…",
    pairSecure:
      "Para falar com seu clone, esta página precisa abrir por https. Peça a quem cuida do servidor da equipe um endereço https.",
    chatScript: "Para falar com seu clone aqui é preciso JavaScript.",
    chatUnpaired:
      "Este navegador não está pareado, então seu clone não fez isso. Pareie e envie de novo.",
    chatBusy:
      "Seu clone ainda está no que você enviou antes. Envie de novo quando ele responder.",
    chatNews: "Seu clone respondeu.",
    chatAnswered: "Respondido.",
    suggest1: "O que está esperando por mim hoje?",
    suggest2: "Onde parei ontem?",
    suggest3: "Resuma os pedidos ainda abertos",
    tabClone: "Meu clone",
    tabRequests: "Pedidos",
    tabOffice: "Escritório",
    menuLabel: "Seu menu",
    accountTitle: "Sua conta",
    computerOn: "Seu clone está ligado no seu computador",
    computerOff:
      "Seu computador está desligado ou em repouso. O que você escrever aqui espera até ele voltar.",
    chatOff:
      "Falar com seu clone daqui está desligado. Ligue no Clone Office do seu computador: Configurações › Escritório › Falar pelo servidor da equipe.",
    chatPlaceholder: "Diga algo ao seu clone…",
    chatSend: "Enviar",
    chatEmpty:
      "Peça qualquer coisa ao seu clone, como no seu computador. Ele responde de lá.",
    chatWorking: "Seu clone está respondendo…",
    chatWaiting: "Esperando o seu computador…",
    cloneLabel: "Seu clone",
    toDecide: "Para decidir",
    askSettled: "Respondido no seu computador",
    askChosen: "Respondido: {choice}",
    chatKept:
      "Fica aqui por um dia. A conversa inteira fica no seu computador.",
    chatRefresh: "Atualize para ver a resposta.",
    chatFailed:
      "Seu clone não conseguiu responder desta vez. Tente de novo ou veja no seu computador.",
    chatLimit:
      "Seu plano de IA atingiu o limite de uso. Tente mais tarde ou escolha outro modelo no seu computador.",
    noCloneTitle: "Você ainda não tem um clone",
    noCloneWhat:
      "Seu clone roda no seu computador. Conecte-o e você pode falar com ele aqui enquanto ele responde aos colegas por você.",
    connectCta: "Conectar seu computador",
    webCta: "Participar pela web sem computador",
    onWebTitle: "Você participa pela web",
    onWebWhat:
      "Os clones dos colegas perguntam a você aqui, e você responde em Pedidos. Conecte um computador e seu clone assume seu lugar.",
    moveComputer: "Conectar outro computador",
    connectHow:
      "Rode isto uma vez em um terminal desse computador (precisa do Node.js 22.13 ou mais recente, em nodejs.org):",
    officeTitle: "O escritório",
    officeDrawingOff: "O desenho do escritório precisa de JavaScript.",
    runTitle: "Rode isto no seu computador",
    runWhat:
      "Este link conecta um computador ao seu escritório. Rode em um terminal desse computador:",
    people: "Pessoas neste escritório",
    peopleOwner:
      "Como dono, você decide quem está dentro e também pode tornar outras pessoas donas.",
    owner: "Dono",
    member: "Membro",
    you: "você",
    cloneIn: "Clone conectado · visto por último {when}",
    cloneOut: "Nenhum computador conectado ainda",
    remove: "Remover",
    removeTitle: "Remover {name} deste escritório?",
    removeWhat:
      "O clone dessa pessoa para de funcionar aqui na hora, e ela não consegue criar um novo comando de conexão. O que ela pediu e respondeu continua aqui.",
    makeOwner: "Tornar dono",
    ownerTitle: "Tornar {name} dono do escritório?",
    ownerWhat:
      "Os donos decidem quem está no escritório, mudam o nome dele e criam novos links de convite. Você continua sendo dono também.",
    keyed: "Clones que entraram com o link",
    keyedWhat:
      "Entraram pelo app de alguém com o link de convite, sem uma conta aqui.",
    cloneTitle: "Remover o clone de {name} deste escritório?",
    cloneWhat:
      "Ele para de funcionar aqui na hora. O que pediu e respondeu continua aqui.",
    newLink: "Trocar o link de convite compartilhado",
    newLinkTitle: "Trocar a chave do escritório?",
    newLinkWhat:
      "Os links feitos com a chave do escritório param de funcionar. Os convites e quem já está dentro não são afetados.",
    officeName: "Nome do escritório",
    save: "Salvar",
    cancel: "Cancelar",
    continueGoogle: "Continuar com o Google",
    orWord: "ou",
    waysTitle: "Como você entra",
    waysPassword: "E-mail e senha",
    waysGoogle: "Google",
    connectGoogle: "Conectar o Google",
    connectGoogleWhat: "Entre também com a sua conta do Google.",
    inUse: "Em uso",
    linked: "Conectado",
    adminLink: "Configurações de login do servidor da equipe",
    adminTitle: "Configurações de login",
    adminWhat:
      "Como as pessoas entram no servidor da equipe. Vale para todos os escritórios dele, e sempre fica pelo menos uma forma ativa.",
    backHome: "Voltar para a minha página",
    saved: "Salvo.",
    stateOn: "Ativado",
    stateOff: "Desativado",
    stateUnset: "Não configurado",
    turnOn: "Ativar",
    turnOff: "Desativar",
    methodPasswordWhat: "As pessoas criam uma conta com o e-mail e uma senha.",
    methodGoogleWhat:
      "As pessoas entram com a conta do Google. Uma conta nova ainda precisa do link de convite de um escritório.",
    passwordOnly: "{count} pessoas entram só com senha.",
    googleOnly: "{count} pessoas entram só com o Google.",
    linkFirst:
      "Antes de desativar, conecte a sua própria conta do Google na sua página, para continuar conseguindo entrar.",
    googleSetup: "Configurar o login com o Google",
    googleChange: "Trocar o cliente do Google",
    step1:
      "No Google Cloud Console, abra APIs e serviços › Credenciais e crie um ID do cliente OAuth para um aplicativo da Web.",
    consoleLink: "Abrir o Google Cloud Console",
    step2: "Adicione este endereço como URI de redirecionamento autorizado:",
    step3:
      "Cole aqui o ID do cliente e a chave secreta do cliente que o Google mostrar.",
    httpsNote:
      "O Google só devolve as pessoas para um endereço https, ou para localhost. Coloque este servidor atrás de https e defina RELAY_PUBLIC_URL com esse endereço.",
    clientId: "ID do cliente",
    clientSecret: "Chave secreta do cliente",
    secretNew:
      "Ela fica guardada criptografada neste servidor e não é mostrada de novo.",
    secretKeep: "Deixe vazio para manter a chave já salva.",
    savedBy: "Configurado por {name} em {when}.",
    saveGoogle: "Salvar e ativar",
    removeGoogle: "Remover as configurações do Google",
    sealingOff:
      "Para guardar uma chave secreta do Google, este servidor precisa de uma chave de criptografia: defina RELAY_ENCRYPTION_KEY (openssl rand -base64 32) e reinicie.",
    googleRemoveTitle: "Remover as configurações do Google?",
    googleRemoveWhat:
      "O ID do cliente e a chave secreta criptografada são apagados do servidor da equipe. Para configurar o Google de novo, é preciso colocar os dois outra vez.",
    passwordOffTitle: "Desativar e-mail e senha?",
    passwordOffWhat:
      "Enquanto estiver desativado, só dá para entrar com o Google. Você pode ativar de novo quando quiser.",
    passwordPlain: "Senha",
    forgot:
      "Esqueceu a senha? Peça ao administrador do servidor da equipe um link para redefini-la.",
    noAccountInvite: "Ainda não tem conta?",
    makeFromInvite: "Crie com o convite do seu escritório",
    passwordOnlyOne: "1 pessoa entra só com senha.",
    googleOnlyOne: "1 pessoa entra só com o Google.",
    lockedGoogle:
      "{count} pessoas entram só com o Google: não conseguem entrar enquanto estiver desativado.",
    lockedGoogleOne:
      "1 pessoa entra só com o Google: não consegue entrar enquanto estiver desativado.",
    lockedPassword:
      "{count} pessoas entram só com senha: não conseguem entrar enquanto estiver desativado.",
    lockedPasswordOne:
      "1 pessoa entra só com senha: não consegue entrar enquanto estiver desativado.",
    googleOffTitle: "Desativar o login com o Google?",
    googleOffWhat:
      "As configurações continuam salvas, e você pode ativar de novo quando quiser.",
    serverPeople: "Pessoas no servidor da equipe",
    serverPeopleWhat:
      "Todas as pessoas com conta aqui. Quem esquecer a senha recebe de você um link para redefini-la.",
    resetLink: "Link para redefinir",
    resetTitle: "Criar um link para redefinir a senha de {name}?",
    resetWhat:
      "Você recebe um link para enviar à pessoa. Ele funciona uma vez, por uma hora, e ao ser usado encerra a sessão dela em todos os lugares.",
    resetMadeTitle: "Link para redefinir de {name}",
    resetMadeWhat:
      "Envie você mesmo este link para {name}. Funciona uma vez, por uma hora:",
    newPassword: "Senha nova (8 caracteres ou mais)",
    setPassword: "Salvar a senha nova",
    adminMade: "Este servidor já está configurado. Entre.",
    resetDone: "Sua senha foi alterada. Entre com ela.",
    joinTitle: "Entrar também em {office}?",
    joinWhat:
      "Você entrou como {name}. As pessoas de {office} vão ver o seu nome e o seu e-mail.",
    join: "Entrar",
    removeAccount: "Remover conta",
    removeAccountTitle: "Remover a conta de {name}?",
    removeAccountWhat:
      "A conta é apagada do servidor da equipe: a pessoa não consegue entrar, e o clone dela para em todos os escritórios daqui. O que ela pediu e respondeu continua, e ela pode criar uma conta nova com um convite.",
    thatOffice: "este escritório",
    yourOffices: "Seus escritórios",
    showing: "Mostrando",
    notYou: "Não é {name}?",
    joinFrom: "{from} convidou você.",
    resetMake: "Criar o link",
    newPasswordFor: "Uma senha nova para {name}",
    resetOpen:
      "Em {when}, {name} criou um link para redefinir a sua senha. Ele funciona uma vez, por mais {minutes} minutos. Se você não pediu, pare o link.",
    resetOpenOne:
      "Em {when}, {name} criou um link para redefinir a sua senha. Ele funciona uma vez, por mais 1 minuto. Se você não pediu, pare o link.",
    passwordOffBlocked: "Ainda não dá para desligar as senhas",
    resetStop: "Parar o link",
    resetStopped:
      "Em {when}, {name} criou um link para redefinir a sua senha. Você o parou.",
    resetEnded:
      "Em {when}, {name} criou um link para redefinir a sua senha. Ele terminou sem ser usado.",
    stoppedDone: "Parado. Esse link não pode mais mudar a sua senha.",
    connectTitleTo: "Conecte seu computador a {office}",
    resetDeadTitle: "Este link não funciona mais",
    resetDeadWhat:
      "Ele já foi usado, foi parado ou expirou. Peça um novo a quem administra o servidor da equipe.",
    passwordBack:
      "Salvo. O login com e-mail e senha voltou a valer para todos.",
    adminsOnlyNote:
      "Por enquanto, só quem administra este servidor pode entrar com senha.",
    resetMadeTold:
      "A página da pessoa mostra que você o criou, e ela pode pará-lo.",
    errors: {
      "too-many":
        "É muita coisa de uma vez. Espere a resposta do seu clone e depois envie mais.",
      "web-chat-unpaired":
        "Este navegador ainda não está pareado com seu clone. Pareie primeiro.",
      "web-chat-off":
        "Falar com seu clone daqui está desligado. Ligue no Clone Office do seu computador.",
      "no-clone":
        "Não há clone para conversar: conecte seu computador primeiro.",
      "too-long": "É longo demais para enviar de uma vez.",
      "text-missing": "Escreva algo primeiro.",
      "not-on-web": "Seu clone responde isso no seu computador.",
      "invite-used": "Uma conta já foi criada com este convite. Peça um novo.",
      "admin-link-ended": "Este link de configuração terminou.",
      "too-many-invites":
        "Este escritório tem convites abertos demais. Cancele alguns primeiro.",
      "too-many-invites-mine":
        "Você tem 10 convites abertos. Dá para criar outro quando alguém usar um ou quando a semana dele acabar.",
      "invite-wrong": "Esse convite não existe.",
      "name-missing": "Informe seu nome.",
      "account-exists": "Já existe uma conta com esse e-mail: entre com ela.",
      "password-short": "A senha precisa ter 8 caracteres ou mais.",
      "password-long": "Essa senha é longa demais.",
      "email-wrong": "Esse e-mail não parece certo.",
      "sign-in-wrong": "O e-mail ou a senha estão errados.",
      "too-many-tries":
        "Tentativas demais. Espere alguns minutos e tente de novo.",
      "not-in-office": "Você não está neste escritório.",
      "account-failed": "Não deu certo. Tente de novo.",
      "not-owner": "Só um dono deste escritório pode fazer isso.",
      "not-yourself": "Você não pode remover a própria conta.",
      "password-off":
        "O login com senha está desativado neste servidor. Use o Google.",
      "google-off": "O login com o Google está desativado neste servidor.",
      "google-not-linked":
        "A conta com esse e-mail entra com a senha. Entre com ela e depois conecte o Google na sua página.",
      "google-no-account":
        "Nenhuma conta daqui usa essa conta do Google ainda. Abra o link de convite do seu escritório para criar uma.",
      "google-cancelled": "O login com o Google foi cancelado.",
      "google-other":
        "Essa conta do Google está conectada a outra conta daqui, ou o e-mail dela não é o desta conta.",
      "google-unverified": "O Google não verificou o e-mail dessa conta.",
      "google-again": "Demorou demais. Tente de novo.",
      "google-failed": "Não deu para entrar com o Google. Tente de novo.",
      "not-admin":
        "Só o administrador deste servidor pode mudar como as pessoas entram.",
      "google-first":
        "Ative o Google primeiro, para que as pessoas continuem conseguindo entrar.",
      "link-google-first":
        "Conecte primeiro a sua própria conta do Google, para continuar conseguindo entrar.",
      "password-first":
        "Ative e-mail e senha primeiro, para que as pessoas continuem conseguindo entrar.",
      "sealing-off":
        "Este servidor não tem uma chave para criptografar a chave secreta. Defina RELAY_ENCRYPTION_KEY e reinicie.",
      "google-id-wrong":
        "Isso não é um ID do cliente do Google: ele termina em .apps.googleusercontent.com.",
      "google-secret-missing": "Cole também a chave secreta do cliente.",
      "google-secret-wrong": "Isso não parece uma chave secreta do cliente.",
      "google-not-set": "Configure o Google primeiro.",
      "google-unreadable":
        "A chave secreta salva não pode ser aberta com a chave deste servidor. Cole de novo.",
      "reset-expired":
        "Esse link não funciona mais. Peça um novo a quem administra o servidor da equipe.",
      "no-password":
        "Essa pessoa não tem senha para redefinir: entra com o Google.",
      "last-owner":
        "Essa pessoa é a única dona de um escritório daqui. Torne outra pessoa dona primeiro.",
      "not-yours":
        "Essa conta está em um escritório do qual você não é dono: os donos dele cuidam dela.",
      "has-google":
        "Essa pessoa entra com o Google: não precisa de um link para redefinir.",
      "owner-reset":
        "Ninguém mais pode criar um link para redefinir a conta de quem é dono de um escritório.",
      "public-url-needed":
        "O Google por https precisa do endereço público deste servidor: defina RELAY_PUBLIC_URL com ele e reinicie o servidor.",
    },
  },
};

// Each page language says everything English says, and nothing more.
const _wordsInStep: AllInSync<typeof WORDS> & Record<PageLanguage, unknown> =
  WORDS;

type Words = (typeof WORDS)["en"];
type Key = Exclude<keyof Words, "errors">;

/** A tab's title with what waits on the person before it, as the app's own tab carries it. */
const counted = (title: string, waiting: number) =>
  waiting > 0 ? `(${waiting}) ${title}` : title;

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
  // only the page's own codes: a name like "constructor" is no failure's words
  return escape(
    Object.hasOwn(errors, code) ? errors[code] : errors["account-failed"],
  );
}

/** Failures of making an invite: said where the invite is made, which the page opens on. */
const INVITE_ERRORS = new Set(["too-many-invites", "too-many-invites-mine"]);

const problem = (lang: PageLanguage, code?: string) =>
  code ? `<p class="error" role="alert">${errorWords(lang, code)}</p>` : "";

/** Google's own mark, as its sign-in buttons carry it. */
const GOOGLE_MARK = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

/**
 * Signing in with Google, then a line between it and the password's form when both are on. A link
 * rather than a form: the pages' forms may post only to this server, and the way goes on to Google.
 */
function googleWay(
  lang: PageLanguage,
  methods: SignInMethods,
  href: string,
): string {
  if (!methods.google) return "";
  return `<a class="google" href="${escape(href)}">${GOOGLE_MARK}<span>${say(lang, "continueGoogle")}</span></a>${
    methods.password ? `<p class="or">${say(lang, "orWord")}</p>` : ""
  }`;
}

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
  local?: Local;
  installers?: Installers;
  /** The ways the server lets people in. */
  methods: SignInMethods;
  error?: string;
  /**
   * Where the error shows: the account's own fold after its form (the browser lands there), or the
   * top, after Google sent them back here.
   */
  errorAtTop?: boolean;
  /** Come from the sign-in page to make an account: the account part shows open. */
  openAccount?: boolean;
  /** The invite made an account already: the part says so, with the way to sign in. */
  accountMade?: boolean;
  name?: string;
  email?: string;
}): string {
  const { lang } = input;
  const title = input.from
    ? say(lang, "inviteTitle", { from: input.from })
    : say(lang, "inviteTitleNobody");
  const here = `/i/${encodeURIComponent(input.key)}${input.from ? `?from=${encodeURIComponent(input.from)}` : ""}`;
  const google = `/i/${encodeURIComponent(input.key)}/google${input.from ? `?from=${encodeURIComponent(input.from)}` : ""}`;
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${input.errorAtTop ? problem(lang, input.error) : ""}
${input.accountMade ? `<p class="done" role="status">${say(lang, "accountMade")} <a href="/login">${say(lang, "signInLink")}</a></p>` : ""}
<p>${say(lang, "what")}</p>
${installGuide(input)}
<details class="account" id="account"${input.error || input.openAccount ? " open" : ""}><summary>${say(lang, "accountInstead")}</summary>
<section>
${
  input.accountMade
    ? `<p>${say(lang, "accountMade")}</p>`
    : `<p class="note">${say(lang, "accountWhy")}</p>
${input.errorAtTop ? "" : problem(lang, input.error)}
${googleWay(lang, input.methods, google)}`
}
${
  input.methods.password && !input.accountMade
    ? `<form method="post" action="${escape(here)}#account" class="auth">
<label for="name">${say(lang, "name")}</label>
<input id="name" name="name" required maxlength="80" autocomplete="name" value="${escape(input.name ?? "")}">
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "password")}</label>
<input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password">
<button type="submit">${say(lang, "create")}</button>
</form>`
    : ""
}
<p class="note">${say(lang, "haveAccount")} <a href="/login?key=${encodeURIComponent(input.key)}">${say(lang, "signInLink")}</a></p>
</section>
</details>
<footer>${say(lang, "keep")}</footer>`,
  );
}

export function signInPage(input: {
  lang: PageLanguage;
  key?: string;
  methods: SignInMethods;
  error?: string;
  /** A word for what just happened: the password was changed, or the server was set up already. */
  done?: "reset" | "admin-made";
  email?: string;
}): string {
  const { lang } = input;
  const title = say(lang, "signInTitle");
  return shell(
    lang,
    title,
    // one narrow card, the app's mark over its title (10-19 redesign)
    `<div class="auth-mark">${MARK}</div>
<h1>${title}</h1>
${problem(lang, input.error)}
${input.done ? `<p class="done" role="status">${say(lang, input.done === "reset" ? "resetDone" : "adminMade")}</p>` : ""}
${googleWay(lang, input.methods, `/login/google${input.key ? `?key=${encodeURIComponent(input.key)}` : ""}`)}
${
  input.methods.password
    ? `<form method="post" class="auth">
${input.key ? `<input type="hidden" name="key" value="${escape(input.key)}">` : ""}
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "passwordPlain")}</label>
<input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password">
<button type="submit">${say(lang, "signIn")}</button>
</form>
<p class="note">${say(lang, input.methods.adminsOnly ? "adminsOnlyNote" : "forgot")}</p>`
    : ""
}
<p class="note">${
      input.key
        ? `${say(lang, "noAccountInvite")} <a href="/i/${encodeURIComponent(input.key)}?account#account">${say(lang, "makeFromInvite")}</a>`
        : say(lang, "noAccount")
    }</p>`,
    undefined,
    { main: "auth" },
  );
}

/** Where a person changes a forgotten password, with the link the admin made for them. */
export function newPasswordPage(input: {
  lang: PageLanguage;
  token: string;
  /** Whose password it is; none when the link is used or expired, which then says so alone. */
  name?: string;
  error?: string;
}): string {
  const { lang } = input;
  if (!input.name) {
    const dead = say(lang, "resetDeadTitle");
    return shell(
      lang,
      dead,
      `<h1>${dead}</h1>
<p>${say(lang, "resetDeadWhat")}</p>
<p><a href="/login">${say(lang, "signInLink")}</a></p>`,
    );
  }
  const title = say(lang, "newPasswordFor", { name: input.name });
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${problem(lang, input.error)}
<form method="post" action="/reset" class="auth">
<input type="hidden" name="token" value="${escape(input.token)}">
<label for="password">${say(lang, "newPassword")}</label>
<input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password">
<button type="submit">${say(lang, "setPassword")}</button>
</form>`,
  );
}

/** The reset link the admin made, to send on themselves. */
export function resetMadePage(input: {
  lang: PageLanguage;
  name: string;
  link: string;
}): string {
  const { lang } = input;
  const title = say(lang, "resetMadeTitle", { name: input.name });
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, "resetMadeWhat", { name: input.name })}</p>
<pre>${escape(input.link)}</pre>
<p class="note">${say(lang, "resetMadeTold")}</p>
<p><a href="/home/admin">${say(lang, "adminTitle")}</a></p>`,
  );
}

/** One request on the web page: asked of the reader, or by them. */
export interface WebRequest {
  id: string;
  /** The other one's name: who asked, or who was asked. */
  other: string;
  text: string;
  answer?: string;
  /** The answer was its person's own, not their clone's. */
  byPerson?: boolean;
  state: "waiting" | "answered" | "closed";
  when: string;
}

/**
 * Requests on the web, for someone with no computer connected (they answer here themselves) or
 * with one (their clone answers; they see and ask from here): what was asked of them, asking a
 * colleague, and what they asked.
 */
export function requestsPage(input: {
  lang: PageLanguage;
  office: { id: string; name: string };
  /** Here on the web with no clone: they answer what is asked of them on this page. */
  web: boolean;
  colleagues: { id: string; name: string; web?: boolean }[];
  asked: WebRequest[];
  sent: WebRequest[];
  done?: "sent" | "answered";
  error?: string;
  /** The signed-in pages' top, with this page as its Requests tab. */
  band?: Omit<Band, "tab">;
}): string {
  const { lang } = input;
  const title = say(lang, "requestsTitle");
  const at = `office=${encodeURIComponent(input.office.id)}`;
  const officeField = `<input type="hidden" name="office" value="${escape(input.office.id)}">`;
  // who it waits on: the person here on the web, their clone, or the one asked; once answered,
  // who answered: the one asked, or, for what was asked of them, they or their clone
  const state = (one: WebRequest, mine: boolean) =>
    `<span class="tag">${say(
      lang,
      one.state === "answered"
        ? mine
          ? "stateAnswered"
          : one.byPerson || input.web
            ? "stateYouAnswered"
            : "stateCloneAnswered"
        : one.state === "closed"
          ? "stateClosed"
          : mine
            ? "stateAwaiting"
            : input.web
              ? "stateWaiting"
              : "stateCloneOn",
    )}</span>`;
  const asked = input.asked
    .map(
      (
        one,
      ) => `<li${input.web && one.state === "waiting" ? ' class="waits"' : ""}><span class="who"><b>${say(lang, "fromWho", { name: one.other })}</b>${state(one, false)}<small>${escape(one.when)}</small></span>
<p class="request">${escape(one.text)}</p>${
        one.answer
          ? `<p class="note"><b>${say(lang, "answerLabel")}</b><br>${escape(one.answer)}</p>`
          : ""
      }${
        input.web && one.state === "waiting"
          ? `<form method="post" action="/home/requests/answer">${officeField}<input type="hidden" name="task" value="${escape(one.id)}">
<label for="answer-${escape(one.id)}" class="visually-hidden">${say(lang, "answerLabel")}</label>
<textarea id="answer-${escape(one.id)}" name="text" required maxlength="8000" rows="2" placeholder="${say(lang, "answerLabel")}"></textarea>
<button type="submit" class="quiet">${say(lang, "answerSend")}</button>
</form>`
          : ""
      }</li>`,
    )
    .join("");
  const sent = input.sent
    .map(
      (
        one,
      ) => `<li><span class="who"><b>${say(lang, "toWho", { name: one.other })}</b>${state(one, true)}<small>${escape(one.when)}</small></span>
<p class="request">${escape(one.text)}</p>${one.answer ? `<p class="note"><b>${say(lang, one.byPerson ? "answerFrom" : "answerFromClone", { name: one.other })}</b><br>${escape(one.answer)}</p>` : ""}</li>`,
    )
    .join("");
  const waiting = input.web
    ? input.asked.filter((one) => one.state === "waiting").length
    : 0;
  return shell(
    lang,
    counted(title, waiting),
    `<h1${input.band ? ' class="visually-hidden"' : ""}>${title}${input.office.name ? ` · ${escape(input.office.name)}` : ""}</h1>
${input.done ? `<p class="done" role="status">${say(lang, input.done === "sent" ? "askSent" : "answerSent")}</p>` : ""}
${problem(lang, input.error)}
<section>
<h2>${say(lang, "askedOfYou")}</h2>
${input.web ? "" : `<p class="note">${say(lang, "cloneHandles")}</p>`}
${asked ? `<ul class="rows requests">${asked}</ul>` : `<p class="note">${say(lang, "askedNone")}</p>`}
</section>
<section>
<h2>${say(lang, "askTitle")}</h2>
${
  input.colleagues.length
    ? `<form method="post" action="/home/requests/ask">${officeField}
<label for="to">${say(lang, "askTo")}</label>
<select id="to" name="to" required>${
        // nobody picked until the person picks: a first name chosen for them is easy to send to
        input.colleagues.length > 1
          ? `<option value="" disabled selected>${say(lang, "askPick")}</option>`
          : ""
      }${input.colleagues
        .map(
          (one) =>
            `<option value="${escape(one.id)}">${escape(one.name)}${one.web ? ` (${say(lang, "onWeb")})` : ""}</option>`,
        )
        .join("")}</select>
<label for="text">${say(lang, "askText")}</label>
<textarea id="text" name="text" required maxlength="8000"></textarea>
<button type="submit">${say(lang, "askSend")}</button>
</form>`
    : `<p class="note">${say(lang, "noColleagues")}</p>`
}
</section>
<section>
<h2>${say(lang, "youAsked")}</h2>
${sent ? `<ul class="rows requests">${sent}</ul>` : `<p class="note">${say(lang, "youAskedNone")}</p>`}
</section>
<p class="links" data-refresh><a href="/home/requests?${at}">${say(lang, "refresh")}</a></p>`,
    undefined,
    input.band
      ? {
          band: homeBand(lang, {
            ...input.band,
            tab: "requests",
            ...(input.web ? { web: true } : {}),
          }),
          style: HOME_STYLE,
          scripts: ["/assets/home.mjs"],
        }
      : {},
  );
}

/** Where the server's admin is made, with the link whoever runs it has. */
export function setupPage(input: {
  lang: PageLanguage;
  error?: string;
  name?: string;
  email?: string;
}): string {
  const { lang } = input;
  const title = say(lang, "setupTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, "setupWhat")}</p>
${problem(lang, input.error)}
<form method="post" class="auth">
<label for="name">${say(lang, "name")}</label>
<input id="name" name="name" required maxlength="80" autocomplete="name" value="${escape(input.name ?? "")}">
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "password")}</label>
<input id="password" name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password">
<button type="submit">${say(lang, "setupButton")}</button>
</form>`,
  );
}

/** A setup link used or past its day. */
export function adminLinkEndedPage(lang: PageLanguage): string {
  const title = say(lang, "adminLinkEndedTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p>${say(lang, "adminLinkEnded")}</p>
<p><a href="/login">${say(lang, "signInLink")}</a></p>`,
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
  /** Taking part on the web, with no computer connected. */
  web?: boolean;
}

export interface HomeClone {
  id: string;
  name: string;
  role: string;
  seen: string;
}

/** Where the signed-in pages are: the person's clone, the requests, the office, their account. */
export type HomeTab = "clone" | "requests" | "office" | "account";

/** What the signed-in pages share at their top: the office, its tabs, and the person's menu. */
export interface Band {
  office?: { id: string; name: string };
  /** The offices the person is in, to switch between when there are several. */
  offices?: { id: string; name: string }[];
  tab: HomeTab;
  name: string;
  admin?: boolean;
  /** Requests waiting on the person's own answer, counted on their tab. */
  waiting?: number;
  /** Taking part on the web, with no clone: their first tab is their home, not a clone. */
  web?: boolean;
}

/** The signed-in pages' top: the office on the brand's colour, its tabs, and the person's menu. */
export function homeBand(lang: PageLanguage, band: Band): string {
  const office = band.office;
  const at = office ? `?office=${encodeURIComponent(office.id)}` : "";
  const officeName = (office && escape(office.name)) || say(lang, "yourOffice");
  const offices = band.offices ?? [];
  const switcher =
    office && offices.length > 1
      ? `<details class="pick"><summary aria-label="${say(lang, "yourOffices")}"></summary><ul class="menu">${offices
          .map(
            (one) =>
              `<li><a href="/home?office=${encodeURIComponent(one.id)}"${one.id === office.id ? ' aria-current="page"' : ""}>${escape(one.name) || say(lang, "thatOffice")}</a></li>`,
          )
          .join("")}</ul></details>`
      : "";
  const tab = (id: HomeTab, href: string, words: string) =>
    `<a href="${href}"${band.tab === id ? ' aria-current="page"' : ""}>${words}</a>`;
  // One white row (10-19 redesign): the office, its tabs underlined where one is, the person's menu.
  return `<header class="band">
<div class="band-row"><a class="band-office" href="/home${at}">${MARK}<span>${officeName}</span></a>${switcher}
${
  office
    ? `<nav class="tabs" aria-label="${officeName}">${tab("clone", `/home${at}`, say(lang, band.web ? "tabHome" : "tabClone"))}${tab(
        "requests",
        `/home/requests${at}`,
        `${say(lang, "tabRequests")}${band.waiting ? ` <span class="count">${band.waiting}</span>` : ""}`,
      )}${tab("office", `/home/office${at}`, say(lang, "tabOffice"))}</nav>`
    : ""
}
<details class="me"><summary aria-label="${say(lang, "menuLabel")}"><span class="avatar" aria-hidden="true">${MARK}</span><span class="me-name" aria-hidden="true">${escape(band.name)}</span></summary><div class="menu">
<p class="menu-name">${escape(band.name)}</p>
<a href="/home/account${at}">${say(lang, "accountTitle")}</a>
${band.admin ? `<a href="/home/admin">${say(lang, "adminLink")}</a>` : ""}
<form method="post" action="/logout"><button type="submit" class="ghost">${say(lang, "signOut")}</button></form>
</div></details></div>
</header>`;
}

/** A person's conversation with their own clone, as their page shows it. */
export interface HomeChat {
  /** Their clone lets them talk to it from here (its person turned it on). */
  on: boolean;
  /** Its computer is there now. */
  present: boolean;
  /** The codes of the browsers the clone trusts (lib/key-code.ts), for the page to know if it is one. */
  keys: string[];
  messages: OwnMessage[];
}

/** Words inside a line of an answer: code, bold and links to web pages, the rest as text. */
function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}

/**
 * A clone's answer, which it writes in Markdown, as the page draws it: paragraphs, lists, headings
 * as bold lines, code blocks, and inline code, bold and links. Everything is escaped first; no
 * other mark becomes HTML.
 */
export function answerHtml(text: string): string {
  const out: string[] = [];
  const blocks = text.split(/^```[^\n]*\n?/m);
  blocks.forEach((block, index) => {
    // between fences: code, as it is
    if (index % 2 === 1) {
      out.push(`<pre><code>${escape(block.replace(/\n$/, ""))}</code></pre>`);
      return;
    }
    let list: { tag: "ul" | "ol"; items: string[] } | undefined;
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push(`<p>${para.join("<br>")}</p>`);
      para = [];
      if (list)
        out.push(
          `<${list.tag}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.tag}>`,
        );
      list = undefined;
    };
    for (const line of block.split("\n")) {
      const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
      const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (bullet || numbered) {
        const tag = bullet ? "ul" : "ol";
        if (para.length || (list && list.tag !== tag)) flush();
        list ??= { tag, items: [] };
        list.items.push(inline((bullet ?? numbered)?.[1] ?? ""));
      } else if (heading) {
        flush();
        out.push(`<p><strong>${inline(heading[1])}</strong></p>`);
      } else if (!line.trim()) flush();
      else {
        if (list) flush();
        para.push(inline(line));
      }
    }
    flush();
  });
  return out.join("");
}

/** One line of the conversation shown as the reader reads it: an answer's code in their words. */
function ownWords(lang: PageLanguage, message: OwnMessage): string {
  if (!message.code) return answerHtml(message.text);
  if (message.code === "web-chat-off") return say(lang, "chatOff");
  if (message.code === "web-chat-unpaired") return say(lang, "chatUnpaired");
  if (message.code === "busy") return say(lang, "chatBusy");
  if (message.code.startsWith("brain-limit")) return say(lang, "chatLimit");
  return say(lang, "chatFailed");
}

/**
 * The conversation itself: what was said and whether the clone is answering, and apart from it what
 * waits on the person, pinned above the box so it never scrolls away. The page's script asks for
 * both again while an answer is on its way.
 */
export function chatThread(
  lang: PageLanguage,
  chat: HomeChat,
  office: string,
): { html: string; decide: string; waiting: boolean } {
  const officeField = `<input type="hidden" name="office" value="${escape(office)}">`;
  const answered = new Set(
    chat.messages
      .filter((m) => m.kind === "answer" && m.replyTo)
      .map((m) => m.replyTo),
  );
  const open = chat.messages.filter((m) => m.kind === "ask" && !m.chosen);
  const asks = open
    .map(
      (ask) =>
        `<form class="decide" method="post" action="/home/clone/choose">${officeField}<input type="hidden" name="ask" value="${escape(ask.id)}"><p class="decide-head">${say(lang, "toDecide")}</p><p class="decide-text">${escape(ask.text)}</p><div class="decide-acts">${(
          ask.choices ?? []
        )
          .map(
            (choice) =>
              // nothing answers until the page's script knows this browser is paired and signs it
              `<button type="submit" name="value" value="${escape(choice.value)}" class="choice" disabled>${escape(choice.label)}</button>`,
          )
          .join("")}</div></form>`,
    )
    .join("");
  const lines = chat.messages
    .map((m) => {
      if (m.kind === "said") return `<p class="msg mine">${escape(m.text)}</p>`;
      if (m.kind === "answer")
        return `<div class="msg clone${m.code ? " failed" : ""}"><small>${say(lang, "cloneLabel")}</small>${m.code ? `<p>${ownWords(lang, m)}</p>` : ownWords(lang, m)}</div>`;
      if (!m.chosen) return "";
      const label =
        m.chosen === "settled"
          ? say(lang, "askSettled")
          : say(lang, "askChosen", {
              choice:
                m.choices?.find((one) => one.value === m.chosen)?.label ?? "",
            });
      // what was asked, as its card said it in its first lines, and the answer
      const asked = m.text.split("\n").slice(0, 2).join(" ");
      return `<p class="msg note">${escape(asked.length > 140 ? `${asked.slice(0, 139)}…` : asked)} · ${label}</p>`;
    })
    .join("");
  const last = [...chat.messages].reverse().find((m) => m.kind === "said");
  const waiting = Boolean(chat.on && last && !answered.has(last.id));
  const working = waiting
    ? `<p class="working"><span class="spin" aria-hidden="true"></span>${say(lang, chat.present ? "chatWorking" : "chatWaiting")}</p><noscript><p class="note">${say(lang, "chatRefresh")}</p></noscript>`
    : "";
  const suggest = chat.on
    ? `<div class="suggest" hidden>${(
        ["suggest1", "suggest2", "suggest3"] as const
      )
        .map(
          (key) =>
            `<button type="button" class="chip" data-fill="${say(lang, key)}">${say(lang, key)}</button>`,
        )
        .join("")}</div>`
    : "";
  return {
    html: `${
      chat.messages.length
        ? lines
        : `<div class="chat-empty"><p>${say(lang, "chatEmpty")}</p>${suggest}</div>`
    }${working}`,
    decide: asks,
    waiting,
  };
}

/** What the signed-in pages add to the server's own style: the band, tabs and the conversation. */
export const HOME_STYLE = `
body { min-height: 100vh; display: flex; flex-direction: column; }
.band { background: var(--bg); color: var(--fg); box-shadow: inset 0 -1px 0 var(--line); }
.band-row { max-width: 62.5rem; margin: 0 auto; padding: 0 1rem; min-height: 3.5rem; display: flex; align-items: center; gap: 1.75rem; }
.band-office { display: flex; align-items: center; gap: .55rem; color: inherit; text-decoration: none; font-weight: 650; min-width: 0; flex: 0 1 auto; }
.band-office span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.band .mark { width: 1.4rem; height: 1.4rem; color: var(--fg); flex: none; }
.band .mark .eye { fill: var(--bg); }
.band details { position: relative; }
.band details > summary { color: inherit; font-size: .9rem; min-height: 2.75rem; min-width: 2.75rem; justify-content: center; }
.band details.me { margin-left: auto; }
.band details.me > summary { gap: .5rem; font-weight: 500; }
.band details.me > summary::after { border-color: var(--muted); transform: rotate(45deg); margin-top: -.2rem; }
.band details.pick { margin-left: -1.4rem; }
.band details.pick > summary::after { border-color: var(--fg); margin-left: 0; }
/* the person's own clone at rest, as the app marks them, never a letter */
.avatar { width: 1.75rem; height: 1.75rem; display: grid; place-items: center; }
.band .avatar .mark { width: 1.45rem; height: 1.45rem; }
.band .menu { position: absolute; right: 0; top: calc(100% + .25rem); z-index: 5; min-width: 13rem; background: var(--bg); color: var(--fg); border: 1px solid var(--line); border-radius: 14px; padding: .4rem; box-shadow: 0 12px 32px rgba(0,0,0,.18); display: flex; flex-direction: column; gap: .1rem; list-style: none; margin: 0; }
.band details.pick .menu { left: 0; right: auto; }
.band .menu a, .band .menu button { display: flex; align-items: center; min-height: 2.5rem; padding: 0 .6rem; border-radius: 8px; color: var(--fg); text-decoration: none; width: 100%; margin: 0; font-weight: 500; justify-content: flex-start; }
.band .menu a:hover, .band .menu button:hover { background: var(--soft); }
.band .menu a[aria-current="page"] { font-weight: 700; }
.band .menu form { margin: 0; }
.menu-name { margin: .2rem .6rem .3rem; font-size: .85rem; color: var(--muted); }
/* the tabs in the row, the one open underlined in the brand colour */
.band .tabs { align-self: stretch; display: flex; gap: 1.35rem; overflow-x: auto; scrollbar-width: none; background: none; border-radius: 0; padding: 0; }
.tabs a { color: var(--muted); text-decoration: none; font-weight: 500; font-size: .9rem; padding: 0 .2rem; white-space: nowrap; display: inline-flex; align-items: center; gap: .4rem; min-height: 2.75rem; }
.tabs a:hover { color: var(--fg); }
.tabs a[aria-current="page"] { color: var(--fg); font-weight: 650; box-shadow: inset 0 -2px 0 var(--brand); }
/* what waits: the ember's ink on its soft fill, as the app counts it */
.tabs .count { background: color-mix(in srgb, var(--waiting) 14%, transparent); color: var(--waiting-ink); border-radius: 999px; font-size: .72rem; font-weight: 700; padding: 0 .45rem; line-height: 1.55; }
.band :focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
/* narrow, the tabs take a row of their own under the office and the menu */
@media (max-width: 40rem) {
  .band-row { flex-wrap: wrap; gap: 0 1rem; }
  .band .me-name { display: none; }
  .tabs { order: 3; flex-basis: 100%; }
}
main { width: 100%; max-width: 46rem; }
/* the office's tab: the drawing and a side, in the band's own width */
main.wide { max-width: 62.5rem; }
main.chat { flex: 1; display: flex; flex-direction: column; gap: 0; padding-top: 0; padding-bottom: 0; }
.status { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-size: .9rem; margin: 0; padding: .9rem 0 .2rem; }
.status i { width: .5rem; height: .5rem; border-radius: 50%; background: var(--muted); flex: none; }
.status i.on { background: var(--brand); }
.callout { margin: 0 0 .5rem; padding: .75rem .9rem; border-radius: 12px; background: var(--soft); font-size: .92rem; }
.thread { flex: 1; display: flex; flex-direction: column; gap: .6rem; padding: 1rem 0; }
.msg { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.msg.mine { align-self: flex-end; max-width: 85%; background: var(--brand-fill); color: #fff; padding: .55rem .85rem; border-radius: 18px 18px 6px 18px; }
.msg.clone { align-self: flex-start; max-width: 92%; }
.msg.clone small { display: block; color: var(--muted); font-size: .78rem; margin-bottom: .1rem; }
.msg.clone { white-space: normal; }
.msg.clone p { margin: 0 0 .5rem; }
.msg.clone p:last-child { margin-bottom: 0; }
.msg.clone ul, .msg.clone ol { margin: 0 0 .5rem; padding-left: 1.3rem; }
.msg.clone pre { margin: 0 0 .5rem; white-space: pre-wrap; user-select: text; -webkit-user-select: text; }
.msg.clone code { font: .88em/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--soft); border-radius: 5px; padding: .05rem .3rem; }
.msg.clone pre code { background: none; padding: 0; }
.msg.clone.failed p { color: var(--muted); }
.msg.note { font-size: .85rem; color: var(--muted); align-self: center; text-align: center; }
.chat-empty { margin: auto 0 0; display: flex; flex-direction: column; gap: .7rem; align-items: flex-start; }
.chat-empty p { margin: 0; color: var(--muted); }
.suggest { display: flex; flex-wrap: wrap; gap: .4rem; }
button.chip { margin: 0; border-radius: 999px; background: var(--soft); color: var(--fg); font-weight: 500; font-size: .9rem; padding: .45rem .9rem; min-height: 2.5rem; }
button.chip:hover { background: color-mix(in srgb, var(--fg) 10%, transparent); }
.working { display: flex; align-items: center; gap: .5rem; color: var(--muted); font-size: .9rem; margin: 0; }
.spin { width: .9rem; height: .9rem; border-radius: 50%; border: 2px solid var(--line); border-top-color: var(--brand); animation: spin .9s linear infinite; flex: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } }
.decide-list { display: flex; flex-direction: column; gap: .5rem; max-height: 45vh; overflow-y: auto; margin-bottom: .5rem; }
.decide-list:empty { display: none; }
/* a decision as the app draws one (10-19 redesign): a card, its asker's line with the ember dot,
   the question, and choices of one weight as soft fills */
.decide { margin: 0; padding: .9rem 1rem; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); display: flex; flex-direction: column; gap: .45rem; }
.decide-head { margin: 0; font-weight: 600; font-size: .82rem; color: var(--muted); display: flex; align-items: center; gap: .45rem; }
.decide-head::before { content: ""; width: .5rem; height: .5rem; border-radius: 50%; background: var(--waiting); flex: none; }
.decide-text { margin: 0; white-space: pre-wrap; font-size: 1rem; font-weight: 600; }
.decide-acts { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .15rem; }
.decide-acts button { margin: 0; border-radius: 10px; min-height: 2.25rem; padding: .35rem .9rem; background: var(--soft); color: var(--fg); border: 0; font-weight: 600; }
.decide-acts button:hover:not(:disabled) { background: color-mix(in srgb, var(--fg) 10%, transparent); }
/* a request waiting on the person's own answer, on the Requests tab: the same card */
.rows.requests li.waits { border: 1px solid var(--line); border-radius: 14px; padding: .9rem 1rem; margin: 0 0 .6rem; }
.rows.requests li textarea { min-height: 4.5rem; resize: vertical; }
.rows.requests li.waits .who b::before { content: ""; display: inline-block; width: .5rem; height: .5rem; border-radius: 50%; background: var(--waiting); margin-right: .45rem; vertical-align: .1em; }
.dock { position: sticky; bottom: 0; background: var(--bg); padding: .6rem 0 1rem; }
.compose { margin: 0; }
.compose-box { display: flex; align-items: flex-end; gap: .5rem; border: 1px solid var(--field); border-radius: 26px; padding: .35rem .35rem .35rem 1rem; background: var(--bg); }
.compose-box:focus-within { border-color: var(--brand); box-shadow: 0 0 0 1px var(--brand); }
.compose textarea { border: 0; padding: .45rem 0; min-height: 1.6rem; max-height: 12rem; resize: none; background: transparent; outline: none; margin: 0; }
.compose button.send { width: 2.5rem; height: 2.5rem; border-radius: 50%; padding: 0; margin: 0; display: grid; place-items: center; flex: none; }
.compose button.send svg { width: 1.1rem; height: 1.1rem; }
.compose textarea:disabled + button.send { opacity: .45; }
.chat-foot { margin: .4rem .2rem 0; font-size: .78rem; color: var(--muted); }
.empty-state { display: flex; flex-direction: column; align-items: flex-start; gap: .75rem; padding-top: 1.5rem; }
.empty-state h2 { font-size: 1.2rem; }
.empty-state form { margin: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.pair { margin: 0 0 .5rem; padding: 1rem; border-radius: 14px; background: var(--brand-soft); display: flex; flex-direction: column; gap: .5rem; align-items: flex-start; }
.pair h2 { font-size: 1rem; }
.pair p { margin: 0; }
.pair button { margin: 0; }
.pair-code { font: 600 1.35rem/1.3 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .06em; font-variant-numeric: tabular-nums; }
h3 { font-size: .95rem; margin: .5rem 0 0; color: var(--muted); }
/* the office's tab (10-19 redesign): the drawing, and beside it inviting and the people as cards */
.office-grid { display: grid; gap: 1.5rem; align-items: start; }
.office-main, .office-side { min-width: 0; }
.office-side { display: flex; flex-direction: column; gap: .9rem; }
@media (min-width: 60rem) { .office-grid { grid-template-columns: minmax(0, 1fr) 18.5rem; } }
.side-card { border: 1px solid var(--line); border-radius: 14px; padding: 1rem; display: flex; flex-direction: column; gap: .5rem; }
.side-card h2 { font-size: .95rem; margin: 0; display: flex; align-items: center; gap: .4rem; }
.side-card p { margin: 0; font-size: .88rem; }
.side-card form { margin: 0; display: flex; flex-direction: column; gap: .45rem; }
.side-card form button { width: 100%; }
.side-card .rows li { padding: .45rem 0; }
.count-soft { font-size: .75rem; font-weight: 600; color: var(--muted); }
.office-more { display: grid; gap: 2rem 3rem; align-items: start; margin-top: 2rem; }
.office-more:not(:has(section)) { display: none; }
.office-more > section { min-width: 0; }
@media (min-width: 60rem) { .office-more { grid-template-columns: 1fr 1fr; } }
.room-slot { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; min-height: 18rem; display: grid; place-items: center; color: var(--muted); }
`;

const SEND_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;

export function homePage(input: {
  lang: PageLanguage;
  name: string;
  /** Which tab of the signed-in pages this is. */
  tab?: Exclude<HomeTab, "requests">;
  /** The reader's account id, to mark them in the list. */
  me?: string;
  /** The office shown, and the others the reader is in, to switch between. */
  office?: { id: string; name: string };
  /** An invite the reader just made, shown once to copy. */
  invited?: { link: string; days: number };
  /**
   * The reader's place in the office: on the web (no computer), or a clone; none yet, with no
   * computer connected, offers taking part on the web.
   */
  place?: "web" | "clone";
  /** For someone on the web: how many requests wait on their answer. */
  waiting?: number;
  /** Their conversation with their own clone, when they have one. */
  chat?: HomeChat;
  /** The office drawing for the Office tab, made by room-page.ts. */
  room?: string;
  /** The office's invites still open, for its owners to see and cancel. */
  invites?: {
    id: string;
    by: string;
    note: string;
    created: string;
    clone: boolean;
    account: boolean;
  }[];
  offices?: { id: string; name: string }[];
  computer?: { name: string; seen: string };
  command?: string;
  error?: string;
  /** Everyone with an account in the office, and whether the reader owns it. */
  people?: HomePerson[];
  owner?: boolean;
  /** Clones that joined with the key, shown to owners. */
  clones?: HomeClone[];
  /** Whether the reader sets how people sign in to the server. */
  admin?: boolean;
  /** How the reader signs in, and the ways the server offers. */
  ways?: SignInWays;
  methods?: SignInMethods;
  /**
   * What someone else did to the reader's account lately: a reset link, while it still works
   * (for `minutes` more, which they can stop), stopped, or ended unused.
   */
  events?: {
    kind: string;
    by: string;
    at: string;
    state: "open" | "stopped" | "ended";
    minutes: number;
  }[];
  /** A word for what just happened: the reader stopped a reset link. */
  done?: "stopped";
}): string {
  const { lang } = input;
  const tab = input.tab ?? "clone";
  const notices = (input.events ?? [])
    // just stopped, the line saying so is enough
    .filter(
      (event) =>
        event.kind === "reset-link" &&
        !(input.done === "stopped" && event.state === "stopped"),
    )
    .map((event) => {
      const named = {
        name: event.by,
        when: event.at,
        minutes: String(event.minutes),
      };
      // one that still works stands out, with the way to stop it; the rest are a quiet line
      return event.state === "open"
        ? `<form method="post" action="/home/reset/stop" class="alert" role="alert"><p>${say(lang, event.minutes === 1 ? "resetOpenOne" : "resetOpen", named)}</p><button type="submit" class="danger small">${say(lang, "resetStop")}</button></form>`
        : `<p class="note">${say(lang, event.state === "stopped" ? "resetStopped" : "resetEnded", named)}</p>`;
    })
    .join("");
  const office = input.office;
  const people = input.people ?? [];
  const owner = Boolean(input.owner);
  // Every change an owner makes names the office shown, as one may own several.
  const at = office ? `office=${encodeURIComponent(office.id)}` : "";
  const officeField = office
    ? `<input type="hidden" name="office" value="${escape(office.id)}">`
    : "";
  const band = homeBand(lang, {
    tab,
    name: input.name,
    admin: input.admin,
    ...(office ? { office } : {}),
    offices: input.offices ?? [],
    ...(input.waiting ? { waiting: input.waiting } : {}),
    ...(input.place === "web" ? { web: true } : {}),
  });
  const top = `${INVITE_ERRORS.has(input.error ?? "") ? "" : problem(lang, input.error)}
${input.done === "stopped" ? `<p class="done" role="status">${say(lang, "stoppedDone")}</p>` : ""}
${notices}`;
  const title = say(lang, "hello", { name: input.name });
  const page = (body: string, main?: string, scripts?: string[]) =>
    shell(lang, counted(title, input.waiting ?? 0), body, undefined, {
      band,
      style: HOME_STYLE,
      ...(main ? { main } : {}),
      scripts: scripts ?? ["/assets/home.mjs"],
    });
  if (!office) return page(`${top}<p>${errorWords(lang, "not-in-office")}</p>`);
  const connect = input.command
    ? `<p>${say(lang, "connectHow")}</p><pre>${escape(input.command)}</pre><p class="note">${say(lang, "commandNote")}</p>`
    : // beside the requests waiting on someone on the web, connecting is the quieter of the two
      `<form method="post" action="/home/pair">${officeField}<button type="submit"${input.place === "web" ? ' class="quiet"' : ""}>${say(lang, "connectCta")}</button></form>`;

  if (tab === "account") {
    const ways = input.ways;
    const signIn =
      ways && (input.methods?.google || ways.google)
        ? `<section>
<h2>${say(lang, "waysTitle")}</h2>
<ul class="ways">${
            ways.password
              ? `<li><span class="who"><b>${say(lang, "waysPassword")}</b></span><span class="tag">${say(lang, "inUse")}</span></li>`
              : ""
          }<li><span class="who"><b>${say(lang, "waysGoogle")}</b>${
            ways.google
              ? ""
              : `<small>${say(lang, "connectGoogleWhat")}</small>`
          }</span>${
            ways.google
              ? `<span class="tag">${say(lang, "linked")}</span>`
              : `<span class="acts"><a class="small" href="/home/google">${say(lang, "connectGoogle")}</a></span>`
          }</li></ul>
</section>`
        : "";
    const self = people.find((one) => one.id === input.me);
    return page(`${top}
<h1>${say(lang, "accountTitle")}</h1>
<p class="note">${escape(input.name)}${self?.email ? ` · ${escape(self.email)}` : ""}</p>
<section>
<h2>${say(lang, "connectTitle")}</h2>
<p class="note">${
      input.computer
        ? say(lang, "connected", {
            name: input.computer.name,
            when: input.computer.seen,
          })
        : say(lang, "notConnected")
    }</p>
${
  input.command
    ? connect
    : `<form method="post" action="/home/pair">${officeField}<button type="submit" class="quiet">${say(lang, input.computer ? "moveComputer" : "connectCta")}</button></form>`
}
</section>
${signIn}`);
  }

  if (tab === "office") {
    const personRow = (person: HomePerson) => {
      const self = person.id === input.me;
      const acts =
        owner && !self
          ? `<span class="acts">${
              person.role === "member"
                ? `<a class="small" href="/home/people/owner?user=${encodeURIComponent(person.id)}&amp;${at}">${say(lang, "makeOwner")}</a>`
                : ""
            }<a class="small" href="/home/people/remove?user=${encodeURIComponent(person.id)}&amp;${at}">${say(lang, "remove")}</a></span>`
          : "";
      return `<li><span class="who"><b>${escape(person.name)}</b><span class="tag">${say(lang, person.role === "owner" ? "owner" : "member")}</span>${self ? `<span class="tag">${say(lang, "you")}</span>` : ""}<small>${escape(person.email)} · ${
        person.web
          ? say(lang, "onWebPerson")
          : person.seen
            ? say(lang, "cloneIn", { when: person.seen })
            : say(lang, "cloneOut")
      }</small></span>${acts}</li>`;
    };
    const clones = owner ? (input.clones ?? []) : [];
    return page(
      `${top}
<h1 class="visually-hidden">${say(lang, "officeTitle")}</h1>
<div class="office-grid">
<div class="office-main">${input.room ?? ""}</div>
<aside class="office-side">
<section id="invite" class="side-card">
<h2>${say(lang, "inviteTeam")}</h2>
${INVITE_ERRORS.has(input.error ?? "") ? problem(lang, input.error) : ""}
<p>${say(lang, "inviteWhat", { days: String(input.invited?.days ?? 7) })}</p>
${
  input.invited
    ? `<p class="done" role="status">${say(lang, "inviteMade")}</p>
<pre>${escape(input.invited.link)}</pre>
<p class="note">${say(lang, "inviteOnce")}</p>`
    : ""
}
<form method="post" action="/home/invite">${officeField}<label for="invite-note">${say(lang, "inviteFor")}</label><input id="invite-note" name="note" maxlength="80" autocomplete="off"><button type="submit">${say(lang, "inviteMake")}</button></form>
${
  owner && input.invites?.length
    ? `<h3>${say(lang, "invitesTitle")}</h3>
<ul class="rows">${input.invites
        .map(
          (one) =>
            `<li><span class="who">${one.note ? `<b>${escape(one.note)}</b>` : ""}<small>${say(lang, "inviteFrom", { by: one.by, when: one.created })}${one.clone ? ` · ${say(lang, "inviteHalfClone")}` : one.account ? ` · ${say(lang, "inviteHalfAccount")}` : ""}</small></span><form method="post" action="/home/invite/cancel" class="acts">${officeField}<input type="hidden" name="invite" value="${escape(one.id)}"><button type="submit" class="ghost small">${say(lang, "cancel")}</button></form></li>`,
        )
        .join("")}</ul>`
    : ""
}
</section>
${
  people.length
    ? `<section class="side-card">
<h2>${say(lang, "people")} <span class="count-soft">${people.length}</span></h2>
${owner ? `<p class="note">${say(lang, "peopleOwner")}</p>` : ""}
<ul class="rows">${people.map(personRow).join("")}</ul>
</section>`
    : ""
}
</aside>
</div>
<div class="office-more">
${
  clones.length
    ? `<section>
<h2>${say(lang, "keyed")}</h2>
<p class="note">${say(lang, "keyedWhat")}</p>
<ul class="rows">${clones
        .map(
          (clone) =>
            `<li><span class="who"><b>${escape(clone.name)}</b><small>${escape(clone.role)}${clone.role ? " · " : ""}${say(lang, "cloneIn", { when: clone.seen })}</small></span><span class="acts"><a class="small" href="/home/clones/remove?member=${encodeURIComponent(clone.id)}&amp;${at}">${say(lang, "remove")}</a></span></li>`,
        )
        .join("")}</ul>
</section>`
    : ""
}
${
  owner
    ? `<section>
<h2>${say(lang, "officeName")}</h2>
<form method="post" action="/home/office/name" class="inline">${officeField}<input name="name" maxlength="80" value="${escape(office.name)}" aria-label="${say(lang, "officeName")}"><button type="submit" class="quiet">${say(lang, "save")}</button></form>
<p class="note"><a href="/home/invite/new?${at}">${say(lang, "newLink")}</a></p>
</section>`
    : ""
}
</div>`,
      "wide",
    );
  }

  // My clone: talking to it, or how to have one.
  if (input.place === "clone" && input.chat) {
    const chat = input.chat;
    const thread = chatThread(lang, chat, office.id);
    return page(
      `${top}
<p class="status"><i class="${chat.present ? "on" : ""}"></i>${say(lang, chat.present ? "computerOn" : "computerOff")}</p>
<div id="thread" class="thread" data-office="${escape(office.id)}" data-waiting="${thread.waiting ? "1" : "0"}" data-on="${chat.on ? "1" : "0"}" data-keys="${escape(chat.keys.join(","))}">${thread.html}</div>
<p id="chat-news" class="visually-hidden" role="status"></p>
<div class="dock">
<div id="decide" class="decide-list" aria-label="${say(lang, "toDecide")}">${thread.decide}</div>
${chat.on ? "" : `<p class="callout">${say(lang, "chatOff")}</p>`}
<noscript><p class="callout">${say(lang, "chatScript")}</p></noscript>
<p id="pair-secure" class="callout" hidden>${say(lang, "pairSecure")}</p>
<section id="pair" class="pair" hidden><h2>${say(lang, "pairTitle")}</h2><p>${say(lang, "pairWhat")}</p><p id="pair-code" class="pair-code"></p><button id="pair-start" type="button">${say(lang, "pairStart")}</button><p id="pair-wait" class="working" hidden><span class="spin" aria-hidden="true"></span>${say(lang, "pairWaiting")}</p></section>
<form id="say" class="compose" method="post" action="/home/clone/say" data-answered="${say(lang, "chatAnswered")}" data-news="${say(lang, "chatNews")}">${officeField}<div class="compose-box"><textarea id="say-text" name="text" rows="1" maxlength="8000" required placeholder="${say(lang, "chatPlaceholder")}" aria-label="${say(lang, "chatPlaceholder")}" disabled></textarea><button type="submit" class="send" aria-label="${say(lang, "chatSend")}" disabled>${SEND_ICON}</button></div><p class="chat-foot">${say(lang, "chatKept")}</p><p id="say-error" class="error" role="alert" hidden></p></form>
</div>`,
      "chat",
      ["/assets/home.mjs"],
    );
  }
  if (input.place === "web")
    return page(`${top}
<section class="empty-state">
<h2>${say(lang, "onWebTitle")}</h2>
<p>${say(lang, "onWebWhat")}</p>
<p><a class="button${input.waiting ? "" : " quiet"}" href="/home/requests?${at}">${
      input.waiting
        ? say(lang, "requestsWaiting", { count: String(input.waiting) })
        : say(lang, "requestsLink")
    }</a></p>
${connect}
</section>`);
  return page(`${top}
<section class="empty-state">
<h2>${say(lang, "noCloneTitle")}</h2>
<p>${say(lang, "noCloneWhat")}</p>
${connect}
${input.command ? "" : `<form method="post" action="/home/web">${officeField}<button type="submit" class="quiet">${say(lang, "webCta")}</button></form>`}
</section>`);
}

/** A count of people said with its own sentence, in the singular for one; nothing for none. */
function countLine(
  lang: PageLanguage,
  count: number,
  many: Key,
  one: Key,
): string {
  if (count <= 0) return "";
  return count === 1
    ? say(lang, one)
    : say(lang, many, { count: String(count) });
}

/** One more look before something an owner can't take back: who it is about, and yes or cancel. */
export function confirmPage(input: {
  lang: PageLanguage;
  what:
    | "remove"
    | "owner"
    | "clone"
    | "newLink"
    | "googleRemove"
    | "googleOff"
    | "passwordOff"
    | "reset"
    | "join"
    | "removeAccount";
  name?: string;
  /** The office it is about, where it is one. */
  office?: string;
  /** How many people it leaves without a way in, where it does. */
  count?: number;
  action: string;
  fields?: Record<string, string>;
  /** Where Cancel goes: one's own page unless said. */
  back?: string;
  /** Who sent the invite, said on the question to join. */
  invitedBy?: string;
  /** Where signing out from the question to join goes on to: the invite, to make an account. */
  signOutNext?: string;
  /** Why it cannot be done now, said in place of the button (an error code). */
  blocked?: string;
}): string {
  const { lang } = input;
  const words = {
    remove: ["removeTitle", "removeWhat", "remove"],
    owner: ["ownerTitle", "ownerWhat", "makeOwner"],
    clone: ["cloneTitle", "cloneWhat", "remove"],
    newLink: ["newLinkTitle", "newLinkWhat", "newLink"],
    googleRemove: ["googleRemoveTitle", "googleRemoveWhat", "removeGoogle"],
    googleOff: ["googleOffTitle", "googleOffWhat", "turnOff"],
    passwordOff: ["passwordOffTitle", "passwordOffWhat", "turnOff"],
    reset: ["resetTitle", "resetWhat", "resetMake"],
    join: ["joinTitle", "joinWhat", "join"],
    removeAccount: ["removeAccountTitle", "removeAccountWhat", "removeAccount"],
  } as const;
  const [titleKey, whatKey, yesKey] = words[input.what];
  const named = {
    name: input.name ?? "",
    office: input.office || WORDS[lang].thatOffice,
  };
  // Something that cannot be done now is said as it is, not asked.
  const title = input.blocked
    ? say(lang, "passwordOffBlocked")
    : say(lang, titleKey, named);
  const hidden = Object.entries(input.fields ?? {})
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escape(name)}" value="${escape(value)}">`,
    )
    .join("");
  // Who is left without a way in, said only when someone is.
  const locked =
    input.what === "passwordOff"
      ? countLine(lang, input.count ?? 0, "lockedPassword", "lockedPasswordOne")
      : input.what === "googleOff" || input.what === "googleRemove"
        ? countLine(lang, input.count ?? 0, "lockedGoogle", "lockedGoogleOne")
        : "";
  const safe =
    input.what === "owner" || input.what === "reset" || input.what === "join";
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${input.what === "join" && input.invitedBy ? `<p>${say(lang, "joinFrom", { from: input.invitedBy })}</p>` : ""}
${input.blocked ? "" : `<p>${say(lang, whatKey, named)}</p>`}
${locked && !input.blocked ? `<p>${locked}</p>` : ""}
${
  input.blocked
    ? `${problem(lang, input.blocked)}
<div class="acts">${input.blocked === "link-google-first" ? `<a class="button" href="/home/google">${say(lang, "connectGoogle")}</a>` : ""}<a class="button ghost" href="${escape(input.back ?? "/home")}">${say(lang, "cancel")}</a></div>`
    : `<form method="post" action="${escape(input.action)}">${hidden}<div class="acts"><button type="submit"${safe ? "" : ' class="danger"'}>${say(lang, yesKey)}</button><a class="button ghost" href="${escape(input.back ?? "/home")}">${say(lang, "cancel")}</a></div></form>`
}
${
  // on a shared browser, the one invited signs the other person out to make their own account
  input.what === "join"
    ? `<form method="post" action="/logout">${input.signOutNext ? `<input type="hidden" name="next" value="${escape(input.signOutNext)}">` : ""}<p class="note">${say(lang, "notYou", named)} <button type="submit" class="ghost small">${say(lang, "signOut")}</button></p></form>`
    : ""
}`,
  );
}

/** A person with an account on the server, as its admin sees them. */
export interface ServerPerson {
  id: string;
  name: string;
  email: string;
  password: boolean;
  google: boolean;
}

/**
 * How people sign in to the server, for its admin: email and password, and Google with the client
 * they registered (its secret kept encrypted, never shown), each on or off, one always on; and the
 * people with accounts, a reset link for one who forgot their password.
 */
export function adminPage(input: {
  lang: PageLanguage;
  settings: SignInSettings;
  /** Where Google sends people back to on this server. */
  redirect: string;
  people?: ServerPerson[];
  /** The reader's account id, to leave them out of the reset links. */
  me?: string;
  error?: string;
  /** A failure of the Google form, said under it with what was typed kept. */
  googleError?: string;
  clientId?: string;
  /** A word for what just happened: saved (maybe passwords back on for everyone with it), or the admin just made. */
  done?: "saved" | "password-back" | "welcome";
}): string {
  const { lang, settings } = input;
  const title = say(lang, "adminTitle");
  const google = settings.google;
  const state = (on: boolean | undefined) =>
    on === undefined
      ? `<span class="state">${say(lang, "stateUnset")}</span>`
      : `<span class="state${on ? " on" : ""}">${say(lang, on ? "stateOn" : "stateOff")}</span>`;
  const back = new URL(input.redirect);
  // Google takes an http address back only on this computer.
  const httpsWanted =
    back.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(back.hostname);
  const password = `<section class="method">
<div class="top"><h2>${say(lang, "waysPassword")}</h2>${state(!settings.passwordKeptOff)}</div>
<p class="note">${say(lang, "methodPasswordWhat")}</p>
${
  google?.on
    ? `<p class="note">${countLine(lang, settings.passwordOnly, "passwordOnly", "passwordOnlyOne")}</p>`
    : ""
}
${
  !settings.passwordKeptOff
    ? google?.on && !settings.mineLinked
      ? `<p class="note">${say(lang, "linkFirst")} <a href="/home/google">${say(lang, "connectGoogle")}</a></p>`
      : google?.on
        ? `<p><a class="button quiet" href="/home/admin/password/off">${say(lang, "turnOff")}</a></p>`
        : ""
    : `<form method="post" action="/home/admin/password"><input type="hidden" name="on" value="1"><button type="submit">${say(lang, "turnOn")}</button></form>`
}
</section>`;
  const failed = input.googleError;
  const idWrong = failed === "google-id-wrong";
  const secretWrong =
    failed === "google-secret-missing" || failed === "google-secret-wrong";
  const fieldError = (code: string | undefined, id: string) =>
    code
      ? `<p class="field-error" id="${id}" role="alert">${errorWords(lang, code)}</p>`
      : "";
  // Just made the admin: Google, which is optional, waits folded below the next step.
  const setUp = `<details${(!google && input.done !== "welcome") || failed ? " open" : ""}><summary>${say(lang, google ? "googleChange" : "googleSetup")}</summary>
<section class="guide">
<ol class="steps">
<li><span>${say(lang, "step1")}</span><a href="https://console.cloud.google.com/apis/credentials" rel="noreferrer" target="_blank">${say(lang, "consoleLink")}</a></li>
<li><span>${say(lang, "step2")}</span><pre>${escape(input.redirect)}</pre>${httpsWanted ? `<small>${say(lang, "httpsNote")}</small>` : ""}</li>
<li><span>${say(lang, "step3")}</span></li>
</ol>
${settings.sealing ? "" : `<p class="error">${say(lang, "sealingOff")}</p>`}
${failed && !idWrong && !secretWrong ? fieldError(failed, "google-error") : ""}
<form method="post" action="/home/admin/google#google">
<label for="clientId">${say(lang, "clientId")}</label>
<input id="clientId" name="clientId" required maxlength="260" autocomplete="off" spellcheck="false" value="${escape(input.clientId ?? google?.clientId ?? "")}"${idWrong ? ' aria-invalid="true" aria-describedby="client-error"' : ""}>
${idWrong ? fieldError(failed, "client-error") : ""}
<label for="secret">${say(lang, "clientSecret")}</label>
<input id="secret" name="secret" type="password" maxlength="200" autocomplete="off"${google ? "" : " required"}${secretWrong ? ' aria-invalid="true" aria-describedby="secret-error"' : ""}>
${secretWrong ? fieldError(failed, "secret-error") : ""}
<p class="note small">${say(lang, "secretNew")}${google ? ` ${say(lang, "secretKeep")}` : ""}</p>
<button type="submit"${settings.sealing ? "" : " disabled"}>${say(lang, google?.on ? "save" : "saveGoogle")}</button>
</form>
</section>
</details>`;
  const googleSection = `<section class="method" id="google">
<div class="top"><h2>${say(lang, "waysGoogle")}</h2>${state(google ? google.on : undefined)}</div>
<p class="note">${say(lang, "methodGoogleWhat")}</p>
${
  google
    ? `<p class="note">${say(lang, "savedBy", {
        name: google.by,
        when: new Date(google.at).toLocaleDateString(lang, {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      })}</p>
${google.readable ? "" : `<p class="error">${errorWords(lang, "google-unreadable")}</p>`}
${google.on ? `<p class="note">${countLine(lang, settings.googleOnly, "googleOnly", "googleOnlyOne")}</p>` : ""}
<div class="acts">${
        google.on
          ? settings.password
            ? settings.googleOnly > 0
              ? `<a class="button quiet" href="/home/admin/google/off">${say(lang, "turnOff")}</a>`
              : `<form method="post" action="/home/admin/google/off"><button type="submit" class="quiet">${say(lang, "turnOff")}</button></form>`
            : ""
          : google.readable
            ? `<form method="post" action="/home/admin/google/on"><button type="submit">${say(lang, "turnOn")}</button></form>`
            : ""
      }${settings.password ? `<a class="button ghost" href="/home/admin/google/remove">${say(lang, "removeGoogle")}</a>` : ""}</div>`
    : ""
}
${setUp}
</section>`;
  const people = input.people ?? [];
  const peopleSection = people.length
    ? `<section>
<h2>${say(lang, "serverPeople")}</h2>
<p class="note">${say(lang, "serverPeopleWhat")}</p>
<ul class="rows">${people
        .map(
          (person) =>
            `<li><span class="who"><b>${escape(person.name)}</b>${person.id === input.me ? `<span class="tag">${say(lang, "you")}</span>` : ""}<small>${escape(person.email)} · ${[
              person.password ? say(lang, "waysPassword") : "",
              person.google ? say(lang, "waysGoogle") : "",
            ]
              .filter(Boolean)
              .join(", ")}</small></span>${
              person.id === input.me
                ? ""
                : `<span class="acts">${
                    person.password && settings.password
                      ? `<a class="small" href="/home/admin/reset?user=${encodeURIComponent(person.id)}">${say(lang, "resetLink")}</a>`
                      : ""
                  }<a class="small" href="/home/admin/account/remove?user=${encodeURIComponent(person.id)}">${say(lang, "removeAccount")}</a></span>`
            }</li>`,
        )
        .join("")}</ul>
</section>`
    : "";
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p class="note">${say(lang, "adminWhat")}</p>
${problem(lang, input.error)}
${
  input.done === "welcome"
    ? `<section class="welcome"><p class="done" role="status">${say(lang, "welcome")}</p>
<p><a class="button" href="/home#invite">${say(lang, "inviteTeam")}</a></p></section>`
    : input.done
      ? `<p class="done" role="status">${say(lang, input.done === "password-back" ? "passwordBack" : "saved")}</p>`
      : ""
}
${password}
${googleSection}
${peopleSection}
<p><a href="/home">${say(lang, "backHome")}</a></p>`,
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
