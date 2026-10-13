# The guide to your clone

The clone reads this whenever an answer depends on how Clone Office works: what it can do for
its person, what it keeps and never keeps, what it reads from their computer, how they leave
something out, what to do when something fails. It is written for the person, not for whoever
builds the app: screens and words they see, never code.

Read the one file that covers the question, then answer in a sentence or two, in the person's
language. Name a screen or button the way they see it, and never name a file from here.

| File | What is in it |
|---|---|
| `memory.md` | What the clone keeps about them, what it never keeps, how it learns, bringing what another AI remembers, how they see, correct or remove what it keeps, starting over, where it is kept |
| `reading.md` | What it reads from their computer and what it never opens, leaving a folder out, the search over their past AI conversations, where their data goes |
| `office.md` | The office: opening one on their computer or joining by an invite link, cards, asking a colleague's clone (also from Claude Code, with the Clone Office plugin), answering requests that come in, what goes to the relay and what never does, sharing skills with the office and adding colleagues', files between clones |
| `phone.md` | Talking with the clone from Discord, Telegram or Slack on their phone: setting up their own bot, letting their phone in by its code, questions as buttons, what comes to the phone by itself while they are away from the page, when it does not answer |
| `brain.md` | What the clone thinks with: their ChatGPT plan, their Claude subscription through Claude Code (Haiku, Sonnet or Opus), a key (OpenAI, Claude, Gemini, OpenRouter) or a model on their computer (Ollama, LM Studio); keys, cost, the backup model for when it is busy, the lighter model for background work, changing it; long work: the to-do list, helpers, the scratch folder |
| `connectors.md` | Connectors: the services the clone works in (Notion, Linear, Jira and Confluence, GitHub, Google), connecting each, registering Google's client once for the team, what it asks before using them, disconnecting, when it does not work |
| `flows.md` | Flows: what the clone does on its own at set times, how they make one by asking, when it runs and what a run may do, where its answers go |
| `trouble.md` | Claude Code missing or signed out, a Codex conversation that cannot be asked, learning that takes long, something said that is out of date, reading again |

Two things hold everywhere:

- **It is theirs and it stays on their computer.** Everything the clone keeps is files on this
  computer. What it reads goes only to the AI it thinks with, the one they picked under **AI model**
  (AI 모델): their own Claude Code, or a model with their key (`reading.md`, `brain.md`).
- **It learns their work first, then the rest while working.** The first time, it reads their AI
  records and the folders they worked in lately, and keeps what they do, what they are working on
  (a dated page for each piece of work, starting with its folder), a map of where their work lives
  on the computer, the people around them and how they work. It learns the rest from doing work
  with them and from their corrections (`memory.md`, `reading.md`).

## Where things are

- **The column on the left** is always there. At its top, **New chat** (새 대화, ⇧⌘O) and **Search**
  (검색, ⌘K: one box that finds a conversation, a request or a colleague, opens a place or a part of
  Settings, or asks the clone what was typed with ⌘↵); then the four places: **Home** (홈),
  **Requests** (부탁, with how many are open), **Office** (오피스, which says when the clones are
  meeting) and **Your clone** (내 클론, with how far it has read while it reads); the place open is
  the shaded row. **To decide** (정할 것) appears below them only when something waits on them, one
  line each: the face of the clone that asked, with a red dot, the question, and how long it has
  waited; a click goes where it is answered. Then their conversations, under **Today**, **Yesterday**,
  **Previous 7 days**, **Previous 30 days** and then by month (오늘, 어제, 지난 7일, 지난 30일), a page
  at a time as they scroll, with a dot where a question waits and a turning mark where the clone is
  answering. Pointing at one gives its menu: **Rename** (이름 바꾸기, also F2 on the row) and
  **Archive** (보관하기), which takes it off the list without deleting anything; **Undo** (되돌리기) brings it
  straight back, and Settings › General › **Archived chats** (보관한 대화) any time later. With the
  keyboard the list is one stop: ↑↓ move through it, Shift+F10 opens a row's menu and F2 renames
  it; **Skip to content** (본문으로 건너뛰기), the first stop on any screen, goes past the column. At the
  bottom: their name and office status, which opens their menu (their status, the office and where
  it is, **Invite a colleague** 동료 초대, **Keyboard shortcuts** 단축키), and **Settings** (설정, ⌘,)
  beside it. The column folds away (⌘\, or the button at its top) and stays folded; on a narrow
  window it is a drawer behind ☰ in a thin bar at the top.
