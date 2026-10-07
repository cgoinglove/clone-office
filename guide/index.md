# The guide to your clone

The clone reads this whenever an answer depends on how sub-office works: what it can do for
its person, what it keeps and never keeps, what it reads from their computer, how they leave
something out, what to do when something fails. It is written for the person, not for whoever
builds the app: screens and words they see, never code.

Read the one file that covers the question, then answer in a sentence or two, in the person's
language. Name a screen or button the way they see it, and never name a file from here.

| File | What is in it |
|---|---|
| `memory.md` | What the clone keeps about them, what it never keeps, how it learns, bringing what another AI remembers, how they see, correct or remove what it keeps, starting over, where it is kept |
| `reading.md` | What it reads from their computer and what it never opens, leaving a folder out, the search over their past AI conversations, where their data goes |
| `office.md` | The office: opening one on their computer or joining by an invite link, cards, asking a colleague's clone (also from Claude Code, with the sub-office plugin), answering requests that come in, what goes to the relay and what never does, files between clones |
| `phone.md` | Talking with the clone from Discord, Telegram or Slack on their phone: setting up their own bot, letting their phone in by its code, questions as buttons, what comes to the phone by itself while they are away from the page, when it does not answer |
| `brain.md` | What the clone thinks with: their ChatGPT plan, their Claude subscription through Claude Code (Haiku, Sonnet or Opus), a key (OpenAI, Claude, Gemini, OpenRouter) or a model on their computer (Ollama, LM Studio); keys, cost, the lighter model for background work, changing it |
| `connectors.md` | Connectors: the services the clone works in (Notion, Linear, Jira and Confluence, GitHub, Google), connecting each, registering Google's client once for the team, what it asks before using them, disconnecting, when it does not work |
| `flows.md` | Flows: what the clone does on its own at set times, how they make one by asking, when it runs and what a run may do, where its answers go |
| `trouble.md` | Claude Code missing or signed out, learning that takes long, something said that is out of date, reading again |

Two things hold everywhere:

- **It is theirs and it stays on their computer.** Everything the clone keeps is files on this
  computer. What it reads goes only to the AI it thinks with, the one they picked under **Brain**
  (두뇌): their own Claude Code, or a model with their key (`reading.md`, `brain.md`).
- **It learns while working, not all at once.** The first time, it reads a little and keeps only
  a few lines about how they work. It learns the rest from doing work with them and from their
  corrections (`memory.md`).

## Where things are

