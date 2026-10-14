// How someone invited sets up their clone, on the invite's page: install Node.js, open a
// terminal, paste one line (`npx -y clone-office join "<invite link>"`), answer a few questions in
// the browser. Written for someone who has never opened a terminal: each step says which keys to
// press, the line has a Copy button, what the terminal shows once it worked is drawn beside it,
// and the usual ways it goes wrong are answered below. The steps for Mac, Windows and Linux are
// tabs, the computer the page was opened on (its User-Agent) picked first, with no script; the
// only script is the Copy button's, served by the relay itself (`INSTALL_SCRIPT`). A phone is told
// to open the link on a computer. Plain HTML like the relay's other pages.

import type { AllInSync } from "../../i18n/sync.ts";
import { escape, type PageLanguage } from "./page.ts";

export type Os = "mac" | "windows" | "linux" | "phone";

/** Node.js's download page: the way on Linux, and on the others until the installers are known. */
const NODE = "https://nodejs.org/en/download";
/** Node.js's own list of its releases, newest first, each LTS one named. */
const NODE_INDEX = "https://nodejs.org/dist/index.json";
/** How long the LTS found there is kept before it is asked again. */
const NODE_KEPT_MS = 12 * 60 * 60 * 1000;

const WORDS = {
  en: {
    title: "Set up your clone",
    minutes: "About 5 minutes",
    noCode: "No coding: you copy one line",
    why: "Your clone runs on your own computer. It learns how you work from what is there, works with your files and tools, and keeps what it learns on that computer. Only requests and your card go through the office.",
    computer: "Your computer",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "Install Node.js",
    nodeWhat: "A free program your clone runs on.",
    nodeMac:
      "Open the file you downloaded and click Continue until it is done.",
    nodeMacNote:
      "If it asks for a password, it is the one you sign in to this Mac with. Already have Node.js 22.13 or later? Skip this step.",
    nodeWindows:
      "Open the file you downloaded and click Next until it is done.",
    nodeWindowsNote:
      "You can leave “Automatically install the necessary tools” unticked. Already have Node.js 22.13 or later? Skip this step.",
    nodeLinux:
      "Distributions often carry an older Node.js. Install 22.13 or later the way nodejs.org shows.",
    download: "Download Node.js",
    nodeHow: "How to get Node.js",
    terminalMac: "Open Terminal",
    terminalWindows: "Open Command Prompt",
    terminalLinux: "Open a terminal",
    terminalWordMac: "Terminal",
    openKeys: "Press {keys}, type {word}, then press {enter}",
    openLinux: "On most systems: {keys}",
    terminalMacAfter:
      "A window with only text opens: the next line goes there.",
    terminalWindowsAfter:
      "If it was open while Node.js installed, close it and open a new one.",
    paste: "Paste this line",
    pasteKeys:
      "Paste with {keys}, then press {enter}. The first time takes a minute or two.",
    copy: "Copy",
    copied: "Copied",
    copySelected: "Selected: copy it",
    seen: "When you see this, it worked",
    answer: "Answer a few questions in your browser",
    answerFrom:
      "Your browser opens Clone Office. Pick the AI your clone uses and say who you are; then it joins {from}'s office.",
    answerNobody:
      "Your browser opens Clone Office. Pick the AI your clone uses and say who you are; then it joins the office.",
    notOpen:
      "If it does not open, type {address} in your browser's address bar.",
    keepOpen: "Keep the terminal window open.",
    keepWhy:
      "Closing it puts your clone to rest. To skip this, turn on Settings › General › Start with this computer in the app: it then starts by itself, with no window.",
    local:
      "This office runs on {from}'s computer: join from the same Wi-Fi or network, while their Clone Office is open.",
    localNobody:
      "This office runs on a teammate's computer: join from the same Wi-Fi or network, while their Clone Office is open.",
    localNetwork:
      "This team server is on a private network: join from that same network (in the office, or through its VPN).",
    trouble: "If it does not work",
    npxMissingWindows:
      "'npx' is not recognized as an internal or external command",
    npxMissing:
      "Node.js is not installed yet, or this window was opened before it was. Quit the terminal completely, open a new one and paste the line again.",
    nodeOld:
      "This Node.js is older. Install the new one from the first step, then open a new terminal.",
    powershellSaid: "running scripts is disabled on this system",
    powershell:
      "It was pasted into PowerShell. Open Command Prompt (cmd) and paste it there.",
    folderSaid: "“node” would like to access files in your Documents folder.",
    folder:
      "On a Mac, your clone reads your folders to learn your work. Allow lets it read that folder too; Don't Allow is fine as well.",
    doctorFrom:
      "Still stuck? Paste {command} into the same window and send {from} what it says: it checks each part and says what to do.",
    doctorNobody:
      "Still stuck? Paste {command} into the same window and send whoever invited you what it says: it checks each part and says what to do.",
    phone:
      "Open this link on your computer: your clone runs there, not on a phone. Send it to yourself by email or a messenger.",
    already:
      "Already use Clone Office? Open it, then paste this link under Settings › Office.",
    agent: "Use an AI that works on your computer?",
    agentHow:
      "Paste this into Claude Code, Codex or a similar assistant on your computer, and it does the steps above for you.",
  },
  ko: {
    title: "내 클론 만들기",
    minutes: "5분쯤",
    noCode: "코딩 없이 한 줄 복사",
    why: "클론은 내 컴퓨터에서 돌아가요. 그 컴퓨터에 있는 기록으로 내가 일하는 방식을 배우고, 내 파일과 도구로 일하고, 배운 것도 그 컴퓨터에만 둬요. 오피스로는 부탁과 내 명함만 오가요.",
    computer: "내 컴퓨터",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "Node.js 설치",
    nodeWhat: "클론을 돌리는 데 필요한 무료 프로그램이에요.",
    nodeMac: "받은 파일을 열고 끝날 때까지 ‘계속’을 누르세요.",
    nodeMacNote:
      "비밀번호를 물으면 이 Mac에 로그인할 때 쓰는 비밀번호예요. Node.js 22.13 이상이 이미 있다면 넘어가세요.",
    nodeWindows: "받은 파일을 열고 끝날 때까지 Next를 누르세요.",
    nodeWindowsNote:
      "‘Automatically install the necessary tools’ 체크는 하지 않아도 돼요. Node.js 22.13 이상이 이미 있다면 넘어가세요.",
    nodeLinux:
      "배포판 기본 Node.js는 오래된 경우가 많아요. nodejs.org 안내대로 22.13 이상을 설치하세요.",
    download: "Node.js 받기",
    nodeHow: "Node.js 받는 법",
    terminalMac: "터미널 열기",
    terminalWindows: "명령 프롬프트 열기",
    terminalLinux: "터미널 열기",
    terminalWordMac: "터미널",
    openKeys: "{keys} 누르고 {word} 입력, {enter}",
    openLinux: "대부분 {keys}",
    terminalMacAfter: "글자만 있는 창이 열려요. 다음 줄을 여기에 붙여 넣어요.",
    terminalWindowsAfter: "Node.js를 설치할 때 열려 있었다면 닫고 새로 여세요.",
    paste: "이 한 줄 붙여 넣기",
    pasteKeys: "붙여 넣기 {keys}, 그다음 {enter}. 처음 한 번은 1~2분 걸려요.",
    copy: "복사",
    copied: "복사했어요",
    copySelected: "선택했어요. 복사하세요",
    seen: "이렇게 보이면 된 거예요",
    answer: "브라우저에서 몇 가지 답하기",
    answerFrom:
      "브라우저에 Clone Office가 열려요. 클론이 쓸 AI 모델을 고르고 나를 소개하면 {from} 님의 오피스에 들어가요.",
    answerNobody:
      "브라우저에 Clone Office가 열려요. 클론이 쓸 AI 모델을 고르고 나를 소개하면 오피스에 들어가요.",
    notOpen: "안 열리면 브라우저 주소창에 {address}를 입력하세요.",
    keepOpen: "터미널 창은 열어 두세요.",
    keepWhy:
      "닫으면 클론도 쉬어요. 번거로우면 앱의 설정 › 일반 › 컴퓨터와 함께 켜기를 켜 두세요. 창 없이 저절로 켜져요.",
    local:
      "이 오피스는 {from} 님의 컴퓨터에서 열려 있어요. {from} 님의 Clone Office가 켜져 있을 때, 같은 와이파이에서 들어와 주세요.",
    localNobody:
      "이 오피스는 동료의 컴퓨터에서 열려 있어요. 동료의 Clone Office가 켜져 있을 때, 같은 와이파이에서 들어와 주세요.",
    localNetwork:
      "이 팀 서버는 사내 네트워크에 있어요. 같은 네트워크(사무실, 또는 그 네트워크의 VPN)에서 들어와 주세요.",
    trouble: "안 될 때",
    npxMissingWindows:
      "'npx'은(는) 내부 또는 외부 명령, 실행할 수 있는 프로그램, 또는 배치 파일이 아닙니다.",
    npxMissing:
      "Node.js가 아직 없거나, 설치 전에 연 창이에요. 터미널을 완전히 닫고 새로 연 뒤 다시 붙여 넣으세요.",
    nodeOld:
      "Node.js가 오래됐어요. 첫 단계에서 새로 받아 설치한 뒤 터미널을 새로 여세요.",
    powershellSaid: "이 시스템에서 스크립트를 실행할 수 없으므로",
    powershell:
      "PowerShell에 붙여 넣었어요. 명령 프롬프트(cmd)를 열어 거기에 붙여 넣으세요.",
    folderSaid: "“node”이(가) 문서 폴더의 파일에 접근하려고 합니다.",
    folder:
      "Mac에서 클론이 내 일을 배우려고 폴더를 읽는 거예요. 허용하면 그 폴더도 읽고, 허용 안 함을 눌러도 괜찮아요.",
    doctorFrom:
      "그래도 안 되면 같은 창에 {command}를 붙여 넣고, 나온 글을 {from} 님에게 보내 주세요. 하나씩 확인하고 할 일을 알려 줘요.",
    doctorNobody:
      "그래도 안 되면 같은 창에 {command}를 붙여 넣고, 나온 글을 초대한 사람에게 보내 주세요. 하나씩 확인하고 할 일을 알려 줘요.",
    phone:
      "이 링크는 컴퓨터에서 여세요. 클론은 휴대폰이 아니라 컴퓨터에서 돌아요. 메일이나 메신저로 나에게 보내 두세요.",
    already:
      "이미 Clone Office를 쓰고 있다면, 앱을 열고 설정 › 오피스에 이 링크를 붙여 넣어 주세요.",
    agent: "내 컴퓨터에서 일하는 AI를 쓰나요?",
    agentHow:
      "Claude Code, Codex 같은 내 컴퓨터의 AI에게 이걸 붙여 넣으면 위의 단계를 대신 해 줘요.",
  },
  zh: {
    title: "设置你的分身",
    minutes: "大约 5 分钟",
    noCode: "不用写代码，复制一行就行",
    why: "你的分身在你自己的电脑上运行。它从电脑上已有的内容学习你的工作方式，用你的文件和工具干活，学到的东西也只留在那台电脑上。经过办公室的只有请求和你的名片。",
    computer: "你的电脑",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "安装 Node.js",
    nodeWhat: "运行分身所需的免费程序。",
    nodeMac: "打开下载的文件，一直点“继续”，直到完成。",
    nodeMacNote:
      "如果要求输入密码，就是你登录这台 Mac 时用的密码。已经有 Node.js 22.13 或更高版本？跳过这一步。",
    nodeWindows: "打开下载的文件，一直点 Next，直到完成。",
    nodeWindowsNote:
      "“Automatically install the necessary tools”可以不勾选。已经有 Node.js 22.13 或更高版本？跳过这一步。",
    nodeLinux:
      "发行版自带的 Node.js 往往较旧。请按 nodejs.org 的说明安装 22.13 或更高版本。",
    download: "下载 Node.js",
    nodeHow: "获取 Node.js 的方法",
    terminalMac: "打开“终端”",
    terminalWindows: "打开命令提示符",
    terminalLinux: "打开终端",
    terminalWordMac: "终端",
    openKeys: "按 {keys}，输入 {word}，再按 {enter}",
    openLinux: "大多数系统：{keys}",
    terminalMacAfter: "会打开一个只有文字的窗口，下一行就粘贴到这里。",
    terminalWindowsAfter: "如果安装 Node.js 时它是开着的，请关掉再重新打开。",
    paste: "粘贴这一行",
    pasteKeys: "用 {keys} 粘贴，再按 {enter}。第一次需要一两分钟。",
    copy: "复制",
    copied: "已复制",
    copySelected: "已选中，请复制",
    seen: "看到这样就成功了",
    answer: "在浏览器里回答几个问题",
    answerFrom:
      "浏览器会打开 Clone Office。选好你的分身用的 AI，介绍一下你自己，它就会加入{from}的办公室。",
    answerNobody:
      "浏览器会打开 Clone Office。选好你的分身用的 AI，介绍一下你自己，它就会加入办公室。",
    notOpen: "如果没有打开，请在浏览器地址栏输入 {address}。",
    keepOpen: "请让终端窗口保持打开。",
    keepWhy:
      "关掉它，分身也会休息。嫌麻烦的话，在应用里打开“设置 › 通用 › 随电脑启动”，它就会自己启动，不需要窗口。",
    local:
      "这个办公室运行在{from}的电脑上：请在对方的 Clone Office 开着时，从同一个 Wi-Fi 或网络加入。",
    localNobody:
      "这个办公室运行在一位同事的电脑上：请在对方的 Clone Office 开着时，从同一个 Wi-Fi 或网络加入。",
    localNetwork:
      "这个团队服务器在内部网络上：请从同一个网络（办公室里，或通过它的 VPN）加入。",
    trouble: "遇到问题时",
    npxMissingWindows:
      "'npx' 不是内部或外部命令，也不是可运行的程序或批处理文件。",
    npxMissing:
      "还没装好 Node.js，或者这个窗口是在安装前打开的。完全退出终端，重新打开后再粘贴一次。",
    nodeOld: "这个 Node.js 太旧了。按第一步装好新版本，再打开一个新的终端。",
    powershellSaid: "因为在此系统上禁止运行脚本",
    powershell: "你粘贴到了 PowerShell。请打开命令提示符（cmd），粘贴到那里。",
    folderSaid: "“node”想要访问“文稿”文件夹中的文件。",
    folder:
      "在 Mac 上，分身会读你的文件夹来了解你的工作。点“允许”它就能读这个文件夹，点“不允许”也没关系。",
    doctorFrom:
      "还是不行？在同一个窗口粘贴 {command}，把显示的内容发给{from}：它会逐项检查，并告诉你该怎么做。",
    doctorNobody:
      "还是不行？在同一个窗口粘贴 {command}，把显示的内容发给邀请你的人：它会逐项检查，并告诉你该怎么做。",
    phone:
      "请在电脑上打开这个链接：你的分身运行在电脑上，不在手机上。可以用邮件或聊天软件发给自己。",
    already:
      "已经在用 Clone Office？打开它，然后在“设置 › 办公室”里粘贴这个链接。",
    agent: "在用能在你电脑上干活的 AI 吗？",
    agentHow:
      "把这段粘贴给你电脑上的 Claude Code、Codex 等助手，它会替你完成上面的步骤。",
  },
  ja: {
    title: "クローンを用意する",
    minutes: "5分ほど",
    noCode: "コーディング不要、1行コピーするだけ",
    why: "クローンはあなた自身のコンピューターで動きます。そこにあるものからあなたの仕事の進め方を学び、あなたのファイルやツールで作業し、学んだことはそのコンピューターに残します。オフィスを通るのは依頼とあなたの名刺だけです。",
    computer: "あなたのコンピューター",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "Node.jsをインストール",
    nodeWhat: "クローンを動かすための無料のプログラムです。",
    nodeMac:
      "ダウンロードしたファイルを開き、完了するまで「続ける」を押してください。",
    nodeMacNote:
      "パスワードを求められたら、このMacにログインするときのパスワードです。Node.js 22.13以降がすでにあれば、このステップは飛ばしてください。",
    nodeWindows:
      "ダウンロードしたファイルを開き、完了するまでNextを押してください。",
    nodeWindowsNote:
      "「Automatically install the necessary tools」はチェックしなくてかまいません。Node.js 22.13以降がすでにあれば、このステップは飛ばしてください。",
    nodeLinux:
      "ディストリビューション標準のNode.jsは古いことが多いです。nodejs.orgの案内どおりに22.13以降をインストールしてください。",
    download: "Node.jsをダウンロード",
    nodeHow: "Node.jsの入手方法",
    terminalMac: "ターミナルを開く",
    terminalWindows: "コマンドプロンプトを開く",
    terminalLinux: "ターミナルを開く",
    terminalWordMac: "ターミナル",
    openKeys: "{keys} を押して {word} と入力し、{enter}",
    openLinux: "多くのシステムでは {keys}",
    terminalMacAfter:
      "文字だけのウィンドウが開きます。次の1行はここに貼り付けます。",
    terminalWindowsAfter:
      "Node.jsのインストール中に開いていた場合は、いったん閉じて開き直してください。",
    paste: "この1行を貼り付ける",
    pasteKeys: "{keys} で貼り付けて {enter}。初回は1〜2分かかります。",
    copy: "コピー",
    copied: "コピーしました",
    copySelected: "選択しました。コピーしてください",
    seen: "こう表示されれば成功です",
    answer: "ブラウザーでいくつかの質問に答える",
    answerFrom:
      "ブラウザーでClone Officeが開きます。クローンが使うAIを選んで自己紹介すると、{from}さんのオフィスに参加します。",
    answerNobody:
      "ブラウザーでClone Officeが開きます。クローンが使うAIを選んで自己紹介すると、オフィスに参加します。",
    notOpen:
      "開かない場合は、ブラウザーのアドレスバーに {address} と入力してください。",
    keepOpen: "ターミナルのウィンドウは開いたままにしてください。",
    keepWhy:
      "閉じるとクローンも休みます。手間を省くなら、アプリの設定 › 一般 › パソコンと一緒に起動をオンにしてください。ウィンドウなしで自動的に起動します。",
    local:
      "このオフィスは{from}さんのコンピューターで動いています。相手のClone Officeが開いている間に、同じWi-Fiかネットワークから参加してください。",
    localNobody:
      "このオフィスはチームメイトのコンピューターで動いています。相手のClone Officeが開いている間に、同じWi-Fiかネットワークから参加してください。",
    localNetwork:
      "このチームサーバーは社内ネットワークにあります。同じネットワーク（オフィス内、またはそのVPN経由）から参加してください。",
    trouble: "うまくいかないとき",
    npxMissingWindows:
      "'npx' は、内部コマンドまたは外部コマンド、操作可能なプログラムまたはバッチ ファイルとして認識されていません。",
    npxMissing:
      "Node.jsがまだないか、インストール前に開いたウィンドウです。ターミナルを完全に終了し、開き直してからもう一度貼り付けてください。",
    nodeOld:
      "Node.jsが古いです。最初のステップで新しいものをインストールし、ターミナルを開き直してください。",
    powershellSaid: "このシステムではスクリプトの実行が無効になっているため",
    powershell:
      "PowerShellに貼り付けています。コマンドプロンプト（cmd）を開いて、そこに貼り付けてください。",
    folderSaid:
      "“node”が“書類”フォルダ内のファイルへのアクセスを求めています。",
    folder:
      "Macでは、クローンが仕事を学ぶためにフォルダーを読みます。「許可」でそのフォルダーも読み、「許可しない」でも問題ありません。",
    doctorFrom:
      "それでもだめなら、同じウィンドウに {command} を貼り付けて、表示された内容を{from}さんに送ってください。一つずつ確かめて、何をすればいいか教えてくれます。",
    doctorNobody:
      "それでもだめなら、同じウィンドウに {command} を貼り付けて、表示された内容を招待してくれた人に送ってください。一つずつ確かめて、何をすればいいか教えてくれます。",
    phone:
      "このリンクはコンピューターで開いてください。クローンはスマホではなく、コンピューターで動きます。メールやメッセンジャーで自分に送っておきましょう。",
    already:
      "すでにClone Officeを使っている場合は、アプリを開き、設定 › オフィスでこのリンクを貼り付けてください。",
    agent: "自分のパソコンで動く AI を使っていますか？",
    agentHow:
      "Claude Code や Codex など、パソコン上の AI にこれを貼り付けると、上の手順を代わりにやってくれます。",
  },
  es: {
    title: "Crea tu clon",
    minutes: "Unos 5 minutos",
    noCode: "Sin programar: copias una línea",
    why: "Tu clon funciona en tu propia computadora. Aprende cómo trabajas a partir de lo que hay ahí, trabaja con tus archivos y herramientas, y guarda lo que aprende en esa computadora. Por la oficina solo pasan las solicitudes y tu tarjeta.",
    computer: "Tu computadora",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "Instala Node.js",
    nodeWhat: "Un programa gratuito con el que funciona tu clon.",
    nodeMac:
      "Abre el archivo descargado y haz clic en Continuar hasta que termine.",
    nodeMacNote:
      "Si te pide una contraseña, es la que usas para entrar en esta Mac. ¿Ya tienes Node.js 22.13 o posterior? Omite este paso.",
    nodeWindows:
      "Abre el archivo descargado y haz clic en Next hasta que termine.",
    nodeWindowsNote:
      "Puedes dejar sin marcar “Automatically install the necessary tools”. ¿Ya tienes Node.js 22.13 o posterior? Omite este paso.",
    nodeLinux:
      "Las distribuciones suelen traer un Node.js antiguo. Instala la 22.13 o posterior como indica nodejs.org.",
    download: "Descargar Node.js",
    nodeHow: "Cómo obtener Node.js",
    terminalMac: "Abre Terminal",
    terminalWindows: "Abre el Símbolo del sistema",
    terminalLinux: "Abre una terminal",
    terminalWordMac: "Terminal",
    openKeys: "Presiona {keys}, escribe {word} y presiona {enter}",
    openLinux: "En la mayoría de los sistemas: {keys}",
    terminalMacAfter:
      "Se abre una ventana solo con texto: ahí va la siguiente línea.",
    terminalWindowsAfter:
      "Si estaba abierto mientras se instalaba Node.js, ciérralo y abre uno nuevo.",
    paste: "Pega esta línea",
    pasteKeys:
      "Pega con {keys} y presiona {enter}. La primera vez tarda uno o dos minutos.",
    copy: "Copiar",
    copied: "Copiado",
    copySelected: "Seleccionado: cópialo",
    seen: "Si ves esto, funcionó",
    answer: "Responde unas preguntas en tu navegador",
    answerFrom:
      "Tu navegador abre Clone Office. Elige la IA que usará tu clon y di quién eres; después se une a la oficina de {from}.",
    answerNobody:
      "Tu navegador abre Clone Office. Elige la IA que usará tu clon y di quién eres; después se une a la oficina.",
    notOpen:
      "Si no se abre, escribe {address} en la barra de direcciones del navegador.",
    keepOpen: "Deja abierta la ventana de la terminal.",
    keepWhy:
      "Si la cierras, tu clon descansa. Para no tener que hacerlo, activa Configuración › General › Iniciar con la computadora en la app: así arranca solo, sin ventana.",
    local:
      "Esta oficina funciona en la computadora de {from}: únete desde el mismo Wi-Fi o red, mientras su Clone Office esté abierto.",
    localNobody:
      "Esta oficina funciona en la computadora de un colega: únete desde el mismo Wi-Fi o red, mientras su Clone Office esté abierto.",
    localNetwork:
      "Este servidor del equipo está en una red privada: únete desde esa misma red (en la oficina o por su VPN).",
    trouble: "Si no funciona",
    npxMissingWindows:
      "'npx' no se reconoce como un comando interno o externo, programa o archivo por lotes ejecutable.",
    npxMissing:
      "Node.js aún no está instalado, o esta ventana se abrió antes. Cierra la terminal del todo, abre una nueva y vuelve a pegar la línea.",
    nodeOld:
      "Este Node.js es antiguo. Instala el nuevo desde el primer paso y abre una terminal nueva.",
    powershellSaid:
      "la ejecución de scripts está deshabilitada en este sistema",
    powershell:
      "Se pegó en PowerShell. Abre el Símbolo del sistema (cmd) y pégala ahí.",
    folderSaid: "“node” quiere acceder a archivos de tu carpeta Documentos.",
    folder:
      "En una Mac, tu clon lee tus carpetas para aprender cómo trabajas. Permitir le deja leer también esa; No permitir también está bien.",
    doctorFrom:
      "¿Sigue sin funcionar? Pega {command} en la misma ventana y envíale a {from} lo que diga: revisa cada parte y dice qué hacer.",
    doctorNobody:
      "¿Sigue sin funcionar? Pega {command} en la misma ventana y envíale lo que diga a quien te invitó: revisa cada parte y dice qué hacer.",
    phone:
      "Abre este enlace en tu computadora: tu clon funciona ahí, no en un teléfono. Envíatelo por correo o por una app de mensajería.",
    already:
      "¿Ya usas Clone Office? Ábrelo y pega este enlace en Configuración › Oficina.",
    agent: "¿Usas una IA que trabaja en tu ordenador?",
    agentHow:
      "Pega esto en Claude Code, Codex o un asistente parecido en tu ordenador, y hará los pasos de arriba por ti.",
  },
  pt: {
    title: "Crie seu clone",
    minutes: "Uns 5 minutos",
    noCode: "Sem programar: você copia uma linha",
    why: "Seu clone roda no seu próprio computador. Ele aprende como você trabalha com o que está ali, trabalha com seus arquivos e ferramentas, e guarda o que aprende nesse computador. Pelo escritório passam só os pedidos e o seu cartão.",
    computer: "Seu computador",
    mac: "Mac",
    windows: "Windows",
    linux: "Linux",
    node: "Instale o Node.js",
    nodeWhat: "Um programa gratuito em que seu clone roda.",
    nodeMac: "Abra o arquivo baixado e clique em Continuar até terminar.",
    nodeMacNote:
      "Se pedir uma senha, é a que você usa para entrar neste Mac. Já tem o Node.js 22.13 ou mais recente? Pule esta etapa.",
    nodeWindows: "Abra o arquivo baixado e clique em Next até terminar.",
    nodeWindowsNote:
      "Pode deixar “Automatically install the necessary tools” desmarcado. Já tem o Node.js 22.13 ou mais recente? Pule esta etapa.",
    nodeLinux:
      "As distribuições costumam trazer um Node.js antigo. Instale a 22.13 ou mais recente como mostra o nodejs.org.",
    download: "Baixar o Node.js",
    nodeHow: "Como obter o Node.js",
    terminalMac: "Abra o Terminal",
    terminalWindows: "Abra o Prompt de Comando",
    terminalLinux: "Abra um terminal",
    terminalWordMac: "Terminal",
    openKeys: "Pressione {keys}, digite {word} e pressione {enter}",
    openLinux: "Na maioria dos sistemas: {keys}",
    terminalMacAfter: "Abre uma janela só com texto: a próxima linha vai ali.",
    terminalWindowsAfter:
      "Se ele estava aberto durante a instalação do Node.js, feche e abra um novo.",
    paste: "Cole esta linha",
    pasteKeys:
      "Cole com {keys} e pressione {enter}. Na primeira vez, leva um ou dois minutos.",
    copy: "Copiar",
    copied: "Copiado",
    copySelected: "Selecionado: copie",
    seen: "Se aparecer isto, deu certo",
    answer: "Responda algumas perguntas no navegador",
    answerFrom:
      "Seu navegador abre o Clone Office. Escolha a IA que seu clone vai usar e diga quem você é; depois ele entra no escritório de {from}.",
    answerNobody:
      "Seu navegador abre o Clone Office. Escolha a IA que seu clone vai usar e diga quem você é; depois ele entra no escritório.",
    notOpen:
      "Se não abrir, digite {address} na barra de endereços do navegador.",
    keepOpen: "Deixe a janela do terminal aberta.",
    keepWhy:
      "Se você fechar, seu clone descansa. Para não precisar disso, ative Configurações › Geral › Iniciar com o computador no app: aí ele inicia sozinho, sem janela.",
    local:
      "Este escritório roda no computador de {from}: entre pelo mesmo Wi-Fi ou rede, enquanto o Clone Office dessa pessoa estiver aberto.",
    localNobody:
      "Este escritório roda no computador de um colega: entre pelo mesmo Wi-Fi ou rede, enquanto o Clone Office dele estiver aberto.",
    localNetwork:
      "Este servidor da equipe está numa rede privada: entre por essa mesma rede (no escritório ou pela VPN dela).",
    trouble: "Se não funcionar",
    npxMissingWindows:
      "'npx' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.",
    npxMissing:
      "O Node.js ainda não está instalado, ou esta janela foi aberta antes. Feche o terminal por completo, abra um novo e cole a linha de novo.",
    nodeOld:
      "Este Node.js é antigo. Instale o novo pela primeira etapa e abra um terminal novo.",
    powershellSaid: "a execução de scripts foi desabilitada neste sistema",
    powershell:
      "Foi colado no PowerShell. Abra o Prompt de Comando (cmd) e cole lá.",
    folderSaid: "“node” gostaria de acessar arquivos da pasta Documentos.",
    folder:
      "No Mac, seu clone lê suas pastas para aprender seu trabalho. Permitir deixa ler essa também; Não Permitir também tudo bem.",
    doctorFrom:
      "Ainda não deu? Cole {command} na mesma janela e mande para {from} o que aparecer: ele confere cada parte e diz o que fazer.",
    doctorNobody:
      "Ainda não deu? Cole {command} na mesma janela e mande o que aparecer para quem te convidou: ele confere cada parte e diz o que fazer.",
    phone:
      "Abra este link no seu computador: seu clone roda nele, não no celular. Mande o link para o seu e-mail ou para um app de mensagens.",
    already:
      "Já usa o Clone Office? Abra o app e cole este link em Configurações › Escritório.",
    agent: "Usa uma IA que trabalha no seu computador?",
    agentHow:
      "Cole isto no Claude Code, no Codex ou num assistente parecido no seu computador, e ele faz os passos acima por você.",
  },
};
// Each page language's guide says everything the English one says, and nothing more.
const _wordsInStep: AllInSync<typeof WORDS> & Record<PageLanguage, unknown> =
  WORDS;