- **Keys** (단축키, also `?`): ⌘K search (⌘↵ there asks the clone what was typed), ⇧⌘O new chat,
  `/` the box to the clone, ⌘\ the column, ⌘, Settings and ⌘1–6 its sections, F2 renames a
  conversation, F6 reaches the latest note's **Undo**. On Windows and Linux it is Ctrl for ⌘.
  Buttons drawn as an icon alone say what they do, and their key, when pointed at.
- **What happened, and news** (알림): what they just did says so for a moment at the bottom (copied,
  archived, with **Undo** where it can be taken back); news they did not cause (a colleague's clone
  asks them something, a colleague answered their request) comes as a card at the bottom right,
  with who it is from and **Answer** (답하기) or **Open** (열기), unless the screen they are on
  already shows it. Several cards stand one above the other, and both kinds stay above the box a
  screen keeps at its bottom. With the app's tab in the back, it comes from the browser instead, once they
  turn that on in Settings › Notifications & phone.
- **Home** (홈) is where the app opens: what is happening, what waits on them, and what to do
  about it. One box at the top asks their clone anything (name a colleague, and it asks theirs),
  with a few things to try under it; **Getting started** (시작하기) while the app is new; **Decide
  now** (정할 것), answered right there: the answer stays on its row as what is about to go, with
  **Undo** (되돌리기) beside it and in the note at the bottom, and goes after a few seconds (or when
  they leave the screen), so a stray tap is never a decision made in their name; meanwhile it no
  longer counts as waiting, and the keyboard moves on to the next question once it is sent; **Requests on their way** (오가는 부탁), those waiting on
  them first; and beside them, **Today** (오늘), the day in one panel: **What your clone did**
  (클론이 한 일: whom it answered for them, meetings it brought back, flows it ran), **Still to
  come** (남은 일정: the clones' standup, today's flows) and their **Colleagues** (동료). A part with
  nothing in it says so in one line.
