# Clone Office

English · [한국어](README.ko.md) · [简体中文](README.zh-CN.md)

**Your AI does the work. You're still the messenger.**

You ask your AI to write up the request. You paste it into Slack. You wait, you chase, you paste the
answer back. Everyone on your team has an AI, and none of them can reach each other, so the people
carry the messages.

**Clone Office gives everyone on the team a clone, an AI that works like them, and lets the clones
talk.** Your clone learns how you work from your own records, does your everyday tasks like an
assistant, and stands in for you with your teammates' clones. It answers what it can, takes
requests, has your Claude Code conversations do the work, and brings you only the calls that are
yours.

> Not one person with ten bots. Ten people, ten clones.

![The first screen: "Send your clone." beside the office, where a colleague's clone has brought something only you can decide](docs/images/intro.png)

## Get started

Clone Office runs on your own computer: that is where your clone learns how you work, uses your files
and tools, and keeps what it learns. Setting it up takes about five minutes, with no coding.

1. **Install Node.js** 22.13 or later: the installer for your system from
   [nodejs.org](https://nodejs.org/en/download). Have it already? Skip this.
2. **Open a terminal**: on a Mac, press ⌘ Space, type *Terminal* and press Return; on Windows,
   press the Windows key, type *cmd* and press Enter; on Linux, Ctrl+Alt+T on most systems.
3. **Paste this line and press Enter:**

   ```sh
   npx -y clone-office
   ```

Invited by a teammate? Open the link they sent you: its page shows these steps for your computer,
with a line that also joins their office (`npx -y clone-office join "<invite link>"`).

It opens in your browser. The first steps take about three minutes, and each can wait:

1. **Pick what it thinks with**: your ChatGPT plan, your Claude subscription, an API key, or a
   model on your computer.
2. **Let it learn how you work** from the AI conversations already on your computer, leaving out
   any folders you like, or bring what ChatGPT, Claude or Gemini remembers about you. No AI
   records? Skip it: it learns as you work, and you can just tell it about yourself.
3. **Say who you are and whether there is a team**: on your own for now, join your team's office
   with an invite link, or open one on this computer.

Then Home opens: what waits on you, the requests on their way, what your clone did, and a short
list of first things to try. It runs while the
terminal window is open, and `npx -y clone-office` starts it again later. To have it start with your
computer instead, so your clone answers colleagues with no window open, turn on **Start with this
computer** in Settings › General, or run `npx -y clone-office service install` (macOS, Linux and
Windows; `service uninstall` undoes it). When something does not work, `npx -y clone-office doctor`
says what and what to do.

## What it does

- **Learns how you work, and keeps only what lasts.** How you decide, where you stop, how you
  talk, and what you corrected, in a few lines shown exactly as saved; you fix or remove any.
  Projects, plans, dates and files are looked up when needed, never stored. It also reads what you
  do, what you look after and the tools you use, for you to confirm: your clone starts every
  conversation knowing whose work it does, and colleagues' clones know when to come to you.
- **Works for you.** Ask it anything you'd ask a teammate at the next desk. It searches your past
  AI conversations, works in Notion, Linear, Jira, GitHub, Gmail, Calendar, Drive, Docs and Sheets
  through each service's own connector, and asks your Claude Code conversations to do work, every
  change shown to you first. It comes with skills for a morning brief, a day wrap, a weekly report,
  a meeting follow-up, asking a colleague and writing as you write, and each becomes yours as you
  correct it.
- **Stands in for you with your team.** Your card says what people can ask you for; for each kind
  you choose *on its own*, *tell me* or *ask me first*. Promises, decisions and anything about a
  relationship always come to you, and a second look checks every answer before it leaves. The
  like-me score tells you how often you send its answers as they were.
- **Brings you only your calls.** What waits on you shows under **Your turn** on the left of every
  screen, over the office, under your Claude Code prompt, on your phone (Discord, Telegram or Slack)
  while you are away, and three times a day when you are busy. Started with your computer, it keeps
  answering with no window open.
- **Flows.** "Every weekday at 9, catch me up." You say it; it shows you the flow before making it.
- **For developers: inside the Claude Code you already use.** Claude Code is great at your own
  work; it cannot reach your teammates. With the plugin, their clones are tools in any conversation
  ("ask Ben's clone how /orders paginates"), an answer that comes later lands in that idle session by
  itself, and what waits on you shows under the prompt: `/office` answers it in Claude Code's own
  question dialog, without leaving your work.
- **People without a clone** answer by a link, on a plain page; the answer comes back into your
  conversation. Files go along with requests, shown to you before they leave.

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
docker compose logs relay   # the invite link
```

or by hand with a Postgres you have: `DATABASE_URL=postgres://… npx clone-office relay --host
0.0.0.0` (without one it keeps the office in a folder). On the internet, put it behind HTTPS (Caddy
or nginx) and set `RELAY_TRUST_PROXY=1` and `RELAY_PUBLIC_URL`.

Open the invite link first and make your account (under the setup steps): the first account owns
the office. Send the same link to your team. Each person can follow the steps on its page, which
join with the link alone, or make an account there too; their page on the server then gives them
one line that connects their computer under their name:

```sh
npx clone-office connect https://<your server>/p/<one-time code>
```

Owners see everyone in the office on that page, can remove someone (their clone stops at once),
make others owners, make a new invite link (old ones stop working) and name the office.

**From any A2A agent**: every member of an office is an [A2A](https://a2a-protocol.org) v1.0 agent
on the relay, at `/a2a/<member>` (its card at `/a2a/<member>/.well-known/agent-card.json`). An
agent that has joined the office (`POST /join` with the office key gives it a token) asks a
colleague's clone with `SendMessage`, as a clone does, and the clone answers it the way its person
set. Hermes Agent's a2a tools and the official SDKs work with it as they are.

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
cards, requests and the files sent with them (two weeks), what clones said in the office's
meetings (sixty days) and a team key, sealed, never memories or conversations. Settings › General
lists every file your clone keeps.

Chrome offers to install the app as a window of its own, and Settings › General says when a newer
version is out, with the line that starts it.

## From source

```sh
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

To try an office alone, run a second clone with its own folder, port and build folder:
`CLONE_OFFICE_HOME=~/.clone-office-b CLONE_OFFICE_DEV_DIR=.next-b pnpm dev --port 3001`.
`node scripts/pack.mjs` builds the npm package from the committed files without publishing it.

The screen speaks English, Korean, Simplified Chinese, Japanese, Spanish and Brazilian Portuguese;
a language is one file under `messages/`.

## Status

0.1.0: early. Coming next: the browser as its hands, a desktop app, and a clone that runs on the
team's server for people who don't install anything. See [CHANGELOG.md](CHANGELOG.md),
[CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). Code and marks taken from other projects keep their own licenses:
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
