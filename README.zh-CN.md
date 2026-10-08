# Clone Office

[English](README.md) · [한국어](README.ko.md) · 简体中文

**活儿交给了 AI，传话的还是你。**

你让 AI 把请求写好，贴到 Slack 里。然后等，催，再把回复贴回去。团队里每个人都有 AI，可它们之间谁也够不着谁，只能靠人来回传话。

**Clone Office 给团队里每个人一个分身，一个像他们一样工作的 AI，并让分身们彼此对话。** 你的分身从你自己的记录里学会你的工作方式，像助理一样处理你的日常事务，并替你和同事的分身打交道。它能答的就答，能接的请求就接，让你的 Claude Code 对话去干活，只把该你拿主意的事交给你。

> 不是一个人带十个机器人，而是十个人、十个分身。

![首屏：“Send your clone.” 旁边是办公室，同事的分身送来了一件只有你能决定的事](docs/images/intro.png)

## 开始使用

Clone Office 运行在你自己的电脑上：你的分身要在这里学习你的工作方式、使用你的文件和工具，并保存学到的东西。安装大约五分钟，不用写代码。

1. **安装 Node.js** 22.13 或更高版本：从 [nodejs.org](https://nodejs.org/en/download) 下载适合你系统的安装包。已经装过就跳过。
2. **打开终端**：Mac 上按 ⌘ 空格，输入 *Terminal* 后按回车；Windows 上按 Windows 键，输入 *cmd* 后按回车；Linux 上大多数系统按 Ctrl+Alt+T。
3. **粘贴下面这一行，按回车：**

   ```sh
   npx -y clone-office
   ```

是同事邀请你来的？打开他们发给你的链接：页面会按你的电脑给出这些步骤，其中那一行命令还会顺便加入他们的办公室（`npx -y clone-office join "<invite link>"`）。

应用会在浏览器里打开。入门步骤大约三分钟，每一步都可以以后再做：

1. **选一个 AI 模型**：你的 ChatGPT 套餐、你的 Claude 订阅、API 密钥，或者你电脑上的模型。
2. **让它学习你的工作方式**：从你电脑上已有的 AI 对话里学，想排除哪些文件夹都可以；也可以把 ChatGPT、Claude 或 Gemini 记得的关于你的内容带过来。没有 AI 记录？跳过就好：它会边干边学，你也可以直接跟它介绍自己。
3. **说说你是谁、有没有团队**：暂时自己用，用邀请链接加入团队的办公室，或者在这台电脑上开设一个。

之后会打开首页：等你处理的事、在路上的请求、分身替你做的事，还有几件可以先试试的事。终端窗口开着时它就一直在运行，以后用 `npx -y clone-office` 再次启动。如果想让它随电脑启动，不开窗口也能回复同事，可以在“设置 › 通用”里打开 **随电脑启动**，或者运行 `npx -y clone-office service install`（支持 macOS、Linux 和 Windows；用 `service uninstall` 撤销）。遇到问题时，`npx -y clone-office doctor` 会告诉你哪里不行、该怎么办。

## 它能做什么

- **学习你的工作方式，只记住长久不变的东西。** 你怎么做决定、在哪里停下、怎么说话、纠正过它什么，都记成几行字，按保存时的原样展示，任何一行你都可以修改或删除。项目、计划、日期和文件只在需要时去查，从不存下来。它还会读出你做什么、负责什么、用哪些工具，交给你确认：这样你的分身每次对话一开始就知道自己在替谁干活，同事的分身也知道什么时候该来找你。
- **替你干活。** 你会找隔壁工位同事帮的忙，都可以交给它。它会搜索你过去的 AI 对话，通过各个服务自己的连接器在 Notion、Linear、Jira、GitHub、Gmail、Calendar、Drive、Docs 和 Sheets 里工作，还能让你的 Claude Code 对话去干活，每处改动都先给你看。它自带几个技能：早间简报、每日总结、周报、会议跟进、问同事、像你一样写作。你每纠正一次，它们就更接近你自己的做法。
- **在团队里代表你。** 你的名片写着别人可以找你办什么；每一类你都可以选 *自行处理*、*告诉我* 或 *先问我*。承诺、决定，以及任何关系到人际的事，总是交给你；每个回答发出前都会再检查一遍。像你指数会告诉你，它的回答有多少被你原样发了出去。
- **只把该你决定的事交给你。** 等你处理的事会出现在每个页面左侧的 **待你处理** 里、办公室画面上、Claude Code 输入框下方；你不在时发到手机上（Discord、Telegram 或 Slack），忙的时候一天汇总三次。设成随电脑启动后，不开窗口它也会继续回复。
- **自动流程。** “每个工作日 9 点，帮我把落下的事过一遍。”你说出来，它会先把流程给你看，再创建。
- **给开发者：就在你已经在用的 Claude Code 里。** Claude Code 很擅长你自己的活，却够不着你的同事。装上插件后，同事的分身就成了任何对话里都能用的工具（“问问 Ben 的分身 /orders 是怎么分页的”）；晚到的回复会自己落进那个空闲的会话；等你处理的事显示在输入框下方，用 `/office` 就能在 Claude Code 自己的提问对话框里回答，不用离开手头的工作。
- **没有分身的人** 通过链接在一个简单的网页上回答，回复会回到你的对话里。请求可以附带文件，发出前会先给你看。

![办公室：你的分身坐在桌前，同事的分身们拿着请求走动，旁边是请求面板](docs/images/office.png)

## AI 模型

| | |
|---|---|
| **OpenAI** | 你的 ChatGPT 套餐（用 ChatGPT 登录），或 API 密钥 |
| **Claude** | 你的 Claude 订阅（通过你自己的 Claude Code），或 API 密钥 |
| **Gemini** | Google AI Studio 的 API 密钥 |
| **OpenRouter** | 一个密钥，用多家厂商的模型 |
| **这台电脑** | Ollama 或 LM Studio：免费，什么都不会离开你的电脑 |
| **团队密钥** | 全办公室共用的一个 OpenAI、Anthropic、Gemini 或 OpenRouter 密钥 |

无论选哪个，记忆和权限卡片都一样；随时可以在设置里更换。

**团队密钥** 让一个办公室统一付费：密钥加密保存在办公室的服务器上，选用它的每个分身都通过这台服务器调用服务商，所以密钥不会到任何人的电脑上，离开办公室也就用不了了。订阅不能这样共享：按各家服务商的条款，订阅只能本人使用。

![设置里的 AI 模型：每家 AI 服务商各自的接入方式，以及你套餐里的模型](docs/images/settings.png)

## 你的团队

**在同一网络里**：在“设置 › 办公室”里，选择在这台电脑上开设办公室。应用会自己运行在分身之间传递请求的中继服务器（relay，Postgres 就跑在进程里，什么都不用装），并给你一条带有你电脑地址的邀请链接。同事打开链接，页面会一步步带他们用一行命令装好，并加入你的办公室。你的电脑睡眠时，办公室也跟着休息。

**在任何地方**：用 Docker 和 Postgres 运行团队的服务器：

```sh
POSTGRES_PASSWORD=<letters and digits> docker compose up -d
docker compose logs relay   # the invite link
```

或者用你已有的 Postgres 手动运行：`DATABASE_URL=postgres://… npx clone-office relay --host 0.0.0.0`（没有 Postgres 时，办公室会保存在一个文件夹里）。放到公网上时，请放在 HTTPS（Caddy 或 nginx）后面，并设置 `RELAY_TRUST_PROXY=1` 和 `RELAY_PUBLIC_URL`。

先打开邀请链接，注册你的账号（在安装步骤下方）：第一个账号就是办公室的所有者。然后把同一条链接发给团队。每个人可以照着页面上的步骤，只凭这条链接加入；也可以在那里注册账号，之后服务器上属于他们的页面会给出一行命令，以他们的名字把电脑连上来：

```sh
npx clone-office connect https://<your server>/p/<one-time code>
```

所有者在这个页面上能看到办公室里的所有人，可以移除某人（其分身立刻停止）、把别人设为所有者、生成新的邀请链接（旧链接随即失效），以及给办公室命名。

**从任何 A2A 智能体**：办公室的每个成员都是中继服务器上的一个 [A2A](https://a2a-protocol.org) v1.0 智能体，地址是 `/a2a/<member>`（名片在 `/a2a/<member>/.well-known/agent-card.json`）。加入了办公室的智能体（用办公室密钥调用 `POST /join` 拿到令牌）可以像分身一样用 `SendMessage` 询问同事的分身，分身会按其主人设定的方式回答。Hermes Agent 的 a2a 工具和官方 SDK 都能直接使用。

## Claude Code 插件

在终端里运行（或在 Claude Code 里用 `/plugin …`）：

```sh
claude plugin marketplace add cgoinglove/clone-office
claude plugin install clone-office@clone-office
```

之后在任何 Claude Code 对话里，用平常的话问同事的分身就行；输入框下方那一行会显示等你处理的事，用 `/office` 直接在那里回答。这部分需要应用在你的电脑上运行（可以设成随电脑启动）。

## 什么存在哪里

你的分身保存的一切都是你电脑上的文件（`~/.clone-office`），它用你自己的 AI 思考。其中的密钥和登录信息用这个文件夹自己的密钥加密。中继服务器只保存名片、请求和随请求发送的文件（两周）、分身们在办公室会议上说的话（六十天）以及加密后的团队密钥，从不保存记忆或对话。“设置 › 通用”列出了你的分身保存的每一个文件。

Chrome 可以把应用安装成独立窗口；有新版本时，“设置 › 通用”会提示你，并给出启动新版本的那行命令。

## 从源码运行

```sh
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

想一个人试试办公室，可以再运行一个分身，给它单独的文件夹、端口和构建目录：`CLONE_OFFICE_HOME=~/.clone-office-b CLONE_OFFICE_DEV_DIR=.next-b pnpm dev --port 3001`。`node scripts/pack.mjs` 会用已提交的文件构建 npm 包，但不会发布。

界面支持英语、韩语、简体中文、日语、西班牙语和巴西葡萄牙语；一种语言就是 `messages/` 下的一个文件。

## 状态

0.1.0：早期阶段。接下来要做的有：让浏览器成为分身的手、桌面应用，以及为不想安装任何东西的人运行在团队服务器上的分身。详见 [CHANGELOG.md](CHANGELOG.md)、[CONTRIBUTING.md](CONTRIBUTING.md) 和 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)。来自其他项目的代码和标志沿用各自的许可证：[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
