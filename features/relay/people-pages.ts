// The pages of an office's server for the people who sign in there (accounts.ts): making an account
// from an invite, signing in (with a password, or with Google where the admin turned it on), one's
// own page with the line that connects one's computer, and, for the server's admin, how people sign
// in. Plain HTML from the relay, with no scripts and nothing from elsewhere, in the reader's language
// when written in it (English otherwise); everything a person typed is escaped before it is shown,
// and a password or a secret is never put back into a page.

import type { AllInSync } from "../../i18n/sync.ts";
import type { SignInMethods, SignInSettings, SignInWays } from "./accounts.ts";
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
    continueGoogle: "Continue with Google",
    orWord: "or",
    waysTitle: "How you sign in",
    waysPassword: "Email and password",
    waysGoogle: "Google",
    connectGoogle: "Connect Google",
    connectGoogleWhat: "Sign in with your Google account too.",
    inUse: "In use",
    linked: "Connected",
    adminLink: "Sign-in settings for this server",
    adminTitle: "Sign-in settings",
    adminWhat:
      "How people sign in to this server. It applies to every office here, and one way always stays on.",
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
      "Connect your own Google account on your page before turning this off, so you can still sign in.",
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
    secretNew: "It is sealed on this server and never shown again.",
    secretKeep: "Leave it empty to keep the secret already saved.",
    savedBy: "Set up by {name}, {when}.",
    saveGoogle: "Save and turn on",
    removeGoogle: "Remove Google settings",
    sealingOff:
      "To keep a Google secret, this server needs a sealing key: set RELAY_ENCRYPTION_KEY (openssl rand -base64 32) and restart it.",
    googleRemoveTitle: "Remove the Google settings?",
    googleRemoveWhat:
      "The client ID and the sealed secret are deleted from this server. {count} people who sign in only with Google can't sign in until it is set up again.",
    passwordOffTitle: "Turn off email and password?",
    passwordOffWhat:
      "{count} people who sign in only with a password can't sign in while it is off. You can turn it back on any time.",
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
        "Connect your own Google account first (on your page), so you can still sign in.",
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
    },
  },
  ko: {
    inviteTitle: "{from} 님이 오피스에 초대했어요",
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
    continueGoogle: "Google 계정으로 계속하기",
    orWord: "또는",
    waysTitle: "내 로그인 방법",
    waysPassword: "이메일과 비밀번호",
    waysGoogle: "Google",
    connectGoogle: "Google 연결",
    connectGoogleWhat: "Google 계정으로도 로그인할 수 있어요.",
    inUse: "사용 중",
    linked: "연결됨",
    adminLink: "이 서버의 로그인 설정",
    adminTitle: "로그인 설정",
    adminWhat:
      "사람들이 이 서버에 로그인하는 방법이에요. 이 서버의 모든 오피스에 똑같이 적용되고, 한 가지는 항상 켜져 있어요.",
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
      "끄기 전에 내 페이지에서 내 Google 계정을 연결해 두세요. 그래야 나도 계속 로그인할 수 있어요.",
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
    secretNew: "이 서버에 봉인해서 저장하고, 다시 보여 주지 않아요.",
    secretKeep: "비워 두면 저장된 보안 비밀번호를 그대로 써요.",
    savedBy: "{name}님이 설정했어요. {when}",
    saveGoogle: "저장하고 켜기",
    removeGoogle: "Google 설정 지우기",
    sealingOff:
      "Google 보안 비밀번호를 저장하려면 이 서버에 봉인 키가 있어야 해요. RELAY_ENCRYPTION_KEY(openssl rand -base64 32)를 넣고 다시 시작해 주세요.",
    googleRemoveTitle: "Google 설정을 지울까요?",
    googleRemoveWhat:
      "클라이언트 ID와 봉인한 보안 비밀번호가 이 서버에서 지워져요. Google로만 로그인하는 {count}명은 다시 설정할 때까지 로그인할 수 없어요.",
    passwordOffTitle: "이메일과 비밀번호 로그인을 끌까요?",
    passwordOffWhat:
      "비밀번호로만 로그인하는 {count}명은 끄는 동안 로그인할 수 없어요. 언제든 다시 켤 수 있어요.",
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
        "먼저 내 페이지에서 내 Google 계정을 연결해 주세요. 그래야 나도 계속 로그인할 수 있어요.",
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
    },
  },
  zh: {
    inviteTitle: "{from}邀请你加入他们的办公室",
    inviteTitleNobody: "你收到了一个办公室的邀请",
    what: "在这个办公室里，每个人的分身（一个像本人一样工作的 AI）会接收并回答团队的请求，只把该本人决定的事交给本人。",
    accountInstead: "或者在这个办公室的服务器上创建账号",
    accountWhy:
      "有了账号，你可以在这里登录，看看办公室里有谁，并用你的名字连接你的电脑。",
    name: "你的名字",
    email: "邮箱",
    password: "密码（至少 8 位）",
    create: "创建我的账号",
    haveAccount: "已经有账号了？",
    signInLink: "登录",
    keep: "拿到这个链接的任何人都能加入这个办公室，请只在团队内分享。",
    signInTitle: "登录你的办公室",
    signIn: "登录",
    noAccount: "还没有账号？打开你们办公室的邀请链接来创建。",
    hello: "{name}，你好",
    yourOffice: "你的办公室",
    connectTitle: "连接你的电脑",
    connectWhat:
      "你的分身在你的电脑上运行：它从那里的 AI 记录中学习，用你自己的 AI 思考，用你的文件工作。请在那台电脑的终端里运行一次这行命令（需要 Node.js 22 或更高版本，可从 nodejs.org 获取）：",
    makeCommand: "生成我的连接命令",
    commandNote:
      "只能用一次，10 分钟内有效；随时可以重新生成。连接另一台电脑，会把你的分身移到那台电脑上。",
    connected: "已连接：{name}的分身，最近在线 {when}。",
    notConnected: "还没有连接任何电脑。",
    inviteTeam: "邀请同事",
    inviteWhat: "把这个链接发给对方，对方用它创建账号。",
    signOut: "退出登录",
    runTitle: "在你的电脑上运行这个",
    runWhat: "这个链接会把一台电脑连接到你的办公室。请在那台电脑的终端里运行：",
    people: "这个办公室的成员",
    peopleOwner: "作为所有者，你决定谁能留在办公室，也可以把其他人设为所有者。",
    owner: "所有者",
    member: "成员",
    you: "你",
    cloneIn: "分身已连接，最近在线 {when}",
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
    newLink: "生成新的邀请链接",
    newLinkTitle: "生成新的邀请链接？",
    newLinkWhat: "之前发出的链接会失效。已经在办公室里的人不受影响。",
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
    adminLink: "这台服务器的登录设置",
    adminTitle: "登录设置",
    adminWhat:
      "大家登录这台服务器的方式。它适用于这里的每个办公室，并且始终至少保留一种方式。",
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
    savedBy: "由 {name} 设置，{when}。",
    saveGoogle: "保存并开启",
    removeGoogle: "删除 Google 设置",
    sealingOff:
      "要保存 Google 密钥，这台服务器需要一个加密密钥：设置 RELAY_ENCRYPTION_KEY（openssl rand -base64 32）后重启。",
    googleRemoveTitle: "删除 Google 设置？",
    googleRemoveWhat:
      "客户端 ID 和加密保存的密钥会从这台服务器上删除。只用 Google 登录的 {count} 人在重新设置之前将无法登录。",
    passwordOffTitle: "关闭邮箱和密码登录？",
    passwordOffWhat:
      "只用密码登录的 {count} 人在关闭期间无法登录。你随时可以重新开启。",
    errors: {
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
      "link-google-first":
        "请先在你的页面关联你自己的 Google 账号，这样你仍然可以登录。",
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
    },
  },
  ja: {
    inviteTitle: "{from}さんからオフィスへの招待が届いています",
    inviteTitleNobody: "オフィスに招待されています",
    what: "このオフィスでは、一人ひとりのクローン（本人のように働くAI）がチームの依頼を受けて答え、本人が決めるべきことだけを本人に届けます。",
    accountInstead: "または、このオフィスのサーバーでアカウントを作る",
    accountWhy:
      "アカウントがあれば、ここにサインインしてオフィスに誰がいるかを確認し、あなたの名前でコンピューターをつなげます。",
    name: "名前",
    email: "メールアドレス",
    password: "パスワード（8文字以上）",
    create: "アカウントを作成",
    haveAccount: "アカウントをお持ちですか？",
    signInLink: "サインイン",
    keep: "このリンクがあれば誰でもこのオフィスに参加できます。チームの中だけで共有してください。",
    signInTitle: "オフィスにサインイン",
    signIn: "サインイン",
    noAccount:
      "まだアカウントがない場合は、オフィスの招待リンクを開いて作成してください。",
    hello: "{name}さん、こんにちは",
    yourOffice: "あなたのオフィス",
    connectTitle: "コンピューターをつなぐ",
    connectWhat:
      "クローンはあなたのコンピューターで動きます。そこにあるAIの記録から学び、あなた自身のAIで考え、あなたのファイルで作業します。そのコンピューターのターミナルで、これを一度実行してください（Node.js 22以降が必要です。nodejs.orgから入手できます）：",
    makeCommand: "接続コマンドを作成",
    commandNote:
      "1回だけ、10分間有効です。いつでも作り直せます。別のコンピューターをつなぐと、クローンはそちらに移ります。",
    connected: "接続済み：{name}さんのクローン、最終オンライン {when}。",
    notConnected: "まだコンピューターがつながっていません。",
    inviteTeam: "チームメイトを招待",
    inviteWhat: "このリンクを送ると、相手はそれでアカウントを作れます。",
    signOut: "サインアウト",
    runTitle: "コンピューターでこれを実行",
    runWhat:
      "このリンクは、コンピューターをあなたのオフィスにつなぎます。そのコンピューターのターミナルで実行してください：",
    people: "このオフィスのメンバー",
    peopleOwner:
      "オーナーとして、誰がオフィスにいるかを決められ、ほかの人をオーナーにすることもできます。",
    owner: "オーナー",
    member: "メンバー",
    you: "あなた",
    cloneIn: "クローン接続済み、最終オンライン {when}",
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
    newLink: "新しい招待リンクを作る",
    newLinkTitle: "新しい招待リンクを作りますか？",
    newLinkWhat:
      "前に送ったリンクは使えなくなります。すでに参加している人はそのままです。",
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
    adminLink: "このサーバーのサインイン設定",
    adminTitle: "サインイン設定",
    adminWhat:
      "このサーバーへのサインイン方法です。ここにあるすべてのオフィスに適用され、少なくとも一つは常にオンのままです。",
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
    savedBy: "{name}さんが設定しました（{when}）。",
    saveGoogle: "保存してオンにする",
    removeGoogle: "Google の設定を削除",
    sealingOff:
      "Google のシークレットを保存するには、このサーバーに暗号化キーが必要です。RELAY_ENCRYPTION_KEY（openssl rand -base64 32）を設定して再起動してください。",
    googleRemoveTitle: "Google の設定を削除しますか？",
    googleRemoveWhat:
      "クライアント ID と暗号化したシークレットがこのサーバーから削除されます。Google だけでサインインする{count}人は、設定し直すまでサインインできません。",
    passwordOffTitle:
      "メールアドレスとパスワードのサインインをオフにしますか？",
    passwordOffWhat:
      "パスワードだけでサインインする{count}人は、オフの間サインインできません。いつでもオンに戻せます。",
    errors: {
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
        "先に自分のページで自分の Google アカウントをつないでください。そうすればあなたも引き続きサインインできます。",
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
    },
  },
  es: {
    inviteTitle: "{from} te invita a su oficina",
    inviteTitleNobody: "Te invitaron a una oficina",
    what: "En esta oficina, el clon de cada persona (una IA que trabaja como ella) recibe y responde las solicitudes del equipo, y a cada persona solo le trae las decisiones que le tocan.",
    accountInstead: "O crea una cuenta en el servidor de esta oficina",
    accountWhy:
      "Con una cuenta inicias sesión aquí, ves quién está en la oficina y conectas tu computadora con tu nombre.",
    name: "Tu nombre",
    email: "Correo electrónico",
    password: "Contraseña (8 caracteres o más)",
    create: "Crear mi cuenta",
    haveAccount: "¿Ya tienes una cuenta?",
    signInLink: "Iniciar sesión",
    keep: "Cualquiera con este enlace puede unirse a esta oficina; compártelo solo dentro de tu equipo.",
    signInTitle: "Inicia sesión en tu oficina",
    signIn: "Iniciar sesión",
    noAccount:
      "¿Todavía no tienes cuenta? Abre el enlace de invitación de tu oficina para crear una.",
    hello: "Hola, {name}",
    yourOffice: "Tu oficina",
    connectTitle: "Conecta tu computadora",
    connectWhat:
      "Tu clon funciona en tu computadora: aprende de tus registros de IA que hay ahí, piensa con tu propia IA y trabaja con tus archivos. Ejecuta esto una vez en una terminal de esa computadora (necesita Node.js 22 o posterior, de nodejs.org):",
    makeCommand: "Crear mi comando de conexión",
    commandNote:
      "Funciona una sola vez, durante 10 minutos; crea uno nuevo cuando quieras. Si conectas otra computadora, tu clon se muda ahí.",
    connected: "Conectado: el clon de {name}, visto por última vez {when}.",
    notConnected: "Todavía no hay ninguna computadora conectada.",
    inviteTeam: "Invita a un colega",
    inviteWhat: "Envíale este enlace; con él crea su cuenta.",
    signOut: "Cerrar sesión",
    runTitle: "Ejecuta esto en tu computadora",
    runWhat:
      "Este enlace conecta una computadora a tu oficina. Ejecútalo en una terminal de esa computadora:",
    people: "Personas en esta oficina",
    peopleOwner:
      "Como dueño, decides quién está dentro y también puedes hacer dueños a otros.",
    owner: "Dueño",
    member: "Miembro",
    you: "tú",
    cloneIn: "Clon conectado, visto por última vez {when}",
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
    newLink: "Crear un nuevo enlace de invitación",
    newLinkTitle: "¿Crear un nuevo enlace de invitación?",
    newLinkWhat:
      "El enlace que enviaste antes deja de funcionar. Quienes ya están dentro siguen dentro.",
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
    adminLink: "Ajustes de inicio de sesión de este servidor",
    adminTitle: "Ajustes de inicio de sesión",
    adminWhat:
      "Cómo inician sesión las personas en este servidor. Se aplica a todas las oficinas de aquí, y siempre queda al menos una forma activa.",
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
    savedBy: "Configurado por {name}, {when}.",
    saveGoogle: "Guardar y activar",
    removeGoogle: "Eliminar los ajustes de Google",
    sealingOff:
      "Para guardar un secreto de Google, este servidor necesita una clave de cifrado: define RELAY_ENCRYPTION_KEY (openssl rand -base64 32) y reinícialo.",
    googleRemoveTitle: "¿Eliminar los ajustes de Google?",
    googleRemoveWhat:
      "El ID de cliente y el secreto cifrado se borran de este servidor. {count} personas que inician sesión solo con Google no podrán hacerlo hasta que se configure de nuevo.",
    passwordOffTitle: "¿Desactivar el correo y la contraseña?",
    passwordOffWhat:
      "{count} personas que inician sesión solo con contraseña no podrán hacerlo mientras esté desactivado. Puedes volver a activarlo cuando quieras.",
    errors: {
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
        "Conecta primero tu propia cuenta de Google (en tu página), para que puedas seguir iniciando sesión.",
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
    },
  },
  pt: {
    inviteTitle: "{from} convida você para o escritório",
    inviteTitleNobody: "Você recebeu um convite para um escritório",
    what: "Neste escritório, o clone de cada pessoa (uma IA que trabalha como ela) recebe e responde os pedidos da equipe, e traz a cada pessoa só as decisões que são dela.",
    accountInstead: "Ou crie uma conta no servidor deste escritório",
    accountWhy:
      "Com uma conta, você entra aqui, vê quem está no escritório e conecta seu computador com o seu nome.",
    name: "Seu nome",
    email: "E-mail",
    password: "Senha (8 caracteres ou mais)",
    create: "Criar minha conta",
    haveAccount: "Já tem uma conta?",
    signInLink: "Entrar",
    keep: "Qualquer pessoa com este link pode entrar neste escritório; compartilhe só com a sua equipe.",
    signInTitle: "Entre no seu escritório",
    signIn: "Entrar",
    noAccount:
      "Ainda não tem conta? Abra o link de convite do seu escritório para criar uma.",
    hello: "Oi, {name}",
    yourOffice: "Seu escritório",
    connectTitle: "Conecte seu computador",
    connectWhat:
      "Seu clone roda no seu computador: ele aprende com os seus registros de IA de lá, pensa com a sua própria IA e trabalha com os seus arquivos. Rode isto uma vez em um terminal desse computador (precisa do Node.js 22 ou mais recente, em nodejs.org):",
    makeCommand: "Criar meu comando de conexão",
    commandNote:
      "Funciona uma vez, por 10 minutos; crie um novo quando quiser. Conectar outro computador leva seu clone para lá.",
    connected: "Conectado: clone de {name}, visto por último {when}.",
    notConnected: "Nenhum computador conectado ainda.",
    inviteTeam: "Convide um colega",
    inviteWhat: "Envie este link; a pessoa cria a conta com ele.",
    signOut: "Sair",
    runTitle: "Rode isto no seu computador",
    runWhat:
      "Este link conecta um computador ao seu escritório. Rode em um terminal desse computador:",
    people: "Pessoas neste escritório",
    peopleOwner:
      "Como dono, você decide quem está dentro e também pode tornar outras pessoas donas.",
    owner: "Dono",
    member: "Membro",
    you: "você",
    cloneIn: "Clone conectado, visto por último {when}",
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
    newLink: "Criar um novo link de convite",
    newLinkTitle: "Criar um novo link de convite?",
    newLinkWhat:
      "O link que você enviou antes para de funcionar. Quem já está dentro continua dentro.",
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
    adminLink: "Configurações de login deste servidor",
    adminTitle: "Configurações de login",
    adminWhat:
      "Como as pessoas entram neste servidor. Vale para todos os escritórios daqui, e sempre fica pelo menos uma forma ativa.",
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
    savedBy: "Configurado por {name}, {when}.",
    saveGoogle: "Salvar e ativar",
    removeGoogle: "Remover as configurações do Google",
    sealingOff:
      "Para guardar uma chave secreta do Google, este servidor precisa de uma chave de criptografia: defina RELAY_ENCRYPTION_KEY (openssl rand -base64 32) e reinicie.",
    googleRemoveTitle: "Remover as configurações do Google?",
    googleRemoveWhat:
      "O ID do cliente e a chave secreta criptografada são apagados deste servidor. {count} pessoas que entram só com o Google não conseguem entrar até que seja configurado de novo.",
    passwordOffTitle: "Desativar e-mail e senha?",
    passwordOffWhat:
      "{count} pessoas que entram só com senha não conseguem entrar enquanto estiver desativado. Você pode ativar de novo quando quiser.",
    errors: {
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
        "Conecte primeiro a sua própria conta do Google (na sua página), para continuar conseguindo entrar.",
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
    },
  },
};

