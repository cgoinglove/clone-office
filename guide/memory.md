# What the clone keeps

The clone keeps four small things, all as plain text files on this computer:

- **About them**: a few short lines on how they work, decide and talk, and what they want to be
  asked first. Read at the start of every conversation, so it stays short (about 1,400
  characters).
- **Their way of working**: lasting conventions that are written nowhere else. Also read every
  time, also short (about 2,200 characters).
- **Skills**: how they want one kind of task done, such as a weekly report or a reply to a
  client, with what they corrected. Opened only when that kind of task comes up.
- **Notes**: one page per person they work with, opened only when that person comes up.

Beside these is **About you** (나에 대해, on the clone's screen): their name, what they do, what
they look after and the tools they work in. It is not memory: they set it themselves, on the first
steps or there (**Draft it for me**, 초안 써 줘, fills it in from their records), and change it
whenever it stops being true. Every conversation starts with it, so the clone knows whose work it
does; their name, what they do and what they look after also go on their card in the office.

## What it never keeps

- **Anything that changes or can be found again on the computer**: projects and how far along
  they are, plans, goals, dates, versions, folders and files, what they are doing now, what they
  did. A kept copy goes out of date and would mislead; the clone looks these up each time
  instead (`reading.md`).
- Passwords, keys and other secrets, health details, and private details about other people.

## How it learns

Everything it keeps is written in their own language, whatever it is: the one they picked under
**Language** (언어) under Settings › General, else the one their browser uses. The screen itself
reads in English or Korean (more can be added); in any other language it reads in English while
the clone still keeps what it learns, and asks them, in theirs.

- **The first time**: it reads a little of what is on their computer (`reading.md`) and keeps at
  most five lines about how they work. Lines kept this time are marked **New** (새로).
- **From another AI**: **Bring it from another AI** (다른 AI에서 가져오기) shows the text Claude's own
  memory import uses (**Copy**, 복사), to paste into a chat with the AI they use most — ChatGPT,
  Claude, Gemini or another. It asks that AI for everything it remembers; the clone sorts it. They
  paste that AI's answer back and press **Add to memory** (기억에 추가). The clone keeps only what
  will still be true in months (at most five lines each time) and never stores the pasted text. It
  can be done during the first steps, or any time later under **Your clone** (내 클론) › What it knows.
- **While working**: when they correct it ("shorter", "always ask before sending"), it keeps the
  correction in the skill for that kind of task, or in the lines about them when it applies to
  everything.
- **After a piece of work**: it looks back over the conversation once and keeps what is worth
  keeping. Each thing it keeps shows as a **Kept:** (기억함:) line in the conversation. Settings ›
  Brain can turn this off (**Learn after each conversation**, 대화가 끝나면 배우기).
- **After a colleague's request they answered in**: their own words about it ("not Friday
  mornings, I keep them for focused work") are looked back on the same way; only what stays true
  is kept (never the date), shown as a **Kept:** line in their latest conversation.
- **When a conversation gets long**: it first keeps what is worth keeping, then sums up what came
  before and goes on from that summary, as Claude Code compacts a long conversation. The line
  "I summed up what came before" (앞의 대화를 정리해 두었어요) shows when it happens. The whole
  conversation stays in its record and can still be searched.
- **When they have used their AI tools a lot since it last read**: **Your clone** › What it knows says how
  many conversations are new, and **Read my AI records again** (내 AI 기록 다시 읽기) reads only
  those, keeping only what lasts, as the first time.
- **Once a week**: skills it made and has not used for a month are set aside, never deleted.

## Seeing and changing it

- **What it remembers** (기억하는 것) under **Your clone** (내 클론) › **What it knows** (아는 것) shows every line it
  keeps about them, exactly as saved. The pencil (**Correct**, 고치기) lets them write a line the
  way it should read; the clone then fixes it, in their words. The bin (**Remove**, 지우기) removes
  the line after one more press.
- In the conversation they can simply say so: "forget that", "that's no longer true", "from now
  on, always…".
- **Start over** (처음부터 다시), at the end of **Your clone** › What it knows, moves everything it keeps into
  a backup folder and begins again from the first steps; folders they left out stay left out. When all it
  keeps came from reading their records (they have not talked with it, taught it or brought
  anything from another AI yet), there is nothing of theirs to keep, so it clears that instead of
  making a backup, and says so before they confirm; reading again brings it back.
- Settings › **General** (일반), under **Files** (파일), lists every file the clone keeps on the computer, grouped by kind,
  and opens each text file in place.
- The files are theirs to read and edit with any text editor, in the `.sub-office` folder in their
  home folder.

## What it does alone, and what it asks first

- **Alone**: keeping and tidying its own memory, skills and notes, searching their past
  conversations, reading this guide, and searching the web.
- **It asks first**, with a card in the conversation (**May I do this?**, 이걸 해도 될까요?): reading
  one of their files or folders, and opening a web page. **Allow** (허락) or **Don't** (거절). With
  **Don't ask again for this** (앞으로 이런 건 묻지 않기), it reads that folder (or opens that site)
  alone from then on. Folders they left out stay out whatever they answer. Settings ›
  Permissions can let it read on its own, or also act, without these cards (`index.md`,
  "Settings in more detail").
- **It never does now**: changing their files, running programs, or sending anything to anyone.
- **When only they can decide**, it asks with a card (**Needs you**, 답이 필요해요), with choices or
  their own answer, and waits up to ten minutes; without an answer it does not guess.
- What they allowed "from now on" holds at once, even later in the same answer. It is listed on
  Settings › **Permissions** (권한) under **What it does without asking** (묻지 않고 하는 일), each
  in plain words;
  **Ask me first again** (다시 먼저 묻기) takes one back. (It is kept in `settings.json` in the
  `.sub-office` folder, under `trust`.)
