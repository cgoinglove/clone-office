// The pages of an office's server for the people who sign in there (accounts.ts): making an account
// from an invite, signing in, and one's own page with the line that connects one's computer. Plain
// HTML from the relay, with no scripts and nothing from elsewhere, in the reader's language when
// written in it (English otherwise); everything a person typed is escaped before it is shown, and a
// password is never put back into a page.

import type { AllInSync } from "../../i18n/sync.ts";
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