- **Chat** (대화): the conversation with their clone, and the box, **Ask your clone anything**
  (클론에게 무엇이든 부탁해 보세요). A new chat starts with the clone's hello and things to try.
  While the clone is answering, what they write still goes: it shows **Waits for its next step**
  (다음 단계 전에 읽어요) with an X to take it back, and the clone reads it before its next step
  (with a key's model) or as soon as this answer is done (with Claude Code), then **Read** (읽음),
  after Thursday's step-in. For work of several steps the clone keeps a **To-do list** (할 일) above
  its answer: each step ticked as it is done, the one under way turning while it works (as Claude
  Code shows its own); a new list takes the place of the last, and opening the conversation again
  shows the last one. When it sends a helper off (`brain.md`, "Long work"), a line says what the
  helper is on and when it finished. When their model was busy and the backup model finished the
  answer, a line says so (**Your model was busy, so … finished this answer**). Under
  the box, **Ask a colleague** (동료에게) and **Every so often** (정해진 때마다) start the sentence
  for them. On a wide screen the right side shows **The office now** (지금 오피스): the office, live;
  the requests in motion; today's flows. The button at the top folds it away.
- **Requests** (부탁): what they and their colleagues asked each other, grouped as **To decide**,
  **On its way**, **Waiting on them** and **Done** (정할 것, 진행 중, 답 기다리는 중, 완료), with **All**,
  **Received** and **Sent** (모두, 받은 부탁, 보낸 부탁), and **Ask a colleague** (동료에게
  부탁하기) at the top. A request opens on its own page: the clones' exchange, what waits on them
  (answered right there, with **Undo** for a few seconds as on Home), its files, and who it is with.
- **Office** (오피스): the office floor (`office.md`), with what waits on them laid over it to
  answer right there.
- **Your clone** (내 클론): how like them it answers, and four tabs. **What it knows** (아는 것:
  about them, what it remembers, its skills and, in an office, the office's skills, reading again,
  bringing it from another AI, starting over),
  **Requests it takes** (받는 부탁: the kinds colleagues can ask, how much it does alone for each,
  where a new kind starts), **Flows** (플로우) and **In your name** (나 대신 한 일: what it did for
  them, any day, latest first: each answer it sent a colleague and whether it did so on its own,
  told them, or sent what they saw; answers it held back; requests it sent; what they allowed from
  now on or took back; flows run. A request opens where it is answered.)
- **Settings** (설정) has six sections. **AI model** (AI 모델: the model it uses, its **Backup model**
  (예비 모델) for when that one is busy, learning after each
  conversation, the lighter model for background work), **Permissions** (권한: how much it does on
  its own, what it does without asking, folders left out), **Connectors** (도구 연결),
  **Notifications & phone** (알림·휴대폰: the phone, when kept questions come, quiet hours),
  **Office** (오피스: open one, join, invite, people, the morning lobby) and **General** (일반:
  language, theme, starting with this computer, the files it keeps, this app; when a newer version
  is on npm, it says so there with the line that starts it, `npx -y clone-office@latest`, once this
  one is closed).
- Keys: ⌘, (Ctrl+, on Windows and Linux) opens Settings, ⇧⌘O starts a new chat, and / goes to the
  box.

## Getting started

Home shows **Getting started** (시작하기), five steps that tick themselves off as they are
done: **Hand your clone a task** (클론에게 일 하나 맡기기), **Tell your clone about you** (클론에게
나를 알려 주기, which starts the sentence "About me…" in the box; nothing else is needed, no AI
records), **Bring in a colleague** (동료 부르기), **Choose what colleagues can ask** (동료가 부탁할
수 있는 일 정하기) and **Get what needs you on your phone** (나를 기다리는 일을 휴대폰으로 받기).
The one to do next says why; the others wait one line each, and those done fold into one line
beneath. **Hide getting started** (시작하기 숨기기) folds it away.

## The first time

Opened the first time, the app says what a clone is (**One more you, working the way you do.**,
나처럼 일하는 나를 하나 더.): everyone on a team sends a clone of their own, it learns, stands in and
asks them only what is theirs, and it keeps to the AI they already use. Beside it, the office plays
the loop out as an example with nobody real in it. **Get started** (시작하기) leads to four steps,
named in a bar at the top: what it thinks with, picked from one field that opens on the vendors and
what each offers, and checked to answer at once (`brain.md`); letting it learn how they work, after
leaving out any folder it should never read (`reading.md`, `memory.md`): when it has read, it shows
**What I understood about you** (제가 이해한 내용) in short, by names (what they do, their projects,
the people, their tools, their folders; pressing one lists all of it, each line with a × to take
it back), while beside it, in the office, a colleague's clone brings the question it expects a
colleague to ask and theirs answers it in their place (on a narrow window, under **If a colleague
asks**, 동료가 이렇게 물으면) (with no AI records
on the computer, it simply learns as they work); who they are (name, what they do, what they look
after and the tools they work in, filled in from what it read for them to correct, with their card
as colleagues will see it laid over the office as they write) and whether a team is in it
(`office.md`; started from an invite, this comes first, with the office they were invited to picked
already, so the team's models are there when they pick one); then how much their clone does on its
own in their own work (**Ask me first**, 수동, or **On its own**, 자동, each explained under its
name), and each part as it stands, a chevron on one that can still be changed; then Home. At the
bottom, **Back** (이전) goes back, and **Skip** (건너뛰기) beside the step's own button passes over
the step on screen only. The screen's language is one button at the top
right of the first steps (**Follow the browser**, 브라우저 언어 따르기, until they pick one), and
under Settings › General.

## Installing

Clone Office runs on their own computer, so their clone can learn from what is there and work with
their files and tools; what it keeps stays there. It needs Node.js 22.13 or later (nodejs.org).
In a terminal, `npx -y clone-office` starts it and opens it in the browser; the window stays open while it
runs, and the same line starts it again later. **Start with this computer** (컴퓨터와 함께 켜기) in
Settings › General has it start when they sign in to their computer instead, with no window open,
so their clone answers colleagues while they are away from it (the same as
`npx -y clone-office service install`; after updating Clone Office, turn it off and on again). Invited by a teammate, the invite link's page shows
the same steps with the one line that also joins their office (`office.md`).

## Settings in more detail

- **How much it does on its own** (혼자 할 수 있는 범위, Settings › Permissions), one of two: **Ask me
  first** (수동, the default) asks before reading a file, opening a web page, running a command,
  using its browser or a connected service; **On its own** (자동) does all of that without asking
  (reading files never in folders left out, commands only inside its sandbox, never uploading a file
  or running code in a web page) and shows what it did in the conversation. In both, files leaving
  the computer, flows, adding a skill, and work in their Claude Code or Codex conversations are
  shown to them first, and colleagues' requests never use this: there, each kind of request has its
  own trust level under Your clone › Requests it takes.
- **New kinds of request start at** (새 부탁 종류의 시작 단계, Your clone › Requests it takes): on its
  own, tell me, or ask me first.
- **When kept questions come** (미뤄 둔 질문 받는 시간, Settings › Notifications & phone): the hours
  questions kept for later come to the phone together, 10:00, 14:00 and 17:00 unless they choose
  others. On screen, they are under **To decide** all the time.
- **Learn after each conversation** (대화가 끝날 때마다 배우기, Settings › AI model): on by default; off, it
  learns only what they tell it to remember.
- **Lighter model for background work** (뒤에서 하는 일은 가벼운 모델로, Settings › AI model): looking
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
  conversations** (지난 대화) opens an earlier one where it left off. A long conversation is
  carried on from a summary, so it never fills up.
- Find and read their past conversations with their AI tools on this computer: "what did I do
  today", "where did we leave the login bug", "how did I handle that last time".
- Remember how they want a kind of task done once they say so, and do it that way next time.
- Read their files and the web when they let it, asking first with a card; ask them with a card
  when only they can decide (`memory.md`, "What it does alone, and what it asks first").
- Ask one of their own Claude Code or Codex conversations about its project ("ask my payments-api
  conversation how /orders pages"), by the name they gave it with `/rename` (or, in Codex, by what
  they first asked in it), after a card the first time. A copy answers, reading files only, so the
  conversation itself is never changed. A Codex copy runs in Codex's own sandbox: it reads files,
  kept out of the folders they left out (those listed by their place on the computer) and the
  clone's own keys, and cannot write anything or reach the network.

- Work with colleagues' clones in an office: send and answer requests, asking them first for
  what only they can decide; tell them what is waiting for them ("what is waiting for me?"); show
  how like them its answers are (**Like you**); carry their **How to work with me** lines (ME.md)
  on their card; ask someone who has no clone by a link they send themselves; share one of its
  skills with the office and add the ones colleagues shared; and bring a colleague in with one
  invite link (`office.md`).
- Have one of their Claude Code or Codex conversations do a piece of work they took on (often a
  colleague's request). The card asking whether it may (**Have one of your Claude Code or Codex
  conversations do work**) comes every time, and offers **For this task, don't ask about changing
  files in <folder>**: ticked, it changes files in that folder without a card each time, for that
  one piece of work only. When it is done the clone says which files it changed (in a git
  repository: each file whose content changed, with the lines added and removed, and the files it
  added, removed or put back as committed), so they can look before relying on it.
  - In Claude Code it works in a copy of that conversation named "<name> · clone", which they can
    open later with `/resume`. Unless they ticked the task's choice, every file it changes is asked
    of them first, on a card that shows the change itself; every command it runs is asked every
    time.
  - Codex cannot stop to ask, so a copy of the conversation works in a separate copy of the
    project (it must be in git): its files as they are now, with changes not yet committed, but
    without what git ignores (such as node_modules or .env) and without folders left out. There it
    may change files and run commands, sandboxed: nothing outside that copy is written and nothing
    reaches the network. When it is done, one card (**Let a Codex conversation's changes into your
    files**, Codex 대화가 고친 내용을 내 파일에 반영하기) shows every file it changed and the lines
    before and after, unless they ticked the task's choice and every change is inside that folder
    (and none in a folder they left out), when the changes go in at once.
    **Allow** puts the changes into their folder, all or none: if one of those files changed in the
    meantime, nothing is applied. Otherwise their files stay as they were, and the changes are kept
    as a patch file under `hands/changes/` in the clone's folder (`git apply <file>` in the project
    applies it later). The copy of the project, under `hands/work/`, is removed once they decide.
    The Codex conversation itself is never written to, and the copy is kept nowhere. This needs a
    Codex from August 2026 or later (`codex exec fork`).
- Do something on its own at set times, again and again or once later ("every weekday at 9, sum
  up what is waiting for me"), or handle a kind of colleague's request their way when it comes
  in, when they ask for it, after a card (`flows.md`).
- Keep a folder out of everything it reads and searches when they say so, after a card
  (`reading.md`).

- Work with its own hands, in their own work only (never for a colleague's request):
  - **A workspace** of its own, the `workspace` folder in the clone's folder, where it makes what
    it makes, downloads and installs.
  - **A scratch folder** for each conversation, `scratch/<session>/` in the clone's folder, for
    what it needs only while it works (`brain.md`, "Long work"); removed on its own a week after
    the conversation was last used.
  - **Commands** in that workspace, inside the computer's own sandbox (as Claude Code's are, on
    macOS and on Linux with bubblewrap): they may read their files but never their keys, passwords
    or the folders they left out, may write only in the workspace and the conversation's scratch
    folder, and never reach the computer's own services. The card shows the command; **Don't ask again for commands in its sandbox**
    (앞으로 샌드박스 안의 명령은 묻지 않기) lets them run alone. Where there is no sandbox (Windows,
    or folders left out by name on Linux), every command is asked, every time.
  - **Its own browser** (Chrome where it is installed, else Edge or Chromium), on a profile of its
    own, not signed in to their accounts until they sign in there; its window shows while they are
    in the conversation. Looking at pages can be let once (**Don't ask again for looking at pages
    in its browser**); clicking, typing and filling forms are asked each time by hand; uploading a
    file or running code in a page is asked every time. It never pays, buys, books, posts or
    accepts terms without their yes, and never types a password or a card number.
  - **What it makes** (a document, a report, a sheet, a chart, a page) comes as a link in its
    answer; it opens in the app (a page runs walled off from the app), with **Save** to keep it.
  - **Skills from the open registry** (skills.sh): it can look for one when a task needs a method
    it lacks, and adds one only after a card listing its files; its scripts run only as commands
    they see.

- Work in the services they connected under **Connectors** (도구 연결): Notion, Linear, Jira and
  Confluence, GitHub, and Google's Gmail, Calendar, Drive, Docs and Sheets, through each one's own
  MCP server, asking first for each kind of action (`connectors.md`).
