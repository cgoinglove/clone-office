# sub-office

**Your AI does the work. You're still the messenger.**

You ask your AI to write up the request. You paste it into Slack. You wait, you chase, you paste the
answer back. Everyone on your team has an AI, and none of them can reach each other, so the people
carry the messages.

**sub-office gives everyone on the team a mini-me, an AI that works like them, and lets the
mini-mes talk.** Your mini-me learns how you work from your own records, does your everyday tasks
like an assistant, and stands in for you with your teammates' mini-mes. It answers what it can,
takes requests, has your Claude Code conversations do the work, and brings you only the calls that
are yours.

> Not one person with ten bots. Ten people, ten mini-mes.

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
- **Flows.** "Every weekday at 9, catch me up." "When someone asks about the payments API, end with
  a pointer to #payments-api." You ask; it shows you the flow on a card before making it.
- **For developers:** with the Claude Code plugin, your teammates' mini-mes are tools in your
  Claude Code, and an answer that comes later lands in your idle session by itself.
- **People without a mini-me answer by a link.** Your mini-me makes the link, you send it the way
  you usually would, they answer on a plain page, and the answer comes back into your
  conversation. A colleague joins your office from one invite link.
- **The office, drawn.** Your team's floor: each person's mini-me at their desk, requests carried
  from desk to desk and brought back answered, a board of who is on what. It opens at the lobby
  the first time each day.
- **It is yours.** Everything it keeps is files on your computer, and it thinks with your own
  Claude Code. The relay that carries requests between mini-mes is a small server your team runs;
  it holds cards and requests, never memories or conversations.

English and Korean today; a language is one file under `messages/`.

## Try it

You need Node.js 22.18 or later, pnpm, and Claude Code, signed in.

```sh
git clone <this repository> sub-office && cd sub-office
pnpm install
pnpm dev        # your mini-me: http://127.0.0.1:3000/me
```

For an office, one teammate runs a relay and shares its address and the key it prints:

```sh
pnpm relay      # http://127.0.0.1:3200 by default; --host and --port to change
```

Then **Office** on each person's page joins it. To try it alone, run a second mini-me with its own
folder and port: `SUB_OFFICE_HOME=~/.sub-office-b pnpm dev --port 3001`.

By default the relay is reachable only from its own computer. For teammates on the same network,
start it with `--host 0.0.0.0` and have everyone, its host included, join with that computer's
network address rather than 127.0.0.1, so invite and reply links point somewhere they can reach.
This has not been tried across two computers yet.

The Claude Code plugin, from this folder:

```sh
claude plugin marketplace add .
claude plugin install sub-office@sub-office
```

`node scripts/pack.mjs` builds the npm package (`npx sub-office`) from the committed files, without
publishing it.

## Status

Early, in local development. Coming next: a relay on Postgres that a team can deploy anywhere,
and opening an office for your network in one step; files between mini-mes; talking to your
mini-me from Discord or Slack; mail, calendar and documents as its hands; a desktop app for people
who don't code.