- **The column on the left** is always there. At its top, **New chat** (새 대화), then the three
  screens: **Chat** (대화), **Requests** (부탁) and **Office** (오피스). **Your turn** (내 차례)
  appears below them only when something waits on them, one line each (a question about a
  colleague's request, or one in a conversation); a click goes where it is answered. Then **Recent
  chats** (최근 대화), with a dot where a question waits. At the bottom: their clone (how far it has
  learned, or how like them it answers; it opens **Your clone**, 내 클론), their status in the
  office once they are in one (working, in a meeting, away, off), and **Settings** (설정).
- **Chat** (대화) is where the app opens: the conversation with their clone, and the box, **Ask your
  clone anything** (클론에게 무엇이든 부탁하세요). A new chat starts with the clone's hello,
  **Getting started** (시작하기) and things to try. Under the box, **Ask a colleague** (동료에게)
  and **Every so often** (정해진 때마다) start the sentence for them. On a wide screen the right side
  shows **The office now** (지금 오피스): the office, live; the requests in motion; today's flows.
  The button at the top folds it away.
- **Requests** (부탁): what they and their colleagues asked each other, grouped as **Your turn**,
  **On its way**, **Waiting on them** and **Done** (내 차례, 처리 중, 답 기다림, 끝남), with **All**,
  **Received** and **Sent** (모두, 받은 부탁, 보낸 부탁), and **Ask a colleague** (동료에게
  부탁하기) at the top. A request opens on its own page: the clones' exchange, what waits on them
  (answered right there), its files, and who it is with.
- **Office** (오피스): the office floor (`office.md`), with what waits on them laid over it to
  answer right there.
- **Your clone** (내 클론): how like them it answers, and three tabs. **What it knows** (아는 것:
  about them, what it remembers, reading again, bringing it from another AI, starting over),
  **Requests it takes** (받는 부탁: the kinds colleagues can ask, how much it does alone for each,
  where a new kind starts) and **Flows** (플로우).
- **Settings** (설정) has six sections. **Brain** (두뇌: what it thinks with, learning after each
  conversation, the lighter model for background work), **Permissions** (권한: how much it does on
  its own, what it does without asking, folders left out), **Connectors** (도구 연결),
  **Notifications & phone** (알림과 휴대폰: the phone, when kept questions come, quiet hours),
  **Office** (오피스: open one, join, invite, people, the morning lobby) and **General** (일반:
  language, theme, the files it keeps, this app).
- Keys: ⌘, (Ctrl+, on Windows and Linux) opens Settings, ⌘⇧N starts a new chat, and / goes to the
  box.

## Getting started

A new chat shows **Getting started** (시작하기), five steps that tick themselves off as they are
done: **Hand your clone a task** (클론에게 일 하나 맡기기), **Tell your clone about you** (클론에게
나를 알려 주기, which starts the sentence "About me…" in the box; nothing else is needed, no AI
records), **Bring in a colleague** (동료 부르기), **Choose what colleagues can ask** (동료가 부탁할
수 있는 것 정하기) and **Get what needs you on your phone** (나를 기다리는 일을 폰으로 받기).
**Hide getting started** (시작하기 숨기기) folds it away.

## The first time

Opened the first time, the app shows **Get started** (시작하기) beside the office playing a short
scene. Four steps follow, each of which can be passed over: what it thinks with (`brain.md`);
letting it learn how they work, after leaving out any folder it should never read (`reading.md`,
`memory.md`; with no AI records on the computer, it simply learns as they work); what to call
them and whether a team is in it (`office.md`; started from an invite, it says who invited them
and joins that office); then the chat with their clone. **Set up later** (나중에 하기) goes
straight there. The screen's language is at the top right of the first steps, and under
Settings › General.

## Installing

sub-office runs on their own computer, so their clone can learn from what is there and work with
their files and tools; what it keeps stays there. It needs Node.js 22.13 or later (nodejs.org).
In a terminal, `npx -y sub-office` starts it and opens it in the browser; the window stays open while it
runs, and the same line starts it again later. Invited by a teammate, the invite link's page shows
the same steps with the one line that also joins their office (`office.md`).

## Settings in more detail

- **How much it does on its own** (혼자 해도 되는 정도, Settings › Permissions): **Ask me first**
  (먼저 묻기, the default) asks before reading a file, opening a web page or using a connected
  service; **Read on its own** (읽기는 알아서) reads files (never in folders left out), web pages and
  connected services without asking, and still asks before anything that changes something; **Do
  it, then tell me** (하고 나서 알려 주기) also acts in connected services and asks colleagues
  without asking first. In every mode, files leaving the computer, flows, and work in their Claude
  Code conversations are shown to them first, and colleagues' requests never use this: there,
  each kind of request has its own trust level under Your clone › Requests it takes.
- **New kinds of request start at** (새로 받는 부탁의 기본값, Your clone › Requests it takes): on its
  own, tell me, or ask me first.
- **When kept questions come** (미뤄 둔 질문을 받을 때, Settings › Notifications & phone): the hours
  questions kept for later come to the phone together, 10:00, 14:00 and 17:00 unless they choose
  others. On screen, they are under **Your turn** all the time.
- **Learn after each conversation** (대화가 끝나면 배우기, Settings › Brain): on by default; off, it
  learns only what they tell it to remember.
- **Lighter model for background work** (뒤에서 도는 일은 가벼운 모델로, Settings › Brain): looking
  back, summaries and drafts on the brain's smaller model; off by default.
- **Quiet hours** (방해 금지 시간, Settings › Notifications & phone) for the phone, and **Clock in at
  the lobby** (로비에서 출근하기, Settings › Office).

## What it can do now

This is version 0.1, an early one.

- Learn how they work from their AI tools' records and from what their usual AI (ChatGPT, Claude,
  Gemini…) remembers about them, and show what it keeps exactly as saved, each line correctable or
  removable.
- Suggest three things to do together, chosen from what they are doing lately, and do one with
  them in the conversation.
- Keep every conversation with them: **New conversation** (새 대화) starts one, **Past
  conversations** (이전 대화) opens an earlier one where it left off. A long conversation is
  carried on from a summary, so it never fills up.
- Find and read their past conversations with their AI tools on this computer: "what did I do
  today", "where did we leave the login bug", "how did I handle that last time".
- Remember how they want a kind of task done once they say so, and do it that way next time.
- Read their files and the web when they let it, asking first with a card; ask them with a card
  when only they can decide (`memory.md`, "What it does alone, and what it asks first").
- Ask one of their own Claude Code conversations about its project ("ask my payments-api
  conversation how /orders pages"), by the name they gave it with `/rename`, after a card the
  first time. A copy answers, reading files only, so the conversation itself is never changed.

- Work with colleagues' clones in an office: send and answer requests, asking them first for
  what only they can decide; tell them what is waiting for them ("what is waiting for me?"); show
  how like them its answers are (**Like you**); carry their **How to work with me** lines (ME.md)
  on their card; ask someone who has no clone by a link they send themselves; and bring a
  colleague in with one invite link (`office.md`).
- Have one of their Claude Code conversations do a piece of work they took on (often a
  colleague's request): it works in a copy of that conversation named "<name> · clone", which
  they can open later with `/resume`, and every file it changes and every command it runs is
  asked of them first, on a card that shows the change itself.
- Do something on its own at set times, again and again or once later ("every weekday at 9, sum
  up what is waiting for me"), or handle a kind of colleague's request their way when it comes
  in, when they ask for it, after a card (`flows.md`).
- Keep a folder out of everything it reads and searches when they say so, after a card
  (`reading.md`).

- Work in the services they connected under **Connectors** (도구 연결): Notion, Linear, Jira and
  Confluence, GitHub, and Google's Gmail, Calendar, Drive, Docs and Sheets, through each one's own
  MCP server, asking first for each kind of action (`connectors.md`).
