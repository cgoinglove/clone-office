# sub-office

**Your AI does the work. You're still the messenger.**

You ask your AI to write up the request. You paste it into Slack. You wait, you chase, you paste the
answer back. Everyone on your team has an AI, and none of them can reach each other, so the people
carry the messages.

**sub-office gives everyone on the team a clone, an AI that works like them, and lets the
clones talk.** Your clone learns how you work from your own records, does your everyday tasks
like an assistant, and stands in for you with your teammates' clones. It answers what it can,
takes requests, has your Claude Code conversations do the work, and brings you only the calls that
are yours.

> Not one person with ten bots. Ten people, ten clones.

`sub-office` is a working name.

## Why now

Your AI makes your own work faster every few months. The moment you need someone else, work drops
back to human speed. The bottleneck has moved to the handoffs between people, and people still hold
the access, the responsibility and the final call. sub-office runs the handoffs at AI speed and
leaves each decision with the person it belongs to.

## What works today

- **It starts from what your AI tools already know.** It reads your conversations with Claude
  Code, Codex, Cursor and Hermes Agent, the notes you wrote for them and your recent commits, or
  what ChatGPT, Claude or Gemini remembers about you (copy a prompt there, paste the answer here).
  It keeps a few lines about how you work, shown exactly as saved; you correct or remove any. You
  choose the folders it never reads.
- **It keeps learning, and only what lasts.** After each conversation it looks back and keeps how
  you decide and talk and what you corrected. Anything that changes (projects, plans, dates,
  files) is looked up when needed, never stored.
- **It thinks with what you have.** Your own Claude Code with your Claude subscription, or a
  model with your key (Claude, OpenAI, Gemini, OpenRouter), or one running on your computer
  (Ollama, LM Studio). Same memory, same cards, whichever you pick.
- **It finds things in your past AI conversations.** "What did I decide yesterday?", "How did I
  handle this last time?", across your tools, on your computer.
- **It asks your Claude Code conversations, and has them do work.** By the names you gave them.
  Every change and every command is shown to you on a card first.
- **It takes your team's requests your way.** Your card says what people can ask you for; for each
  kind you choose *on its own*, *tell me* or *ask me first*. Promises, decisions and anything about
  a relationship always come to you. A second look checks every answer before it leaves. When you
  are away, its questions wait and come to you three times a day.
- **It tells you how like you it is.** The like-me score: how often you send its answers as they
  were.
- **From your phone.** Talk with your clone from Discord, Telegram or Slack as you do on its
  page, through a bot of your own that answers only you; its questions come as buttons. While you
  are away from its page, what needs you comes there by itself: a colleague's question, your
  morning brief, the answer to what you asked. Tried with a real Discord bot; Telegram and Slack
  against stand-ins so far.
- **It works in your services.** Notion, Linear, Jira and Confluence, GitHub, and Google's Gmail,
  Calendar, Drive, Docs and Sheets, through each service's own MCP server, signed in as you and
  asking before each kind of action. Most connect with one approval; for Google, someone on the
  team registers a client once and everyone connects their own account.
- **Flows.** "Every weekday at 9, catch me up." "When someone asks about the payments API, end with
  a pointer to #payments-api." You ask; it shows you the flow on a card before making it.
- **For developers:** with the Claude Code plugin, your teammates' clones are tools in your
  Claude Code, and an answer that comes later lands in your idle session by itself.
- **Files go along.** "Send Minsu the quote and ask him to check it": the files travel with the
  request, shown to you on the card first, and an answer can bring a file back, after you saw it.
  The relay keeps them two weeks, for the two of you only.
- **People without a clone answer by a link.** Your clone makes the link, you send it the way
  you usually would, they answer on a plain page, and the answer comes back into your
  conversation. A colleague joins your office from one invite link.
- **An office in one click.** Your computer can be the office for teammates on the same Wi-Fi; a
  team that works apart runs the same relay on a server, with Docker and Postgres.
- **The office, drawn.** Your team's floor: each person's clone at their desk, requests carried
  from desk to desk and brought back answered, a board of who is on what. It opens at the lobby
  the first time each day.
- **It is yours.** Everything it keeps is files on your computer, and it thinks with your own
  Claude Code. The relay that carries requests between clones, on one of your computers or a
  server your team runs, holds cards and requests, never memories or conversations.

English and Korean today; a language is one file under `messages/`.

## Try it

You need Node.js 22.18 or later, pnpm, and Claude Code, signed in.

```sh
git clone <this repository> sub-office && cd sub-office
pnpm install
pnpm dev        # your clone: http://127.0.0.1:3000/me
```

For an office on your network, open **Office** on your page and choose **Open one on this
computer**: the app starts the relay that carries requests between clones (its records in
`relay/` in your clone's folder, with PGlite, Postgres inside the process; nothing to install)
and gives you an invite link with your computer's network address. Teammates on the same Wi-Fi
paste that link under **Join with an invite link**. The office rests while your computer sleeps
or the app is closed. This has been tried on one computer, not yet across two.

For teammates anywhere, run the relay on a server. By hand it is

```sh
pnpm relay      # http://127.0.0.1:3200 by default; --host and --port to change
```

which keeps the office in `./relay-data` with PGlite and prints the office key. With Postgres,
with Docker:

```sh
POSTGRES_PASSWORD=<letters and digits> docker compose up -d
docker compose logs relay   # the office key
```

or point it at a Postgres you have: `DATABASE_URL=postgres://… pnpm relay --host 0.0.0.0`.
On the internet, put it behind HTTPS (Caddy or nginx, for example) and set `RELAY_TRUST_PROXY=1`,
so it counts wrong office keys by each caller's address rather than the proxy's.

It prints an invite link; open it first and make your account there (the first account owns the
office), then send the same link to your team. Each person makes their account from it, and their
page on the server gives them one line to run on their computer:

```sh
npx sub-office connect http://<your server>/p/<one-time code>
```

That puts their clone in the office and opens it. Behind a proxy, set `RELAY_PUBLIC_URL` to the
address people reach. Someone already running sub-office can instead paste the invite link under
**Office** on their page, with the invite link or the relay's address and key. To try an office alone, run a second clone with its own folder and port:
`SUB_OFFICE_HOME=~/.sub-office-b pnpm dev --port 3001`.

The Claude Code plugin, from this folder:

```sh
claude plugin marketplace add .
claude plugin install sub-office@sub-office
```

`node scripts/pack.mjs` builds the npm package (`npx sub-office`) from the committed files, without
publishing it.

## Status

Early, in local development. Coming next: the browser as its hands; a desktop app for people who
don't code.
