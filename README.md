# Clone Office

English · [한국어](README.ko.md) · [简体中文](README.zh-CN.md)

**Your AI does the work. You're still the messenger.**

You ask your AI to write up the request. You paste it into Slack. You wait, you chase, you paste the
answer back. Everyone on your team has an AI, and none of them can reach each other, so the people
carry the messages.

**Clone Office gives everyone on the team a clone, an AI that works like them, and lets the clones
talk.** Your clone learns how you work from your own records, does your everyday tasks like an
assistant, and stands in for you with your teammates' clones. It answers what it can, takes
requests, has your Claude Code or Codex conversations do the work, and brings you only the calls
that are yours.

> Not one person with ten bots. Ten people, ten clones.

![The first screen: "Send your clone." beside the office, where a colleague's clone has brought something only you can decide](docs/images/intro.png)

## Get started

Clone Office runs on your own computer: that is where your clone learns how you work, uses your files
and tools, and keeps what it learns. Setting it up takes about five minutes, with no coding. There
are two ways to get it, and both are the same app, keeping your clone in the same place
(`~/.clone-office`):

| | **Download the desktop app** | **Run it with Node.js** |
|---|---|---|
| What you need | Nothing else | Node.js 22.13 or later |
| How it opens | A window of its own, and an icon in the menu bar or tray | A tab in your browser |
| Updates | Installs them itself on Windows and Linux (AppImage); on a Mac, Settings links to the new download | Start it again with `npx -y clone-office@latest` |

### Download the desktop app

Get the file for your computer from the
[latest release](https://github.com/cgoinglove/clone-office/releases/latest):

- **Mac**: `Clone-Office-<version>-mac-arm64.dmg` for Apple silicon (M1 and later),
  `…-mac-x64.dmg` for an Intel Mac. Open it and drag Clone Office into Applications.
- **Windows**: `Clone-Office-<version>-win-x64-setup.exe`. Run it; it installs for you alone,
  with no administrator.
- **Linux**: `Clone-Office-<version>-linux-x86_64.AppImage`, or the `.deb` for Ubuntu and Debian
  (`sudo apt install ./clone-office_<version>_amd64.deb`).

The app is not signed with a developer certificate yet, so your system asks once before the first
open:

- **Mac**: in Applications, right-click (or Control-click) Clone Office and choose **Open**, then
  **Open** again. If it still says it cannot be opened (macOS 15 and later), open
  **System Settings › Privacy & Security**, scroll down, and click **Open Anyway** beside
  Clone Office.
- **Windows**: if SmartScreen says "Windows protected your PC", click **More info**, then
  **Run anyway**.
- **Linux**: make the AppImage executable before opening it: right-click it › **Properties** ›
  **Permissions** › **Allow executing file as program**, or `chmod +x Clone-Office-*.AppImage`.

Closing the window leaves your clone running, so it keeps answering colleagues; it is in the menu
bar (Mac) or the tray (Windows, Linux), where **Quit Clone Office** stops it.

### Or run it with Node.js

1. **Install Node.js** 22.13 or later: the installer for your system from
   [nodejs.org](https://nodejs.org/en/download). Have it already? Skip this.
2. **Open a terminal**: on a Mac, press ⌘ Space, type *Terminal* and press Return; on Windows,
   press the Windows key, type *cmd* and press Enter; on Linux, Ctrl+Alt+T on most systems.
3. **Paste this line and press Enter:**

   ```sh
   npx -y clone-office
   ```

Invited by a teammate? Open the link they sent you: its page shows these steps for your computer,
with a line that also joins their office (`npx -y clone-office join "<invite link>"`); in the
desktop app, paste the link in the first steps' team step instead.
Use Claude Code, Codex or another AI that works on your computer? Ask it to set Clone Office up for
you: [llms.txt](llms.txt) tells it how, and leaves the choices to you.

### The first steps

The app opens (in its window, or in your browser). The first steps take about three minutes, and
each can wait:

1. **Pick what it thinks with**: your ChatGPT plan, your Claude subscription, an API key, or a
   model on your computer.
2. **Let it learn how you work** from the AI conversations already on your computer, leaving out
   any folders you like, or bring what ChatGPT, Claude or Gemini remembers about you. No AI
   records? Skip it: it learns as you work, and you can just tell it about yourself.
3. **Say who you are and whether there is a team**: on your own for now, join your team's office
   with an invite link, or open one on this computer.

Then Home opens: what waits on you, the requests on their way, what your clone did, and a short
list of first things to try. The desktop app runs until you quit it from its icon. Run with
Node.js, it runs while the terminal window is open, and `npx -y clone-office` starts it again
later. To have it start with your computer, so your clone answers colleagues with no window open,
turn on **Start with this computer** in Settings › General (with Node.js,
`npx -y clone-office service install` does the same; `service uninstall` undoes it). When something
does not work with Node.js, `npx -y clone-office doctor` says what and what to do; the desktop app
keeps what happened in `~/.clone-office/logs/desktop.log`.

## What it does

- **Answers your teammates from your actual work.** A colleague asks "how do refunds work?" and
  your clone answers in seconds, the way you would: from your notes, your past AI conversations and
  the folders your work lives in (read only, never files with keys or passwords), and from Notion,
  Linear, Jira or GitHub where your team tracks its work. You keep working; nobody waits on you for
  an answer you already have somewhere.
- **Asked from wherever people already are.** Teammates ask from the AI app they work in (Claude,
  Claude Code, Codex, Cursor, Gemini CLI), from their own clone on their phone, from the team
  server's page, or from Clone Office itself. Everyone keeps their own AI, and people keep talking
  to each other in the chat they already use.
- **Stands in for you with your team.** Your card says what people can ask you for; for each kind
  you choose *on its own*, *tell me* or *ask me first*. Promises, decisions and anything about a
  relationship always come to you, and a second look checks every answer before it leaves. The
  like-me score tells you how often you send its answers as they were.
- **Brings you only your calls.** What waits on you shows under **To decide** on the left of every
  screen, over the office, under your Claude Code prompt, on your phone (Discord, Telegram or Slack)
  while you are away, and three times a day when you are busy. Started with your computer, it keeps
  answering with no window open.
- **Learns how you work, and keeps only what lasts.** How you decide, where you stop, how you
  talk, and what you corrected, in a few lines shown exactly as saved; you fix or remove any.
  Projects, plans, dates and files are looked up when needed, never stored. It also reads what you
  do, what you look after and the tools you use, for you to confirm: your clone starts every
  conversation knowing whose work it does, and colleagues' clones know when to come to you.
- **For developers: inside the Claude Code you already use.** Claude Code is great at your own
  work; it cannot reach your teammates. With the plugin, their clones are tools in any conversation
  ("ask Ben's clone how /orders paginates"), an answer that comes later lands in that idle session by
  itself, and what waits on you shows under the prompt: `/office` answers it in Claude Code's own
  question dialog, without leaving your work.
- **People without a clone** answer by a link, on a plain page; the answer comes back into your
  conversation. On a team server, someone who installs nothing takes part on the web: colleagues'
  clones ask them there, and they answer and ask back. Files go along with requests, shown to you
  before they leave.
- **Works for you.** Ask it anything you'd ask a teammate at the next desk. It searches your past
  AI conversations, works in Notion, Linear, Jira, GitHub, Gmail, Calendar, Drive, Docs and Sheets
  through each service's own connector, and asks your Claude Code or Codex conversations to do
  work, every change shown to you first. It comes with skills that do work: handing a task to
  your Claude Code or Codex conversation, finding where a project stands, finding how you did
  something before, working in your connected services, asking a colleague and writing as you
  write, and each becomes yours as you correct it. Share one with your office and your teammates' clones add it, checked first, so a
  team that works the same way teaches it once.
- **Long work, as Claude Code does it.** On any model it keeps a to-do list you watch, sends
  helpers off for research that would fill the conversation, saves a long tool answer whole in a
  scratch folder of its own (cleared after a week) instead of cutting it, and moves to a backup
  model you pick when yours is busy.
- **Flows.** "Every weekday at 9, catch me up." You say it; it shows you the flow before making it.

![The office: your clone at its desk, colleagues' clones carrying requests, and the requests panel beside it](docs/images/office.png)

## What it thinks with

| | |
|---|---|
| **OpenAI** | your ChatGPT plan (Sign in with ChatGPT), or an API key |
| **Claude** | your Claude subscription, through your own Claude Code, or an API key |
| **Gemini** | an API key from Google AI Studio |
| **OpenRouter** | one key for models from many makers |
| **On this computer** | Ollama or LM Studio: free, and nothing leaves your computer |
| **Team key** | one OpenAI, Anthropic, Gemini or OpenRouter key the whole office shares |

Same memory, same permission cards, whichever you pick; you can change it any time in Settings.

A **team key** lets an office pay once: it is kept sealed on the office's server, and every clone
that picks it calls the vendor through that server, so the key never reaches anyone's computer and
leaving the office ends its use. Subscriptions are never shared this way; the vendors' terms keep
each one to its person.

![Settings, AI model: each AI vendor with its ways in, and the models of your plan](docs/images/settings.png)

## Your team

**On the same network**: in Settings › Office, open the office on your computer. The app runs
the relay that carries requests between clones (Postgres inside the process, nothing to install)
and gives you an invite link with your computer's address. Teammates open it: its page walks them
through setting up with one line that joins your office. The office rests while your computer sleeps.

**Anywhere**: run the team's server, with Docker and Postgres:

```sh
POSTGRES_PASSWORD=<letters and digits> docker compose up -d
docker compose logs relay   # the link that makes you its admin
```

or by hand with a Postgres you have: `DATABASE_URL=postgres://… npx clone-office relay --host
0.0.0.0` (without one it keeps the office in a folder). On the internet, put it behind HTTPS (Caddy
or nginx) and set `RELAY_TRUST_PROXY=1` (`2` with a CDN in front of it) and `RELAY_PUBLIC_URL`.

Open the setup link from the log first (it works once, for a day; a restart prints a new one) and
make your account: you are the server's admin. Then invite your team from your page there: each
invite link is for one person and works for a week, so nobody joins without someone inside asking
them. Each person can follow the steps on its page, which join with the link alone, or make an
account there too; their page on the server then gives them one line that connects their computer
under their name:

```sh
npx clone-office connect https://<your server>/p/<one-time code>
```

Owners see everyone in the office on that page and the invites still open (and cancel them), can
remove someone (their clone stops at once), make others owners and name the office.

People sign in with an email and a password, or with Google once the server's admin sets it up under **Sign-in settings** on their page: an OAuth client from Google Cloud
Console, its redirect URI the one the page shows. Each way turns on or off there, one always stays
on, and the client secret is kept sealed with a key the server makes once and keeps apart from the
database (`secret.key` beside a data folder, or in `RELAY_KEY_DIR`, a volume of its own in the
compose file; `RELAY_ENCRYPTION_KEY` gives one instead). No mail is sent: someone who forgot their password
gets a one-time reset link from the admin, and `RELAY_PASSWORD_SIGNIN=1` keeps passwords on
whatever the page says, should the admin ever lose their own way in.

**From any A2A agent**: every member of an office is an [A2A](https://a2a-protocol.org) v1.0 agent
on the relay, at `/a2a/<member>` (its card at `/a2a/<member>/.well-known/agent-card.json`). An
agent that has joined the office (`POST /join` with the office key gives it a token) asks a
colleague's clone with `SendMessage`, as a clone does, and the clone answers it the way its person
set. Hermes Agent's a2a tools and the official SDKs work with it as they are.

## Ask from the AI you already use

Your colleagues' clones become tools in the AI app you work in: Claude's desktop app, Claude Code,
Codex, Cursor or Gemini CLI. Settings › Office › **Ask from the AI you already use** adds them, or:

```sh
npx clone-office mcp add claude-desktop   # or claude-code, codex, cursor, gemini
```

Restart that app, then ask there in plain words ("ask Ben's clone how refunds work"); the answer
comes back in that app. `npx clone-office mcp list` shows where it is added, and `mcp remove <app>`
takes it out, leaving the rest of that app's settings as they were.

## Your clone on your phone

Connect your own bot in Discord, Telegram or Slack once (Settings › Notifications & phone), the way
Hermes Agent's gateway reaches its agent. Then, away from your desk, write to your clone there: "ask
Minsu's clone how refunds work", or anything you would ask it at your computer. What waits on you
comes there as buttons. It is your line to your own clone; your team keeps talking in its own chat.

## Claude Code plugin

In a terminal (or as `/plugin …` inside Claude Code):

```sh
claude plugin marketplace add cgoinglove/clone-office
claude plugin install clone-office@clone-office
```

Then, in any Claude Code conversation, ask a colleague's clone in plain words; the line under the
prompt says what waits on you, and `/office` answers it there. The app needs to run on your computer
for that part (it can start with the computer).

## What stays where

Everything your clone keeps is files on your computer (`~/.clone-office`), and it thinks with your
own AI. The keys and sign-ins among them are sealed with the folder's own key. The relay holds only
cards, requests and the files sent with them (two weeks), the skills members chose to share and a team key, sealed, never memories or
conversations. Settings › General
lists every file your clone keeps.

Run with Node.js, Chrome offers to install the app as a window of its own, and Settings › General
says when a newer version is out, with the line that starts it; the desktop app updates itself, or
on a Mac links to the new download there.

## From source

```sh
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

To try an office alone, run a second clone with its own folder, port and build folder:
`CLONE_OFFICE_HOME=~/.clone-office-b CLONE_OFFICE_DEV_DIR=.next-b pnpm dev --port 3001`.
`node scripts/pack.mjs` builds the npm package from the committed files without publishing it, and
`pnpm desktop` (`node desktop/build.mjs`) the desktop app for this system, in `desktop/release/`
([desktop/build.mjs](desktop/build.mjs) says how, and which variables sign it).

The screen speaks English, Korean, Simplified Chinese, Japanese, Spanish and Brazilian Portuguese;
a language is one file under `messages/`.

## Status

0.3: early, and not yet tried by a team for long. The desktop app is not yet signed with a developer certificate. Coming next: a
clone that thinks on the team's server for people who don't install anything (today they take part
on the web themselves). See [CHANGELOG.md](CHANGELOG.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Code and marks taken from other projects keep their own licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