type Key = keyof (typeof WORDS)["en"];

/**
 * The words in the page's language, escaped; `html` fills their {names} with markup this file
 * made (keys, a command), after the escaping, and `values` with text to escape.
 */
function say(
  lang: PageLanguage,
  key: Key,
  values: Record<string, string> = {},
  html: Record<string, string> = {},
): string {
  let text: string = WORDS[lang][key];
  for (const [name, value] of Object.entries(values))
    text = text.replaceAll(`{${name}}`, value);
  text = escape(text);
  for (const [name, markup] of Object.entries(html))
    text = text.replaceAll(`{${name}}`, markup);
  return text;
}

/** Keys as they are pressed together: ⌘ + Space. */
function keys(...names: string[]): string {
  return names.map((name) => `<kbd>${escape(name)}</kbd>`).join("+");
}

/** The current LTS, as Node.js's release list last said, and when that was asked. */
let nodeLts: { version: string; at: number } | undefined;
let askingNode: Promise<void> | undefined;

/** Node.js's own installer for each computer that has one, or its download page. */
export type Installers = Record<"mac" | "windows", string>;

/**
 * Node.js's own installers of the current LTS: a Mac's (one .pkg for both kinds of chip) and
 * Windows' (x64, which Windows on Arm runs too); its download page until the release list has
 * answered once. The list is asked in the background, again after half a day, so a page never
 * waits for it and a relay with no way out simply links the page.
 */