// Each page language says everything English says, and nothing more.
const _wordsInStep: AllInSync<typeof WORDS> & Record<PageLanguage, unknown> =
  WORDS;

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
  local?: boolean;
  /** The ways the server lets people in. */
  methods: SignInMethods;
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
${googleWay(lang, input.methods, `/i/${encodeURIComponent(input.key)}/google${input.from ? `?from=${encodeURIComponent(input.from)}` : ""}`)}
${
  input.methods.password
    ? `<form method="post">
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
  email?: string;
}): string {
  const { lang } = input;
  const title = say(lang, "signInTitle");
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
${problem(lang, input.error)}
${googleWay(lang, input.methods, `/login/google${input.key ? `?key=${encodeURIComponent(input.key)}` : ""}`)}
${
  input.methods.password
    ? `<form method="post">
${input.key ? `<input type="hidden" name="key" value="${escape(input.key)}">` : ""}
<label for="email">${say(lang, "email")}</label>
<input id="email" name="email" type="email" required maxlength="200" autocomplete="email" value="${escape(input.email ?? "")}">
<label for="password">${say(lang, "password")}</label>
<input id="password" name="password" type="password" required maxlength="128" autocomplete="current-password">
<button type="submit">${say(lang, "signIn")}</button>
</form>`
    : ""
}
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
  /** Whether the reader sets how people sign in to the server. */
  admin?: boolean;
  /** How the reader signs in, and the ways the server offers. */
  ways?: SignInWays;
  methods?: SignInMethods;
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
  const ways = input.ways;
  // How one signs in shows once Google is a way here: where Google can be connected, or already is.
  const signIn =
    ways && (input.methods?.google || ways.google)
      ? `<section>
<h2>${say(lang, "waysTitle")}</h2>
<ul class="rows">${
          ways.password
            ? `<li><span class="who"><b>${say(lang, "waysPassword")}</b></span><span class="tag">${say(lang, "inUse")}</span></li>`
            : ""
        }<li><span class="who"><b>${say(lang, "waysGoogle")}</b>${
          ways.google ? "" : `<small>${say(lang, "connectGoogleWhat")}</small>`
        }</span>${
          ways.google
            ? `<span class="tag">${say(lang, "linked")}</span>`
            : `<span class="acts"><a class="small" href="/home/google">${say(lang, "connectGoogle")}</a></span>`
        }</li></ul>
</section>`
      : "";
  const adminLink = input.admin
    ? `<p><a href="/home/admin">${say(lang, "adminLink")}</a></p>`
    : "";
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
${signIn}
${adminLink}
<form method="post" action="/logout"><button type="submit" class="quiet">${say(lang, "signOut")}</button></form>`,
  );
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
    | "passwordOff";
  name?: string;
  /** How many people it leaves without a way in, where it does. */
  count?: string;
  action: string;
  fields?: Record<string, string>;
  /** Where Cancel goes: one's own page unless said. */
  back?: string;
}): string {
  const { lang } = input;
  const words = {
    remove: ["removeTitle", "removeWhat", "remove"],
    owner: ["ownerTitle", "ownerWhat", "makeOwner"],
    clone: ["cloneTitle", "cloneWhat", "remove"],
    newLink: ["newLinkTitle", "newLinkWhat", "newLink"],
    googleRemove: ["googleRemoveTitle", "googleRemoveWhat", "removeGoogle"],
    passwordOff: ["passwordOffTitle", "passwordOffWhat", "turnOff"],
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
<p>${say(lang, whatKey, { count: input.count ?? "0" })}</p>
<form method="post" action="${escape(input.action)}">${hidden}<div class="acts"><button type="submit" class="${input.what === "owner" ? "" : "danger"}">${say(lang, yesKey)}</button><a href="${escape(input.back ?? "/home")}">${say(lang, "cancel")}</a></div></form>`,
  );
}

/**
 * How people sign in to the server, for its admin: email and password, and Google with the client
 * they registered (its secret sealed, never shown), each on or off, one always on.
 */
export function adminPage(input: {
  lang: PageLanguage;
  settings: SignInSettings;
  /** Where Google sends people back to on this server. */
  redirect: string;
  error?: string;
  saved?: boolean;
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
<div class="top"><h2>${say(lang, "waysPassword")}</h2>${state(settings.password)}</div>
<p class="note">${say(lang, "methodPasswordWhat")}</p>
${
  google?.on
    ? `<p class="note">${say(lang, "passwordOnly", { count: String(settings.passwordOnly) })}</p>`
    : ""
}
${
  settings.password
    ? google?.on && !settings.mineLinked
      ? `<p class="note">${say(lang, "linkFirst")}</p>`
      : google?.on
        ? `<p><a class="button quiet" href="/home/admin/password/off">${say(lang, "turnOff")}</a></p>`
        : ""
    : `<form method="post" action="/home/admin/password"><input type="hidden" name="on" value="1"><button type="submit">${say(lang, "turnOn")}</button></form>`
}
</section>`;
  const setUp = `<details${google ? "" : " open"}><summary>${say(lang, google ? "googleChange" : "googleSetup")}</summary>
<section class="guide">
<ol class="steps">
<li><span>${say(lang, "step1")}</span><a href="https://console.cloud.google.com/apis/credentials" rel="noreferrer" target="_blank">${say(lang, "consoleLink")}</a></li>
<li><span>${say(lang, "step2")}</span><pre>${escape(input.redirect)}</pre>${httpsWanted ? `<small>${say(lang, "httpsNote")}</small>` : ""}</li>
<li><span>${say(lang, "step3")}</span></li>
</ol>
${settings.sealing ? "" : `<p class="error">${say(lang, "sealingOff")}</p>`}
<form method="post" action="/home/admin/google">
<label for="clientId">${say(lang, "clientId")}</label>
<input id="clientId" name="clientId" required maxlength="260" autocomplete="off" spellcheck="false" value="${escape(google?.clientId ?? "")}">
<label for="secret">${say(lang, "clientSecret")}</label>
<input id="secret" name="secret" type="password" maxlength="200" autocomplete="off"${google ? "" : " required"}>
<p class="note small">${say(lang, "secretNew")}${google ? ` ${say(lang, "secretKeep")}` : ""}</p>
<button type="submit"${settings.sealing ? "" : " disabled"}>${say(lang, "saveGoogle")}</button>
</form>
${google ? `<p><a class="small" href="/home/admin/google/remove">${say(lang, "removeGoogle")}</a></p>` : ""}
</section>
</details>`;
  const googleSection = `<section class="method">
<div class="top"><h2>${say(lang, "waysGoogle")}</h2>${state(google ? google.on : undefined)}</div>
<p class="note">${say(lang, "methodGoogleWhat")}</p>
${
  google
    ? `<p class="note">${say(lang, "savedBy", {
        name: google.by,
        when: new Date(google.at).toLocaleString(lang),
      })}</p>
${google.readable ? "" : `<p class="error">${errorWords(lang, "google-unreadable")}</p>`}
${google.on ? `<p class="note">${say(lang, "googleOnly", { count: String(settings.googleOnly) })}</p>` : ""}
${
  google.on
    ? settings.password
      ? `<form method="post" action="/home/admin/google/off"><button type="submit" class="quiet">${say(lang, "turnOff")}</button></form>`
      : ""
    : google.readable
      ? `<form method="post" action="/home/admin/google/on"><button type="submit">${say(lang, "turnOn")}</button></form>`
      : ""
}`
    : ""
}
${setUp}
</section>`;
  return shell(
    lang,
    title,
    `<h1>${title}</h1>
<p class="note">${say(lang, "adminWhat")}</p>
${problem(lang, input.error)}
${input.saved ? `<p class="done" role="status">${say(lang, "saved")}</p>` : ""}
${password}
${googleSection}
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