export function nodeInstallers(
  now = Date.now(),
  ask: typeof fetch = fetch,
): Installers {
  if ((!nodeLts || now - nodeLts.at > NODE_KEPT_MS) && !askingNode)
    askingNode = latestLts(ask)
      .then((version) => {
        if (version) nodeLts = { version, at: now };
      })
      .finally(() => {
        askingNode = undefined;
      });
  const version = nodeLts?.version;
  if (!version) return { mac: NODE, windows: NODE };
  return {
    mac: `https://nodejs.org/dist/${version}/node-${version}.pkg`,
    windows: `https://nodejs.org/dist/${version}/node-${version}-x64.msi`,
  };
}

/** The LTS being asked for now, for tests. */
export function askingNodeNow(): Promise<void> | undefined {
  return askingNode;
}

/** The newest LTS version with both installers, from Node.js's release list, or nothing. */
export async function latestLts(
  ask: typeof fetch = fetch,
): Promise<string | undefined> {
  try {
    const response = await ask(NODE_INDEX, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return undefined;
    const releases = (await response.json()) as {
      version?: unknown;
      lts?: unknown;
      files?: unknown;
    }[];
    const lts = releases.find(
      (release) =>
        release.lts &&
        Array.isArray(release.files) &&
        release.files.includes("osx-x64-pkg") &&
        release.files.includes("win-x64-msi"),
    );
    const version = lts?.version;
    // it goes into an address: a version, nothing else
    return typeof version === "string" && /^v\d+\.\d+\.\d+$/.test(version)
      ? version
      : undefined;
  } catch {
    return undefined;
  }
}

/** Forget the LTS found, for tests. */
export function forgetNodeLts(): void {
  nodeLts = undefined;
  askingNode = undefined;
}

/** Where the Copy button's script is served (handler.ts), the only script on an invite's page. */
export const INSTALL_SCRIPT_PATH = "/assets/install.mjs";

/**
 * The Copy button: the clipboard where the page may write to it (an https page, or this
 * computer's), else the line selected with the older copy command, else selected for the person
 * to copy. Its words are on the button (`data-copied`, `data-selected`).
 */
export const INSTALL_SCRIPT = `for (const button of document.querySelectorAll("button[data-copy]")) {
  button.hidden = false;
  const label = button.textContent;
  button.addEventListener("click", async () => {
    const line = document.getElementById(button.dataset.copy);
    if (!line) return;
    let copied = false;
    try {
      await navigator.clipboard.writeText(line.textContent);
      copied = true;
    } catch {}
    if (!copied) {
      const range = document.createRange();
      range.selectNodeContents(line);
      const selection = getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      try {
        copied = document.execCommand("copy");
      } catch {}
    }
    button.textContent = copied ? button.dataset.copied : button.dataset.selected;
    button.toggleAttribute("data-done", copied);
    clearTimeout(button.timer);
    button.timer = setTimeout(() => {
      button.textContent = label;
      button.removeAttribute("data-done");
    }, 2000);
  });
}
`;

/** Where an office is reached from: a teammate's computer, or a server in a private network. */
export type Local = "computer" | "network";

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

/**
 * The line to paste: the invite link in double quotes, which every terminal takes (zsh would
 * otherwise read its "?" as a pattern), with the name's characters a shell might act on encoded.
 */
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

/** How each computer opens a terminal, pastes, and ends a line. */
const COMPUTERS = {
  mac: {
    terminal: "terminalMac",
    open: ["⌘", "Space"],
    paste: ["⌘", "V"],
    enter: "Return",
  },
  windows: {
    terminal: "terminalWindows",
    open: ["Win"],
    paste: ["Ctrl", "V"],
    enter: "Enter",
  },
  linux: {
    terminal: "terminalLinux",
    open: ["Ctrl", "Alt", "T"],
    paste: ["Ctrl", "Shift", "V"],
    enter: "Enter",
  },
} as const;

/** Where the app answers once started, as the launcher says it the first time. */
const APP_ADDRESS = "127.0.0.1:4417";

/** A line to copy, as a terminal draws it, with its Copy button (shown once the script runs). */
function line(lang: PageLanguage, id: string, text: string): string {
  return `<div class="term"><div class="term-bar"><span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><button type="button" class="copy" data-copy="${id}" data-copied="${say(lang, "copied")}" data-selected="${say(lang, "copySelected")}" hidden>${say(lang, "copy")}</button></div><pre id="${id}">${escape(text)}</pre></div>`;
}

/** One computer's four steps. */
function steps(
  lang: PageLanguage,
  os: "mac" | "windows" | "linux",
  input: { command: string; from?: string; installers?: Installers },
): string {
  const computer = COMPUTERS[os];
  const enter = `<kbd>${computer.enter}</kbd>`;
  const node =
    os === "linux"
      ? `<p>${say(lang, "nodeLinux")}</p>
<a class="button" href="${NODE}" target="_blank" rel="noreferrer">${say(lang, "nodeHow")}</a>`
      : `<p>${say(lang, "nodeWhat")} ${say(lang, os === "mac" ? "nodeMac" : "nodeWindows")}</p>
<a class="button" href="${escape(input.installers?.[os] ?? NODE)}" rel="noreferrer">${say(lang, "download")} <small>${os === "mac" ? "macOS" : "Windows"}</small></a>
<small>${say(lang, os === "mac" ? "nodeMacNote" : "nodeWindowsNote")}</small>`;
  const open =
    os === "linux"
      ? say(lang, "openLinux", {}, { keys: keys(...computer.open) })
      : say(
          lang,
          "openKeys",
          {},
          {
            keys: keys(...computer.open),
            word: `<code>${os === "mac" ? say(lang, "terminalWordMac") : "cmd"}</code>`,
            enter,
          },
        );
  const after =
    os === "mac"
      ? `<small>${say(lang, "terminalMacAfter")}</small>`
      : os === "windows"
        ? `<small>${say(lang, "terminalWindowsAfter")}</small>`
        : "";
  const invited = input.from
    ? `Invited to ${input.from}'s office. Your browser opens Clone Office: after a few questions, your clone joins the office.`
    : "Invited to an office. Your browser opens Clone Office: after a few questions, your clone joins the office.";
  return `<ol class="steps on-${os}">
<li><b>${say(lang, "node")}</b>
${node}</li>
<li><b>${say(lang, computer.terminal)}</b>
<p class="keys">${open}</p>
${after}</li>
<li><b>${say(lang, "paste")}</b>
${line(lang, `line-${os}`, input.command)}
<p class="keys">${say(lang, "pasteKeys", {}, { keys: keys(...computer.paste), enter })}</p>
<div class="seen"><span>${say(lang, "seen")}</span><pre>${escape(invited)}
<b>Your clone is at http://${APP_ADDRESS}</b>
It runs on this computer only. Keep this window open; press Ctrl+C to stop.</pre></div></li>
<li><b>${say(lang, "answer")}</b>
<p>${say(lang, input.from ? "answerFrom" : "answerNobody", input.from ? { from: input.from } : {})}</p>
<small>${say(lang, "notOpen", {}, { address: `<code>${APP_ADDRESS}</code>` })}</small></li>
</ol>`;
}

/** The guide's HTML: tabs for the three kinds of computer, the one it was opened on first. */
export function installGuide(input: {
  lang: PageLanguage;
  os: Os;
  command: string;
  link: string;
  from?: string;
  /** The office runs on a teammate's computer, or on a server in a private network. */
  local?: Local;
  /** Node.js's installers (`nodeInstallers`); its download page without them. */
  installers?: Installers;
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
  // The same app, asked to check this computer: the line's own npx, with doctor in place of join.
  const doctor = input.command.replace(/ join "[^"]*"$/, " doctor");
  const kinds = ["mac", "windows", "linux"] as const;
  return `<section class="guide">
<h2>${say(lang, "title")}</h2>
<p class="chips"><span>${say(lang, "minutes")}</span><span>${say(lang, "noCode")}</span></p>
<p class="note">${say(lang, "why")}</p>
<div class="computers">
${kinds.map((kind) => `<input type="radio" name="computer" id="computer-${kind}" class="pick-${kind}"${kind === os ? " checked" : ""}>`).join("\n")}
<div class="tabs" role="group" aria-label="${say(lang, "computer")}">${kinds.map((kind) => `<label for="computer-${kind}">${say(lang, kind)}</label>`).join("")}</div>
${kinds.map((kind) => steps(lang, kind, input)).join("\n")}
</div>
<div class="keep"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m6 10 3 2-3 2"/><path d="M12 14h5"/></svg><div><b>${say(lang, "keepOpen")}</b><p class="note">${say(lang, "keepWhy")}</p></div></div>
${
  input.local === "computer"
    ? `<p class="note">${say(lang, from ? "local" : "localNobody", from)}</p>`
    : input.local === "network"
      ? `<p class="note">${say(lang, "localNetwork")}</p>`
      : ""
}
<div class="folds">
<details class="fold"><summary>${say(lang, "trouble")}</summary>
<ul class="trouble">
<li><span class="said"><code>command not found: npx</code><code>${say(lang, "npxMissingWindows")}</code></span>${say(lang, "npxMissing")}</li>
<li><span class="said"><code>Clone Office needs Node.js 22.13 or later</code></span>${say(lang, "nodeOld")}</li>
<li><span class="said"><code>${say(lang, "powershellSaid")}</code></span>${say(lang, "powershell")}</li>
<li><span class="said"><code>${say(lang, "folderSaid")}</code></span>${say(lang, "folder")}</li>
<li>${say(lang, from ? "doctorFrom" : "doctorNobody", from, { command: `<code>${escape(doctor)}</code>` })}</li>
</ul>
</details>
<details class="fold"><summary>${say(lang, "agent")}</summary>
<p class="note">${say(lang, "agentHow")}</p>
${line(lang, "line-agent", agentPrompt(input.command))}
</details>
</div>
<p class="note">${say(lang, "already")}</p>
<script type="module" src="${INSTALL_SCRIPT_PATH}"></script>
</section>`;
}

/**
 * The same steps as words for the person's own AI on their computer (Claude Code, Codex and the
 * like), with the line to run in them: in English, which such assistants read whatever the
 * person's language, and plain about where its questions go.
 */
export function agentPrompt(command: string): string {
  return `Set up Clone Office on this computer for me. It needs Node.js 22.13 or later: check with "node --version" and install it from nodejs.org if it is missing or older. Then run this in a terminal and leave it running:
${command}
It opens Clone Office in my browser, where I answer its questions myself. If something does not work, run "npx -y clone-office doctor" and tell me what it says. More: https://github.com/cgoinglove/clone-office/blob/main/llms.txt`;
}
